const mysqlService = require('../database/mysql');
const firebaseService = require('./firebase_service');

class SchoolBusNotificationService {
    
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
                // Not a school bus or no parents associated, silently return
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

                // If within 1km radius, add to notification list
                if (distance <= RADIUS_KM) {
                    parentsToNotify.push({
                        ...parent,
                        distance: distance
                    });
                }
            }

            // Send notifications to parents within radius
            if (parentsToNotify.length > 0) {
                for (const parent of parentsToNotify) {
                    // Determine title prefix (Mr/Mrs)
                    const titlePrefix = this.getTitlePrefix(parent.name);
                    const title = 'School Bus Arrival';
                    const message = `${titlePrefix} ${parent.name} your child is arrives from school through school bus near you on your area`;

                    try {
                        await firebaseService.sendNotificationToSingleUser(
                            parent.fcm_token,
                            title,
                            message,
                            {
                                type: 'school_bus_proximity',
                                imei: imei,
                                vehicleLat: vehicleLat,
                                vehicleLon: vehicleLon,
                                parentLat: parent.latitude,
                                parentLon: parent.longitude,
                                distance: parent.distance.toFixed(2)
                            }
                        );
                    } catch (error) {
                        console.error(`Error sending notification to parent ${parent.id}:`, error);
                    }
                }

                console.log(`School bus proximity notifications sent to ${parentsToNotify.length} parent(s) for IMEI: ${imei}`);
            }

        } catch (error) {
            console.error('Error checking school bus proximity:', error);
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
}

module.exports = SchoolBusNotificationService;

