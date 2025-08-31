const cluster = require('cluster');
const os = require('os');
const tcp = require('./tcp/tcp_listener');
const prisma = require('./database/prisma');
const express = require('express');
const { errorMiddleware } = require('./api/middleware/error_middleware');
const socketService = require('./socket/socket_service');
const AuthMiddleware = require('./api/middleware/auth_middleware');
// const corsMiddleware = require('./api/middleware/cors_middleware');
const otpCleanupService = require('./utils/otp_cleanup_service');
const path = require('path');
require('dotenv').config();


// PORTS 
const API_PORT = process.env.API_PORT || 7070;
const TCP_PORT = process.env.TCP_PORT || 7777;

// IMPORT Routes
const authRoutes = require('./api/routes/auth_routes');
const notificationRoutes = require('./api/routes/notification_routes');
const roleRoutes = require('./api/routes/role_routes');
const userRoutes = require('./api/routes/user_routes');
const deviceRoutes = require('./api/routes/device_routes');
const locationRoutes = require('./api/routes/location_routes');
const statusRoutes = require('./api/routes/status_routes');
const vehicleRoutes = require('./api/routes/vehicle_routes');
const geofenceRoutes = require('./api/routes/geofence_routes');
const popupRoutes = require('./api/routes/popup_routes');
const relayRoutes = require('./api/routes/relay_routes');

// Express App
const app = express();
app.use(express.json());

// CORS
const allowedOrigins = [
    'https://app.mylunago.com',
    'http://app.mylunago.com',
    'http://5.189.159.178:7070',  
];

app.use(cors({
    origin: function (origin, callback) {
        // allow requests with no origin like mobile apps
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true
}));



// API Routes
app.use('/uploads', express.static(`/home/luna/luna_iot/Luna-Iot/uploads`));
// app.use(corsMiddleware.corsMiddleware);

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});
app.use('/api/auth', authRoutes);
app.use('/api', AuthMiddleware.verifyToken, roleRoutes);
app.use('/api', AuthMiddleware.verifyToken, notificationRoutes);
app.use('/api', AuthMiddleware.verifyToken, userRoutes);
app.use('/api', AuthMiddleware.verifyToken, deviceRoutes);
app.use('/api', AuthMiddleware.verifyToken, locationRoutes);
app.use('/api', AuthMiddleware.verifyToken, statusRoutes);
app.use('/api', AuthMiddleware.verifyToken, vehicleRoutes);
app.use('/api', AuthMiddleware.verifyToken, geofenceRoutes);
app.use('/api', AuthMiddleware.verifyToken, popupRoutes);
app.use('/api', relayRoutes);

// Middleware
app.use(errorMiddleware);



// Number of CPU for Cluster
const numCPUs = os.cpus().length;

if (cluster.isMaster) {
    // This block runs in the master process
    console.log(`Master process ${process.pid} is running`);


    // Start OTP cleanup service in master process
    otpCleanupService.startCleanupScheduler();


    // Fork workers (one per CPU core)
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork(); // Create a new worker
    }

    // Listen for dying workers
    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Starting a new one...`);
        cluster.fork(); // Replace dead worker
    });

    // Handle inter-worker communication
    cluster.on('message', (worker, message) => {
        if (message.type === 'socket_broadcast') {
            // Forward the message to all other workers
            for (const id in cluster.workers) {
                if (cluster.workers[id].id !== worker.id) {
                    cluster.workers[id].send(message);
                }
            }
        }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down gracefully...');
        await prisma.disconnect();
        process.exit(0);
    });

} else {
    // This block runs in each worker process
    console.log(`Worker ${process.pid} started...`);
    async function startWorker() {
        try {
            // Initialize Prisma in each worker
            await prisma.connect();
            console.log(`Worker ${process.pid}: Prisma connected`);

            // Start HTTP server
            const server = app.listen(API_PORT, () => {
                console.log(`Worker ${process.pid}: API server running on port ${API_PORT}`);
            });

            // Initialize Socket.IO
            socketService.initialize(server);

            // Start TCP listener (only in first worker)
            tcp.startServer(TCP_PORT);

            // Graceful shutdown
            process.on('SIGINT', async () => {
                await prisma.disconnect();
                process.exit(0);
            });

        } catch (error) {
            console.error(`Worker ${process.pid} initialization failed:`, error);
            process.exit(1);
        }
    }

    startWorker();
}