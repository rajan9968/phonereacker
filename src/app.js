// src/app.js
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const circleRoutes = require('./routes/circle.routes');

const app = express();

// ── Security & Logging ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

// ── Body Parser ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'PhoneTracker API is running ✅', version: '1.0.0' });
});

// ── Routes ──────────────────────────────────────────────────────────────────
// All routes are mounted at /phone_tracker/api/ to match the Android base URL:
// https://phonetracker.videoapps.club/phone_tracker/api/
app.use('/phone_tracker/api', authRoutes);
app.use('/phone_tracker/api', userRoutes);
app.use('/phone_tracker/api', circleRoutes);

// ── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ data: '', message: 'Route not found', success: false });
});

// ── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  res.status(500).json({ data: '', message: 'Internal server error', success: false });
});

module.exports = app;
