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
        // Normalize deviceImei to string for consistent storage
        if (connectionData.deviceImei) {
            connectionData.deviceImei = String(connectionData.deviceImei);
        }
        
        this.connections.set(connectionId, connectionData);
        
        // If device IMEI is available, map it immediately
        // This ensures commands can be sent instantly after device identifies itself
        if (connectionData.deviceImei) {
            const imeiStr = String(connectionData.deviceImei);
            const existingConnectionId = this.deviceImeiMap.get(imeiStr);
            
            // If IMEI is already mapped, check if we should update to this connection
            if (existingConnectionId) {
                const existingConnection = this.connections.get(existingConnectionId);
                // Update map if existing connection is invalid or this connection is more recent
                if (!existingConnection || !existingConnection.socket || existingConnection.socket.destroyed) {
                    this.deviceImeiMap.set(imeiStr, connectionId);
                    if (imeiStr === TARGET_IMEI) {
                        console.log(`[IMEI: ${TARGET_IMEI}] Updated IMEI map - Old connection invalid, using new connectionId: ${connectionId}`);
                    }
                } else {
                    // Both connections valid - use most recent one
                    const existingTime = existingConnection.lastActivityAt?.getTime() || existingConnection.connectedAt?.getTime() || 0;
                    const newTime = connectionData.lastActivityAt?.getTime() || connectionData.connectedAt?.getTime() || 0;
                    if (newTime > existingTime) {
                        this.deviceImeiMap.set(imeiStr, connectionId);
                        if (imeiStr === TARGET_IMEI) {
                            console.log(`[IMEI: ${TARGET_IMEI}] Updated IMEI map - New connection more recent, connectionId: ${connectionId}`);
                        }
                    }
                }
            } else {
                // First time mapping this IMEI
                this.deviceImeiMap.set(imeiStr, connectionId);
                if (imeiStr === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] IMEI mapped immediately - connectionId: ${connectionId}, ready for commands`);
                }
            }
        }
    }

    // Remove connection
    removeConnection(connectionId) {
        const connectionData = this.connections.get(connectionId);
        if (connectionData && connectionData.deviceImei) {
            // Normalize IMEI to string for consistent deletion
            const imeiStr = String(connectionData.deviceImei);
            this.deviceImeiMap.delete(imeiStr);
        }
        this.connections.delete(connectionId);
    }

    // Find connection by IMEI with fallback and verification
    findConnectionByImei(imei) {
        // Normalize IMEI to string for consistent lookup
        const imeiStr = imei ? String(imei) : null;
        
        if (!imeiStr) {
            return null;
        }
        
        // Diagnostic log for target IMEI
        if (imeiStr === TARGET_IMEI) {
            console.log(`[FIND] Searching for IMEI - Input: ${imei} (type: ${typeof imei}), Normalized: ${imeiStr}`);
        }
        
        // First try: Use IMEI map (fast lookup)
        const connectionId = this.deviceImeiMap.get(imeiStr);
        if (connectionId) {
            const connection = this.connections.get(connectionId);
            // Verify connection is valid and socket is not destroyed
            if (connection && connection.socket && !connection.socket.destroyed && connection.socket.writable) {
                if (imeiStr === TARGET_IMEI) {
                    console.log(`[FIND] ✅ Found via IMEI map - connectionId: ${connectionId}`);
                }
                return connection;
            }
            // Map points to invalid connection, remove it
            this.deviceImeiMap.delete(imeiStr);
        }
        
        // Fallback: Search all connections by IMEI (slower but reliable)
        // This handles cases where map is out of sync
        let foundConnection = null;
        let mostRecentConnection = null;
        let mostRecentTime = 0;
        let sampleImeis = [];
        
        for (const [connId, connData] of this.connections.entries()) {
            // Normalize stored IMEI for comparison
            const storedImeiStr = connData.deviceImei ? String(connData.deviceImei) : null;
            
            // Collect sample IMEIs for diagnostics (only first 3)
            if (imeiStr === TARGET_IMEI && sampleImeis.length < 3 && storedImeiStr) {
                sampleImeis.push(`${storedImeiStr} (type: ${typeof connData.deviceImei})`);
            }
            
            if (storedImeiStr === imeiStr) {
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
                this.deviceImeiMap.set(imeiStr, recentConnId);
                if (imeiStr === TARGET_IMEI) {
                    console.log(`[FIND] ✅ Found via fallback search - Updated map, connectionId: ${recentConnId}`);
                }
            }
            return mostRecentConnection;
        }
        
        // Log for target IMEI if connection not found
        if (imeiStr === TARGET_IMEI) {
            const totalConnections = this.connections.size;
            const mappedConnections = Array.from(this.deviceImeiMap.keys()).length;
            console.log(`[FIND] ❌ Connection not found - Total connections: ${totalConnections}, Mapped IMEIs: ${mappedConnections}, Sample IMEIs in connections: ${sampleImeis.join(', ') || 'none'}`);
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

            // Build relay command based on GT06 protocol (HFYD# for ON, DYD# for OFF, no newline)
            let relayCommand;
            if (command === 'ON') {
                relayCommand = Buffer.from('HFYD#'); // GT06 relay ON command
                if (imei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] Built relay ON command buffer: HFYD#`);
                }
            } else if (command === 'OFF') {
                relayCommand = Buffer.from('DYD#');  // GT06 relay OFF command
                if (imei === TARGET_IMEI) {
                    console.log(`[IMEI: ${TARGET_IMEI}] Built relay OFF command buffer: DYD#`);
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
    //    Packet: 'HFYD#' (hex: 0x48 0x46 0x59 0x44 0x23)
    //    Purpose: Turn relay ON on device
    //    Location: tcp_service.js sendRelayCommand() method and getCommandBuffer()
    //
    // 3. RELAY OFF COMMAND  
    //    Packet: 'DYD#' (hex: 0x44 0x59 0x44 0x23)
    //    Purpose: Turn relay OFF on device
    //    Location: tcp_service.js sendRelayCommand() method and getCommandBuffer()
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
                return Buffer.from('HFYD#');
            case 'RELAY_OFF':
                return Buffer.from('DYD#');
            case 'RELAY':
                // RELAY command with params: 'ON', 'OFF', or {command: 'ON'/'OFF'}
                let relayCommand = '';
                if (typeof params === 'string') {
                    relayCommand = params;
                } else if (params && typeof params === 'object') {
                    relayCommand = params.command || '';
                } else {
                    return null;
                }
                
                // Normalize command to uppercase for comparison
                relayCommand = relayCommand.toString().trim().toUpperCase();
                
                if (relayCommand === 'ON') {
                    return Buffer.from('HFYD#');
                } else if (relayCommand === 'OFF') {
                    return Buffer.from('DYD#');
                }
                // Log for debugging (will be filtered by TARGET_IMEI check in processQueuedCommands)
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
        // Normalize IMEI to string for consistent lookup
        const imeiStr = imei ? String(imei) : null;
        
        if (!imeiStr) {
            console.error('[COMMAND QUEUE] ❌ Cannot queue command: IMEI is required');
            return false;
        }

        if (!this.commandQueue.has(imeiStr)) {
            this.commandQueue.set(imeiStr, []);
            if (imeiStr === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] Created new command queue`);
            }
        }

        const command = {
            commandType: commandType,
            commandData: commandData,
            timestamp: new Date(),
            priority: priority
        };

        this.commandQueue.get(imeiStr).push(command);
        const queueSize = this.commandQueue.get(imeiStr).length;
        
        // Minimal queue log - only for target IMEI
        if (imeiStr === TARGET_IMEI) {
            let commandName = commandType;
            if (commandType === 'RELAY') {
                // Extract command value from object or string
                const commandValue = (typeof commandData === 'object' && commandData !== null) 
                    ? (commandData.command || JSON.stringify(commandData))
                    : commandData;
                commandName = `RELAY ${commandValue}`;
            }
            console.log(`[QUEUE] Command queued: ${commandName} (Queue: ${queueSize})`);
        }
        
        return true;
    }

    // Process all queued commands for a device
    async processQueuedCommands(imei) {
        // Normalize IMEI to string for consistent lookup
        const imeiStr = imei ? String(imei) : null;
        
        // Entry log - show ALL calls, especially useful when IMEI is null/undefined
        if (!imeiStr || imeiStr === TARGET_IMEI) {
            console.log(`[QUEUE] processQueuedCommands called - IMEI: ${imeiStr || 'NULL'}, IMEI type: ${typeof imei}, HasQueue: ${imeiStr ? this.commandQueue.has(imeiStr) : false}`);
            
            // Diagnostic: Show all queue keys for debugging type mismatch
            if (imeiStr === TARGET_IMEI && this.commandQueue.size > 0) {
                const queueKeys = Array.from(this.commandQueue.keys());
                const matchingKeys = queueKeys.filter(k => String(k) === imeiStr);
                console.log(`[QUEUE] Queue keys for debugging - Total queues: ${queueKeys.length}, Looking for: ${imeiStr}, Matching keys: ${matchingKeys.length}, Sample keys: ${queueKeys.slice(0, 3).map(k => `${k}(${typeof k})`).join(', ')}`);
            }
        }
        
        if (!imeiStr || !this.commandQueue.has(imeiStr)) {
            // Minimal log - only for target IMEI
            if (imeiStr === TARGET_IMEI) {
                console.log(`[QUEUE] Empty - no commands (checked IMEI: ${imeiStr})`);
            }
            return { processed: 0, failed: 0 };
        }

        // Find connection with retry logic for reliability
        let connection = this.findConnectionByImei(imeiStr);
        
        // Retry once if connection not found (might be timing issue)
        if (!connection || !connection.socket || connection.socket.destroyed) {
            // Small delay and retry
            await new Promise(resolve => setTimeout(resolve, 100));
            connection = this.findConnectionByImei(imeiStr);
            
            if (!connection || !connection.socket || connection.socket.destroyed) {
                // No log for retry failure - device simply not connected
                return { processed: 0, failed: 0 };
            }
        }

        // Verify socket is writable before processing
        if (!connection.socket.writable) {
            if (imeiStr === TARGET_IMEI) {
                console.log(`[QUEUE] Socket not writable`);
            }
            return { processed: 0, failed: 0 };
        }

        const commands = this.commandQueue.get(imeiStr);
        if (!commands || commands.length === 0) {
            // Minimal log - only for target IMEI
            if (imeiStr === TARGET_IMEI) {
                console.log(`[QUEUE] Empty - no commands`);
            }
            return { processed: 0, failed: 0 };
        }

        // Minimal trigger log - only for target IMEI
        if (imeiStr === TARGET_IMEI) {
            console.log(`[QUEUE] Processing triggered (${commands.length} commands)`);
            // Diagnostic: Show queue contents
            commands.forEach((cmd, idx) => {
                console.log(`[QUEUE] Command ${idx + 1}: Type=${cmd.commandType}, Data=${JSON.stringify(cmd.commandData)}, DataType=${typeof cmd.commandData}`);
            });
            // Diagnostic: Show connection status
            console.log(`[QUEUE] Connection: Found=${!!connection}, Socket=${!!connection?.socket}, Writable=${connection?.socket?.writable}, Destroyed=${connection?.socket?.destroyed}`);
        }

        // Sort by priority (higher priority first)
        commands.sort((a, b) => b.priority - a.priority);

        let processed = 0;
        let failed = 0;

        // Enable no delay for immediate sending
        connection.socket.setNoDelay(true);

        for (const cmd of commands) {
            try {
                // Diagnostic: Log what we're trying to build
                if (imeiStr === TARGET_IMEI) {
                    console.log(`[QUEUE] Building buffer: Type=${cmd.commandType}, Data=${JSON.stringify(cmd.commandData)}`);
                }
                
                const commandBuffer = this.getCommandBuffer(cmd.commandType, cmd.commandData);
                
                // Diagnostic: Log getCommandBuffer result
                if (imeiStr === TARGET_IMEI) {
                    if (commandBuffer) {
                        console.log(`[QUEUE] Buffer created: ${commandBuffer.toString('hex')} (${commandBuffer.length} bytes)`);
                    } else {
                        console.log(`[QUEUE] ❌ getCommandBuffer returned NULL for Type=${cmd.commandType}, Data=${JSON.stringify(cmd.commandData)}`);
                    }
                }
                
                if (commandBuffer) {
                    // Verify socket is still writable before each command
                    if (!connection.socket.writable || connection.socket.destroyed) {
                        if (imeiStr === TARGET_IMEI) {
                            console.log(`[QUEUE] Socket unwritable - stopped`);
                        }
                        break;
                    }
                    
                    // Write with callback for confirmation
                    connection.socket.write(commandBuffer, (error) => {
                        if (error && imeiStr === TARGET_IMEI) {
                            console.log(`[QUEUE] Send failed: ${cmd.commandType}`);
                        }
                    });
                    
                    processed++;
                    
                    // Minimal send log - only for target IMEI
                    if (imeiStr === TARGET_IMEI) {
                        // Extract command value from object or string
                        const commandValue = (typeof cmd.commandData === 'object' && cmd.commandData !== null) 
                            ? (cmd.commandData.command || JSON.stringify(cmd.commandData))
                            : cmd.commandData;
                        const commandName = cmd.commandType === 'RELAY' ? `RELAY ${commandValue}` : cmd.commandType;
                        console.log(`[QUEUE] Sending: ${commandName}`);
                    }
                } else {
                    // Log when getCommandBuffer returns null
                    if (imeiStr === TARGET_IMEI) {
                        console.log(`[QUEUE] ❌ Command failed - getCommandBuffer returned null for Type=${cmd.commandType}, Data=${JSON.stringify(cmd.commandData)}`);
                    }
                    failed++;
                }
            } catch (error) {
                if (imeiStr === TARGET_IMEI) {
                    console.log(`[QUEUE] ❌ Exception: ${error.message}`);
                }
                failed++;
            }
        }

        // Clear processed commands
        this.clearQueuedCommands(imeiStr);

        // Minimal completion log - only for target IMEI
        if (imeiStr === TARGET_IMEI) {
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
        // Normalize IMEI to string for consistent lookup
        const imeiStr = imei ? String(imei) : null;
        if (imeiStr && this.commandQueue.has(imeiStr)) {
            this.commandQueue.delete(imeiStr);
            console.log(`Cleared command queue for device ${imeiStr}`);
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