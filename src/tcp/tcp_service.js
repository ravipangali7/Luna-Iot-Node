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

            // Build relay command using GT06 protocol packet builder
            // This wraps the command (HFYD# or DYD#) in proper GT06 protocol packet format
            // Note: HFYD# = Connect/Restore oil-electricity (ON), DYD# = Cut off oil-electricity (OFF)
            const relayCommand = this.getCommandBuffer('RELAY', { command: command });
            if (!relayCommand) {
                throw new Error(`Invalid relay command: ${command}`);
            }
            
            if (imei === TARGET_IMEI) {
                console.log(`[IMEI: ${TARGET_IMEI}] Built relay ${command} command - GT06 packet length: ${relayCommand.length} bytes`);
                console.log(`[IMEI: ${TARGET_IMEI}] GT06 packet hex: ${relayCommand.toString('hex')}`);
            }
            
            // Send command to device with error handling and callback
            try {
                // Enable no delay for immediate sending
                connection.socket.setNoDelay(true);
                
                // Write with callback to confirm data was sent
                const writeSuccess = connection.socket.write(relayCommand, (error) => {
                    if (error) {
                        if (imei === TARGET_IMEI) {
                            console.error(`[IMEI: ${TARGET_IMEI}] ❌ Socket write error:`, error);
                        }
                        // Queue command if write fails
                        this.queueCommand(imei, 'RELAY', command);
                    } else {
                        if (imei === TARGET_IMEI) {
                            console.log(`[IMEI: ${TARGET_IMEI}] ✅ Command RELAY confirmed sent to socket`);
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
                    console.log(`[IMEI: ${TARGET_IMEI}] 📤 SERVER SENDING COMMAND - Type: RELAY, Command: ${command}, Packet Hex: ${relayCommand.toString('hex')}, Length: ${relayCommand.length} bytes, Writable: ${writeSuccess}, Timestamp: ${new Date().toISOString()}`);
                    console.log(`[IMEI: ${TARGET_IMEI}] Command packet bytes:`, Array.from(relayCommand).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                }
            } catch (writeError) {
                if (imei === TARGET_IMEI) {
                    console.error(`[IMEI: ${TARGET_IMEI}] ❌ Error writing to socket:`, writeError);
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
            if (imei === TARGET_IMEI) {
                console.log(`Generic command sent to device ${imei}`);
            }
            
            return { success: true };
            
        } catch (error) {
            if (imei === TARGET_IMEI) {
                console.error(`Error sending generic command to device ${imei}:`, error);
            }
            return { success: false, error: error.message };
        }
    }

    // ========================================
    // SERVER COMMAND PACKETS SENT TO DEVICES
    // ========================================
    // 
    // 2. RELAY ON COMMAND (Official GT06 Protocol)
    //    Packet: 'HFYD#' (hex: 0x48 0x46 0x59 0x44 0x23)
    //    Purpose: Connect/Restore oil and electricity supply
    //    Location: tcp_service.js sendRelayCommand() method and getCommandBuffer()
    //    Device Response: Success -> 'HFYD=Success!', Fail -> 'HFYD=Fail!'
    //
    // 3. RELAY OFF COMMAND (Official GT06 Protocol)
    //    Packet: 'DYD#' (hex: 0x44 0x59 0x44 0x23)
    //    Purpose: Cut off oil and electricity supply
    //    Location: tcp_service.js sendRelayCommand() method and getCommandBuffer()
    //    Device Response: Success -> 'DYD=Success!', Fail -> 'DYD=Unvalued Fix' or 'DYD=Speed Limit, Speed XXkm/h'
    //    Note: GT06 requires GPS fix + speed < 20 km/h for DYD# command to execute
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
    // Build GT06 protocol command packet according to section 6.1 of GT06 documentation
    // Packet structure: Start(2) + Length(1) + Protocol(1) + InfoContent + Check(2) + Stop(2)
    // InfoContent: CmdLen(1) + ServerFlag(4) + Command(ASCII) + Language(2) + Serial(2)
    buildGT06CommandPacket(commandText, language = 0x0002, serialNumber = 0x0001) {
        // Start Bit: 0x78 0x78
        const startBit = Buffer.from([0x78, 0x78]);
        
        // Protocol Number: 0x80 (server command)
        const protocolNumber = Buffer.from([0x80]);
        
        // Server Flag Bit: 4 bytes (0x00 0x00 0x00 0x00)
        const serverFlagBit = Buffer.from([0x00, 0x00, 0x00, 0x00]);
        
        // Command Content: ASCII string
        const commandContent = Buffer.from(commandText, 'ascii');
        
        // Length of Command: Server Flag Bit (4) + Command Content length
        const commandLength = 4 + commandContent.length;
        
        // Language: 2 bytes (0x00 0x02 for English, 0x00 0x01 for Chinese)
        const languageBytes = Buffer.from([
            (language >> 8) & 0xFF,
            language & 0xFF
        ]);
        
        // Information Serial Number: 2 bytes
        const serialBytes = Buffer.from([
            (serialNumber >> 8) & 0xFF,
            serialNumber & 0xFF
        ]);
        
        // Build Information Content
        const infoContent = Buffer.concat([
            Buffer.from([commandLength]),
            serverFlagBit,
            commandContent,
            languageBytes,
            serialBytes
        ]);
        
        // Calculate checksum: XOR of all bytes from Protocol Number to Information Serial Number
        // GT06 checksum is 16-bit, calculated as XOR of each byte pair
        const checksumData = Buffer.concat([protocolNumber, infoContent]);
        let checksum = 0;
        for (let i = 0; i < checksumData.length; i++) {
            checksum ^= checksumData[i];
        }
        // Checksum is stored as 2 bytes (high byte, low byte)
        // For single byte XOR, high byte is typically 0x00
        const checksumBytes = Buffer.from([
            (checksum >> 8) & 0xFF,
            checksum & 0xFF
        ]);
        
        // Calculate Packet Length: from Protocol Number to Stop Bit
        // Protocol(1) + InfoContent + Check(2) + Stop(2)
        const packetLength = 1 + infoContent.length + 2 + 2;
        
        // Stop Bit: 0x0D 0x0A
        const stopBit = Buffer.from([0x0D, 0x0A]);
        
        // Build complete packet
        const packet = Buffer.concat([
            startBit,
            Buffer.from([packetLength]),
            protocolNumber,
            infoContent,
            checksumBytes,
            stopBit
        ]);
        
        return packet;
    }

    // Map command types to GT06 protocol buffers
    // Now returns proper GT06 protocol packets wrapped according to section 6.1
    getCommandBuffer(commandType, params = {}) {
        // Get serial number from params or use default
        const serialNumber = params.serialNumber || 0x0001;
        // Get language from params or use English as default
        const language = params.language || 0x0002;
        
        switch (commandType) {
            case 'RELAY_ON':
                // Wrap HFYD# command in GT06 protocol packet
                return this.buildGT06CommandPacket('HFYD#', language, serialNumber);
            case 'RELAY_OFF':
                // Wrap DYD# command in GT06 protocol packet
                return this.buildGT06CommandPacket('DYD#', language, serialNumber);
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
                    return this.buildGT06CommandPacket('HFYD#', language, serialNumber);
                } else if (relayCommand === 'OFF') {
                    return this.buildGT06CommandPacket('DYD#', language, serialNumber);
                }
                // Log for debugging (will be filtered by TARGET_IMEI check in processQueuedCommands)
                return null;
            case 'RESET':
                // Wrap RESET command in GT06 protocol packet
                return this.buildGT06CommandPacket('RESET#', language, serialNumber);
            case 'SERVER_POINT':
                // GT06 server point command - format may vary
                // Example: SERVER,IP:PORT#
                if (params.ip && params.port) {
                    return this.buildGT06CommandPacket(`SERVER,${params.ip}:${params.port}#`, language, serialNumber);
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
        
        // Entry log - only for target IMEI
        if (imeiStr === TARGET_IMEI) {
            console.log(`[QUEUE] processQueuedCommands called - IMEI: ${imeiStr || 'NULL'}, IMEI type: ${typeof imei}, HasQueue: ${imeiStr ? this.commandQueue.has(imeiStr) : false}`);
            
            // Diagnostic: Show all queue keys for debugging type mismatch
            if (this.commandQueue.size > 0) {
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
            if (imeiStr === TARGET_IMEI) {
                console.log(`Cleared command queue for device ${imeiStr}`);
            }
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
            // Only log if target IMEI had expired commands
            const targetImeiExpired = this.commandQueue.has(TARGET_IMEI) && 
                this.commandQueue.get(TARGET_IMEI).some(cmd => {
                    const age = now - cmd.timestamp;
                    return age >= expiryMs;
                });
            if (targetImeiExpired) {
                console.log(`Expired ${expiredCount} old commands from queue`);
            }
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

    // Parse GT06 protocol response packet according to section 6.2
    // Device responses have same structure as server commands but with Protocol Number 0x15 (or 0x13)
    // However, actual device responses may have different structure - this function handles both cases
    parseGT06ResponsePacket(data) {
        try {
            // Minimum packet size check
            if (data.length < 5) {
                return null;
            }

            // Check start bit
            if (data[0] !== 0x78 || data[1] !== 0x78) {
                return null;
            }

            // Get packet length (from Protocol Number to Stop Bit)
            const packetLength = data[2];
            
            // Check if we have enough data
            const expectedTotalLength = 3 + packetLength; // Start(2) + Length(1) + packetLength bytes
            if (data.length < expectedTotalLength) {
                return null;
            }

            // Get protocol number (should be 0x15 for response, but some devices use 0x13)
            const protocolNumber = data[3];
            
            // Only parse if it's a command response protocol
            if (protocolNumber !== 0x13 && protocolNumber !== 0x15) {
                return null;
            }

            // Log full packet structure for analysis
            console.log(`[PARSE] 🔍 Full packet analysis for ${TARGET_IMEI}:`);
            console.log(`[PARSE]   Hex: ${data.toString('hex')}`);
            console.log(`[PARSE]   Length: ${data.length} bytes`);
            console.log(`[PARSE]   Packet Length byte: ${packetLength} (0x${packetLength.toString(16)})`);
            console.log(`[PARSE]   Protocol: 0x${protocolNumber.toString(16).padStart(2, '0')}`);
            console.log(`[PARSE]   Bytes breakdown:`, Array.from(data).map((b, i) => `${i}:0x${b.toString(16).padStart(2, '0')}`).join(' '));
            
            // Extract Information Content area (everything between Protocol and Stop Bit)
            // InfoContent starts at index 4 and ends before checksum
            const infoContentStart = 4;
            const checksumStart = 3 + packetLength - 2; // Before last 2 bytes (stop bits)
            const infoContent = data.slice(infoContentStart, checksumStart);
            
            console.log(`[PARSE]   InfoContent area (bytes ${infoContentStart} to ${checksumStart}): ${infoContent.toString('hex')} (${infoContent.length} bytes)`);
            
            // Try multiple parsing approaches
            
            // Approach 1: Standard GT06 format (Command Length + Server Flag + Command + Language + Serial)
            if (infoContent.length >= 9) {
                const commandLength = infoContent[0];
                const serverFlagBit = infoContent.slice(1, 5); // 4 bytes
                const commandContentLength = commandLength - 4; // Command Length includes Server Flag Bit
                
                if (commandContentLength > 0 && infoContent.length >= 5 + commandContentLength + 4) {
                    const commandContent = infoContent.slice(5, 5 + commandContentLength);
                    const responseText = commandContent.toString('ascii');
                    
                    // Check if response text contains expected patterns
                    if (responseText.includes('HFYD=') || responseText.includes('DYD=') || 
                        responseText.includes('Success') || responseText.includes('Fail') ||
                        responseText.includes('Speed Limit') || responseText.includes('Unvalued Fix')) {
                        console.log(`[PARSE] ✅ Parsed (Standard format): "${responseText}"`);
                        return {
                            protocolNumber: protocolNumber,
                            responseText: responseText,
                            packetLength: packetLength,
                            commandLength: commandLength
                        };
                    }
                }
            }
            
            // Approach 2: Try extracting ASCII text from entire InfoContent
            // Some devices might send response text directly without full structure
            const asciiFromInfoContent = infoContent.toString('ascii');
            if (asciiFromInfoContent.includes('HFYD=') || asciiFromInfoContent.includes('DYD=') ||
                asciiFromInfoContent.includes('Success') || asciiFromInfoContent.includes('Fail') ||
                asciiFromInfoContent.includes('Speed Limit') || asciiFromInfoContent.includes('Unvalued Fix')) {
                console.log(`[PARSE] ✅ Parsed (Direct ASCII from InfoContent): "${asciiFromInfoContent}"`);
                return {
                    protocolNumber: protocolNumber,
                    responseText: asciiFromInfoContent,
                    packetLength: packetLength,
                    commandLength: null
                };
            }
            
            // Approach 3: Try extracting ASCII from entire packet (except start/stop)
            // Response might be embedded differently
            const dataContent = data.slice(4, data.length - 2); // Skip start (2) and stop (2)
            const asciiFromPacket = dataContent.toString('ascii');
            if (asciiFromPacket.includes('HFYD=') || asciiFromPacket.includes('DYD=') ||
                asciiFromPacket.includes('Success') || asciiFromPacket.includes('Fail') ||
                asciiFromPacket.includes('Speed Limit') || asciiFromPacket.includes('Unvalued Fix')) {
                console.log(`[PARSE] ✅ Parsed (Direct ASCII from packet): "${asciiFromPacket}"`);
                return {
                    protocolNumber: protocolNumber,
                    responseText: asciiFromPacket,
                    packetLength: packetLength,
                    commandLength: null
                };
            }
            
            // Approach 4: Check if this is just an acknowledgment packet (no text response)
            // Some devices may send protocol 0x13/0x15 as acknowledgment without text
            if (infoContent.length <= 5) {
                console.log(`[PARSE] ⚠️ Small packet (${infoContent.length} bytes) - might be acknowledgment only, no text response`);
                // Still return something to indicate packet was received
                return {
                    protocolNumber: protocolNumber,
                    responseText: '', // Empty response text
                    packetLength: packetLength,
                    commandLength: null,
                    isAcknowledgment: true
                };
            }
            
            // If all approaches fail, log for analysis
            console.log(`[PARSE] ❌ Could not extract response text from packet`);
            console.log(`[PARSE]   InfoContent hex: ${infoContent.toString('hex')}`);
            console.log(`[PARSE]   InfoContent ASCII: ${asciiFromInfoContent}`);
            console.log(`[PARSE]   Full packet ASCII: ${asciiFromPacket}`);
            
            return null;
        } catch (e) {
            // Parsing failed
            console.log(`[PARSE] ❌ Parse error for ${TARGET_IMEI}:`, e.message, `Hex: ${data.toString('hex')}`);
            return null;
        }
    }

    // Detect and log device responses to relay commands
    // Device responses can come as:
    // 1. Plain ASCII text: HFYD=Success!, DYD=Success!, etc.
    // 2. GT06 protocol packets with protocol 0x13 or 0x15 containing the response text
    detectDeviceResponse(data, imei) {
        if (!imei || imei !== TARGET_IMEI) {
            return false;
        }

        console.log(`[DETECT] 🔍 detectDeviceResponse called for ${imei}, data length: ${data.length}, hex: ${data.toString('hex')}`);

        // First, check if it's a GT06 protocol response packet
        if (data.length >= 4 && data[0] === 0x78 && data[1] === 0x78) {
            const protocolNumber = data[3];
            console.log(`[DETECT] 📦 GT06 protocol packet detected - Protocol: 0x${protocolNumber.toString(16).padStart(2, '0')}, Length: ${data.length}`);
            
            // Check if it's a command response protocol (0x13 or 0x15)
            if (protocolNumber === 0x13 || protocolNumber === 0x15) {
                console.log(`[DETECT] ✅ Command response protocol detected (0x${protocolNumber.toString(16).padStart(2, '0')}) - parsing...`);
                const parsed = this.parseGT06ResponsePacket(data);
                
                if (parsed) {
                    console.log(`[DEVICE RESPONSE] 📥 GT06 Protocol Response detected for IMEI ${imei}:`);
                    console.log(`[DEVICE RESPONSE] Protocol: 0x${protocolNumber.toString(16).padStart(2, '0')}`);
                    console.log(`[DEVICE RESPONSE] Full Packet Hex: ${data.toString('hex')}`);
                    console.log(`[DEVICE RESPONSE] Packet Length: ${data.length} bytes`);
                    console.log(`[DEVICE RESPONSE] Timestamp: ${new Date().toISOString()}`);
                    
                    // Handle acknowledgment-only packets (no text response)
                    if (parsed.isAcknowledgment) {
                        console.log(`[DEVICE RESPONSE] ✅ Command ACKNOWLEDGED by device (acknowledgment packet received)`);
                        console.log(`[DEVICE RESPONSE] ℹ️ Note: Device sent acknowledgment but no text response - command may have been received`);
                        return true;
                    }
                    
                    // Handle packets with response text
                    if (parsed.responseText) {
                        console.log(`[DEVICE RESPONSE] Response Text: ${parsed.responseText}`);
                        
                        // Parse specific responses
                        const responseText = parsed.responseText;
                        if (responseText.includes('HFYD=Success!')) {
                            console.log(`[DEVICE RESPONSE] ✅ Relay ON command SUCCESSFUL - Oil/electricity connected`);
                        } else if (responseText.includes('HFYD=Fail!')) {
                            console.log(`[DEVICE RESPONSE] ❌ Relay ON command FAILED - Oil/electricity not connected`);
                        } else if (responseText.includes('DYD=Success!')) {
                            console.log(`[DEVICE RESPONSE] ✅ Relay OFF command SUCCESSFUL - Oil/electricity cut off`);
                        } else if (responseText.includes('DYD=Unvalued Fix')) {
                            console.log(`[DEVICE RESPONSE] ❌ Relay OFF command FAILED - GPS fix not valid (Unvalued Fix)`);
                        } else if (responseText.includes('DYD=Speed Limit')) {
                            const speedMatch = responseText.match(/Speed Limit, Speed (\d+)km\/h/);
                            if (speedMatch) {
                                console.log(`[DEVICE RESPONSE] ❌ Relay OFF command FAILED - Vehicle speed too high: ${speedMatch[1]} km/h (must be < 20 km/h)`);
                            } else {
                                console.log(`[DEVICE RESPONSE] ❌ Relay OFF command FAILED - Vehicle speed too high (must be < 20 km/h)`);
                            }
                        } else if (responseText.trim().length > 0) {
                            console.log(`[DEVICE RESPONSE] ⚠️ Unknown response format: "${responseText}"`);
                        }
                        
                        return true;
                    }
                } else {
                    console.log(`[DETECT] ❌ parseGT06ResponsePacket returned null - parsing failed`);
                }
            } else {
                console.log(`[DETECT] ℹ️ Not a command response protocol (0x${protocolNumber.toString(16).padStart(2, '0')}) - skipping`);
            }
        } else {
            console.log(`[DETECT] ℹ️ Not a GT06 protocol packet (doesn't start with 0x78 0x78)`);
        }

        // Fallback: Try to convert data to ASCII string (for plain ASCII responses)
        let asciiText = '';
        try {
            // Check if data is ASCII text (not binary GT06 protocol)
            // GT06 protocol starts with 0x78 0x78, so if first bytes are not that, might be ASCII
            const firstBytes = data.slice(0, 2);
            const isGT06Protocol = firstBytes.length === 2 && firstBytes[0] === 0x78 && firstBytes[1] === 0x78;
            
            if (!isGT06Protocol) {
                // Try to convert to ASCII
                asciiText = data.toString('ascii');
                
                // Check for device response patterns
                if (asciiText.includes('HFYD=') || asciiText.includes('DYD=')) {
                    console.log(`[DEVICE RESPONSE] 📥 ASCII Device response detected for IMEI ${imei}:`);
                    console.log(`[DEVICE RESPONSE] ASCII: ${asciiText}`);
                    console.log(`[DEVICE RESPONSE] Hex: ${data.toString('hex')}`);
                    console.log(`[DEVICE RESPONSE] Length: ${data.length} bytes`);
                    console.log(`[DEVICE RESPONSE] Timestamp: ${new Date().toISOString()}`);
                    
                    // Parse specific responses
                    if (asciiText.includes('HFYD=Success!')) {
                        console.log(`[DEVICE RESPONSE] ✅ Relay ON command SUCCESSFUL - Oil/electricity connected`);
                    } else if (asciiText.includes('HFYD=Fail!')) {
                        console.log(`[DEVICE RESPONSE] ❌ Relay ON command FAILED - Oil/electricity not connected`);
                    } else if (asciiText.includes('DYD=Success!')) {
                        console.log(`[DEVICE RESPONSE] ✅ Relay OFF command SUCCESSFUL - Oil/electricity cut off`);
                    } else if (asciiText.includes('DYD=Unvalued Fix')) {
                        console.log(`[DEVICE RESPONSE] ❌ Relay OFF command FAILED - GPS fix not valid (Unvalued Fix)`);
                    } else if (asciiText.includes('DYD=Speed Limit')) {
                        const speedMatch = asciiText.match(/Speed Limit, Speed (\d+)km\/h/);
                        if (speedMatch) {
                            console.log(`[DEVICE RESPONSE] ❌ Relay OFF command FAILED - Vehicle speed too high: ${speedMatch[1]} km/h (must be < 20 km/h)`);
                        } else {
                            console.log(`[DEVICE RESPONSE] ❌ Relay OFF command FAILED - Vehicle speed too high (must be < 20 km/h)`);
                        }
                    } else {
                        console.log(`[DEVICE RESPONSE] ⚠️ Unknown response format: ${asciiText}`);
                    }
                    
                    return true;
                }
            }
        } catch (e) {
            // Not ASCII text, ignore
        }
        
        return false;
    }
}

module.exports = new TCPService();