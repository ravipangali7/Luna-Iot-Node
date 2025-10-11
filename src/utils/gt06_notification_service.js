const mysqlService = require('../database/mysql');
const firebaseService = require('./firebase_service');

class GT06NotificationService {
    // In-memory notification cooldown tracking
    static notificationCooldowns = new Map();
    
    // Cooldown periods in milliseconds
    static COOLDOWN_PERIODS = {
        speed_alert: 5 * 60 * 1000, // 5 minutes
        ignition_change: 1 * 60 * 1000, // 1 minute
        moving_after_ignition_off: 30 * 60 * 1000 // 30 minutes
    };
    
    // Check if notification is in cooldown period
    static isInCooldown(imei, notificationType) {
        const key = `${imei}_${notificationType}`;
        const lastSent = this.notificationCooldowns.get(key);
        
        if (!lastSent) return false;
        
        const cooldownPeriod = this.COOLDOWN_PERIODS[notificationType] || 0;
        const timeSinceLastSent = Date.now() - lastSent;
        
        return timeSinceLastSent < cooldownPeriod;
    }
    
    // Set notification cooldown
    static setCooldown(imei, notificationType) {
        const key = `${imei}_${notificationType}`;
        this.notificationCooldowns.set(key, Date.now());
    }
    
    // Clear expired cooldowns to prevent memory leaks
    static clearExpiredCooldowns() {
        const now = Date.now();
        for (const [key, timestamp] of this.notificationCooldowns.entries()) {
            const notificationType = key.split('_').slice(1).join('_');
            const cooldownPeriod = this.COOLDOWN_PERIODS[notificationType] || 0;
            
            if (now - timestamp > cooldownPeriod) {
                this.notificationCooldowns.delete(key);
            }
        }
    }
    
    // Get cooldown status for debugging
    static getCooldownStatus(imei, notificationType) {
        const key = `${imei}_${notificationType}`;
        const lastSent = this.notificationCooldowns.get(key);
        
        if (!lastSent) return { inCooldown: false, timeRemaining: 0 };
        
        const cooldownPeriod = this.COOLDOWN_PERIODS[notificationType] || 0;
        const timeSinceLastSent = Date.now() - lastSent;
        const timeRemaining = Math.max(0, cooldownPeriod - timeSinceLastSent);
        
        return {
            inCooldown: timeSinceLastSent < cooldownPeriod,
            timeRemaining: timeRemaining,
            lastSent: new Date(lastSent)
        };
    }
    
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

    // Check if ignition status changed and send notification
    static async checkIgnitionChangeAndNotify(imei, newIgnitionStatus) {
        try {
            // Check if notification is in cooldown
            if (this.isInCooldown(imei, 'ignition_change')) {
                return;
            }

            // Get latest status to compare ignition
            const latestStatus = await mysqlService.getLatestStatus(imei);

            // If no previous status or ignition changed, send notification
            if (!latestStatus || latestStatus.ignition !== newIgnitionStatus) {
                const vehicle = await mysqlService.getVehicleByImei(imei);

                if (vehicle) {
                    const ignitionStatus = newIgnitionStatus ? 'On' : 'Off';
                    const title = 'Vehicle Status Update';
                    const message = `${vehicle.vehicle_no}: Ignition is ${ignitionStatus}`;

                    await this.sendVehicleNotification(imei, title, message, {
                        type: 'ignition_change',
                        ignitionStatus: newIgnitionStatus
                    });
                    
                    // Set cooldown after sending notification
                    this.setCooldown(imei, 'ignition_change');
                }
            }
        } catch (error) {
            console.error('Error checking ignition change:', error);
        }
    }

    // Check speed limit and send overspeeding notification
    static async checkSpeedLimitAndNotify(imei, currentSpeed) {
        try {
            // Check if notification is in cooldown
            if (this.isInCooldown(imei, 'speed_alert')) {
                return;
            }

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
                
                // Set cooldown after sending notification
                this.setCooldown(imei, 'speed_alert');
            }
        } catch (error) {
            console.error('Error checking speed limit:', error);
        }
    }

    // Check if vehicle is moving after ignition off and send notification
    static async checkMovingAfterIgnitionOffAndNotify(imei) {
        try {
            // Check if notification is in cooldown
            if (this.isInCooldown(imei, 'moving_after_ignition_off')) {
                (`Moving after ignition off notification for ${imei} is in cooldown`);
                return;
            }

            // Get latest status and location data
            const latestStatus = await mysqlService.getLatestStatus(imei);
            const latestLocation = await mysqlService.getLatestLocation(imei);

            if (!latestStatus || !latestLocation) return;

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
                        
                        // Set cooldown after sending notification (30 minutes)
                        this.setCooldown(imei, 'moving_after_ignition_off');
                    }
                }
            }
        } catch (error) {
            console.error('Error checking moving after ignition off:', error);
        }
    }
}

module.exports = GT06NotificationService;