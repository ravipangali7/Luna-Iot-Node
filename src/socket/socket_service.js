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

        this.io.on('connection', (socket) => {
            this.connectedClients.add(socket.id);

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
                console.log(`📡 Broadcasted ${event} to ${this.io.engine.clientsCount} clients`);
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
            
            var data;
            data = {
                imei: imei,
                battery: battery,
                signal: signal,
                ignition: ignition,
                charging: charging,
                relay: relay,
                createdAt: nepalTime
            }
            this._broadcastToAll('status_update', data);
        } else {
            console.log(`[Worker ${process.pid}] ❌ Socket.IO not initialized`);
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
                createdAt: nepalTime
            }
            this._broadcastToAll('location_update', data);
        }
    }

    getConnectedClientsCount() {
        return this.io ? this.io.engine.clientsCount : 0;
    }
}

const socketService = new SocketService();

module.exports = socketService;
module.exports = socketService;