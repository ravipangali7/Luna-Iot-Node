const mysqlService = require('../database/mysql');
const firebaseService = require('./firebase_service');

class SchoolBusNotificationService {
    // In-memory cache to track notification state for each parent-IMEI pair
    // Key format: `${imei}_${parentId}`, Value: { isInside: boolean, lastCheckTime: timestamp }
    static notificationStateCache = new Map();
    
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
            console.log(`[SchoolBus Service] Starting proximity check for IMEI: ${imei}, Vehicle Location: ${vehicleLat}, ${vehicleLon}`);
            
            // Get all school parents associated with this school bus
            const parents = await mysqlService.getSchoolBusParentsByImei(imei);

            if (parents.length === 0) {
                console.log(`[SchoolBus Service] No parents found for IMEI: ${imei} - Not a school bus or no parents associated`);
                return;
            }

            console.log(`[SchoolBus Service] Found ${parents.length} parent(s) associated with school bus IMEI: ${imei}`);

            const RADIUS_KM = 1.0; // 1 kilometer radius
            const parentsToNotify = [];

            // Check distance for each parent
            for (const parent of parents) {
                console.log(`[SchoolBus Service] Checking parent ID: ${parent.id}, Name: ${parent.name}`);
                
                if (!parent.latitude || !parent.longitude) {
                    console.log(`[SchoolBus Service] Skipping parent ${parent.id} - missing location data (lat: ${parent.latitude}, lon: ${parent.longitude})`);
                    continue; // Skip if parent location is not set
                }

                console.log(`[SchoolBus Service] Parent ${parent.id} location: ${parent.latitude}, ${parent.longitude}`);

                const distance = this.calculateDistance(
                    vehicleLat,
                    vehicleLon,
                    parent.latitude,
                    parent.longitude
                );

                console.log(`[SchoolBus Service] Distance from parent ${parent.id} (${parent.name}): ${distance.toFixed(3)} km`);

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
                        console.log(`[SchoolBus Service] Parent ${parent.id} (${parent.name}) - First check: inside radius, will notify`);
                    } else {
                        console.log(`[SchoolBus Service] Parent ${parent.id} (${parent.name}) - First check: outside radius, no notification`);
                    }
                } else {
                    // Check state transition
                    const wasInside = lastState.isInside;
                    
                    if (!wasInside && isCurrentlyInside) {
                        // Transition: Outside → Inside (entering radius)
                        shouldNotify = true;
                        console.log(`[SchoolBus Service] Parent ${parent.id} (${parent.name}) - State change: Entering radius, will notify`);
                    } else if (wasInside && isCurrentlyInside) {
                        // Still inside - don't notify again (prevent spam)
                        console.log(`[SchoolBus Service] Parent ${parent.id} (${parent.name}) - Still inside radius, skipping notification (already notified)`);
                    } else if (wasInside && !isCurrentlyInside) {
                        // Transition: Inside → Outside (leaving radius)
                        console.log(`[SchoolBus Service] Parent ${parent.id} (${parent.name}) - State change: Leaving radius, no notification`);
                    } else {
                        // Still outside - no notification
                        console.log(`[SchoolBus Service] Parent ${parent.id} (${parent.name}) - Still outside radius, no notification`);
                    }
                }
                
                // Update cache with current state
                this.notificationStateCache.set(cacheKey, {
                    isInside: isCurrentlyInside,
                    lastCheckTime: Date.now()
                });
                
                // Add to notification list if should notify
                if (shouldNotify) {
                    parentsToNotify.push({
                        ...parent,
                        distance: distance
                    });
                }
            }

            console.log(`[SchoolBus Service] Total parents to notify: ${parentsToNotify.length}`);

            // Send notifications to parents within radius
            if (parentsToNotify.length > 0) {
                console.log(`[SchoolBus Service] Preparing to send notifications to ${parentsToNotify.length} parent(s)`);
                
                for (const parent of parentsToNotify) {
                    // Determine title prefix (Mr/Mrs)
                    const titlePrefix = this.getTitlePrefix(parent.name);
                    const title = 'School Bus Arrival';
                    const message = `${titlePrefix} ${parent.name} your child is arrives from school through school bus near you on your area`;

                    console.log(`[SchoolBus Service] Sending notification to parent ${parent.id} (${parent.name})`);
                    console.log(`[SchoolBus Service] Notification details - Title: ${title}, Message: ${message}`);
                    console.log(`[SchoolBus Service] FCM Token: ${parent.fcm_token ? parent.fcm_token.substring(0, 20) + '...' : 'MISSING'}`);

                    try {
                        // Convert all data values to strings (Firebase requirement)
                        const result = await firebaseService.sendNotificationToSingleUser(
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
                        console.log(`[SchoolBus Service] Notification sent successfully to parent ${parent.id}:`, result);
                    } catch (error) {
                        console.error(`[SchoolBus Service] Error sending notification to parent ${parent.id}:`, error);
                    }
                }

                console.log(`[SchoolBus Service] ✅ School bus proximity notifications sent to ${parentsToNotify.length} parent(s) for IMEI: ${imei}`);
            } else {
                console.log(`[SchoolBus Service] No parents within ${RADIUS_KM}km radius for IMEI: ${imei}`);
            }

        } catch (error) {
            console.error('[SchoolBus Service] ❌ Error checking school bus proximity:', error);
            console.error('[SchoolBus Service] Error stack:', error.stack);
        }
    }

    /**
     * Determine title prefix (Mr/Mrs) based on name
     * Simple heuristic: if name contains common female titles/names, use Mrs, otherwise Mr
     */
    static getTitlePrefix(name) {
        if (!name) {
            return 'Mr/Mrs';
        }

        const nameLower = name.toLowerCase();
        // Common patterns that might indicate female (this is a simple heuristic)
        const femaleIndicators = ['mrs', 'miss', 'ms', 'kumari', 'devi'];
        
        for (const indicator of femaleIndicators) {
            if (nameLower.includes(indicator)) {
                return 'Mrs';
            }
        }

        // Default to Mr if no female indicators found
        return 'Mr';
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

