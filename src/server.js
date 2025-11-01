const tcp = require('./tcp/tcp_listener');
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