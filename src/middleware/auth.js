// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { buildErrorResponse } = require('../utils/encryption');

/**
 * Middleware to verify Bearer token on protected routes.
 * The Android app sends: Authorization: Bearer <token>
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(buildErrorResponse('Unauthorized: No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, name }
    next();
  } catch (err) {
    return res.status(401).json(buildErrorResponse('Unauthorized: Invalid or expired token'));
  }
}

module.exports = authenticate;

