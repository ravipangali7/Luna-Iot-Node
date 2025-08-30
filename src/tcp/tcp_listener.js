const net = require('net')
const tcpHandler = require('./handlers/handler')
const socketService = require('../socket/socket_service');
const tcpService = require('./tcp_service');

class TCPListener {
    constructor() {
        this.server = null;
        this.connections = new Map();
    }

    startServer(port = 7777) {
        this.server = net.createServer((socket) => {
            const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
            socketService.deviceMonitoringMessage('connected', null, null, null);

            // Store connection info
            const connectionData = {
                socket: socket,
                connectionId: connectionId,
                workerId: process.pid,
                connectedAt: new Date(),
                remoteAddress: socket.remoteAddress,
                remotePort: socket.remotePort,
                deviceImei: null // Will be set when IMEI is received
            };

            this.connections.set(connectionId, connectionData);
            tcpService.storeConnection(connectionId, connectionData);

            // Handle incoming data
            socket.on('data', async (data) => {
                // Data handling
                let datahandler = new tcpHandler.DataHandler();
                datahandler.handleData(data, socket);

                // Update device IMEI in connection data
                if (socket.deviceImei) {
                    connectionData.deviceImei = socket.deviceImei;
                    tcpService.storeConnection(connectionId, connectionData);
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
                console.error(`${new Date().toISOString} => CLIENT ERROR =>`, err.message);
                this.connections.delete(connectionId);
                tcpService.removeConnection(connectionId);
            });

            socket.setKeepAlive(true, 60000); // 60 seconds
            socket.setTimeout(600000); // Increase to 10 minutes

            // Add timeout handler
            socket.on('timeout', () => {
                socketService.deviceMonitoringMessage('disconnected', null, null, null);
                console.log(`[Worker ${process.pid}] Socket timeout for ${connectionId}`);
                this.connections.delete(connectionId);
                tcpService.removeConnection(connectionId);
                socket.end(); // Gracefully close the connection
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
function startServer(port = 7777) {
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