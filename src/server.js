const tcp = require('./tcp/tcp_listener');
const tcpService = require('./tcp/tcp_service');
const mysqlService = require('./database/mysql');
const socketService = require('./socket/socket_service');
const GT06NotificationService = require('./utils/gt06_notification_service');
require('dotenv').config();


// PORTS 
const SOCKET_PORT = process.env.SOCKET_PORT || 6060;
const TCP_PORT = process.env.TCP_PORT || 6666;



// Simple HTTP server for Socket.IO
const http = require('http');
const app = require('express')();

// Add middleware for JSON parsing
app.use(require('express').json());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
socketService.initialize(server);

// Alert notification endpoint
app.post('/api/alert-notification', (req, res) => {
    try {
        const { radar_tokens, alert_data } = req.body;
        
        if (!radar_tokens || !Array.isArray(radar_tokens) || !alert_data) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request data. radar_tokens and alert_data are required.'
            });
        }
        
        if (radar_tokens.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No radar tokens provided, no notifications sent.'
            });
        }
        
        // Broadcast alert to radar rooms
        socketService.broadcastAlertToRadars(radar_tokens, alert_data);
        
        console.log(`Alert notification sent to ${radar_tokens.length} radar rooms`);
        
        res.json({
            success: true,
            message: `Alert notification sent to ${radar_tokens.length} radar rooms`,
            radar_tokens: radar_tokens
        });
        
    } catch (error) {
        console.error('Error in alert notification endpoint:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// TCP Command API Endpoints

// POST /api/tcp/send-command - Send command to device (with auto-queue if offline)
app.post('/api/tcp/send-command', async (req, res) => {
    try {
        const { imei, commandType, params } = req.body;
        
        console.log(`[TCP API] Received command request - IMEI: ${imei}, CommandType: ${commandType}, Params:`, params, `Timestamp: ${new Date().toISOString()}`);
        console.log(`[TCP API] Request from IP: ${req.ip || req.connection.remoteAddress}`);

        if (!imei || !commandType) {
            console.warn(`[TCP API] ❌ Missing required parameters - IMEI: ${imei}, CommandType: ${commandType}`);
            return res.status(400).json({
                success: false,
                message: 'IMEI and commandType are required'
            });
        }

        console.log(`[TCP API] Calling tcpService.sendCommand for device ${imei}`);
        const result = await tcpService.sendCommand(imei, commandType, params || {});
        
        console.log(`[TCP API] Command result - Success: ${result.success}, Queued: ${result.queued || false}, Error: ${result.error || 'None'}`);

        if (result.success) {
            const message = result.queued 
                ? 'Command queued - will be sent when device connects'
                : 'Command sent successfully';
            console.log(`[TCP API] ✅ Command processed successfully for device ${imei} - ${message}`);
            
            return res.json({
                success: true,
                message: message,
                queued: result.queued || false,
                commandType: commandType
            });
        } else {
            console.error(`[TCP API] ❌ Command failed for device ${imei}: ${result.error || 'Unknown error'}`);
            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send command'
            });
        }

    } catch (error) {
        console.error(`[TCP API] ❌ Unexpected error in send-command endpoint:`, error);
        console.error(`[TCP API] Error stack:`, error.stack);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /api/tcp/device-status/:imei - Get device connection status and queue info
app.get('/api/tcp/device-status/:imei', (req, res) => {
    try {
        const { imei } = req.params;

        if (!imei) {
            return res.status(400).json({
                success: false,
                message: 'IMEI is required'
            });
        }

        const status = tcpService.getDeviceStatus(imei);

        return res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('Error in device-status endpoint:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /api/tcp/queued-commands/:imei - Get queued commands for a device
app.get('/api/tcp/queued-commands/:imei', (req, res) => {
    try {
        const { imei } = req.params;

        if (!imei) {
            return res.status(400).json({
                success: false,
                message: 'IMEI is required'
            });
        }

        const commands = tcpService.getQueuedCommands(imei);
        const count = tcpService.getQueuedCommandsCount(imei);

        return res.json({
            success: true,
            data: {
                commands: commands,
                count: count
            }
        });

    } catch (error) {
        console.error('Error in queued-commands endpoint:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// GET /api/tcp/connected-devices - Get list of all connected devices
app.get('/api/tcp/connected-devices', (req, res) => {
    try {
        const devices = tcpService.getConnectedDevices();

        return res.json({
            success: true,
            data: {
                devices: devices,
                count: devices.length
            }
        });

    } catch (error) {
        console.error('Error in connected-devices endpoint:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Start server
async function startServer() {
    try {
        // Start HTTP server for Socket.IO
        server.listen(SOCKET_PORT, () => {
            console.log(`Socket.IO server running on port ${SOCKET_PORT}`);
        });

        // Start TCP listener
        tcp.startServer(TCP_PORT);
        console.log(`TCP listener started on port ${TCP_PORT}`);

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Shutting down gracefully...');
            await mysqlService.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('Server initialization failed:', error);
        process.exit(1);
    }
}

startServer();