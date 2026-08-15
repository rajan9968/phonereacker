// src/config/initDb.js
const db = require('./db');

async function initDb() {
  try {
    const conn = await db.getConnection();
    console.log('🔄 Checking & initializing database tables...');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name             VARCHAR(255)  NOT NULL,
        email            VARCHAR(255)  NOT NULL UNIQUE,
        social_id        VARCHAR(255)  NOT NULL UNIQUE COMMENT 'Google Account ID',
        profile_pic      VARCHAR(1000) DEFAULT '' COMMENT 'Google profile photo URL',
        source_lan       VARCHAR(10)   DEFAULT 'en' COMMENT 'Language code e.g. hi, en',
        device_name      VARCHAR(255)  DEFAULT '' COMMENT 'e.g. Samsung-Galaxy S21',
        player_id        VARCHAR(500)  DEFAULT '' COMMENT 'FCM push notification token',
        join_code        VARCHAR(20)   NOT NULL UNIQUE COMMENT '6-char alphanumeric code for joining',
        join_link        VARCHAR(500)  DEFAULT '' COMMENT 'Deep link with join_code',
        bar_code         VARCHAR(50)   DEFAULT '' COMMENT 'QR code data (same as join_code)',
        location_status  ENUM('on','off') DEFAULT 'on',
        enabled          INT           DEFAULT 0 COMMENT 'Count of active tracking connections',
        disabled         INT           DEFAULT 0 COMMENT 'Count of disabled tracking connections',
        created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email     (email),
        INDEX idx_social_id (social_id),
        INDEX idx_join_code (join_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_joins (
        id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        parent_user_id  INT          NOT NULL COMMENT 'The user who is watching (tracker)',
        child_user_id   INT          NOT NULL COMMENT 'The user being tracked',
        join_type       VARCHAR(20)  NOT NULL DEFAULT 'code' COMMENT '"code" or "link"',
        device_name     VARCHAR(255) DEFAULT '',
        join_date       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (child_user_id)  REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_join (parent_user_id, child_user_id),
        INDEX idx_parent (parent_user_id),
        INDEX idx_child  (child_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_locations (
        id                   INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id              INT           NOT NULL,
        lattitude            VARCHAR(50)   NOT NULL,
        longitude            VARCHAR(50)   NOT NULL,
        address              VARCHAR(1000) DEFAULT '',
        phone_bettery        INT           DEFAULT 0,
        user_speed           VARCHAR(50)   DEFAULT '0',
        course               FLOAT         DEFAULT 0,
        accuracy             FLOAT         DEFAULT 0,
        phone_battery_status VARCHAR(20)   DEFAULT 'active',
        is_mock              TINYINT(1)    DEFAULT 0,
        hold_status          VARCHAR(20)   DEFAULT 'moving',
        today_date           VARCHAR(50)   DEFAULT '',
        created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id    (user_id),
        INDEX idx_created_at (created_at),
        INDEX idx_user_date  (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS geofence_zones (
        id              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
        child_user_id   INT           NOT NULL,
        zone_name       VARCHAR(255)  NOT NULL,
        zone_type       ENUM('safe_zone','red_zone') NOT NULL DEFAULT 'safe_zone',
        zone_lattitude  VARCHAR(50)   NOT NULL,
        zone_longitude  VARCHAR(50)   NOT NULL,
        zone_meter      VARCHAR(20)   NOT NULL,
        zone_address    VARCHAR(1000) DEFAULT '',
        noti_status     ENUM('on','off') DEFAULT 'on',
        created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (child_user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_child_user (child_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        sender_user_id   INT          NOT NULL,
        receiver_user_id INT          NOT NULL,
        title            VARCHAR(255) DEFAULT 'SOS Alert',
        is_read          TINYINT(1)   DEFAULT 0,
        noti_date        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_user_id)   REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_receiver (receiver_user_id),
        INDEX idx_sender   (sender_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        id                 INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        app_version        VARCHAR(20)  NOT NULL DEFAULT '1.0',
        version_status     VARCHAR(20)  NOT NULL DEFAULT 'ok',
        dialog_title       VARCHAR(255) DEFAULT 'Update Available',
        dialog_message     TEXT,
        action_button_text VARCHAR(100) DEFAULT 'Update Now',
        action_button_url  VARCHAR(500) DEFAULT '',
        privacy_policy     LONGTEXT,
        created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      INSERT IGNORE INTO app_config (id, app_version, version_status, dialog_title, dialog_message, action_button_text, action_button_url, privacy_policy)
      VALUES (
        1,
        '1.0',
        'ok',
        'Update Available',
        'A new version of Phone Tracker is available. Please update to continue.',
        'Update Now',
        'https://play.google.com/store/apps/details?id=com.find24.live.location.tracker',
        '<p>This is the privacy policy for Phone Tracker app.</p>'
      );
    `);

    conn.release();
    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('⚠️ Database initialization warning:', err.message);
  }
}

module.exports = initDb;
