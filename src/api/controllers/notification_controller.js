const NotificationModel = require('../../database/models/NotificationModel');
const UserModel = require('../../database/models/UserModel');
const FirebaseService = require('../../utils/firebase_service');

class NotificationController {
    // Get notifications based on user role
    static async getNotifications(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role.name;

            const notifications = await NotificationModel.getNotifications(userId, userRole);
            
            return res.status(200).json({
                success: true,
                data: notifications
            });
        } catch (error) {
            console.error('GET NOTIFICATIONS ERROR', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch notifications'
            });
        }
    }

    // Create notification (Super Admin only)
    static async createNotification(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role.name;

            // Check if user is Super Admin
            if (userRole !== 'Super Admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Only Super Admin can create notifications'
                });
            }

            const { title, message, type, targetUserIds, targetRoleIds } = req.body;

            // Validate required fields
            if (!title || !message || !type) {
                return res.status(400).json({
                    success: false,
                    message: 'Title, message, and type are required'
                });
            }

            // Validate type
            if (!['all', 'specific', 'role'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Type must be all, specific, or role'
                });
            }

            // Validate targetUserIds for specific type
            if (type === 'specific' && (!targetUserIds || !Array.isArray(targetUserIds))) {
                return res.status(400).json({
                    success: false,
                    message: 'targetUserIds array is required for specific type'
                });
            }

            // Validate targetRoleIds for role type
            if (type === 'role' && (!targetRoleIds || !Array.isArray(targetRoleIds))) {
                return res.status(400).json({
                    success: false,
                    message: 'targetRoleIds array is required for role type'
                });
            }

            // Create notification
            const notification = await NotificationModel.createNotification({
                title,
                message,
                type,
                sentById: userId,
                targetUserIds,
                targetRoleIds
            });

            // Send push notifications
            try {
                let fcmTokens = [];

                if (type === 'all') {
                    // Get all active users' FCM tokens
                    const allUsers = await UserModel.getAllUsers();
                    fcmTokens = allUsers
                        .filter(user => user.fcmToken && user.status === 'ACTIVE')
                        .map(user => user.fcmToken);
                } else if (type === 'specific' && targetUserIds) {
                    // Get specific users' FCM tokens
                    const specificUsers = await Promise.all(
                        targetUserIds.map(id => UserModel.getUserById(id))
                    );
                    fcmTokens = specificUsers
                        .filter(user => user && user.fcmToken && user.status === 'ACTIVE')
                        .map(user => user.fcmToken);
                } else if (type === 'role' && targetRoleIds) {
                    // Get users with specific roles' FCM tokens
                    const usersWithRoles = await UserModel.getAllUsers();
                    fcmTokens = usersWithRoles
                        .filter(user => 
                            targetRoleIds.includes(user.roleId) && 
                            user.fcmToken && 
                            user.status === 'ACTIVE'
                        )
                        .map(user => user.fcmToken);
                }

                if (fcmTokens.length > 0) {
                    await FirebaseService.sendNotificationToMultipleUsers(
                        fcmTokens,
                        title,
                        message,
                        { notificationId: notification.id.toString() }
                    );
                }
            } catch (firebaseError) {
                console.error('Firebase notification error:', firebaseError);
                // Don't fail the request if Firebase fails
            }

            return res.status(201).json({
                success: true,
                message: 'Notification created successfully',
                data: notification
            });
        } catch (error) {
            console.error('CREATE NOTIFICATION ERROR', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create notification'
            });
        }
    }

    // Delete notification (Super Admin only)
    static async deleteNotification(req, res) {
        try {
            const userId = req.user.id;
            const userRole = req.user.role.name;
            const notificationId = parseInt(req.params.id);

            // Check if user is Super Admin
            if (userRole !== 'Super Admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Only Super Admin can delete notifications'
                });
            }

            await NotificationModel.deleteNotification(notificationId);

            return res.status(200).json({
                success: true,
                message: 'Notification deleted successfully'
            });
        } catch (error) {
            console.error('DELETE NOTIFICATION ERROR', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete notification'
            });
        }
    }

    // Mark notification as read
    static async markNotificationAsRead(req, res) {
        try {
            const userId = req.user.id;
            const notificationId = parseInt(req.params.notificationId);

            await NotificationModel.markNotificationAsRead(userId, notificationId);

            return res.status(200).json({
                success: true,
                message: 'Notification marked as read'
            });
        } catch (error) {
            console.error('MARK NOTIFICATION AS READ ERROR', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to mark notification as read'
            });
        }
    }

    // Get unread notification count
    static async getUnreadNotificationCount(req, res) {
        try {
            const userId = req.user.id;
            const count = await NotificationModel.getUnreadNotificationCount(userId);

            return res.status(200).json({
                success: true,
                data: { count }
            });
        } catch (error) {
            console.error('GET UNREAD COUNT ERROR', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get unread count'
            });
        }
    }
}

module.exports = NotificationController;