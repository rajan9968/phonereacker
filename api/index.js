// api/index.js — Vercel Serverless Function entry point
const app = require('../src/app');
const initDb = require('../src/config/initDb');

let dbInitialized = false;

module.exports = async (req, res) => {
  if (!dbInitialized) {
    try {
      await initDb();
      dbInitialized = true;
    } catch (err) {
      console.error('⚠️ DB Initialization error on Vercel cold start:', err.message);
    }
  }
  return app(req, res);
};
