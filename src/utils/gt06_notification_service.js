const prisma = require('../database/prisma');
const firebaseService = require('./firebase_service');

class GT06NotificationService {
    
    // Send notification to all users who have access to a vehicle and notifications enabled
    static async sendVehicleNotification(imei, title, message, data = {}) {
        try {
            // Get vehicle details
            const vehicle = await prisma.getClient().vehicle.findUnique({
                where: { imei: imei.toString() },
                select: { id: true, vehicleNo: true }
            });

            if (!vehicle) {
                console.log(`Vehicle not found for IMEI: ${imei}`);
                return;
            }

            // Get all users who have access to this vehicle and notifications enabled
            const userVehicles = await prisma.getClient().userVehicle.findMany({
                where: {
                    vehicleId: vehicle.id,
                    notification: true // Assuming 'events' permission includes notifications
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            fcmToken: true,
                            name: true
                        }
                    }
                }
            });

            // Filter users with FCM tokens
            const usersWithFcmTokens = userVehicles
                .map(uv => uv.user)
                .filter(user => user.fcmToken && user.fcmToken.trim() !== '');

            if (usersWithFcmTokens.length === 0) {
                console.log(`No users with FCM tokens found for vehicle: ${vehicle.vehicleNo}`);
                return;
            }

            // Extract FCM tokens
            const fcmTokens = usersWithFcmTokens.map(user => user.fcmToken);

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
            // Get latest status to compare ignition
            const latestStatus = await prisma.getClient().status.findFirst({
                where: { imei: imei.toString() },
                orderBy: { createdAt: 'desc' },
                select: { ignition: true }
            });

            // If no previous status or ignition changed, send notification
            if (!latestStatus || latestStatus.ignition !== newIgnitionStatus) {
                const vehicle = await prisma.getClient().vehicle.findUnique({
                    where: { imei: imei.toString() },
                    select: { vehicleNo: true }
                });

                if (vehicle) {
                    const ignitionStatus = newIgnitionStatus ? 'On' : 'Off';
                    const title = 'Vehicle Status Update';
                    const message = `${vehicle.vehicleNo}: Ignition is ${ignitionStatus}`;

                    await this.sendVehicleNotification(imei, title, message, {
                        type: 'ignition_change',
                        ignitionStatus: newIgnitionStatus
                    });
                }
            }
        } catch (error) {
            console.error('Error checking ignition change:', error);
        }
    }

    // Check speed limit and send overspeeding notification
    static async checkSpeedLimitAndNotify(imei, currentSpeed) {
        try {
            // Get vehicle speed limit
            const vehicle = await prisma.getClient().vehicle.findUnique({
                where: { imei: imei.toString() },
                select: { vehicleNo: true, speedLimit: true }
            });

            if (!vehicle) return;

            // Check if speed exceeds limit
            if (currentSpeed > vehicle.speedLimit) {
                const title = 'Speed Alert';
                const message = `${vehicle.vehicleNo}: Vehicle is Overspeeding at ${currentSpeed} km/h`;

                await this.sendVehicleNotification(imei, title, message, {
                    type: 'overspeeding',
                    currentSpeed: currentSpeed,
                    speedLimit: vehicle.speedLimit
                });
            }
        } catch (error) {
            console.error('Error checking speed limit:', error);
        }
    }

    // Check if vehicle is moving after ignition off and send notification
    static async checkMovingAfterIgnitionOffAndNotify(imei) {
        try {
            // Get latest status where ignition is off
            const latestIgnitionOffStatus = await prisma.getClient().status.findFirst({
                where: {
                    imei: imei.toString(),
                    ignition: false
                },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true }
            });

            if (!latestIgnitionOffStatus) return;

            // Get latest location data
            const latestLocation = await prisma.getClient().location.findFirst({
                where: { imei: imei.toString() },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true }
            });

            if (!latestLocation) return;

            // Compare timestamps: if ignition_off is newer than location, send notification
            if (latestIgnitionOffStatus.createdAt > latestLocation.createdAt) {
                const vehicle = await prisma.getClient().vehicle.findUnique({
                    where: { imei: imei.toString() },
                    select: { vehicleNo: true }
                });

                if (vehicle) {
                    const title = 'Vehicle Movement Alert';
                    const message = `${vehicle.vehicleNo}: Vehicle is moving`;

                    await this.sendVehicleNotification(imei, title, message, {
                        type: 'moving_after_ignition_off',
                        ignitionOffTime: latestIgnitionOffStatus.createdAt,
                        lastLocationTime: latestLocation.createdAt
                    });
                }
            }
        } catch (error) {
            console.error('Error checking moving after ignition off:', error);
        }
    }
}

module.exports = GT06NotificationService;