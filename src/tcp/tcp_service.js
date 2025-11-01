const net = require('net');
require('dotenv').config();

class TCPService {
    constructor() {
        this.connections = new Map();
        this.deviceImeiMap = new Map(); // imei -> connectionId
        this.commandQueue = new Map(); // imei -> Array<{commandType, commandData, timestamp, priority}>
        
        // Start periodic cleanup of expired commands
        this.startCommandExpirationCleanup();
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

    // Send relay command to device (with auto-queue if offline)
    async sendRelayCommand(imei, command) {
        try {
            console.log(`[RELAY COMMAND] Starting relay command - IMEI: ${imei}, Command: ${command}, Timestamp: ${new Date().toISOString()}`);
            
            const connection = this.findConnectionByImei(imei);
            
            // Check if device is connected and socket is valid
            if (!connection || !connection.socket || connection.socket.destroyed) {
                // Device not connected - queue the command
                console.log(`[RELAY COMMAND] Device ${imei} not connected - queuing command ${command}`);
                this.queueCommand(imei, 'RELAY', command);
                console.log(`[RELAY COMMAND] Relay command ${command} queued for device ${imei}`);
                return { 
                    success: true, 
                    command: command, 
                    queued: true,
                    message: 'Command queued - will be sent when device connects'
                };
            }

            console.log(`[RELAY COMMAND] Device ${imei} is connected - preparing to send command ${command}`);

            // Build relay command based on your GT06 protocol
            let relayCommand;
            if (command === 'ON') {
                relayCommand = Buffer.from('HFYD#\n'); // Your ON command
                console.log(`[RELAY COMMAND] Built relay ON command buffer: HFYD#\\n`);
            } else if (command === 'OFF') {
                relayCommand = Buffer.from('DYD#\n');  // Your OFF command
                console.log(`[RELAY COMMAND] Built relay OFF command buffer: DYD#\\n`);
            } else {
                throw new Error(`Invalid relay command: ${command}`);
            }
            
            // Send command to device
            connection.socket.write(relayCommand);
            
            console.log(`[RELAY COMMAND] ✅ Relay command ${command} sent successfully to device ${imei} via TCP`);
            
            return { success: true, command: command, queued: false };
            
        } catch (error) {
            console.error(`[RELAY COMMAND] ❌ Error sending relay command to device ${imei}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Generic command sender - supports multiple command types
    async sendCommand(imei, commandType, params = {}) {
        try {
            console.log(`[TCP COMMAND] Received command request - IMEI: ${imei}, CommandType: ${commandType}, Params:`, params, `Timestamp: ${new Date().toISOString()}`);
            
            const connection = this.findConnectionByImei(imei);
            
            // Check if device is connected and socket is valid
            if (!connection || !connection.socket || connection.socket.destroyed) {
                // Device not connected - queue the command
                console.log(`[TCP COMMAND] Device ${imei} not connected - checking connection status`);
                const isConnected = this.isDeviceConnected(imei);
                console.log(`[TCP COMMAND] Device ${imei} connection status: ${isConnected}`);
                
                this.queueCommand(imei, commandType, params);
                console.log(`[TCP COMMAND] Command ${commandType} queued for device ${imei}`);
                
                return { 
                    success: true, 
                    commandType: commandType,
                    queued: true,
                    message: 'Command queued - will be sent when device connects'
                };
            }

            console.log(`[TCP COMMAND] Device ${imei} is connected - preparing to send command ${commandType}`);

            // Get command buffer based on type
            const commandBuffer = this.getCommandBuffer(commandType, params);
            if (!commandBuffer) {
                console.error(`[TCP COMMAND] ❌ Unknown or invalid command type: ${commandType} with params:`, params);
                throw new Error(`Unknown command type: ${commandType}`);
            }
            
            console.log(`[TCP COMMAND] Built command buffer for ${commandType}:`, commandBuffer.toString('hex'));
            
            // Send command to device
            connection.socket.write(commandBuffer);
            
            console.log(`[TCP COMMAND] ✅ Command ${commandType} sent successfully to device ${imei} via TCP`);
            
            return { success: true, commandType: commandType, queued: false };
            
        } catch (error) {
            console.error(`[TCP COMMAND] ❌ Error sending command ${commandType} to device ${imei}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Send generic/custom command buffer
    async sendGenericCommand(imei, commandBuffer) {
        try {
            const connection = this.findConnectionByImei(imei);
            
            if (!connection || !connection.socket || connection.socket.destroyed) {
                return { success: false, error: 'Device not connected' };
            }
            
            if (!Buffer.isBuffer(commandBuffer)) {
                commandBuffer = Buffer.from(commandBuffer);
            }
            
            connection.socket.write(commandBuffer);
            console.log(`Generic command sent to device ${imei}`);
            
            return { success: true };
            
        } catch (error) {
            console.error(`Error sending generic command to device ${imei}:`, error);
            return { success: false, error: error.message };
        }
    }

    // Map command types to GT06 protocol buffers
    getCommandBuffer(commandType, params = {}) {
        switch (commandType) {
            case 'RELAY_ON':
                return Buffer.from('HFYD#\n');
            case 'RELAY_OFF':
                return Buffer.from('DYD#\n');
            case 'RELAY':
                // RELAY command with params: 'ON', 'OFF', or {command: 'ON'/'OFF'}
                const relayCommand = (typeof params === 'string') ? params : (params.command || '');
                if (relayCommand === 'ON') {
                    return Buffer.from('HFYD#\n');
                } else if (relayCommand === 'OFF') {
                    return Buffer.from('DYD#\n');
                }
                return null;
            case 'RESET':
                return Buffer.from('RESET#\n'); // Verify actual GT06 reset command
            case 'SERVER_POINT':
                // GT06 server point command - format may vary
                // Example: Buffer.from('SERVER,IP:PORT#\n')
                if (params.ip && params.port) {
                    return Buffer.from(`SERVER,${params.ip}:${params.port}#\n`);
                }
                return null;
            default:
                return null;
        }
    }

    // Queue command for offline device
    queueCommand(imei, commandType, commandData, priority = 0) {
        if (!imei) {
            console.error('[COMMAND QUEUE] ❌ Cannot queue command: IMEI is required');
            return false;
        }

        if (!this.commandQueue.has(imei)) {
            this.commandQueue.set(imei, []);
            console.log(`[COMMAND QUEUE] Created new queue for device ${imei}`);
        }

        const command = {
            commandType: commandType,
            commandData: commandData,
            timestamp: new Date(),
            priority: priority
        };

        this.commandQueue.get(imei).push(command);
        const queueSize = this.commandQueue.get(imei).length;
        console.log(`[COMMAND QUEUE] Command ${commandType} queued for device ${imei} - Queue size: ${queueSize}, Priority: ${priority}, Timestamp: ${command.timestamp.toISOString()}`);
        
        return true;
    }

    // Process all queued commands for a device
    async processQueuedCommands(imei) {
        if (!imei || !this.commandQueue.has(imei)) {
            console.log(`[QUEUE PROCESS] No queued commands for device ${imei}`);
            return { processed: 0, failed: 0 };
        }

        const connection = this.findConnectionByImei(imei);
        if (!connection || !connection.socket || connection.socket.destroyed) {
            console.log(`[QUEUE PROCESS] Cannot process queued commands for ${imei}: device not connected`);
            return { processed: 0, failed: 0 };
        }

        const commands = this.commandQueue.get(imei);
        if (!commands || commands.length === 0) {
            console.log(`[QUEUE PROCESS] Command queue is empty for device ${imei}`);
            return { processed: 0, failed: 0 };
        }

        console.log(`[QUEUE PROCESS] Processing ${commands.length} queued commands for device ${imei} - Timestamp: ${new Date().toISOString()}`);

        // Sort by priority (higher priority first)
        commands.sort((a, b) => b.priority - a.priority);
        console.log(`[QUEUE PROCESS] Commands sorted by priority for device ${imei}`);

        let processed = 0;
        let failed = 0;

        for (const cmd of commands) {
            try {
                console.log(`[QUEUE PROCESS] Processing queued command - Type: ${cmd.commandType}, Data:`, cmd.commandData, `Timestamp: ${cmd.timestamp.toISOString()}`);
                
                const commandBuffer = this.getCommandBuffer(cmd.commandType, cmd.commandData);
                if (commandBuffer) {
                    connection.socket.write(commandBuffer);
                    processed++;
                    console.log(`[QUEUE PROCESS] ✅ Queued command ${cmd.commandType} sent to device ${imei} via TCP`);
                } else {
                    console.warn(`[QUEUE PROCESS] ⚠️ Invalid command type ${cmd.commandType} for device ${imei}, skipping`);
                    failed++;
                }
            } catch (error) {
                console.error(`[QUEUE PROCESS] ❌ Error processing queued command ${cmd.commandType} for device ${imei}:`, error);
                failed++;
            }
        }

        // Clear processed commands
        this.clearQueuedCommands(imei);

        console.log(`[QUEUE PROCESS] ✅ Completed processing queued commands for device ${imei} - Processed: ${processed}, Failed: ${failed}`);
        return { processed, failed };
    }

    // Get count of queued commands for a device
    getQueuedCommandsCount(imei) {
        if (!imei || !this.commandQueue.has(imei)) {
            return 0;
        }
        return this.commandQueue.get(imei).length;
    }

    // Get queued commands for a device (for monitoring)
    getQueuedCommands(imei) {
        if (!imei || !this.commandQueue.has(imei)) {
            return [];
        }
        return this.commandQueue.get(imei).map(cmd => ({
            commandType: cmd.commandType,
            timestamp: cmd.timestamp,
            priority: cmd.priority
        }));
    }

    // Clear queued commands for a device
    clearQueuedCommands(imei) {
        if (imei && this.commandQueue.has(imei)) {
            this.commandQueue.delete(imei);
            console.log(`Cleared command queue for device ${imei}`);
        }
    }

    // Remove expired commands (older than configured hours)
    expireOldCommands() {
        const expiryHours = parseInt(process.env.COMMAND_QUEUE_EXPIRY_HOURS) || 24;
        const expiryMs = expiryHours * 60 * 60 * 1000;
        const now = new Date();
        let expiredCount = 0;

        for (const [imei, commands] of this.commandQueue.entries()) {
            const validCommands = commands.filter(cmd => {
                const age = now - cmd.timestamp;
                return age < expiryMs;
            });

            if (validCommands.length !== commands.length) {
                expiredCount += (commands.length - validCommands.length);
                if (validCommands.length === 0) {
                    this.commandQueue.delete(imei);
                } else {
                    this.commandQueue.set(imei, validCommands);
                }
            }
        }

        if (expiredCount > 0) {
            console.log(`Expired ${expiredCount} old commands from queue`);
        }
    }

    // Start periodic cleanup of expired commands
    startCommandExpirationCleanup() {
        // Run cleanup every hour
        setInterval(() => {
            this.expireOldCommands();
        }, 60 * 60 * 1000);
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
                    lastActivity: connection.lastActivityAt,
                    remoteAddress: connection.remoteAddress,
                    remotePort: connection.remotePort
                });
            }
        }
        return devices;
    }

    // Get device status (connection status and queue info)
    getDeviceStatus(imei) {
        const connection = this.findConnectionByImei(imei);
        const isConnected = connection && connection.socket && !connection.socket.destroyed;
        
        return {
            connected: isConnected,
            lastActivity: connection?.lastActivityAt || null,
            connectedAt: connection?.connectedAt || null,
            queuedCommands: this.getQueuedCommandsCount(imei)
        };
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