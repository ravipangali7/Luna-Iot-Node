const net = require('net');

class TCPService {
    constructor() {
        this.connections = new Map();
        this.deviceImeiMap = new Map(); // imei -> connectionId
    }

    // Store connection with device info
    storeConnection(connectionId, connectionData) {
        this.connections.set(connectionId, connectionData);
        
        // If device IMEI is available, map it
        if (connectionData.deviceImei) {
            this.deviceImeiMap.set(connectionData.deviceImei, connectionId);
        }
    }

    // Remove connection
    removeConnection(connectionId) {
        const connectionData = this.connections.get(connectionId);
        if (connectionData && connectionData.deviceImei) {
            this.deviceImeiMap.delete(connectionData.deviceImei);
        }
        this.connections.delete(connectionId);
    }

    // Find connection by IMEI
    findConnectionByImei(imei) {
        const connectionId = this.deviceImeiMap.get(imei);
        if (!connectionId) return null;
        
        return this.connections.get(connectionId);
    }

    // Check if device is connected by IMEI
    isDeviceConnected(imei) {
        const connection = this.findConnectionByImei(imei);
        return connection && connection.socket && !connection.socket.destroyed;
    }

    // Send relay command to device
    async sendRelayCommand(imei, command) {
        try {
            const connection = this.findConnectionByImei(imei);
            
            if (!connection) {
                return { success: false, error: 'Device not connected' };
            }

            if (!connection.socket || connection.socket.destroyed) {
                return { success: false, error: 'Socket connection invalid' };
            }

            // Build relay command based on your GT06 protocol
            let relayCommand;
            if (command === 'ON') {
                relayCommand = Buffer.from('HFYD#\n'); // Your ON command
            } else if (command === 'OFF') {
                relayCommand = Buffer.from('DYD#\n');  // Your OFF command
            } else {
                throw new Error(`Invalid relay command: ${command}`);
            }
            
            // Send command to device
            connection.socket.write(relayCommand);
            
            console.log(`Relay command sent to device ${imei}: ${command}`);
            
            return { success: true, command: command };
            
        } catch (error) {
            console.error(`Error sending relay command to device ${imei}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Get all connected devices
    getConnectedDevices() {
        const devices = [];
        for (const [imei, connectionId] of this.deviceImeiMap) {
            const connection = this.connections.get(connectionId);
            if (connection && connection.socket && !connection.socket.destroyed) {
                devices.push({
                    imei: imei,
                    connectionId: connectionId,
                    connectedAt: connection.connectedAt,
                    remoteAddress: connection.remoteAddress,
                    remotePort: connection.remotePort
                });
            }
        }
        return devices;
    }

    // Debug method to see all connections
    debugConnections() {
        for (const [imei, connectionId] of this.deviceImeiMap) {
            const connection = this.connections.get(connectionId);
         }
    }

    // Get connection count
    getConnectionCount() {
        return this.connections.size;
    }

    // Get device count
    getDeviceCount() {
        return this.deviceImeiMap.size;
    }
}

module.exports = new TCPService();