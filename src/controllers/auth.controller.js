// src/controllers/auth.controller.js
/**
 * Login Controller — handles POST /social_login
 *
 * Android sends (from GoogleSignupActivity.kt):
 *   {
 *     email:       account.email,
 *     social_id:   account.id,           ← Google Account ID
 *     name:        account.displayName,
 *     profile_pic: account.photoUrl.toString(),
 *     source_lan:  "hi",                 ← hardcoded
 *     device_name: "${Build.MANUFACTURER}-${Build.MODEL}",
 *     player_id:   fcm_token             ← Firebase Cloud Messaging token
 *   }
 *
 * Android expects back (PostmanResponse wrapper):
 *   { data: "<AES_ENCRYPTED_BASE64>", message: "...", success: true }
 *
 * Where the decrypted `data` is a LoginEncryptResponse:
 *   { name, id, email, token }
 *
 * After login the app stores:
 *   USER_ID  → loginEncryptResponse.id
 *   USERNAME → loginEncryptResponse.name
 *   EMAIL    → loginEncryptResponse.email
 *   TOKEN    → "Bearer " + loginEncryptResponse.token
 *   IS_LOGGED_IN → true
 */

const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('../config/db');
const {
  buildEncryptedResponse,
  buildPlainResponse,
  buildErrorResponse,
} = require('../utils/encryption');

/**
 * Generates a unique join code for a new user (6 uppercase alphanumeric chars).
 */
function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * POST /social_login
 */
async function socialLogin(req, res) {
  const { email, social_id, name, profile_pic, source_lan, device_name, player_id } = req.body;

  // ── Validate required fields ────────────────────────────────────────────────
  if (!email || !social_id || !name) {
    return res.status(400).json(buildErrorResponse('email, social_id and name are required'));
  }

  let connection;
  try {
    connection = await db.getConnection();

    // ── Check if user already exists (by email OR social_id) ────────────────
    const [existingRows] = await connection.execute(
      `SELECT * FROM users WHERE email = ? OR social_id = ? LIMIT 1`,
      [email, social_id]
    );

    let user;

    if (existingRows.length > 0) {
      // ── EXISTING USER: update FCM token, device name, profile pic ──────────
      user = existingRows[0];

      await connection.execute(
        `UPDATE users
         SET player_id   = ?,
             device_name = ?,
             profile_pic = ?,
             source_lan  = ?,
             updated_at  = NOW()
         WHERE id = ?`,
        [
          player_id   || user.player_id,
          device_name || user.device_name,
          profile_pic || user.profile_pic,
          source_lan  || user.source_lan,
          user.id,
        ]
      );

      // Re-fetch updated user
      const [updatedRows] = await connection.execute(
        `SELECT * FROM users WHERE id = ? LIMIT 1`,
        [user.id]
      );
      user = updatedRows[0];
    } else {
      // ── NEW USER: create account ────────────────────────────────────────────
      const joinCode = generateJoinCode();
      const joinLink = `https://phonetracker.app/join?code=${joinCode}`;
      const barCode  = joinCode;

      const [insertResult] = await connection.execute(
        `INSERT INTO users
          (name, email, social_id, profile_pic, source_lan, device_name, player_id,
           join_code, join_link, bar_code, location_status, enabled, disabled,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'on', 0, 0, NOW(), NOW())`,
        [
          name,
          email,
          social_id,
          profile_pic || '',
          source_lan  || 'en',
          device_name || '',
          player_id   || '',
          joinCode,
          joinLink,
          barCode,
        ]
      );

      // Fetch the newly created user
      const [newRows] = await connection.execute(
        `SELECT * FROM users WHERE id = ? LIMIT 1`,
        [insertResult.insertId]
      );
      user = newRows[0];
    }

    // ── Generate JWT token ──────────────────────────────────────────────────
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    // ── Build LoginEncryptResponse payload ──────────────────────────────────
    // Matches LoginEncryptResponse.kt:
    //   { name, id, email, token }
    const loginPayload = {
      name:  user.name,
      id:    user.id,
      email: user.email,
      token: token,
    };

    // ── Encrypt and return ──────────────────────────────────────────────────
    return res.status(200).json(
      buildEncryptedResponse(loginPayload, 'Login successful')
    );
  } catch (err) {
    console.error('[social_login] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /get_privacy
 * Returns plain unencrypted privacy policy.
 */
async function getPrivacyPolicy(req, res) {
  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.execute(
      `SELECT privacy_policy FROM app_config LIMIT 1`
    );

    const privacyPolicy = rows.length > 0 ? rows[0].privacy_policy : '<p>Privacy policy not set.</p>';
    return res.status(200).json(
      buildPlainResponse({ privacy_policy: privacyPolicy }, 'Privacy policy fetched successfully')
    );
  } catch (err) {
    console.error('[getPrivacyPolicy] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /app_common_data
 * Returns encrypted app configuration and update details.
 */
async function appUpdateData(req, res) {
  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.execute(
      `SELECT app_version, version_status, dialog_title, dialog_message, action_button_text, action_button_url, privacy_policy FROM app_config LIMIT 1`
    );

    if (rows.length === 0) {
      return res.status(404).json(buildErrorResponse('App configuration not found'));
    }

    const config = rows[0];
    const payload = {
      app_update_dialog: {
        action_button: {
          action_button_text: config.action_button_text || 'Update Now',
          action_button: config.action_button_url || '',
        },
        app_version: config.app_version || '1.0',
        dialog_message: config.dialog_message || '',
        version_status: config.version_status || 'ok',
        dialog_title: config.dialog_title || 'Update Available',
      },
      privacy_policy: config.privacy_policy || '',
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'App config fetched successfully')
    );
  } catch (err) {
    console.error('[appUpdateData] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  socialLogin,
  getPrivacyPolicy,
  appUpdateData,
};
