const mysqlService = require('../database/mysql');
const firebaseService = require('./firebase_service');

class GT06NotificationService {
    
    // Send notification to all users who have access to a vehicle and notifications enabled
    static async sendVehicleNotification(imei, title, message, data = {}) {
        try {
            // Get all users who have access to this vehicle and notifications enabled
            const users = await mysqlService.getUsersWithVehicleAccess(imei);

            if (users.length === 0) {
                console.log(`No users with notifications enabled found for IMEI: ${imei}`);
                return;
            }

            // Filter users with FCM tokens
            const usersWithFcmTokens = users.filter(user => user.fcm_token && user.fcm_token.trim() !== '');

            if (usersWithFcmTokens.length === 0) {
                // console.log(`No users with FCM tokens found for IMEI: ${imei}`);
                return;
            }

            // Extract FCM tokens
            const fcmTokens = usersWithFcmTokens.map(user => user.fcm_token);

            // Send notification to all users
            const result = await firebaseService.sendNotificationToMultipleUsers(
                fcmTokens,
                title,
                message,
                {}
            );

            return result;

        } catch (error) {
            console.error('Error sending vehicle notification:', error);
            throw error;
        }
    }

    // Send ignition change notification
    static async checkIgnitionChangeAndNotify(imei, newIgnitionStatus, oldIgnitionStatus) {
        try {
            const vehicle = await mysqlService.getVehicleByImei(imei);

            if (vehicle) {
                const ignitionStatus = newIgnitionStatus ? 'On' : 'Off';
                const title = 'Vehicle Status Update';
                const message = `${vehicle.vehicle_no}: Ignition is ${ignitionStatus}`;

                await this.sendVehicleNotification(imei, title, message, {
                    type: 'ignition_change',
                    ignitionStatus: newIgnitionStatus,
                    oldIgnitionStatus: oldIgnitionStatus
                });
            }
        } catch (error) {
            console.error('Error sending ignition change notification:', error);
        }
    }

    // Check speed limit and send overspeeding notification
    static async checkSpeedLimitAndNotify(imei, currentSpeed) {
        try {
            // Get vehicle speed limit
            const vehicle = await mysqlService.getVehicleByImei(imei);

            if (!vehicle) return;

            // Check if speed exceeds limit
            if (currentSpeed > vehicle.speed_limit) {
                const title = 'Speed Alert';
                const message = `${vehicle.vehicle_no}: Vehicle is Overspeeding at ${currentSpeed} km/h`;

                await this.sendVehicleNotification(imei, title, message, {
                    type: 'overspeeding',
                    currentSpeed: currentSpeed,
                    speedLimit: vehicle.speed_limit
                });
                
            }
        } catch (error) {
            console.error('Error checking speed limit:', error);
        }
    }

    // Check if vehicle is moving after ignition off and send notification
    static async checkMovingAfterIgnitionOffAndNotify(imei) {
        try {
            // Get latest status and location data
            const latestStatus = await mysqlService.getLatestStatus(imei);
            const latestLocation = await mysqlService.getLatestLocation(imei);

            if (!latestStatus || !latestLocation) {
                return;
            }

            // Check if ignition is off
            if (!latestStatus.ignition) {
                const now = new Date();
                const ignitionOffTime = new Date(latestStatus.created_at);
                const locationTime = new Date(latestLocation.created_at);
                
                // Calculate time difference in minutes
                const timeSinceIgnitionOff = (now - ignitionOffTime) / (1000 * 60);
                const timeSinceLocation = (now - locationTime) / (1000 * 60);
                
                // Only check if:
                // 1. Location is newer than status (vehicle moved after ignition off)
                // 2. Location is recent (within last 5 minutes)
                // 3. Ignition has been off for at least 2 minutes (to avoid false positives)
                if (locationTime > ignitionOffTime && 
                    timeSinceLocation <= 5 && 
                    timeSinceIgnitionOff >= 2) {
                    
                    const vehicle = await mysqlService.getVehicleByImei(imei);

                    if (vehicle) {
                        const title = 'Vehicle Movement Alert';
                        const message = `${vehicle.vehicle_no}: Vehicle is moving after ignition was turned off ${Math.round(timeSinceIgnitionOff)} minutes ago`;

                        await this.sendVehicleNotification(imei, title, message, {
                            type: 'moving_after_ignition_off',
                            ignitionOffTime: latestStatus.created_at,
                            lastLocationTime: latestLocation.created_at,
                            timeSinceIgnitionOff: Math.round(timeSinceIgnitionOff)
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error checking moving after ignition off:', error);
        }
    }
}

module.exports = GT06NotificationService;