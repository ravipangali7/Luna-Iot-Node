const net = require('net')
const tcpHandler = require('./handlers/handler')
const socketService = require('../socket/socket_service');
const tcpService = require('./tcp_service');
require('dotenv').config();

class TCPListener {
    constructor() {
        this.server = null;
        this.connections = new Map();
    }

    startServer(port = 6666) {
        this.server = net.createServer((socket) => {
            const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
            socketService.deviceMonitoringMessage('connected', null, null, null);

            // Store connection info
            const connectionData = {
                socket: socket,
                connectionId: connectionId,
                workerId: process.pid,
                connectedAt: new Date(),
                lastActivityAt: new Date(),
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                deviceImei: null // Will be set when IMEI is received
            };

            this.connections.set(connectionId, connectionData);
            tcpService.storeConnection(connectionId, connectionData);

            // Handle incoming data
            socket.on('data', async (data) => {
                // Reset timeout on every data packet to keep connection alive
                const timeoutMs = parseInt(process.env.TCP_CONNECTION_TIMEOUT) || 86400000; // 24 hours default
                socket.setTimeout(timeoutMs);
                
                // Update last activity time
                connectionData.lastActivityAt = new Date();
                
                // Data handling
                let datahandler = new tcpHandler.DataHandler();
                datahandler.handleData(data, socket);

                // Update device IMEI in connection data
                if (socket.deviceImei) {
                    connectionData.deviceImei = socket.deviceImei;
                    tcpService.storeConnection(connectionId, connectionData);
                    
                    // Process any queued commands when device connects/identifies
                    tcpService.processQueuedCommands(socket.deviceImei);
                }
            });

            // Handle connection close
            socket.on('close', () => {
                socketService.deviceMonitoringMessage('disconnected', null, null, null);
                this.connections.delete(connectionId);
                tcpService.removeConnection(connectionId);
            });

            // Handle errors
            socket.on('error', (err) => {
                const errorMessage = err.message || 'Unknown error';
                console.error(`[Worker ${process.pid}] Client error for ${connectionId}:`, errorMessage);

                // Log more details for debugging
                if (err.code === 'ETIMEDOUT') {
                    console.log(`[Worker ${process.pid}] Connection timeout for device ${socket.deviceImei || 'Unknown'}`);
                }
                socketService.deviceMonitoringMessage('disconnected', null, null, null);
                console.error(`${new Date().toISOString()} => CLIENT ERROR =>`, err.message);
                this.connections.delete(connectionId);
                tcpService.removeConnection(connectionId);
            });

            socket.setKeepAlive(true, 60000); // 60 seconds
            
            // Set timeout duration (default: 24 hours, configurable via TCP_CONNECTION_TIMEOUT env var)
            const timeoutMs = parseInt(process.env.TCP_CONNECTION_TIMEOUT) || 86400000; // 24 hours = 86400000ms
            socket.setTimeout(timeoutMs);

            // Timeout handler - log but keep connection alive (don't close)
            // Connection will reset timeout on next data packet
            socket.on('timeout', () => {
                const deviceInfo = socket.deviceImei ? `device ${socket.deviceImei}` : 'unknown device';
                console.log(`[Worker ${process.pid}] Socket idle timeout for ${connectionId} (${deviceInfo}), but keeping connection alive`);
                
                // Reset timeout again to keep connection alive
                socket.setTimeout(timeoutMs);
                
                // Note: We don't close the connection or remove it from maps
                // This allows the connection to stay alive and receive commands
                // Connection will only be removed on actual close/error events
            });
        });

        this.server.listen(port, () => {
            console.log(`[Worker ${process.pid}] TCP server listening on port ${port}`);
        });

        this.server.on('error', (err) => {
            console.error(`[Worker ${process.pid}] Server error: `, err.message);
        });
    }

    getConnectionCount() {
        return this.connections.size;
    }

    getConnections() {
        return Array.from(this.connections.keys());
    }
}

// Create singleton instance
const tcpListener = new TCPListener();

// Export fucntions
function startServer(port = 6666) {
    tcpListener.startServer(port);
}

function getConnectionCount() {
    return tcpListener.getConnectionCount();
}

function getConnections() {
    return tcpListener.getConnections();
}

module.exports = {
    startServer,
    getConnectionCount,
    getConnections
}