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

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
socketService.initialize(server);

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