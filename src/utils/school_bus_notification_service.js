const mysqlService = require('../database/mysql');
const firebaseService = require('./firebase_service');

class SchoolBusNotificationService {
    // In-memory cache to track notification state for each parent-IMEI pair
    // Key format: `${imei}_${parentId}`, Value: { isInside: boolean, lastCheckTime: timestamp, lastNotificationLat: number, lastNotificationLon: number }
    static notificationStateCache = new Map();
    
    // Minimum distance threshold (in kilometers) - bus must move at least this distance from last notification location
    static MIN_DISTANCE_THRESHOLD_KM = 0.5; // 500 meters = 0.5 km
    
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
     * Check if school bus is within 1km of any associated parent's location
     * and send FCM notifications to those parents
     */
    static async checkSchoolBusProximityAndNotify(imei, vehicleLat, vehicleLon) {
        try {
            // Get all school parents associated with this school bus
            const parents = await mysqlService.getSchoolBusParentsByImei(imei);

            if (parents.length === 0) {
                return;
            }

            const RADIUS_KM = 1.0; // 1 kilometer radius
            const parentsToNotify = [];

            // Check distance for each parent
            for (const parent of parents) {
                if (!parent.latitude || !parent.longitude) {
                    continue; // Skip if parent location is not set
                }

                const distance = this.calculateDistance(
                    vehicleLat,
                    vehicleLon,
                    parent.latitude,
                    parent.longitude
                );

                // Check if within 1km radius
                const isCurrentlyInside = distance <= RADIUS_KM;
                const cacheKey = `${imei}_${parent.id}`;
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
                        // Check if bus has moved at least 500m from last notification location
                        if (lastState.lastNotificationLat && lastState.lastNotificationLon) {
                            const distanceFromLastNotification = this.calculateDistance(
                                vehicleLat,
                                vehicleLon,
                                lastState.lastNotificationLat,
                                lastState.lastNotificationLon
                            );
                            
                            // Only notify if bus has moved at least 500m from last notification location
                            if (distanceFromLastNotification >= this.MIN_DISTANCE_THRESHOLD_KM) {
                                shouldNotify = true;
                            }
                        } else {
                            // No previous notification location, allow notification
                            shouldNotify = true;
                        }
                    }
                }
                
                // Update cache with current state
                this.notificationStateCache.set(cacheKey, {
                    isInside: isCurrentlyInside,
                    lastCheckTime: Date.now(),
                    lastNotificationLat: lastState?.lastNotificationLat || null,
                    lastNotificationLon: lastState?.lastNotificationLon || null
                });
                
                // Add to notification list if should notify
                if (shouldNotify) {
                    parentsToNotify.push({
                        ...parent,
                        distance: distance,
                        cacheKey: cacheKey
                    });
                }
            }

            // Send notifications to parents within radius
            if (parentsToNotify.length > 0) {
                for (const parent of parentsToNotify) {
                    const title = 'School Bus Alert';
                    const message = `${parent.name} जी स्कूल बस तपाइको घर नजिक आइपुग्यो |`;

                    try {
                        // Convert all data values to strings (Firebase requirement)
                        await firebaseService.sendNotificationToSingleUser(
                            parent.fcm_token,
                            title,
                            message,
                            {
                                type: 'school_bus_proximity',
                                imei: String(imei),
                                vehicleLat: String(vehicleLat),
                                vehicleLon: String(vehicleLon),
                                parentLat: String(parent.latitude),
                                parentLon: String(parent.longitude),
                                distance: String(parent.distance.toFixed(2))
                            }
                        );
                        
                        // Update cache with current bus location as last notification location
                        const cacheKey = parent.cacheKey;
                        const currentState = this.notificationStateCache.get(cacheKey);
                        if (currentState) {
                            this.notificationStateCache.set(cacheKey, {
                                ...currentState,
                                lastNotificationLat: parseFloat(vehicleLat),
                                lastNotificationLon: parseFloat(vehicleLon)
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
    SchoolBusNotificationService.cleanupCache();
}, 60 * 60 * 1000); // 1 hour

module.exports = SchoolBusNotificationService;

