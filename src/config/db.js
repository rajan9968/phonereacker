// src/config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

// Explicit DB_HOST overrides auto-injected MYSQLHOST
const host = process.env.DB_HOST || process.env.MYSQLHOST || process.env.RAILWAY_TCP_PROXY_DOMAIN || '127.0.0.1';
const port = parseInt(process.env.DB_PORT || process.env.MYSQLPORT || process.env.RAILWAY_TCP_PROXY_PORT || '3306', 10);
const user = process.env.DB_USER || process.env.MYSQLUSER || 'root';
const password = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD || '';
const database = process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'phonetracker';
const url = process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL || process.env.DATABASE_URL;

let connectionConfig;

if (url && !url.includes('${{') && url.startsWith('mysql://')) {
  connectionConfig = url;
} else {
  connectionConfig = {
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    timezone: '+00:00',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

const pool = mysql.createPool(connectionConfig);

module.exports = pool;
