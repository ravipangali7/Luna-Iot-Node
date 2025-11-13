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

// Relay command endpoint
app.post('/api/relay-command', async (req, res) => {
    try {
        const { imei, command } = req.body;
        
        if (!imei) {
            return res.status(400).json({
                success: false,
                message: 'IMEI is required'
            });
        }
        
        if (!command) {
            return res.status(400).json({
                success: false,
                message: 'Command is required. Use "on" or "off"'
            });
        }
        
        // Normalize command to lowercase
        const normalizedCommand = String(command).toLowerCase();
        
        if (normalizedCommand !== 'on' && normalizedCommand !== 'off' && normalizedCommand !== '1' && normalizedCommand !== '0') {
            return res.status(400).json({
                success: false,
                message: 'Invalid command. Use "on", "off", "1", or "0"'
            });
        }
        
        // Send relay command via TCP
        const result = await tcpService.sendRelayCommand(imei, normalizedCommand);
        
        if (result.success) {
            return res.json({
                success: true,
                message: `Relay ${normalizedCommand.toUpperCase()} command sent successfully`,
                imei: imei,
                command: normalizedCommand
            });
        } else {
            // Check if device is not connected - return 404 instead of 500
            const isDeviceNotConnected = result.error && (
                result.error.includes('Device not connected') || 
                result.error.includes('Socket connection invalid')
            );
            
            const statusCode = isDeviceNotConnected ? 404 : 500;
            
            return res.status(statusCode).json({
                success: false,
                message: result.error || 'Failed to send relay command',
                imei: imei,
                command: normalizedCommand
            });
        }
        
    } catch (error) {
        console.error('Error in relay command endpoint:', error);
        res.status(500).json({
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