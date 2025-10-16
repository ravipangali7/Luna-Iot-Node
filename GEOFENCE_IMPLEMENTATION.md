# Geofence Entry/Exit Notification System

## Overview

This system monitors vehicle locations in real-time and sends notifications when vehicles enter or exit designated geofenced areas. The system uses:
- **Database state management** for persistent tracking
- **Point-in-polygon algorithm** for boundary detection
- **Firebase Cloud Messaging** for push notifications
- **One-time notifications** per state change (no duplicates)

## Architecture

### Components

1. **Python Django (Backend API)**
   - `GeofenceEvent` model for state tracking
   - RESTful API endpoints for viewing events
   - Admin interface for management

2. **Node.js (Real-time Processing)**
   - Geofence service with point-in-polygon detection
   - MySQL integration for state persistence
   - Firebase notification delivery
   - Integration with GT06 GPS protocol handler

## Database Schema

### New Table: `geofence_events`

```sql
CREATE TABLE geofence_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  vehicle_id INT NOT NULL,
  geofence_id INT NOT NULL,
  is_inside TINYINT(1) NOT NULL DEFAULT 0,
  last_event_type VARCHAR(10) NOT NULL,
  last_event_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY (vehicle_id, geofence_id)
);
```

### Existing Tables Used
- `geofences` - Geofence definitions with boundaries
- `geofence_vehicles` - Vehicle to geofence assignments
- `geofence_users` - User to geofence assignments
- `vehicles` - Vehicle information
- `users` - User information with FCM tokens

## Installation

### 1. Create Database Table

Run the SQL migration:
```bash
mysql -u root -p luna_iot < geofence_events_table.sql
```

Or use Django migrations:
```bash
cd Luna-Iot-Py
python manage.py makemigrations shared
python manage.py migrate shared
```

### 2. No Additional Dependencies Required

All required packages are already included in the existing `package.json` and `requirements.txt`.

## API Endpoints

### Geofence Event Endpoints

All endpoints require authentication.

**Base URL:** `https://py.mylunago.com/api/`

#### 1. Get All Geofence Events
```
GET /geofence/events
```

**Query Parameters:**
- `vehicleId` - Filter by vehicle ID
- `geofenceId` - Filter by geofence ID
- `imei` - Filter by vehicle IMEI
- `isInside` - Filter by current state (true/false)
- `eventType` - Filter by event type (Entry/Exit)
- `startDate` - Filter from date
- `endDate` - Filter to date

**Response:**
```json
{
  "success": true,
  "message": "Geofence events retrieved successfully",
  "data": [
    {
      "id": 1,
      "vehicleId": 123,
      "geofenceId": 45,
      "isInside": true,
      "lastEventType": "Entry",
      "lastEventAt": "2025-10-16T10:30:00",
      "vehicle": {
        "name": "Vehicle 1",
        "vehicleNo": "BA 1 KHA 1234",
        "imei": "352312094630210"
      },
      "geofence": {
        "title": "Office Area",
        "type": "Entry"
      }
    }
  ]
}
```

#### 2. Get Event by ID
```
GET /geofence/events/<id>
```

#### 3. Get Events by Vehicle
```
GET /geofence/events/vehicle/<vehicle_id>
```

#### 4. Get Events by Geofence
```
GET /geofence/events/geofence/<geofence_id>
```

#### 5. Get Events by IMEI
```
GET /geofence/events/imei/<imei>
```

## How It Works

### 1. Geofence Assignment
- Admin creates a geofence with polygon boundary
- Assigns vehicles to the geofence
- Assigns users who should receive notifications

### 2. Real-Time Monitoring

When a vehicle sends a location update:

```javascript
// GT06 Handler processes location
1. Parse GPS data from device
2. Save location to database
3. Call geofenceService.checkGeofenceForLocation(imei, lat, lng)
```

### 3. Geofence Processing

```javascript
// For each assigned geofence:
1. Parse polygon boundary coordinates
2. Check if point is inside polygon (ray casting algorithm)
3. Get last state from geofence_events table
4. Compare current vs last state:
   
   State Transitions:
   - Outside → Inside + Type="Entry" → Send "entered" notification
   - Inside → Outside + Type="Exit" → Send "exited" notification
   - No change → No notification (prevents duplicates)

5. Update state in database
6. Send notification to assigned users
```

### 4. Notification Delivery

```javascript
// Notification Messages:
Entry: "{vehicle_no} entered {geofence_title} boundary"
Exit: "{vehicle_no} exited from {geofence_title} boundary"

// Recipients:
- All users in geofence_users table
- Must have valid FCM token
- Must be active users
```

## Geofence Types

### Entry Type
- Sends notification when vehicle **enters** the boundary
- No notification on exit

### Exit Type
- Sends notification when vehicle **exits** the boundary
- No notification on entry

