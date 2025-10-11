# Luna IoT Node.js Server

This is the simplified Node.js server that handles only TCP listening and Socket.IO functionality for the Luna IoT system.

## Features

- **TCP Listener**: Receives data from GT06 GPS devices on port 6666
- **Socket.IO**: Real-time communication with web clients on port 6060
- **MySQL Integration**: Direct database writes for location and status data
- **Firebase Notifications**: Push notifications for vehicle events

## Environment Variables

Create a `.env` file with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=luna_iot
DB_PORT=3306

# Server Ports
SOCKET_PORT=6060
TCP_PORT=6666

# Firebase Configuration
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your_client_email
```

## Installation

```bash
npm install
```

## Running

```bash
# Development
npm run dev

# Production
npm start
```

## Architecture

- **TCP Listener**: Handles GT06 device connections and data parsing
- **Socket.IO**: Broadcasts real-time updates to connected clients
- **MySQL Service**: Direct database operations for location/status data
- **Firebase Service**: Push notification delivery
- **GT06 Notification Service**: Event detection and notification triggers

## API Endpoints

This server no longer provides REST API endpoints. All API functionality has been moved to the Python backend.

## Socket.IO Events

- `device_monitoring`: Device connection status updates
- `status_update`: Vehicle status changes (battery, signal, ignition, etc.)
- `location_update`: GPS location updates

## Database Tables Used

- `vehicles`: Vehicle information
- `locations`: GPS location data
- `statuses`: Device status data
- `user_vehicles`: User-vehicle access relationships
- `users`: User information for notifications
