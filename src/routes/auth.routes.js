// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// POST /social_login  — No auth required
router.post('/social_login', authController.socialLogin);
router.post('/get_privacy', authController.getPrivacyPolicy);
router.post('/app_common_data', authController.appUpdateData);

module.exports = router;