### Implementation Note
The current implementation supports both types. Geofence type is checked before sending notifications.

## Boundary Format

Boundaries are stored as JSON arrays of coordinate strings:

```json
[
  "28.026029054328312,82.10021015256643",
  "27.987997732270383,82.09324814379215",
  "27.970783480976795,82.14885536581278",
  "28.006054656477307,82.15564303100109",
  "28.02310996411171,82.14754980057478"
]
```

Or nested format:
```json
[[
  "lat,lng",
  "lat,lng",
  "lat,lng"
]]
```

## Point-in-Polygon Algorithm

Uses the **Ray Casting Algorithm**:

```javascript
isPointInPolygon(lat, lng, boundary) {
  // Convert coordinates
  // Cast ray from point to infinity
  // Count polygon edge intersections
  // Odd count = inside, Even count = outside
  return inside;
}
```

## State Management

### State Persistence
- Stored in `geofence_events` table
- Survives server restarts
- Unique constraint on (vehicle_id, geofence_id)

### State Updates
- **First entry:** Insert new record
- **Subsequent updates:** Update existing record
- Tracks: is_inside, last_event_type, last_event_at

## Notification Flow

```
Vehicle Location Update
    ↓
Geofence Service Check
    ↓
State Change Detected?
    ↓
Query Users from geofence_users
    ↓
Get FCM Tokens
    ↓
Firebase Send Notification
    ↓
Users Receive Push Notification
```

## Testing

### 1. Create a Geofence

```bash
POST /api/geofence
{
  "title": "Test Area",
  "type": "Entry",
  "boundary": [
    "28.026029,82.100210",
    "27.987998,82.093248",
    "27.970783,82.148855",
    "28.006055,82.155643"
  ],
  "vehicleIds": [123],
  "userIds": [456]
}
```

### 2. Monitor Vehicle

- Vehicle with IMEI sends location updates
- Check server logs for geofence processing
- Verify notifications received on mobile app

### 3. View Events

```bash
GET /api/geofence/events/imei/352312094630210
```

## Troubleshooting

### No Notifications Received

1. **Check geofence assignment:**
   ```sql
   SELECT * FROM geofence_vehicles WHERE vehicle_id = ?;
   ```

2. **Check user assignment:**
   ```sql
   SELECT * FROM geofence_users WHERE geofence_id = ?;
   ```

3. **Check FCM tokens:**
   ```sql
   SELECT id, name, fcm_token FROM users WHERE id IN (...);
   ```

4. **Check server logs:**
   ```
   Look for: "✅ Geofence notification sent"
   ```

### Duplicate Notifications

- Check `geofence_events` table for state
- Verify unique constraint on (vehicle_id, geofence_id)
- Check state change logic in logs

### Vehicle Not Detected

1. **Verify polygon boundary:**
   - Minimum 3 points required
   - Coordinates in "lat,lng" format
   - No self-intersecting polygons

2. **Test point-in-polygon:**
   ```javascript
   // Add debug logging
   console.log(`Point: ${lat},${lng}`);
   console.log(`Inside: ${isInside}`);
   ```

## Performance Considerations

### Optimization
- Processes only assigned geofences per vehicle
- Uses database indexes on (vehicle_id, geofence_id)
- Caches last state to minimize queries

### Scalability
- Handles multiple geofences per vehicle
- Supports thousands of vehicles
- Asynchronous notification delivery

## Files Modified/Created

### Python Django (Luna-Iot-Py)
- ✅ `shared/models/geofence.py` - Added GeofenceEvent model
- ✅ `shared/serializers/geofence_serializers.py` - Added event serializers
- ✅ `shared/views/geofence_views.py` - Added event API views
- ✅ `shared/urls/geofence_urls.py` - Added event endpoints
- ✅ `shared/admin.py` - Registered GeofenceEvent in admin

### Node.js (Luna-Iot-Node)
- ✅ `src/database/mysql.js` - Added geofence query methods
- ✅ `src/utils/geofence_service.js` - **NEW** Core geofence logic
- ✅ `src/tcp/handlers/gt06_handler.js` - Integrated geofence check
- ✅ `geofence_events_table.sql` - Database migration

## Future Enhancements

1. **Dwell Time Alerts**
   - Notify if vehicle stays inside/outside for X minutes

2. **Speed Zones**
   - Different speed limits per geofence

3. **Time-Based Rules**
   - Active only during certain hours/days

4. **Batch Notifications**
   - Group multiple events in single notification

5. **Analytics Dashboard**
   - Entry/exit frequency reports
   - Time spent in geofences
   - Heat maps

## Support

For issues or questions:
- Check server logs in `Luna-Iot-Node/`
- Review Django admin at `/admin/shared/geofenceevent/`
- Test API endpoints using Postman/curl

## Version

- **Version:** 1.0.0
- **Date:** October 16, 2025
- **Author:** Luna IOT Team

