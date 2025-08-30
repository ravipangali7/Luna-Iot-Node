const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notification_controller');

router.get('/notifications', NotificationController.getNotifications);
router.post('/notification/create', NotificationController.createNotification);
router.delete('/notification/:id', NotificationController.deleteNotification);
router.put('/notification/:notificationId/read', NotificationController.markNotificationAsRead);
router.get('/notification/unread-count', NotificationController.getUnreadNotificationCount);

module.exports = router;