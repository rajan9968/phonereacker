// src/routes/circle.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/auth');

// Protected circle connections & notifications routes
router.post('/verify_join_data', authenticate, userController.verifyJoinUser);
router.post('/join_user', authenticate, userController.joinUser);
router.post('/disconnect_user', authenticate, userController.disconnectUser);
router.post('/located_user_history', authenticate, userController.getLocatedUserHistoryData);
router.post('/notification_list', authenticate, userController.getNotificationList);

module.exports = router;
