const admin = require('firebase-admin');
require('dotenv').config();

class FirebaseService {
    constructor() {
        this.initializeFirebase();
    }

    initializeFirebase() {
        try {
            // Initialize Firebase Admin SDK
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                    })
                });
            }
        } catch (error) {
            console.error('Firebase initialization error:', error);
        }
    }

    async sendNotificationToSingleUser(fcmToken, title, message, data = {}) {
        try {
            const notification = {
                token: fcmToken,
                notification: {
                    title: title,
                    body: message
                },
                data: {
                    ...data,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channel_id: 'luna_iot_channel'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default'
                        }
                    }
                }
            };

            const response = await admin.messaging().send(notification);
            return { success: true, messageId: response };
        } catch (error) {
            console.error('Error sending notification:', error);
            return { success: false, error: error.message };
        }
    }

    async sendNotificationToMultipleUsers(fcmTokens, title, message, data = {}) {
        try {
            if (fcmTokens.length === 0) {
                return { success: false, error: 'No FCM tokens provided' };
            }

            const notification = {
                notification: {
                    title: title,
                    body: message
                },
                data: {
                    ...data,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channel_id: 'luna_iot_channel'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default'
                        }
                    }
                }
            };

            // Send to multiple tokens
            const response = await admin.messaging().sendMulticast({
                tokens: fcmTokens,
                ...notification
            });

            return { 
                success: true, 
                successCount: response.successCount, 
                failureCount: response.failureCount 
            };
        } catch (error) {
            console.error('Error sending notifications to multiple users:', error);
            return { success: false, error: error.message };
        }
    }

    async sendNotificationToTopic(topic, title, message, data = {}) {
        try {
            const notification = {
                topic: topic,
                notification: {
                    title: title,
                    body: message
                },
                data: {
                    ...data,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channel_id: 'luna_iot_channel'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default'
                        }
                    }
                }
            };

            const response = await admin.messaging().send(notification);
            return { success: true, messageId: response };
        } catch (error) {
            console.error('Error sending notification to topic:', error);
            return { success: false, error: error.message };
        }
    }

    async sendNotificationToMultipleUsers(fcmTokens, title, message, data = {}) {
        try {
            if (fcmTokens.length === 0) {
                return { success: false, error: 'No FCM tokens provided' };
            }
    
            const notification = {
                notification: {
                    title: title,
                    body: message
                },
                data: {
                    ...data,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channel_id: 'luna_iot_channel'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default'
                        }
                    }
                }
            };
    
            // Send to multiple tokens using sendEachForMulticast
            const response = await admin.messaging().sendEachForMulticast({
                tokens: fcmTokens,
                ...notification
            });
    
            return { 
                success: true, 
                successCount: response.successCount, 
                failureCount: response.failureCount 
            };
        } catch (error) {
            console.error('Error sending notifications to multiple users:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new FirebaseService();