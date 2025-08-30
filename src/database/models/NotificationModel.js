const prisma = require('../prisma');

class NotificationModel {
    static async createNotification(data) {
        try {
            const notification = await prisma.getClient().notification.create({
                data: {
                    title: data.title,
                    message: data.message,
                    type: data.type, // 'all', 'specific', 'role'
                    sentById: data.sentById
                },
                include: {
                    sentBy: {
                        include: {
                            role: true
                        }
                    }
                }
            });

            // Create user-notification relations based on type
            if (data.type === 'all') {
                // Get all active users
                const allUsers = await prisma.getClient().user.findMany({
                    where: { status: 'ACTIVE' }
                });
                
                // Create user-notification relations for all users
                await Promise.all(allUsers.map(user => 
                    prisma.getClient().userNotification.create({
                        data: {
                            userId: user.id,
                            notificationId: notification.id
                        }
                    })
                ));
            } else if (data.type === 'specific' && data.targetUserIds) {
                // Create user-notification relations for specific users
                await Promise.all(data.targetUserIds.map(userId => 
                    prisma.getClient().userNotification.create({
                        data: {
                            userId: userId,
                            notificationId: notification.id
                        }
                    })
                ));
            } else if (data.type === 'role' && data.targetRoleIds) {
                // Get users with specific roles
                const usersWithRoles = await prisma.getClient().user.findMany({
                    where: {
                        roleId: { in: data.targetRoleIds },
                        status: 'ACTIVE'
                    }
                });
                
                // Create user-notification relations for users with specific roles
                await Promise.all(usersWithRoles.map(user => 
                    prisma.getClient().userNotification.create({
                        data: {
                            userId: user.id,
                            notificationId: notification.id
                        }
                    })
                ));
            }

            return notification;
        } catch (error) {
            console.error('NOTIFICATION CREATION ERROR', error);
            throw error;
        }
    }

    static async getNotifications(userId, userRole) {
        try {
            // If user is Super Admin, return all notifications
            if (userRole === 'Super Admin') {
                return await prisma.getClient().notification.findMany({
                    include: {
                        sentBy: {
                            include: {
                                role: true
                            }
                        },
                        userNotifications: {
                            include: {
                                user: {
                                    include: {
                                        role: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });
            } else {
                // For other roles, return only notifications they have access to
                const userNotifications = await prisma.getClient().userNotification.findMany({
                    where: { userId },
                    include: {
                        notification: {
                            include: {
                                sentBy: {
                                    include: {
                                        role: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });
                
                // Transform the data to match the expected format
                return userNotifications.map(un => un.notification);
            }
        } catch (error) {
            console.error('ERROR FETCHING NOTIFICATIONS', error);
            throw error;
        }
    }

    static async deleteNotification(id) {
        try {
            return await prisma.getClient().notification.delete({
                where: { id }
            });
        } catch (error) {
            console.error('ERROR DELETING NOTIFICATION', error);
            throw error;
        }
    }

    static async markNotificationAsRead(userId, notificationId) {
        try {
            return await prisma.getClient().userNotification.update({
                where: {
                    userId_notificationId: {
                        userId: userId,
                        notificationId: notificationId
                    }
                },
                data: {
                    isRead: true
                }
            });
        } catch (error) {
            console.error('ERROR MARKING NOTIFICATION AS READ', error);
            throw error;
        }
    }

    static async getUnreadNotificationCount(userId) {
        try {
            const count = await prisma.getClient().userNotification.count({
                where: {
                    userId: userId,
                    isRead: false
                }
            });
            return count;
        } catch (error) {
            console.error('ERROR FETCHING UNREAD NOTIFICATION COUNT', error);
            throw error;
        }
    }
}

module.exports = NotificationModel;