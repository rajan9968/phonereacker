// src/controllers/user.controller.js
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { GoogleAuth } = require('google-auth-library');
const {
  buildEncryptedResponse,
  buildPlainResponse,
  buildErrorResponse,
} = require('../utils/encryption');

/**
 * Helper to build the ProfileEncryptResponse structure.
 */
function mapUserProfile(user, enabledCount = 0, disabledCount = 0) {
  return {
    join_link: user.join_link,
    join_code: user.join_code,
    profile_pic: user.profile_pic,
    enabled: enabledCount,
    source_lan: user.source_lan,
    social_id: user.social_id,
    device_name: user.device_name,
    player_id: user.player_id,
    name: user.name,
    bar_code: user.bar_code,
    disabled: disabledCount,
    id: user.id,
    email: user.email,
    location_status: user.location_status || 'on'
  };
}

/**
 * POST /user_profile
 * Retrieves detailed user profile.
 */
async function getUserProfile(req, res) {
  const userId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.execute(
      `SELECT * FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json(buildErrorResponse('User not found'));
    }

    // Dynamic enabled connection count
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) as count FROM user_joins WHERE parent_user_id = ?`,
      [userId]
    );
    const enabledCount = countRows[0].count;
    const disabledCount = rows[0].disabled || 0;

    const profileData = mapUserProfile(rows[0], enabledCount, disabledCount);
    return res.status(200).json(
      buildEncryptedResponse(profileData, 'Profile fetched successfully')
    );
  } catch (err) {
    console.error('[getUserProfile] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /edit_user
 * Updates user profile name.
 */
async function editUserProfile(req, res) {
  const userId = req.user.id;
  const { name } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json(buildErrorResponse('Name field is required'));
  }

  let connection;
  try {
    connection = await db.getConnection();

    // Update the profile name
    await connection.execute(
      `UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?`,
      [name.trim(), userId]
    );

    // Retrieve updated profile
    const [rows] = await connection.execute(
      `SELECT * FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json(buildErrorResponse('User not found'));
    }

    // Dynamic enabled connection count
    const [countRows] = await connection.execute(
      `SELECT COUNT(*) as count FROM user_joins WHERE parent_user_id = ?`,
      [userId]
    );
    const enabledCount = countRows[0].count;
    const disabledCount = rows[0].disabled || 0;

    const profileData = mapUserProfile(rows[0], enabledCount, disabledCount);
    return res.status(200).json(
      buildEncryptedResponse(profileData, 'Profile updated successfully')
    );
  } catch (err) {
    console.error('[editUserProfile] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /user_logout
 * Logs out the user by clearing their FCM player ID.
 */
async function logoutUser(req, res) {
  const userId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();
    
    // Clear FCM token on logout
    await connection.execute(
      `UPDATE users SET player_id = '', updated_at = NOW() WHERE id = ?`,
      [userId]
    );

    return res.status(200).json(
      buildEncryptedResponse({}, 'Logged out successfully')
    );
  } catch (err) {
    console.error('[logoutUser] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /refresh_token
 * Refreshes the JWT session token.
 */
async function refreshToken(req, res) {
  const { id, email, name } = req.user;

  try {
    const newToken = jwt.sign(
      { id, email, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    const refreshPayload = {
      name,
      id,
      email,
      token: newToken
    };

    return res.status(200).json(
      buildEncryptedResponse(refreshPayload, 'Token refreshed successfully')
    );
  } catch (err) {
    console.error('[refreshToken] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  }
}

/**
 * Haversine formula to compute distance between two points in km.
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes total distance in km from location logs.
 */
function calculateTotalDistance(locations) {
  let total = 0;
  for (let i = 1; i < locations.length; i++) {
    const lat1 = parseFloat(locations[i-1].lattitude);
    const lon1 = parseFloat(locations[i-1].longitude);
    const lat2 = parseFloat(locations[i].lattitude);
    const lon2 = parseFloat(locations[i].longitude);
    if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
      total += getHaversineDistance(lat1, lon1, lat2, lon2);
    }
  }
  return total.toFixed(2) + ' km';
}

/**
 * Computes duration between first and last location logs.
 */
function calculateTotalTime(locations) {
  if (locations.length < 2) return '0h 0m';
  const start = new Date(locations[0].created_at);
  const end = new Date(locations[locations.length - 1].created_at);
  const diffMs = Math.abs(end - start);
  const diffMins = Math.floor(diffMs / 1000 / 60);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

/**
 * POST /verify_join_data
 * Verifies code, link, or barcode from a potential parent/tracker.
 */
async function verifyJoinUser(req, res) {
  const { join_type, join_data } = req.body;

  if (!join_data) {
    return res.status(400).json(buildErrorResponse('join_data is required'));
  }

  let code = join_data.trim();
  // Extract code from deep link if it's a URL
  if (join_type === 'link' && code.includes('code=')) {
    try {
      const parts = code.split('code=');
      if (parts.length > 1) {
        code = parts[1].split('&')[0];
      }
    } catch (e) {
      // fallback
    }
  }

  let connection;
  try {
    connection = await db.getConnection();
    
    // Find parent user by join_code (or join_link, or bar_code)
    let query = `SELECT * FROM users WHERE join_code = ? OR join_link = ? OR bar_code = ? LIMIT 1`;
    const [rows] = await connection.execute(query, [code, join_data, code]);

    if (rows.length === 0) {
      return res.status(400).json(buildErrorResponse('Invalid invitation code'));
    }

    const parentUser = rows[0];

    // Prevent self-joining
    if (parentUser.id === req.user.id) {
      return res.status(400).json(buildErrorResponse('You cannot join your own code'));
    }

    const payload = {
      device_name: parentUser.device_name || '',
      parent_user_id: parentUser.id
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'Invitation code verified successfully')
    );
  } catch (err) {
    console.error('[verifyJoinUser] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /join_user
 * Joins a child user (current logged-in user) with a parent/tracker user.
 */
async function joinUser(req, res) {
  const childUserId = req.user.id;
  const {
    parent_user_id,
    join_type,
    device_name,
    child_u_lattitude,
    child_u_longitude,
    address,
    phone_bettery,
    user_speed,
    course,
    isMock,
    accuracy,
    phone_battery_status,
    today_date
  } = req.body;

  if (!parent_user_id) {
    return res.status(400).json(buildErrorResponse('parent_user_id is required'));
  }

  if (parseInt(parent_user_id) === childUserId) {
    return res.status(400).json(buildErrorResponse('You cannot join yourself'));
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Check if relationship already exists
    const [existing] = await connection.execute(
      `SELECT * FROM user_joins WHERE parent_user_id = ? AND child_user_id = ? LIMIT 1`,
      [parent_user_id, childUserId]
    );

    let joinId;
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (existing.length > 0) {
      joinId = existing[0].id;
      // Update relationship details
      await connection.execute(
        `UPDATE user_joins 
         SET join_type = ?, device_name = ?, updated_at = NOW() 
         WHERE id = ?`,
        [join_type || 'code', device_name || '', joinId]
      );
    } else {
      // Create relationship
      const [insertResult] = await connection.execute(
        `INSERT INTO user_joins 
         (parent_user_id, child_user_id, join_type, device_name, join_date, created_at, updated_at) 
         VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [parent_user_id, childUserId, join_type || 'code', device_name || '']
      );
      joinId = insertResult.insertId;

      // Increment child's enabled connection count
      await connection.execute(
        `UPDATE users SET enabled = enabled + 1 WHERE id = ?`,
        [childUserId]
      );

      // Insert notification for the parent
      await connection.execute(
        `INSERT INTO notifications (sender_user_id, receiver_user_id, title, is_read, noti_date, created_at)
         VALUES (?, ?, 'Joined your circle', 0, NOW(), NOW())`,
        [childUserId, parent_user_id]
      );
    }

    // Insert current location if provided
    if (child_u_lattitude && child_u_longitude) {
      const speed = user_speed !== undefined ? String(user_speed) : '0';
      const parsedSpeed = parseFloat(speed);
      const holdStatus = (parsedSpeed === 0) ? 'stopped' : 'moving';

      await connection.execute(
        `INSERT INTO user_locations 
         (user_id, lattitude, longitude, address, phone_bettery, user_speed, course, accuracy, phone_battery_status, is_mock, hold_status, today_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          childUserId,
          String(child_u_lattitude),
          String(child_u_longitude),
          address || '',
          parseInt(phone_bettery) || 0,
          speed,
          parseFloat(course) || 0.0,
          parseFloat(accuracy) || 0.0,
          phone_battery_status || 'active',
          isMock ? 1 : 0,
          holdStatus,
          today_date || nowStr,
          new Date(today_date || Date.now())
        ]
      );
    }

    await connection.commit();

    const payload = {
      parent_user_id: parseInt(parent_user_id),
      child_user_id: childUserId,
      device_name: device_name || '',
      join_type: join_type || 'code',
      join_date: nowStr,
      created_at: nowStr,
      updated_at: nowStr,
      id: joinId
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'Joined successfully')
    );
  } catch (err) {
    console.error('[joinUser] Error:', err);
    if (connection) await connection.rollback();
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /located_user_history
 * Lists parent users (trackers) watching the current child user.
 */
async function getLocatedUserHistoryData(req, res) {
  const childUserId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.execute(
      `SELECT uj.device_name, uj.parent_user_id, u.name AS user_name, u.profile_pic, uj.join_type, uj.created_at
       FROM user_joins uj
       JOIN users u ON uj.parent_user_id = u.id
       WHERE uj.child_user_id = ?
       ORDER BY uj.created_at DESC`,
      [childUserId]
    );

    const belocatedList = rows.map(row => ({
      device_name: row.device_name || '',
      parent_user_id: row.parent_user_id,
      user_name: row.user_name || '',
      profile_pic: row.profile_pic || '',
      join_type: row.join_type || 'code',
      created_at: row.created_at ? new Date(row.created_at).toISOString() : ''
    }));

    return res.status(200).json(
      buildEncryptedResponse(belocatedList, 'Watchers list fetched successfully')
    );
  } catch (err) {
    console.error('[getLocatedUserHistoryData] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /disconnect_user
 * Disconnects a tracking relationship.
 */
async function disconnectUser(req, res) {
  const { parent_user_id, child_user_id } = req.body;

  if (!parent_user_id || !child_user_id) {
    return res.status(400).json(buildErrorResponse('parent_user_id and child_user_id are required'));
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [deleteResult] = await connection.execute(
      `DELETE FROM user_joins WHERE parent_user_id = ? AND child_user_id = ?`,
      [parent_user_id, child_user_id]
    );

    if (deleteResult.affectedRows > 0) {
      // Decrement enabled count, increment disabled count for child user
      await connection.execute(
        `UPDATE users 
         SET enabled = GREATEST(0, enabled - 1), 
             disabled = disabled + 1 
         WHERE id = ?`,
        [child_user_id]
      );

      // Insert notification for the parent
      await connection.execute(
        `INSERT INTO notifications (sender_user_id, receiver_user_id, title, is_read, noti_date, created_at)
         VALUES (?, ?, 'Disconnected from your circle', 0, NOW(), NOW())`,
        [child_user_id, parent_user_id]
      );
    }

    await connection.commit();

    return res.status(200).json(
      buildPlainResponse([], 'Disconnected successfully')
    );
  } catch (err) {
    console.error('[disconnectUser] Error:', err);
    if (connection) await connection.rollback();
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

async function sendFcmNotification(fcmToken, title, description, extraData = {}) {
  const projectId = process.env.FCM_PROJECT_ID;
  const serviceAccountJson = process.env.FCM_SERVICE_ACCOUNT_JSON;   // Railway: paste JSON string here
  const serviceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH;   // Local: path to .json file

  if (!projectId) {
    console.warn('[FCM] FCM_PROJECT_ID is not set in environment variables, skipping push notification');
    return;
  }
  if (!serviceAccountJson && !serviceAccountPath) {
    console.warn('[FCM] Neither FCM_SERVICE_ACCOUNT_JSON nor FCM_SERVICE_ACCOUNT_PATH is set, skipping push notification');
    return;
  }

  try {
    // On Railway: credentials come from env var JSON string
    // Locally: credentials come from a .json file on disk
    const authConfig = serviceAccountJson
      ? { credentials: JSON.parse(serviceAccountJson), scopes: ['https://www.googleapis.com/auth/firebase.messaging'] }
      : { keyFile: serviceAccountPath,                 scopes: ['https://www.googleapis.com/auth/firebase.messaging'] };

    const auth = new GoogleAuth(authConfig);
    const accessToken = await auth.getAccessToken();

    const payload = JSON.stringify({
      message: {
        token: fcmToken,
        data: {
          title: title,
          description: description,
          ...extraData
        },
        android: {
          priority: 'high'
        }
      }
    });

    const options = {
      hostname: 'fcm.googleapis.com',
      port: 443,
      path: `/v1/projects/${projectId}/messages:send`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = require('https').request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`[FCM V1] Notification sent successfully to token: ${fcmToken.substring(0, 20)}...`);
        } else {
          console.error(`[FCM V1] Failed (${res.statusCode}): ${data}`);
        }
      });
    });

    req.on('error', (e) => {
      console.error('[FCM V1] Request error:', e);
    });

    req.write(payload);
    req.end();
  } catch (err) {
    console.error('[FCM V1] Error generating access token or sending notification:', err);
  }
}

/**
 * POST /update_location
 * Bulk updates locations uploaded by a tracked child device.
 */
async function updateLocation(req, res) {
  const childUserId = req.user.id;
  const { locations } = req.body;

  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    return res.status(400).json(buildErrorResponse('locations array is required'));
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [prevLocRows] = await connection.execute(
      `SELECT lattitude, longitude FROM user_locations WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [childUserId]
    );

    let lastLocation = null;

    for (const loc of locations) {
      const speed = loc.user_speed !== undefined ? String(loc.user_speed) : '0';
      const parsedSpeed = parseFloat(speed);
      const holdStatus = (parsedSpeed === 0) ? 'stopped' : 'moving';

      await connection.execute(
        `INSERT INTO user_locations 
         (user_id, lattitude, longitude, address, phone_bettery, user_speed, course, accuracy, phone_battery_status, is_mock, hold_status, today_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          childUserId,
          String(loc.lattitude),
          String(loc.longitude),
          loc.address || '',
          parseInt(loc.phone_bettery) || 0,
          speed,
          parseFloat(loc.course) || 0.0,
          parseFloat(loc.accuracy) || 0.0,
          loc.phone_battery_status || 'active',
          loc.isMock ? 1 : 0,
          holdStatus,
          loc.today_date || new Date().toISOString(),
          new Date(loc.today_date || Date.now())
        ]
      );

      lastLocation = loc;
    }

    // Query active parent watchers count and their FCM tokens
    const [parentRows] = await connection.execute(
      `SELECT uj.parent_user_id, u.player_id 
       FROM user_joins uj 
       JOIN users u ON uj.parent_user_id = u.id 
       WHERE uj.child_user_id = ?`,
      [childUserId]
    );
    const watcherCount = parentRows.length;

    // Geofence transition checking
    if (prevLocRows.length > 0 && lastLocation && parentRows.length > 0) {
      const prevLat = parseFloat(prevLocRows[0].lattitude);
      const prevLng = parseFloat(prevLocRows[0].longitude);
      const newLat = parseFloat(lastLocation.lattitude);
      const newLng = parseFloat(lastLocation.longitude);

      if (!isNaN(prevLat) && !isNaN(prevLng) && !isNaN(newLat) && !isNaN(newLng)) {
        const [zones] = await connection.execute(
          `SELECT id, zone_name, zone_type, zone_lattitude, zone_longitude, zone_meter 
           FROM geofence_zones WHERE child_user_id = ?`,
          [childUserId]
        );

        if (zones.length > 0) {
          const [childUserRows] = await connection.execute(
            `SELECT name FROM users WHERE id = ?`,
            [childUserId]
          );
          const childName = childUserRows.length > 0 ? childUserRows[0].name : 'Child';

          for (const zone of zones) {
            const zoneLat = parseFloat(zone.zone_lattitude);
            const zoneLng = parseFloat(zone.zone_longitude);
            const radius = parseFloat(zone.zone_meter);

            if (!isNaN(zoneLat) && !isNaN(zoneLng) && !isNaN(radius)) {
              const prevDist = getHaversineDistance(prevLat, prevLng, zoneLat, zoneLng);
              const newDist = getHaversineDistance(newLat, newLng, zoneLat, zoneLng);

              const wasInside = prevDist <= radius;
              const isInside = newDist <= radius;

              if (wasInside !== isInside) {
                const zoneName = zone.zone_name || 'Unnamed Zone';
                const zoneTypeLabel = zone.zone_type === 'safe_zone' ? 'Safe Zone' : 'Red Zone';
                const transitionType = isInside ? 'entered' : 'exited';
                const titleMessage = `${childName} ${transitionType} ${zoneName} (${zoneTypeLabel})`;

                for (const parent of parentRows) {
                  await connection.execute(
                    `INSERT INTO notifications (sender_user_id, receiver_user_id, title, is_read, noti_date, created_at)
                     VALUES (?, ?, ?, 0, NOW(), NOW())`,
                    [childUserId, parent.parent_user_id, titleMessage]
                  );

                  if (parent.player_id) {
                    sendFcmNotification(parent.player_id, 'Geofence Alert', titleMessage, {
                      type: 'GEOFENCE_ALERT',
                      member_name: childName,
                      zone_name: zoneName,
                      zone_type: zone.zone_type,
                      transition_type: transitionType
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    await connection.commit();

    // Map response details based on the last updated location point
    const payload = {
      located_parent_user: watcherCount,
      phone_bettery: parseInt(lastLocation.phone_bettery) || 0,
      user_speed: parseFloat(lastLocation.user_speed) || 0.0,
      datetime: lastLocation.today_date || new Date().toISOString(),
      address: lastLocation.address || '',
      lattitude: parseFloat(lastLocation.lattitude) || 0.0,
      longitude: parseFloat(lastLocation.longitude) || 0.0,
      user_id: childUserId,
      phone_battery_status: lastLocation.phone_battery_status || 'active'
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'Location updated successfully')
    );
  } catch (err) {
    console.error('[updateLocation] Error:', err);
    if (connection) await connection.rollback();
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /user_location_details
 * Returns location logs and geofence zones for a user within a date range.
 */
async function getLocationDetails(req, res) {
  const { user_id, start_date, end_date } = req.body;

  if (!user_id) {
    return res.status(400).json(buildErrorResponse('user_id is required'));
  }

  // Default to last 24 hours if dates are not provided
  const start = start_date ? new Date(start_date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = end_date ? new Date(end_date) : new Date();

  let connection;
  try {
    connection = await db.getConnection();

    // 1. Fetch zones
    const [zoneRows] = await connection.execute(
      `SELECT id AS zone_id, zone_name, zone_type, zone_lattitude, zone_longitude, zone_meter, zone_address, noti_status 
       FROM geofence_zones 
       WHERE child_user_id = ?`,
      [user_id]
    );

    const zoneData = zoneRows.map(row => ({
      zone_meter: row.zone_meter || '0',
      zone_id: row.zone_id,
      zone_lattitude: row.zone_lattitude || '',
      zone_longitude: row.zone_longitude || '',
      zone_type: row.zone_type || 'safe_zone',
      zone_name: row.zone_name || '',
      zone_address: row.zone_address || '',
      noti_status: row.noti_status || 'on'
    }));

    // 2. Fetch location history records
    const [locRows] = await connection.execute(
      `SELECT ul.*, u.name AS user_name, u.profile_pic, u.device_name 
       FROM user_locations ul
       JOIN users u ON ul.user_id = u.id
       WHERE ul.user_id = ? AND ul.created_at BETWEEN ? AND ?
       ORDER BY ul.created_at ASC`,
      [user_id, start, end]
    );

    const userData = locRows.map(loc => ({
      hold_status: loc.hold_status || 'moving',
      user_speed: String(loc.user_speed || '0'),
      phone_bettery: parseInt(loc.phone_bettery) || 0,
      datetime: loc.today_date || (loc.created_at ? new Date(loc.created_at).toISOString() : ''),
      address: loc.address || '',
      user_id: loc.user_id,
      lattitude: String(loc.lattitude),
      longitude: String(loc.longitude),
      user_name: loc.user_name || '',
      profile_pic: loc.profile_pic || '',
      device_name: loc.device_name || '',
      phone_battery_status: loc.phone_battery_status || 'active',
      course: parseFloat(loc.course) || 0.0,
      accuracy: parseFloat(loc.accuracy) || 0.0
    }));

    const totalDistance = calculateTotalDistance(locRows);
    const totalTime = calculateTotalTime(locRows);

    const payload = {
      zone_data: zoneData,
      total_distance: totalDistance,
      total_time: totalTime,
      user_data: userData
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'Location details fetched successfully')
    );
  } catch (err) {
    console.error('[getLocationDetails] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /manage_user_geojson
 * Inserts or updates a geofence zone.
 */
async function addGeofence(req, res) {
  const {
    zone_meter,
    zone_type,
    zone_lattitude,
    zone_longitude,
    noti_status,
    zone_id,
    child_user_id,
    zone_name,
    zone_address
  } = req.body;

  if (!child_user_id || !zone_name) {
    return res.status(400).json(buildErrorResponse('child_user_id and zone_name are required'));
  }

  let connection;
  try {
    connection = await db.getConnection();

    if (zone_id) {
      // Update
      await connection.execute(
        `UPDATE geofence_zones 
         SET zone_meter = ?, 
             zone_type = ?, 
             zone_lattitude = ?, 
             zone_longitude = ?, 
             noti_status = ?, 
             child_user_id = ?, 
             zone_name = ?, 
             zone_address = ?, 
             updated_at = NOW() 
         WHERE id = ?`,
        [
          zone_meter || '0',
          zone_type || 'safe_zone',
          String(zone_lattitude),
          String(zone_longitude),
          noti_status || 'on',
          child_user_id,
          zone_name,
          zone_address || '',
          zone_id
        ]
      );
    } else {
      // Insert
      await connection.execute(
        `INSERT INTO geofence_zones 
         (zone_meter, zone_type, zone_lattitude, zone_longitude, noti_status, child_user_id, zone_name, zone_address, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          zone_meter || '0',
          zone_type || 'safe_zone',
          String(zone_lattitude),
          String(zone_longitude),
          noti_status || 'on',
          child_user_id,
          zone_name,
          zone_address || ''
        ]
      );
    }

    return res.status(200).json(
      buildEncryptedResponse({}, 'Geofence configured successfully')
    );
  } catch (err) {
    console.error('[addGeofence] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /delete_zone
 * Deletes a geofence zone by ID.
 */
async function deleteZone(req, res) {
  const { zone_id } = req.body;

  if (!zone_id) {
    return res.status(400).json(buildErrorResponse('zone_id is required'));
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `DELETE FROM geofence_zones WHERE id = ?`,
      [zone_id]
    );

    return res.status(200).json(
      buildEncryptedResponse({}, 'Geofence deleted successfully')
    );
  } catch (err) {
    console.error('[deleteZone] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /remove_user_history
 * Deletes user locations within a date range.
 */
async function removeUserHistory(req, res) {
  const { child_user_id, start_date, end_date } = req.body;

  if (!child_user_id) {
    return res.status(400).json(buildErrorResponse('child_user_id is required'));
  }

  const start = start_date ? new Date(start_date) : new Date(0);
  const end = end_date ? new Date(end_date) : new Date();

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `DELETE FROM user_locations WHERE user_id = ? AND created_at BETWEEN ? AND ?`,
      [child_user_id, start, end]
    );

    return res.status(200).json(
      buildEncryptedResponse({}, 'User location logs removed successfully')
    );
  } catch (err) {
    console.error('[removeUserHistory] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /user_hold_location_details
 * Lists stops for a child user in a date range.
 */
async function fetchStops(req, res) {
  const { user_id, start_date, end_date } = req.body;

  if (!user_id) {
    return res.status(400).json(buildErrorResponse('user_id is required'));
  }

  const start = start_date ? new Date(start_date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const end = end_date ? new Date(end_date) : new Date();

  let connection;
  try {
    connection = await db.getConnection();
    const [rows] = await connection.execute(
      `SELECT ul.*, u.name AS user_name, u.profile_pic 
       FROM user_locations ul
       JOIN users u ON ul.user_id = u.id
       WHERE ul.user_id = ? AND ul.hold_status = 'stopped' AND ul.created_at BETWEEN ? AND ?
       ORDER BY ul.created_at ASC`,
      [user_id, start, end]
    );

    const stopsList = rows.map(row => ({
      hold_status: row.hold_status || 'stopped',
      user_speed: String(row.user_speed || '0'),
      phone_bettery: parseInt(row.phone_bettery) || 0,
      address: row.address || '',
      lattitude: String(row.lattitude),
      user_name: row.user_name || '',
      profile_pic: row.profile_pic || '',
      accuracy: String(row.accuracy || '0'),
      datetime: row.today_date || (row.created_at ? new Date(row.created_at).toISOString() : ''),
      isMock: Boolean(row.is_mock),
      course: String(row.course || '0'),
      phone_battery_status: row.phone_battery_status || 'active',
      longitude: String(row.longitude)
    }));

    return res.status(200).json(
      buildEncryptedResponse(stopsList, 'Stops fetched successfully')
    );
  } catch (err) {
    console.error('[fetchStops] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /send_call_notification
 * Triggers an SOS/alert notification for a target user.
 */
async function sendSos(req, res) {
  const senderUserId = req.user.id;
  const { receiver_user_id } = req.body;

  if (!receiver_user_id) {
    return res.status(400).json(buildErrorResponse('receiver_user_id is required'));
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `INSERT INTO notifications (sender_user_id, receiver_user_id, title, is_read, noti_date, created_at) 
       VALUES (?, ?, 'SOS Alert', 0, NOW(), NOW())`,
      [senderUserId, receiver_user_id]
    );

    // Send FCM push notification to child device
    const [childRows] = await connection.execute(
      `SELECT name, player_id FROM users WHERE id = ?`,
      [receiver_user_id]
    );
    const [parentRows] = await connection.execute(
      `SELECT name FROM users WHERE id = ?`,
      [senderUserId]
    );

    if (childRows.length > 0 && parentRows.length > 0) {
      const childToken = childRows[0].player_id;
      const parentName = parentRows[0].name || 'Parent';
      const alertMsg = `${parentName} triggered the SOS`;

      if (childToken) {
        sendFcmNotification(childToken, 'Emergency Alert', alertMsg, {
          parent_name: parentName,
          type: 'SOS_ALERT'
        });
      }
    }

    return res.status(200).json(
      buildEncryptedResponse({}, 'SOS alert transmitted successfully')
    );
  } catch (err) {
    console.error('[sendSos] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /notification_list
 * Fetches notifications and marks them as read.
 */
async function getNotificationList(req, res) {
  const receiverUserId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Mark all notifications for receiver as read
    await connection.execute(
      `UPDATE notifications SET is_read = 1 WHERE receiver_user_id = ?`,
      [receiverUserId]
    );

    // Query notifications
    const [rows] = await connection.execute(
      `SELECT n.title, n.noti_date, n.sender_user_id, u.name AS user_name, u.profile_pic
       FROM notifications n
       JOIN users u ON n.sender_user_id = u.id
       WHERE n.receiver_user_id = ?
       ORDER BY n.created_at DESC`,
      [receiverUserId]
    );

    await connection.commit();

    const userData = rows.map(row => ({
      noti_date: row.noti_date ? new Date(row.noti_date).toISOString() : '',
      user_name: row.user_name || '',
      profile_pic: row.profile_pic || '',
      title: row.title || 'SOS Alert',
      sender_user_id: row.sender_user_id
    }));

    const payload = {
      pagination: {
        per_page: 20,
        last_page: 1,
        current_page: 1,
        total_record: rows.length
      },
      user_data: userData
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'Notifications fetched successfully')
    );
  } catch (err) {
    console.error('[getNotificationList] Error:', err);
    if (connection) await connection.rollback();
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /get_home_data
 * Returns children location info and unread alerts count for the parent user.
 */
async function getHomeData(req, res) {
  const parentUserId = req.user.id;

  let connection;
  try {
    connection = await db.getConnection();

    // 1. Unread notifications count
    const [notiRows] = await connection.execute(
      `SELECT COUNT(*) AS count FROM notifications WHERE receiver_user_id = ? AND is_read = 0`,
      [parentUserId]
    );
    const notiCount = notiRows[0].count;

    // 2. Child users tracking info
    const [childRows] = await connection.execute(
      `SELECT uj.child_user_id AS id, uj.child_user_id AS user_id, u.name AS user_name, u.profile_pic,
              ul.lattitude AS latitude, ul.longitude, ul.address, ul.phone_bettery AS phone_battery,
              ul.user_speed, ul.phone_battery_status, ul.course
       FROM user_joins uj
       JOIN users u ON uj.child_user_id = u.id
       LEFT JOIN (
         SELECT ul1.* FROM user_locations ul1
         JOIN (SELECT user_id, MAX(id) AS max_id FROM user_locations GROUP BY user_id) ul2
         ON ul1.id = ul2.max_id
       ) ul ON ul.user_id = u.id
       WHERE uj.parent_user_id = ?
       ORDER BY uj.created_at DESC`,
      [parentUserId]
    );

    const homeData = childRows.map(row => ({
      user_speed: String(row.user_speed || '0'),
      address: row.address || '',
      user_id: row.user_id,
      user_name: row.user_name || '',
      latitude: row.latitude ? String(row.latitude) : null,
      profile_pic: row.profile_pic || '',
      id: row.id,
      phone_battery_status: row.phone_battery_status || 'active',
      phone_battery: row.phone_battery !== null ? String(row.phone_battery) : '0',
      longitude: row.longitude ? String(row.longitude) : null,
      course: row.course !== null && row.course !== undefined ? String(row.course) : '0'
    }));

    const payload = {
      noti_count: notiCount,
      home_data: homeData
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'Home data fetched successfully')
    );
  } catch (err) {
    console.error('[getHomeData] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

async function ensureAppUsageTableExists(connection) {
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS app_usage_stats (
        id              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        child_user_id   INT           NOT NULL,
        package_name    VARCHAR(255)  NOT NULL,
        app_name        VARCHAR(255)  NOT NULL,
        usage_time_ms   BIGINT        NOT NULL DEFAULT 0,
        usage_date      DATE          NOT NULL,
        updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (child_user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY idx_child_date_package (child_user_id, usage_date, package_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (e) {
    console.error('[ensureAppUsageTableExists] Notice:', e.message);
  }
}

/**
 * POST /sync_app_usage
 * Synces daily app usage entries from child device for today.
 */
async function syncAppUsage(req, res) {
  const childUserId = req.user.id;
  const { usage_list } = req.body;

  if (!Array.isArray(usage_list)) {
    return res.status(400).json(buildErrorResponse('usage_list array is required'));
  }

  let connection;
  try {
    connection = await db.getConnection();
    await ensureAppUsageTableExists(connection);
    await connection.beginTransaction();

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const item of usage_list) {
      if (item.package_name && item.usage_time_ms !== undefined) {
        await connection.execute(
          `INSERT INTO app_usage_stats (child_user_id, package_name, app_name, usage_time_ms, usage_date, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             app_name = VALUES(app_name),
             usage_time_ms = VALUES(usage_time_ms),
             updated_at = NOW()`,
          [childUserId, item.package_name, item.app_name || item.package_name, item.usage_time_ms, todayStr]
        );
      }
    }

    await connection.commit();
    return res.status(200).json(
      buildEncryptedResponse({}, 'App usage synced successfully')
    );
  } catch (err) {
    if (connection) await connection.rollback();
    console.error('[syncAppUsage] Error:', err);
    return res.status(500).json(buildErrorResponse('Internal server error'));
  } finally {
    if (connection) connection.release();
  }
}

/**
 * POST /get_child_app_usage
 * Retrieves daily app usage for a child user for today.
 */
async function getChildAppUsage(req, res) {
  const { child_user_id } = req.body;

  if (!child_user_id) {
    return res.status(400).json(buildErrorResponse('child_user_id is required'));
  }

  let connection;
  try {
    connection = await db.getConnection();
    await ensureAppUsageTableExists(connection);

    const [rows] = await connection.execute(
      `SELECT package_name, app_name, usage_time_ms
       FROM app_usage_stats
       WHERE child_user_id = ?
       ORDER BY usage_time_ms DESC`,
      [child_user_id]
    );

    let totalScreenTimeMs = 0;
    const apps = rows.map(r => {
      const usageMs = Number(r.usage_time_ms) || 0;
      totalScreenTimeMs += usageMs;
      return {
        package_name: r.package_name || '',
        app_name: r.app_name || r.package_name || 'App',
        usage_time_ms: usageMs
      };
    });

    const payload = {
      total_screen_time_ms: totalScreenTimeMs,
      apps: apps
    };

    return res.status(200).json(
      buildEncryptedResponse(payload, 'App usage fetched successfully')
    );
  } catch (err) {
    console.error('[getChildAppUsage] Error:', err);
    return res.status(200).json(
      buildEncryptedResponse({ total_screen_time_ms: 0, apps: [] }, 'App usage fetched (fallback)')
    );
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getUserProfile,
  editUserProfile,
  logoutUser,
  refreshToken,
  verifyJoinUser,
  joinUser,
  getLocatedUserHistoryData,
  disconnectUser,
  updateLocation,
  getLocationDetails,
  addGeofence,
  deleteZone,
  removeUserHistory,
  fetchStops,
  sendSos,
  getNotificationList,
  getHomeData,
  syncAppUsage,
  getChildAppUsage
};
