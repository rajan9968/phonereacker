// server.js — entry point
require('dotenv').config();
const app = require('./src/app');
const db  = require('./src/config/db');
const initDb = require('./src/config/initDb');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const conn = await db.getConnection();
    console.log('✅ Database connected successfully');
    conn.release();

    // Auto-create database tables if missing (for Railway / fresh DBs)
    await initDb();
  } catch (err) {
    console.error('❌ Database connection failed!');
    console.error('   Error Message:', err.message);
    console.error('   Error Code:', err.code);
    console.error('   Config Used:', {
      host: process.env.DB_HOST || process.env.MYSQLHOST || 'Not set',
      port: process.env.DB_PORT || process.env.MYSQLPORT || 3306,
      user: process.env.DB_USER || process.env.MYSQLUSER || 'Not set',
      database: process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || 'Not set',
      hasPassword: Boolean(process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD),
      hasUrl: Boolean(process.env.MYSQL_URL || process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL),
    });
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PhoneTracker API running on port ${PORT}`);
  });
}

startServer();
