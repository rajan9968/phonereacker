// src/utils/encryption.js
/**
 * AES Encryption utility — matches the Android app's EncryptData.getJson() exactly.
 *
 * Android decryption flow (EncryptData.kt):
 *   encodedKey  = Base64.encodeToString(secretKey.toByteArray(), Base64.DEFAULT)
 *   encodedIv   = Base64.encodeToString(iv.toByteArray(), Base64.DEFAULT)
 *   decodedKey  = Base64.decode(encodedKey, Base64.DEFAULT)  ← these are the raw string bytes
 *   decodedIv   = Base64.decode(encodedIv, Base64.DEFAULT)
 *   secretKeySpec = SecretKeySpec(decodedKey, "AES")         ← AES key = raw string bytes
 *   cipher = AES/CBC/PKCS5PADDING
 *   decrypted = cipher.doFinal(Base64.decode(encryptedData))
 *
 * Key: "a8b7c6d/5ef+4gh3#ij2kl@1m(n0o1pq" = 32 bytes → AES-256
 * IV:  "p/3(04-3*22!9j%8"                 = 16 bytes → valid CBC IV
 *
 * Android Base64.DEFAULT adds a newline (\n) at end of output.
 * So the encoded key string ends with \n which is part of the byte sequence
 * when decoded. However Base64.decode(encodedKey) gives back the ORIGINAL
 * key bytes (the double encode/decode round-trips back to the original).
 * Therefore: effective key = raw bytes of "a8b7c6d/5ef+4gh3#ij2kl@1m(n0o1pq"
 *            effective IV  = raw bytes of "p/3(04-3*22!9j%8"
 */

const crypto = require('crypto');

const AES_KEY_STR = process.env.AES_KEY || 'a8b7c6d/5ef+4gh3#ij2kl@1m(n0o1pq';
const AES_IV_STR  = process.env.AES_IV  || 'p/3(04-3*22!9j%8';

// Pre-build the key/IV buffers once
const KEY = Buffer.from(AES_KEY_STR, 'utf8'); // 32 bytes → aes-256-cbc
const IV  = Buffer.from(AES_IV_STR,  'utf8'); // 16 bytes

/**
 * Encrypts a JS object → Base64 AES-256-CBC string.
 * The Android app will Base64-decode this, then AES-decrypt it.
 * @param {object} payload
 * @returns {string} Base64-encoded ciphertext
 */
function encryptPayload(payload) {
  const jsonString = JSON.stringify(payload);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, IV);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(jsonString, 'utf8')),
    cipher.final(),
  ]);
  return encrypted.toString('base64');
}

/**
 * Decrypts a Base64 AES-256-CBC string → JS object. (for testing / debugging)
 * @param {string} encryptedBase64
 * @returns {object}
 */
function decryptPayload(encryptedBase64) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, IV);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Builds the standard PostmanResponse wrapper the Android app expects.
 * @param {object} payload   - Real data to encrypt into the `data` field
 * @param {string} message
 * @returns {{ data: string, message: string, success: boolean }}
 */
function buildEncryptedResponse(payload, message = 'Success') {
  return {
    data: encryptPayload(payload),
    message,
    success: true,
  };
}

/** Plain (non-encrypted) success — used for disconnect_user, get_privacy */
function buildPlainResponse(data, message = 'Success') {
  return { data, message, success: true };
}

/** Standard error response */
function buildErrorResponse(message = 'Something went wrong') {
  return { data: '', message, success: false };
}

module.exports = {
  encryptPayload,
  decryptPayload,
  buildEncryptedResponse,
  buildPlainResponse,
  buildErrorResponse,
};
