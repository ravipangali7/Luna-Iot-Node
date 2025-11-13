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

            // Working relay commands from GT06 protocol guide
            // ON: "Relay,1#" = Cut Fuel (Relay ON = Relay 1)
            // OFF: "Relay,0#" = Restore Fuel (Relay OFF = Relay 0)
            const WORKING_RELAY_COMMANDS = {
                on: "787814800c0000000052656c61792c312300020000f59f0d0a",   // Relay ON
                off: "787814800c0000000052656c61792c302300020000f1b40d0a"  // Relay OFF
            };

            // Normalize command to lowercase
            const normalizedCommand = String(command).toLowerCase();
            
            let relayCommandHex;
            if (normalizedCommand === 'on' || normalizedCommand === '1') {
                relayCommandHex = WORKING_RELAY_COMMANDS.on;
            } else if (normalizedCommand === 'off' || normalizedCommand === '0') {
                relayCommandHex = WORKING_RELAY_COMMANDS.off;
            } else {
                throw new Error(`Invalid relay command: ${command}. Use 'on'/'off' or '1'/'0'`);
            }
            
            // Convert hex string to Buffer and send command to device
            const relayCommand = Buffer.from(relayCommandHex, 'hex');
            connection.socket.write(relayCommand);
            
            console.log(`Relay command sent to device ${imei}: ${normalizedCommand.toUpperCase()} (${normalizedCommand === 'on' || normalizedCommand === '1' ? 'Cut Fuel' : 'Restore Fuel'})`);
            
            return { success: true, command: normalizedCommand };
            
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