// src/routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authenticate = require('../middleware/auth');

// Protected profile routes
router.post('/user_profile', authenticate, userController.getUserProfile);
router.post('/edit_user', authenticate, userController.editUserProfile);
router.post('/user_logout', authenticate, userController.logoutUser);
router.post('/refresh_token', authenticate, userController.refreshToken);

// Remaining tracking, geofence, notification, and relationship endpoints
router.post('/get_home_data', authenticate, userController.getHomeData);
router.post('/join_user', authenticate, userController.joinUser);
router.post('/verify_join_data', authenticate, userController.verifyJoinUser);
router.post('/located_user_history', authenticate, userController.getLocatedUserHistoryData);
router.post('/disconnect_user', authenticate, userController.disconnectUser);
router.post('/update_location', authenticate, userController.updateLocation);
router.post('/user_location_details', authenticate, userController.getLocationDetails);
router.post('/manage_user_geojson', authenticate, userController.addGeofence);
router.post('/remove_user_history', authenticate, userController.removeUserHistory);
router.post('/user_hold_location_details', authenticate, userController.fetchStops);
router.post('/send_call_notification', authenticate, userController.sendSos);
router.post('/notification_list', authenticate, userController.getNotificationList);
router.post('/delete_zone', authenticate, userController.deleteZone);
router.post('/sync_app_usage', authenticate, userController.syncAppUsage);
router.post('/get_child_app_usage', authenticate, userController.getChildAppUsage);

module.exports = router;
