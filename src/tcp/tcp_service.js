const net = require('net');
require('dotenv').config();

// Target IMEI for detailed logging
const TARGET_IMEI = '352312094594994';

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
            // Target IMEI specific logging
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] 🔌 RELAY COMMAND REQUEST - Command: ${command}, Timestamp: ${new Date().toISOString()}`);
            }
            
            const connection = this.findConnectionByImei(imei);
            
            // Check if device is connected and socket is valid
            if (!connection || !connection.socket || connection.socket.destroyed) {
                // Device not connected - queue the command
                this.queueCommand(imei, 'RELAY', command);
                
                // Target IMEI specific logging
                if (imei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] ⏳ Relay command ${command} QUEUED (device offline) - Will be sent when device connects`);
                }
                return { 
                    success: true, 
                    command: command, 
                    queued: true,
                    message: 'Command queued - will be sent when device connects'
                };
            }

            // Build relay command based on your GT06 protocol
            let relayCommand;
            if (command === 'ON') {
                relayCommand = Buffer.from('HFYD#\n'); // Your ON command
                if (imei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] Built relay ON command buffer: HFYD#\\n`);
                }
            } else if (command === 'OFF') {
                relayCommand = Buffer.from('DYD#\n');  // Your OFF command
                if (imei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] Built relay OFF command buffer: DYD#\\n`);
                }
            } else {
                throw new Error(`Invalid relay command: ${command}`);
            }
            
            // Send command to device
            connection.socket.write(relayCommand);
            
            // Target IMEI specific logging with packet details
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] 📤 SERVER SENDING RELAY COMMAND - Command: ${command}, Packet Hex: ${relayCommand.toString('hex')}, Packet ASCII: ${relayCommand.toString('ascii').replace('\n', '\\n')}, Length: ${relayCommand.length} bytes, Timestamp: ${new Date().toISOString()}`);
                console.log(`[IMEI: ${TARGET_IMEI}] Relay command packet bytes:`, Array.from(relayCommand).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            }
            
            return { success: true, command: command, queued: false };
            
        } catch (error) {
            if (imei === TARGET_IMEI) {
                console.error(`[IMEI: ${TARGET_IMEI}] ❌ Error sending relay command:`, error);
            }
            return { success: false, error: error.message };
        }
    }

    // Generic command sender - supports multiple command types
    async sendCommand(imei, commandType, params = {}) {
        try {
            // Target IMEI specific logging
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] 🎯 COMMAND REQUEST - Type: ${commandType}, Params:`, params, `Timestamp: ${new Date().toISOString()}`);
            }
            
            const connection = this.findConnectionByImei(imei);
            
            // Check if device is connected and socket is valid
            if (!connection || !connection.socket || connection.socket.destroyed) {
                // Device not connected - queue the command
                if (imei === TARGET_IMEI) {
                    const isConnected = this.isDeviceConnected(imei);
                    console.log(`[IMEI: ${TARGET_IMEI}] Device not connected - connection status: ${isConnected}`);
                }
                
                this.queueCommand(imei, commandType, params);
                
                if (imei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] Command ${commandType} QUEUED (device offline) - Will be sent when device connects`);
                }
                
                return { 
                    success: true, 
                    commandType: commandType,
                    queued: true,
                    message: 'Command queued - will be sent when device connects'
                };
            }

            // Get command buffer based on type
            const commandBuffer = this.getCommandBuffer(commandType, params);
            if (!commandBuffer) {
                if (imei === TARGET_IMEI) {
                    console.error(`[IMEI: ${TARGET_IMEI}] ❌ Unknown or invalid command type: ${commandType} with params:`, params);
                }
                throw new Error(`Unknown command type: ${commandType}`);
            }
            
            // Send command to device
            connection.socket.write(commandBuffer);
            
            // Target IMEI specific logging with packet details
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] 📤 SERVER SENDING COMMAND - Type: ${commandType}, Packet Hex: ${commandBuffer.toString('hex')}, Packet ASCII: ${commandBuffer.toString('ascii').replace('\n', '\\n')}, Length: ${commandBuffer.length} bytes, Timestamp: ${new Date().toISOString()}`);
                console.log(`[IMEI: ${TARGET_IMEI}] Command packet bytes:`, Array.from(commandBuffer).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            }
            
            return { success: true, commandType: commandType, queued: false };
            
        } catch (error) {
            if (imei === TARGET_IMEI) {
                console.error(`[IMEI: ${TARGET_IMEI}] ❌ Error sending command ${commandType}:`, error);
            }
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

    // ========================================
    // SERVER COMMAND PACKETS SENT TO DEVICES
    // ========================================
    // 
    // 2. RELAY ON COMMAND
    //    Packet: 'HFYD#\n' (hex: 0x48 0x46 0x59 0x44 0x23 0x0A)
    //    Purpose: Turn relay ON on device
    //    Location: tcp_service.js sendRelayCommand() method
    //
    // 3. RELAY OFF COMMAND  
    //    Packet: 'DYD#\n' (hex: 0x44 0x59 0x44 0x23 0x0A)
    //    Purpose: Turn relay OFF on device
    //    Location: tcp_service.js sendRelayCommand() method
    //
    // 4. RESET COMMAND
    //    Packet: 'RESET#\n' (hex: 0x52 0x45 0x53 0x45 0x54 0x23 0x0A)
    //    Purpose: Reset device
    //    Location: tcp_service.js getCommandBuffer() method
    //
    // 5. SERVER POINT COMMAND
    //    Packet: 'SERVER,IP:PORT#\n' (format varies by implementation)
    //    Purpose: Configure server IP and port on device
    //    Location: tcp_service.js getCommandBuffer() method
    //
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
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] Created new command queue`);
            }
        }

        const command = {
            commandType: commandType,
            commandData: commandData,
            timestamp: new Date(),
            priority: priority
        };

        this.commandQueue.get(imei).push(command);
        const queueSize = this.commandQueue.get(imei).length;
        
        if (imei === TARGET_IMEI) {
            console.log(`[IMEI: ${TARGET_IMEI}] Command ${commandType} queued - Queue size: ${queueSize}, Priority: ${priority}, Timestamp: ${command.timestamp.toISOString()}`);
        }
        
        return true;
    }

    // Process all queued commands for a device
    async processQueuedCommands(imei) {
        if (!imei || !this.commandQueue.has(imei)) {
            // Only log for target IMEI
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] No queued commands`);
            }
            return { processed: 0, failed: 0 };
        }

        const connection = this.findConnectionByImei(imei);
        if (!connection || !connection.socket || connection.socket.destroyed) {
            // Only log for target IMEI
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] Cannot process queued commands: device not connected`);
            }
            return { processed: 0, failed: 0 };
        }

        const commands = this.commandQueue.get(imei);
        if (!commands || commands.length === 0) {
            // Only log for target IMEI
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] Command queue is empty`);
            }
            return { processed: 0, failed: 0 };
        }

        // Target IMEI specific logging
        if (imei === TARGET_IMEI) {
            console.log(`[IMEI: ${TARGET_IMEI}] 📬 Processing ${commands.length} queued commands - Timestamp: ${new Date().toISOString()}`);
        }

        // Sort by priority (higher priority first)
        commands.sort((a, b) => b.priority - a.priority);

        let processed = 0;
        let failed = 0;

        for (const cmd of commands) {
            try {
                const commandBuffer = this.getCommandBuffer(cmd.commandType, cmd.commandData);
                if (commandBuffer) {
                    connection.socket.write(commandBuffer);
                    processed++;
                    
                    // Target IMEI specific logging
                    if (imei === TARGET_IMEI) {
                        console.log(`[IMEI: ${TARGET_IMEI}] 📤 SENDING QUEUED COMMAND - Type: ${cmd.commandType}, Packet Hex: ${commandBuffer.toString('hex')}, Length: ${commandBuffer.length} bytes, Timestamp: ${new Date().toISOString()}`);
                    }
                } else {
                    if (imei === TARGET_IMEI) {
                        console.warn(`[IMEI: ${TARGET_IMEI}] ⚠️ Invalid command type ${cmd.commandType}, skipping`);
                    }
                    failed++;
                }
            } catch (error) {
                if (imei === TARGET_IMEI) {
                    console.error(`[IMEI: ${TARGET_IMEI}] ❌ Error processing queued command ${cmd.commandType}:`, error);
                }
                failed++;
            }
        }

        // Clear processed commands
        this.clearQueuedCommands(imei);

        if (imei === TARGET_IMEI) {
            console.log(`[IMEI: ${TARGET_IMEI}] ✅ Completed processing queued commands - Processed: ${processed}, Failed: ${failed}`);
        }
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