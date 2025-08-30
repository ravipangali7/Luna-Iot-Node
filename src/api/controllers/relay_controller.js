const { successResponse, errorResponse } = require('../utils/response_handler');
const prisma = require('../../database/prisma');
const tcpService = require('../../tcp/tcp_service');

class RelayController {
    // Turn relay ON
    static async turnRelayOn(req, res) {
        try {
            const { imei } = req.body;
            const user = req.user;

            if (!imei) {
                return errorResponse(res, 'IMEI is required', 400);
            }

            // Check if user has access to this vehicle
            const userVehicle = await prisma.getClient().userVehicle.findFirst({
                where: {
                    userId: user.id,
                    vehicle: {
                        imei: imei
                    }
                },
                include: {
                    vehicle: true
                }
            });

            if (!userVehicle) {
                return errorResponse(res, 'Vehicle not found or access denied', 404);
            }

            // Check if device is connected via TCP
            if (!tcpService.isDeviceConnected(imei)) {
                return errorResponse(res, 'Vehicle not connected. Please try again later.', 503);
            }

            // Send relay command to device
            const commandResult = await tcpService.sendRelayCommand(imei, 'ON');
            
            if (commandResult.success) {
                // Wait for device response (timeout after 10 seconds)
                const deviceResponse = await RelayController.waitForDeviceResponse(imei, 'ON', 10000);
                
                if (deviceResponse.success) {
                    // Device confirmed relay change - update database
                    await RelayController.updateRelayStatus(imei, true);
                    
                    return successResponse(res, {
                        relayStatus: 'ON',
                        command: 'HFYD#',
                        message: 'Relay turned ON successfully',
                        deviceConfirmed: true
                    });
                } else {
                    // Device didn't respond or failed
                    return errorResponse(res, 'Device did not confirm relay change', 500);
                }
            } else {
                return errorResponse(res, `Failed to send relay command: ${commandResult.error}`, 500);
            }

        } catch (error) {
            console.error('Relay ON error:', error);
            return errorResponse(res, 'Failed to turn relay ON', 500);
        }
    }

    // Turn relay OFF
    static async turnRelayOff(req, res) {
        try {
            const { imei } = req.body;
            const user = req.user;

            if (!imei) {
                return errorResponse(res, 'IMEI is required', 400);
            }

            // Check if user has access to this vehicle
            const userVehicle = await prisma.getClient().userVehicle.findFirst({
                where: {
                    userId: user.id,
                    vehicle: {
                        imei: imei
                    }
                },
                include: {
                    vehicle: true
                }
            });

            if (!userVehicle) {
                return errorResponse(res, 'Vehicle not found or access denied', 404);
            }

            // Check if device is connected via TCP
            if (!tcpService.isDeviceConnected(imei)) {
                return errorResponse(res, 'Vehicle not connected. Please try again later.', 503);
            }

            // Send relay command to device
            const commandResult = await tcpService.sendRelayCommand(imei, 'OFF');
            
            if (commandResult.success) {
                // Wait for device response (timeout after 10 seconds)
                const deviceResponse = await RelayController.waitForDeviceResponse(imei, 'OFF', 10000);
                
                if (deviceResponse.success) {
                    // Device confirmed relay change - update database
                    await RelayController.updateRelayStatus(imei, false);
                    
                    return successResponse(res, {
                        relayStatus: 'OFF',
                        command: 'DYD#',
                        message: 'Relay turned OFF successfully',
                        deviceConfirmed: true
                    });
                } else {
                    // Device didn't respond or failed
                    return errorResponse(res, 'Device did not confirm relay change', 500);
                }
            } else {
                return errorResponse(res, `Failed to send relay command: ${commandResult.error}`, 500);
            }

        } catch (error) {
            console.error('Relay OFF error:', error);
            return errorResponse(res, 'Failed to turn relay OFF', 500);
        }
    }

    // Get relay status
    static async getRelayStatus(req, res) {
        try {
            const { imei } = req.params;
            const user = req.user;

            if (!imei) {
                return errorResponse(res, 'IMEI is required', 400);
            }

            // Check if user has access to this vehicle
            const userVehicle = await prisma.getClient().userVehicle.findFirst({
                where: {
                    userId: user.id,
                    vehicle: {
                        imei: imei
                    }
                },
                include: {
                    vehicle: true
                }
            });

            if (!userVehicle) {
                return errorResponse(res, 'Vehicle not found or access denied', 404);
            }

            // Get latest status
            const latestStatus = await prisma.getClient().status.findFirst({
                where: { imei: imei },
                orderBy: { createdAt: 'desc' }
            });

            return successResponse(res, {
                relayStatus: latestStatus?.relay ? 'ON' : 'OFF',
                lastUpdated: latestStatus?.createdAt
            });

        } catch (error) {
            console.error('Get relay status error:', error);
            return errorResponse(res, 'Failed to get relay status', 500);
        }
    }

    // Wait for device response
    static async waitForDeviceResponse(imei, expectedStatus, timeoutMs) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            // Check device response every 500ms
            const checkInterval = setInterval(async () => {
                try {
                    // Get latest status from device
                    const latestStatus = await prisma.getClient().status.findFirst({
                        where: { imei: imei },
                        orderBy: { createdAt: 'desc' }
                    });

                    // Check if device responded with expected relay status
                    if (latestStatus && latestStatus.relay === (expectedStatus === 'ON')) {
                        clearInterval(checkInterval);
                        resolve({ success: true, status: latestStatus });
                        return;
                    }

                    // Check timeout
                    if (Date.now() - startTime > timeoutMs) {
                        clearInterval(checkInterval);
                        resolve({ success: false, error: 'Timeout waiting for device response' });
                        return;
                    }

                } catch (error) {
                    console.error('Error checking device response:', error);
                }
            }, 500);
        });
    }

    // Update relay status in database (only after device confirms)
    static async updateRelayStatus(imei, relayStatus) {
        try {
            await prisma.getClient().status.create({
                data: {
                    imei: imei,
                    relay: relayStatus,
                    battery: 0,
                    signal: 0,
                    ignition: false,
                    charging: false,
                    createdAt: new Date()
                }
            });
            console.log(`Relay status updated for device ${imei}: ${relayStatus}`);
        } catch (error) {
            console.error(`Error updating relay status for device ${imei}:`, error);
            throw error;
        }
    }

    // Debug device connections
    static async debugDeviceConnections(req, res) {
        try {
            const connectedDevices = tcpService.getConnectedDevices();
            const totalConnections = tcpService.getConnectionCount();
            const deviceCount = tcpService.getDeviceCount();
            
            // Debug info
            tcpService.debugConnections();
            
            return successResponse(res, {
                totalConnections: totalConnections,
                deviceCount: deviceCount,
                connectedDevices: connectedDevices
            });
        } catch (error) {
            console.error('Error getting device connections:', error);
            return errorResponse(res, 'Failed to get device connections', 500);
        }
    }
}

module.exports = RelayController;