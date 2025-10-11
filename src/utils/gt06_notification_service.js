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
                console.log(`No users with FCM tokens found for IMEI: ${imei}`);
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
            console.log(`🔍 Sending ignition change notification for IMEI: ${imei}, Old: ${oldIgnitionStatus}, New: ${newIgnitionStatus}`);
            
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
                
                console.log(`✅ Ignition change notification sent for IMEI: ${imei}`);
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
                
                console.log(`✅ Speed alert notification sent for IMEI: ${imei}`);
            }
        } catch (error) {
            console.error('Error checking speed limit:', error);
        }
    }

    // Check if vehicle is moving after ignition off and send notification
    static async checkMovingAfterIgnitionOffAndNotify(imei) {
        try {
            console.log(`🔍 Checking moving after ignition off for IMEI: ${imei}`);

            // Get latest status and location data
            const latestStatus = await mysqlService.getLatestStatus(imei);
            const latestLocation = await mysqlService.getLatestLocation(imei);

            if (!latestStatus || !latestLocation) {
                console.log(`❌ No status or location data found for IMEI: ${imei}`);
                return;
            }

            console.log(`📊 Status - Ignition: ${latestStatus.ignition}, Created: ${latestStatus.created_at}`);
            console.log(`📍 Location - Created: ${latestLocation.created_at}`);

            // Check if ignition is off
            if (!latestStatus.ignition) {
                const now = new Date();
                const ignitionOffTime = new Date(latestStatus.created_at);
                const locationTime = new Date(latestLocation.created_at);
                
                // Calculate time difference in minutes
                const timeSinceIgnitionOff = (now - ignitionOffTime) / (1000 * 60);
                const timeSinceLocation = (now - locationTime) / (1000 * 60);
                
                console.log(`⏱️ Time since ignition off: ${Math.round(timeSinceIgnitionOff)} minutes`);
                console.log(`⏱️ Time since location: ${Math.round(timeSinceLocation)} minutes`);
                console.log(`🔄 Location newer than ignition off: ${locationTime > ignitionOffTime}`);
                console.log(`📅 Location recent (≤5min): ${timeSinceLocation <= 5}`);
                console.log(`⏰ Ignition off long enough (≥2min): ${timeSinceIgnitionOff >= 2}`);
                
                // Only check if:
                // 1. Location is newer than status (vehicle moved after ignition off)
                // 2. Location is recent (within last 5 minutes)
                // 3. Ignition has been off for at least 2 minutes (to avoid false positives)
                if (locationTime > ignitionOffTime && 
                    timeSinceLocation <= 5 && 
                    timeSinceIgnitionOff >= 2) {
                    
                    console.log(`🚨 SENDING NOTIFICATION for IMEI: ${imei}`);
                    
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
                        
                        console.log(`✅ Moving after ignition off notification sent for IMEI: ${imei}`);
                    }
                } else {
                    console.log(`❌ Conditions not met for notification - IMEI: ${imei}`);
                }
            } else {
                console.log(`✅ Ignition is ON for IMEI: ${imei} - No notification needed`);
            }
        } catch (error) {
            console.error('Error checking moving after ignition off:', error);
        }
    }
}

module.exports = GT06NotificationService;