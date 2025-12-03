const mysqlService = require('../database/mysql');
const firebaseService = require('./firebase_service');

class PublicVehicleNotificationService {
    // In-memory cache to track notification state for each user-IMEI pair
    // Key format: `${imei}_${userId}`, Value: { isInside: boolean, lastCheckTime: timestamp, lastNotificationTime: timestamp }
    static notificationStateCache = new Map();
    
    // Minimum time interval (in milliseconds) - must wait at least this time between notifications for same IMEI-user pair
    static MIN_NOTIFICATION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
    
    /**
     * Calculate distance between two points using Haversine formula
     * Returns distance in kilometers
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        
        const lat1Rad = this.toRadians(parseFloat(lat1));
        const lon1Rad = this.toRadians(parseFloat(lon1));
        const lat2Rad = this.toRadians(parseFloat(lat2));
        const lon2Rad = this.toRadians(parseFloat(lon2));
        
        const dLat = lat2Rad - lat1Rad;
        const dLon = lon2Rad - lon1Rad;
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.asin(Math.sqrt(a));
        
        return R * c;
    }

    /**
     * Convert degrees to radians
     */
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Check if public vehicle is within 300m of any subscribed user's location
     * and send FCM notifications to those users
     */
    static async checkPublicVehicleProximityAndNotify(imei, vehicleLat, vehicleLon) {
        try {
            // Get all subscribed users for this public vehicle
            const subscriptions = await mysqlService.getPublicVehicleSubscriptionsByImei(imei);

            if (subscriptions.length === 0) {
                return;
            }

            const RADIUS_KM = 0.3; // 300 meters radius
            const usersToNotify = [];

            // Check distance for each subscription
            for (const subscription of subscriptions) {
                if (!subscription.latitude || !subscription.longitude) {
                    continue; // Skip if user location is not set
                }

                const distance = this.calculateDistance(
                    vehicleLat,
                    vehicleLon,
                    subscription.latitude,
                    subscription.longitude
                );

                // Check if within 300m radius
                const isCurrentlyInside = distance <= RADIUS_KM;
                const cacheKey = `${imei}_${subscription.id}`;
                const lastState = this.notificationStateCache.get(cacheKey);
                
                // Determine if we should notify (only when entering the radius, not when already inside)
                let shouldNotify = false;
                
                if (!lastState) {
                    // First time checking - notify if inside
                    if (isCurrentlyInside) {
                        shouldNotify = true;
                    }
                } else {
                    // Check state transition
                    const wasInside = lastState.isInside;
                    
                    if (!wasInside && isCurrentlyInside) {
                        // Transition: Outside → Inside (entering radius)
                        // Check if at least 30 minutes have passed since last notification
                        if (lastState.lastNotificationTime) {
                            const timeSinceLastNotification = Date.now() - lastState.lastNotificationTime;
                            
                            // Only notify if at least 30 minutes have passed since last notification
                            if (timeSinceLastNotification >= this.MIN_NOTIFICATION_INTERVAL_MS) {
                                shouldNotify = true;
                            }
                        } else {
                            // No previous notification time, allow notification
                            shouldNotify = true;
                        }
                    }
                }
                
                // Update cache with current state
                this.notificationStateCache.set(cacheKey, {
                    isInside: isCurrentlyInside,
                    lastCheckTime: Date.now(),
                    lastNotificationTime: lastState?.lastNotificationTime || null
                });
                
                // Add to notification list if should notify
                if (shouldNotify) {
                    usersToNotify.push({
                        ...subscription,
                        distance: distance,
                        cacheKey: cacheKey
                    });
                }
            }

            // Send notifications to users within radius
            if (usersToNotify.length > 0) {
                for (const user of usersToNotify) {
                    const title = 'Public Vehicle Alert';
                    const message = `Public Vehicle आउँदैछ |`;

                    try {
                        // Convert all data values to strings (Firebase requirement)
                        await firebaseService.sendNotificationToSingleUser(
                            user.fcm_token,
                            title,
                            message,
                            {
                                type: 'public_vehicle_proximity',
                                imei: String(imei),
                                vehicleLat: String(vehicleLat),
                                vehicleLon: String(vehicleLon),
                                userLat: String(user.latitude),
                                userLon: String(user.longitude),
                                distance: String(user.distance.toFixed(2))
                            }
                        );
                        
                        // Update cache with current time as last notification time
                        const cacheKey = user.cacheKey;
                        const currentState = this.notificationStateCache.get(cacheKey);
                        if (currentState) {
                            this.notificationStateCache.set(cacheKey, {
                                ...currentState,
                                lastNotificationTime: Date.now()
                            });
                        }
                    } catch (error) {
                        // Silently handle notification errors
                    }
                }
            }

        } catch (error) {
            // Silently handle errors
        }
    }

    /**
     * Clean up old cache entries (older than 24 hours) to prevent memory leaks
     * This can be called periodically or on startup
     */
    static cleanupCache() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        for (const [key, value] of this.notificationStateCache.entries()) {
            if (now - value.lastCheckTime > maxAge) {
                this.notificationStateCache.delete(key);
            }
        }
    }
}

// Cleanup cache every hour
setInterval(() => {
    PublicVehicleNotificationService.cleanupCache();
}, 60 * 60 * 1000); // 1 hour

module.exports = PublicVehicleNotificationService;

