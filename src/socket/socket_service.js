const { Server } = require('socket.io');
const datetimeService = require('../utils/datetime_service');

class SocketService {
    constructor() {
        this.io = null;
        this.connectedClients = new Set();
    }

    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            },
            transports: ['websocket', 'polling'],
            allowEIO3: true,
            pingTimeout: 60000,
            pingInterval: 25000
        });

        // Setup room management for targeted broadcasting
        this._setupRoomManagement();
    }

    _setupRoomManagement() {
        this.io.on('connection', (socket) => {
            this.connectedClients.add(socket.id);

            // Join vehicle room
            socket.on('join_vehicle', (imei) => {
                socket.join(`vehicle:${imei}`);
            });

            // Leave vehicle room
            socket.on('leave_vehicle', (imei) => {
                socket.leave(`vehicle:${imei}`);
            });

            // Join radar room
            socket.on('join_radar', (token) => {
                socket.join(`radar:${token}`);
                console.log(`Client joined radar room: radar:${token}`);
            });

            // Leave radar room
            socket.on('leave_radar', (token) => {
                socket.leave(`radar:${token}`);
                console.log(`Client left radar room: radar:${token}`);
            });

            socket.on('disconnect', () => {
                this.connectedClients.delete(socket.id);
            });
        });
    }

    _broadcastToAll(event, data) {
        if (this.io) {
            try {
                // Direct broadcast to all connected clients
                this.io.emit(event, data);
            } catch (error) {
                console.error(`❌ Error broadcasting ${event}:`, error);
            }
        }
    }


    deviceMonitoringMessage(type, imei, lat, lon) {
        if (this.io) {
            var data;
            switch (type) {
                case 'connected':
                    data = `${new Date().toISOString()} => INCOMING CLIENT`;
                    break;
                case 'disconnected':
                    data = `${new Date().toISOString()} => CLIENT DISCONNECTED`;
                    break;
                case 'location':
                    data = `${new Date().toISOString()} => LOCATION: ${imei} => Lat: ${lat} | Lon: ${lon}`;
                    break;
                case 'login':
                    data = `${new Date().toISOString()} => LOGIN: ${imei}`;
                    break;
                case 'status':
                    data = `${new Date().toISOString()} => STATUS: ${imei} => WRITE SUCCESSFULL`;
                    break;
                case 'imei_not_registered':
                    data = `${new Date().toISOString()} => IMEI NOT REGISTERED: ${imei}`;
                    break;
                case 'alarm':
                    data = `${new Date().toISOString()} => ALARM: ${imei} => Lat: ${lat} | Lon: ${lon}`;
                    break;
                default:
                    return; // Don't broadcast if type is not recognized
            }
            this._broadcastToAll('device_monitoring', data);
        } else {
            console.log(`[Worker ${process.pid}] ❌ Socket.IO not initialized`);
        }
    }

    statusUpdateMessage(imei, battery, signal, ignition, charging, relay, created_at) {
        const nepalTime = datetimeService.nepalTimeDate();
        if (this.io) {
            // Add validation
            if (!imei) {
                console.error('IMEI is required for status update');
                return;
            }
            
            var data = {
                imei: imei,
                battery: battery,
                signal: signal,
                ignition: ignition,
                charging: charging,
                relay: relay,
                createdAt: created_at || nepalTime,  // Use DB created_at, fallback to current time
                updatedAt: nepalTime
            };
            
            // Broadcast to vehicle-specific room only
            this.io.to(`vehicle:${imei}`).emit('status_update', data);
        } else {
            console.log(`❌ Socket.IO not initialized`);
        }
    }

    locationUpdateMessage(imei, latitude, longitude, speed, course, satellite, realTimeGps, created_at) {
        const nepalTime = datetimeService.nepalTimeDate();
        if (this.io) {
            var data = {
                imei: imei,
                latitude: latitude,
                longitude: longitude,
                speed: speed,
                course: course,
                satellite: satellite,
                realTimeGps: realTimeGps,
                createdAt: created_at || nepalTime,  // Use DB created_at, fallback to current time
                updatedAt: nepalTime
            };
            
            // Broadcast to vehicle-specific room only
            this.io.to(`vehicle:${imei}`).emit('location_update', data);
        }
    }

    getConnectedClientsCount() {
        return this.io ? this.io.engine.clientsCount : 0;
    }

    broadcastAlertToRadars(radarTokens, alertData) {
        if (!this.io) {
            console.log('❌ Socket.IO not initialized');
            return;
        }

        try {
            // Prepare the alert notification payload
            const notificationPayload = {
                alert_id: alertData.id,
                institute_id: alertData.institute_id,
                alert_data: alertData
            };

            // Emit to each radar room
            radarTokens.forEach(token => {
                this.io.to(`radar:${token}`).emit('new_alert', notificationPayload);
                console.log(`Alert notification sent to radar room: radar:${token}`);
            });

            console.log(`✅ Alert notification broadcasted to ${radarTokens.length} radar rooms`);
        } catch (error) {
            console.error('❌ Error broadcasting alert to radars:', error);
        }
    }
}

const socketService = new SocketService();

module.exports = socketService;