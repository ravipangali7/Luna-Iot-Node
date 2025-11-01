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
        
        // If device IMEI is available, map it immediately
        // This ensures commands can be sent instantly after device identifies itself
        if (connectionData.deviceImei) {
            const existingConnectionId = this.deviceImeiMap.get(connectionData.deviceImei);
            
            // If IMEI is already mapped, check if we should update to this connection
            if (existingConnectionId) {
                const existingConnection = this.connections.get(existingConnectionId);
                // Update map if existing connection is invalid or this connection is more recent
                if (!existingConnection || !existingConnection.socket || existingConnection.socket.destroyed) {
                    this.deviceImeiMap.set(connectionData.deviceImei, connectionId);
                    if (connectionData.deviceImei === TARGET_IMEI) {
                        console.log(`[IMEI: ${TARGET_IMEI}] Updated IMEI map - Old connection invalid, using new connectionId: ${connectionId}`);
                    }
                } else {
                    // Both connections valid - use most recent one
                    const existingTime = existingConnection.lastActivityAt?.getTime() || existingConnection.connectedAt?.getTime() || 0;
                    const newTime = connectionData.lastActivityAt?.getTime() || connectionData.connectedAt?.getTime() || 0;
                    if (newTime > existingTime) {
                        this.deviceImeiMap.set(connectionData.deviceImei, connectionId);
                        if (connectionData.deviceImei === TARGET_IMEI) {
                            console.log(`[IMEI: ${TARGET_IMEI}] Updated IMEI map - New connection more recent, connectionId: ${connectionId}`);
                        }
                    }
                }
            } else {
                // First time mapping this IMEI
                this.deviceImeiMap.set(connectionData.deviceImei, connectionId);
                if (connectionData.deviceImei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] IMEI mapped immediately - connectionId: ${connectionId}, ready for commands`);
                }
            }
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

    // Find connection by IMEI with fallback and verification
    findConnectionByImei(imei) {
        // First try: Use IMEI map (fast lookup)
        const connectionId = this.deviceImeiMap.get(imei);
        if (connectionId) {
            const connection = this.connections.get(connectionId);
            // Verify connection is valid and socket is not destroyed
            if (connection && connection.socket && !connection.socket.destroyed && connection.socket.writable) {
                return connection;
            }
            // Map points to invalid connection, remove it
            this.deviceImeiMap.delete(imei);
        }
        
        // Fallback: Search all connections by IMEI (slower but reliable)
        // This handles cases where map is out of sync
        let foundConnection = null;
        let mostRecentConnection = null;
        let mostRecentTime = 0;
        
        for (const [connId, connData] of this.connections.entries()) {
            if (connData.deviceImei === imei) {
                // Check if socket is valid and writable
                if (connData.socket && !connData.socket.destroyed && connData.socket.writable) {
                    // Track most recent connection
                    const lastActivity = connData.lastActivityAt?.getTime() || connData.connectedAt?.getTime() || 0;
                    if (lastActivity > mostRecentTime) {
                        mostRecentTime = lastActivity;
                        mostRecentConnection = connData;
                    }
                    foundConnection = connData;
                }
            }
        }
        
        // Use most recent connection if multiple found
        if (mostRecentConnection) {
            // Update map with most recent connection
            const recentConnId = Array.from(this.connections.entries())
                .find(([id, data]) => data === mostRecentConnection)?.[0];
            if (recentConnId) {
                this.deviceImeiMap.set(imei, recentConnId);
            }
            return mostRecentConnection;
        }
        
        // Log for target IMEI if connection not found
        if (imei === TARGET_IMEI) {
            const totalConnections = this.connections.size;
            const mappedConnections = Array.from(this.deviceImeiMap.keys()).length;
            console.log(`[IMEI: ${TARGET_IMEI}] ⚠️ Connection not found - Total connections: ${totalConnections}, Mapped IMEIs: ${mappedConnections}`);
        }
        
        return null;
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
                return { 
                    success: true, 
                    command: command, 
                    queued: true,
                    message: 'Command queued - will be sent when device connects'
                };
            }

            // Verify socket is writable before sending
            if (!connection.socket.writable) {
                if (imei === TARGET_IMEI) {
                    console.error(`[IMEI: ${TARGET_IMEI}] ❌ Socket not writable - cannot send command`);
                }
                // Socket not writable, queue command instead
                this.queueCommand(imei, 'RELAY', command);
                return { 
                    success: false, 
                    command: command, 
                    queued: true,
                    error: 'Socket not writable'
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
            
            // Send command to device with error handling and callback
            try {
                // Enable no delay for immediate sending
                connection.socket.setNoDelay(true);
                
                // Write with callback to confirm data was sent
                connection.socket.write(relayCommand, (error) => {
                    if (error) {
                        // Queue command if write fails
                        this.queueCommand(imei, 'RELAY', command);
                    }
                });
                
                // Minimal send log - only for target IMEI
                if (imei === TARGET_IMEI) {
                    console.log(`[RELAY] Sent: ${command}`);
                }
            } catch (writeError) {
                if (imei === TARGET_IMEI) {
                    console.log(`[RELAY] Send error`);
                }
                throw writeError;
            }
            
            return { success: true, command: command, queued: false };
            
        } catch (error) {
            if (imei === TARGET_IMEI) {
                console.log(`[RELAY] Error: ${error.message}`);
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

            // Verify socket is writable before sending
            if (!connection.socket.writable) {
                if (imei === TARGET_IMEI) {
                    console.error(`[IMEI: ${TARGET_IMEI}] ❌ Socket not writable - cannot send command`);
                }
                // Socket not writable, queue command instead
                this.queueCommand(imei, commandType, params);
                return { 
                    success: false, 
                    commandType: commandType,
                    queued: true,
                    error: 'Socket not writable'
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
            
            // Send command to device with error handling and callback
            try {
                // Enable no delay for immediate sending
                connection.socket.setNoDelay(true);
                
                // Write with callback to confirm data was sent
                const writeSuccess = connection.socket.write(commandBuffer, (error) => {
                    if (error) {
                        if (imei === TARGET_IMEI) {
                            console.error(`[IMEI: ${TARGET_IMEI}] ❌ Socket write error:`, error);
                        }
                        // Queue command if write fails
                        this.queueCommand(imei, commandType, params);
                    } else {
                        if (imei === TARGET_IMEI) {
                            console.log(`[IMEI: ${TARGET_IMEI}] ✅ Command ${commandType} confirmed sent to socket`);
                        }
                    }
                });
                
                if (!writeSuccess) {
                    // Socket buffer is full, data was queued internally
                    if (imei === TARGET_IMEI) {
                        console.warn(`[IMEI: ${TARGET_IMEI}] ⚠️ Socket buffer full, command queued in socket buffer`);
                    }
                }
                
                // Target IMEI specific logging with packet details
                if (imei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] 📤 SERVER SENDING COMMAND - Type: ${commandType}, Packet Hex: ${commandBuffer.toString('hex')}, Packet ASCII: ${commandBuffer.toString('ascii').replace('\n', '\\n')}, Length: ${commandBuffer.length} bytes, Writable: ${writeSuccess}, Timestamp: ${new Date().toISOString()}`);
                    console.log(`[IMEI: ${TARGET_IMEI}] Command packet bytes:`, Array.from(commandBuffer).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                }
            } catch (writeError) {
                if (imei === TARGET_IMEI) {
                    console.error(`[IMEI: ${TARGET_IMEI}] ❌ Error writing to socket:`, writeError);
                }
                throw writeError;
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
        
        // Minimal queue log - only for target IMEI
        if (imei === TARGET_IMEI) {
            const commandName = commandType === 'RELAY' ? `RELAY ${commandData}` : commandType;
            console.log(`[QUEUE] Command queued: ${commandName} (Queue: ${queueSize})`);
        }
        
        return true;
    }

    // Process all queued commands for a device
    async processQueuedCommands(imei) {
        if (!imei || !this.commandQueue.has(imei)) {
            // Minimal log - only for target IMEI
            if (imei === TARGET_IMEI) {
                console.log(`[QUEUE] Empty - no commands`);
            }
            return { processed: 0, failed: 0 };
        }

        // Find connection with retry logic for reliability
        let connection = this.findConnectionByImei(imei);
        
        // Retry once if connection not found (might be timing issue)
        if (!connection || !connection.socket || connection.socket.destroyed) {
            // Small delay and retry
            await new Promise(resolve => setTimeout(resolve, 100));
            connection = this.findConnectionByImei(imei);
            
            if (!connection || !connection.socket || connection.socket.destroyed) {
                // No log for retry failure - device simply not connected
                return { processed: 0, failed: 0 };
            }
        }

        // Verify socket is writable before processing
        if (!connection.socket.writable) {
            if (imei === TARGET_IMEI) {
                console.log(`[QUEUE] Socket not writable`);
            }
            return { processed: 0, failed: 0 };
        }

        const commands = this.commandQueue.get(imei);
        if (!commands || commands.length === 0) {
            // Minimal log - only for target IMEI
            if (imei === TARGET_IMEI) {
                console.log(`[QUEUE] Empty - no commands`);
            }
            return { processed: 0, failed: 0 };
        }

        // Minimal trigger log - only for target IMEI
        if (imei === TARGET_IMEI) {
            console.log(`[QUEUE] Processing triggered (${commands.length} commands)`);
        }

        // Sort by priority (higher priority first)
        commands.sort((a, b) => b.priority - a.priority);

        let processed = 0;
        let failed = 0;

        // Enable no delay for immediate sending
        connection.socket.setNoDelay(true);

        for (const cmd of commands) {
            try {
                const commandBuffer = this.getCommandBuffer(cmd.commandType, cmd.commandData);
                if (commandBuffer) {
                    // Verify socket is still writable before each command
                    if (!connection.socket.writable || connection.socket.destroyed) {
                        if (imei === TARGET_IMEI) {
                            console.log(`[QUEUE] Socket unwritable - stopped`);
                        }
                        break;
                    }
                    
                    // Write with callback for confirmation
                    connection.socket.write(commandBuffer, (error) => {
                        if (error && imei === TARGET_IMEI) {
                            console.log(`[QUEUE] Send failed: ${cmd.commandType}`);
                        }
                    });
                    
                    processed++;
                    
                    // Minimal send log - only for target IMEI
                    if (imei === TARGET_IMEI) {
                        const commandName = cmd.commandType === 'RELAY' ? `RELAY ${cmd.commandData}` : cmd.commandType;
                        console.log(`[QUEUE] Sending: ${commandName}`);
                    }
                } else {
                    failed++;
                }
            } catch (error) {
                failed++;
            }
        }

        // Clear processed commands
        this.clearQueuedCommands(imei);

        // Minimal completion log - only for target IMEI
        if (imei === TARGET_IMEI) {
            if (processed > 0 || failed > 0) {
                console.log(`[QUEUE] Completed: ${processed} sent, ${failed} failed`);
            }
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