const mysqlService = require('../database/mysql');
const firebaseService = require('./firebase_service');
const datetimeService = require('./datetime_service');

class GeofenceService {
    
    /**
     * Main entry point: Check geofences for a location update
     * @param {string} imei - Vehicle IMEI
     * @param {number} latitude - Current latitude
     * @param {number} longitude - Current longitude
     */
    async checkGeofenceForLocation(imei, latitude, longitude) {
        try {
            // Get all geofences assigned to this vehicle
            const geofences = await mysqlService.getGeofencesForVehicle(imei);
            
            if (!geofences || geofences.length === 0) {
                // No geofences assigned to this vehicle
                return;
            }

            // Process each geofence
            for (const geofence of geofences) {
                await this.processGeofence(geofence, latitude, longitude);
            }
            
        } catch (error) {
            console.error('Error in checkGeofenceForLocation:', error);
        }
    }

    /**
     * Process a single geofence for the current location
     * @param {object} geofence - Geofence data with vehicle info
     * @param {number} latitude - Current latitude
     * @param {number} longitude - Current longitude
     */
    async processGeofence(geofence, latitude, longitude) {
        try {
            const vehicleId = geofence.vehicle_id;
            const geofenceId = geofence.id;
            const geofenceTitle = geofence.title;
            const geofenceType = geofence.type;
            const vehicleNo = geofence.vehicle_no;
            
            // Parse boundary - it's stored as JSON array of "lat,lng" strings
            let boundary;
            try {
                if (typeof geofence.boundary === 'string') {
                    boundary = JSON.parse(geofence.boundary);
                } else {
                    boundary = geofence.boundary;
                }
                
                // Handle nested array format: [["lat,lng", "lat,lng", ...]]
                if (Array.isArray(boundary) && Array.isArray(boundary[0])) {
                    boundary = boundary[0];
                }
            } catch (e) {
                console.error(`Error parsing boundary for geofence ${geofenceId}:`, e);
                return;
            }

            // Check if current location is inside the polygon
            const isCurrentlyInside = this.isPointInPolygon(latitude, longitude, boundary);

            // Get the last state from database
            const lastEvent = await mysqlService.getLastGeofenceEvent(vehicleId, geofenceId);

            const nepalTime = datetimeService.nepalTimeDate();
            
            // Determine if we need to send notification and update state
            let shouldNotify = false;
            let eventType = null;

            if (!lastEvent) {
                // First time tracking this vehicle in this geofence
                if (isCurrentlyInside) {
                    shouldNotify = true;
                    eventType = 'Entry';
                } else {
                    // Vehicle is outside, just record the state (no notification for initial outside state)
                    eventType = 'Exit';
                }
            } else {
                const wasInside = Boolean(lastEvent.is_inside);
                
                // State change detection - always notify on state changes
                if (!wasInside && isCurrentlyInside) {
                    // Transition: Outside → Inside
                    shouldNotify = true;
                    eventType = 'Entry';
                } else if (wasInside && !isCurrentlyInside) {
                    // Transition: Inside → Outside
                    shouldNotify = true;
                    eventType = 'Exit';
                }
                // If no state change (still inside or still outside), don't notify
            }

            // Save or update the event state
            if (eventType) {
                const eventData = {
                    vehicleId: vehicleId,
                    geofenceId: geofenceId,
                    isInside: isCurrentlyInside,
                    eventType: eventType,
                    eventAt: nepalTime
                };

                if (!lastEvent) {
                    // Insert new event
                    await mysqlService.insertGeofenceEvent(eventData);
                } else {
                    // Update existing event
                    await mysqlService.updateGeofenceEvent(vehicleId, geofenceId, eventData);
                }
            }

            // Send notification if needed
            if (shouldNotify && eventType) {
                await this.sendGeofenceNotification(geofence, eventType);
            }

        } catch (error) {
            console.error('Error processing geofence:', error);
        }
    }

    /**
     * Check if a point is inside a polygon using ray casting algorithm
     * @param {number} lat - Point latitude
     * @param {number} lng - Point longitude
     * @param {array} boundary - Array of "lat,lng" string coordinates
     * @returns {boolean} - True if point is inside polygon
     */
    isPointInPolygon(lat, lng, boundary) {
        try {
            // Convert boundary strings to coordinate pairs
            const polygon = boundary.map(coordStr => {
                const [pointLat, pointLng] = coordStr.split(',').map(s => parseFloat(s.trim()));
                return { lat: pointLat, lng: pointLng };
            });

            if (polygon.length < 3) {
                return false; // Not a valid polygon
            }

            let inside = false;
            const x = lng;
            const y = lat;

            // Ray casting algorithm
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i].lng;
                const yi = polygon[i].lat;
                const xj = polygon[j].lng;
                const yj = polygon[j].lat;

                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                
                if (intersect) {
                    inside = !inside;
                }
            }

            return inside;
        } catch (error) {
            console.error('Error in isPointInPolygon:', error);
            return false;
        }
    }

    /**
     * Send geofence notification to all users assigned to the geofence
     * @param {object} geofence - Geofence data with vehicle info
     * @param {string} eventType - 'Entry' or 'Exit'
     */
    async sendGeofenceNotification(geofence, eventType) {
        try {
            const geofenceId = geofence.id;
            const geofenceTitle = geofence.title;
            const vehicleNo = geofence.vehicle_no || geofence.vehicle_name || 'Unknown Vehicle';

            // Get all users assigned to this geofence
            const users = await mysqlService.getGeofenceUsers(geofenceId);

            if (!users || users.length === 0) {
                console.log(`No users with FCM tokens found for geofence: ${geofenceTitle}`);
                return;
            }

            // Prepare notification message
            let title, message;
            if (eventType === 'Entry') {
                title = 'Vehicle Entered Geofence';
                message = `${vehicleNo} entered ${geofenceTitle} boundary`;
            } else if (eventType === 'Exit') {
                title = 'Vehicle Exited Geofence';
                message = `${vehicleNo} exited from ${geofenceTitle} boundary`;
            } else {
                return; // Unknown event type
            }

            // Extract FCM tokens
            const fcmTokens = users
                .filter(user => user.fcm_token && user.fcm_token.trim() !== '')
                .map(user => user.fcm_token);

            if (fcmTokens.length === 0) {
                console.log(`No valid FCM tokens for geofence: ${geofenceTitle}`);
                return;
            }

            // Send notification to all users
            const result = await firebaseService.sendNotificationToMultipleUsers(
                fcmTokens,
                title,
                message,
                {
                    type: 'geofence_event',
                    geofenceId: String(geofenceId),
                    geofenceTitle: geofenceTitle,
                    vehicleNo: vehicleNo,
                    eventType: eventType
                }
            );

            
            return result;

        } catch (error) {
            console.error('Error sending geofence notification:', error);
        }
    }
}

module.exports = new GeofenceService();

