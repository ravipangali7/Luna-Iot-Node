const mysql = require('mysql2');
require('dotenv').config();

class MySQLService {
    constructor() {
        this.pool = null;
        this.initializePool();
    }

    initializePool() {
        this.pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'admin',
            password: process.env.DB_PASSWORD || 'Alex$stark453',
            database: process.env.DB_NAME || 'luna_iot',
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            // acquireTimeout: 60000,
            // timeout: 60000,
            // reconnect: true
        });

        console.log('MySQL connection pool initialized');
    }

    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.pool.execute(sql, params, (err, results, fields) => {
                if (err) {
                    console.error('MySQL Query Error:', err);
                    reject(err);
                } else {
                    resolve(results);
                }
            });
        });
    }

    async insertLocation(data) {
        const sql = `
            INSERT INTO locations (device_id, imei, latitude, longitude, speed, course, real_time_gps, satellite, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.deviceId,
            data.imei,
            data.latitude,
            data.longitude,
            data.speed,
            data.course,
            data.realTimeGps,
            data.satellite,
            data.createdAt,
            data.createdAt  // Use same Nepal time as created_at
        ];
        return this.query(sql, params);
    }

    async insertStatus(data) {
        const sql = `
            INSERT INTO statuses (device_id, imei, battery, \`signal\`, ignition, charging, relay, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.deviceId,
            data.imei,
            data.battery,
            data.signal,
            data.ignition,
            data.charging,
            data.relay,
            data.createdAt || new Date(),
            data.createdAt || new Date()  // Use same Nepal time as created_at
        ];
        return this.query(sql, params);
    }

    async getUsersWithVehicleAccess(imei) {
        const sql = `
            SELECT DISTINCT u.id, u.name, u.phone, u.fcm_token, uv.notification
            FROM users u
            JOIN user_vehicles uv ON u.id = uv.user_id
            JOIN vehicles v ON uv.vehicle_id = v.id
            WHERE v.imei = ? AND u.is_active = 1 AND uv.notification = 1
        `;
        return this.query(sql, [imei]);
    }

    async getVehicleByImei(imei) {
        const sql = `
            SELECT id, imei, name, vehicle_no, speed_limit
            FROM vehicles
            WHERE imei = ? AND is_active = 1
        `;
        const results = await this.query(sql, [imei]);
        return results[0] || null;
    }

    async getVehicleOdometer(imei) {
        const sql = `
            SELECT odometer 
            FROM vehicles 
            WHERE imei = ? AND is_active = 1
        `;
        const results = await this.query(sql, [imei]);
        return results[0]?.odometer || 0;
    }

    async updateVehicleOdometer(imei, newOdometer) {
        const sql = `
            UPDATE vehicles 
            SET odometer = ? 
            WHERE imei = ? AND is_active = 1
        `;
        return this.query(sql, [newOdometer, imei]);
    }

    async getDeviceByImei(imei) {
        const sql = `
            SELECT id, imei, phone, sim, protocol, iccid, model, type
            FROM devices
            WHERE imei = ?
        `;
        const results = await this.query(sql, [imei]);
        return results[0] || null;
    }

    async getLatestLocation(imei) {
        const sql = `
            SELECT latitude, longitude, speed, course, created_at, updated_at
            FROM locations
            WHERE imei = ?
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const results = await this.query(sql, [imei]);
        return results[0] || null;
    }

    async getLatestStatus(imei) {
        const sql = `
            SELECT battery, \`signal\`, ignition, charging, relay, created_at, updated_at
            FROM statuses
            WHERE imei = ?
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const results = await this.query(sql, [imei]);
        return results[0] || null;
    }

    async updateStatusTimestamp(imei) {
        const datetimeService = require('../utils/datetime_service');
        const nepalTime = datetimeService.nepalTimeDate();
        
        const sql = `
            UPDATE statuses 
            SET updated_at = ? 
            WHERE imei = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        return this.query(sql, [nepalTime, imei]);
    }

    async updateLocationTimestamp(imei) {
        const datetimeService = require('../utils/datetime_service');
        const nepalTime = datetimeService.nepalTimeDate();
        
        const sql = `
            UPDATE locations 
            SET updated_at = ? 
            WHERE imei = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        return this.query(sql, [nepalTime, imei]);
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('MySQL connection pool closed');
        }
    }

    // ==================== GEOFENCE METHODS ====================

    async getGeofencesForVehicle(imei) {
        const sql = `
            SELECT 
                g.id, 
                g.title, 
                g.type, 
                g.boundary,
                v.id as vehicle_id,
                v.vehicle_no,
                v.name as vehicle_name
            FROM geofences g
            INNER JOIN geofence_vehicles gv ON g.id = gv.geofence_id
            INNER JOIN vehicles v ON gv.vehicle_id = v.id
            WHERE v.imei = ? AND v.is_active = 1
        `;
        return this.query(sql, [imei]);
    }

    async getGeofenceUsers(geofenceId) {
        const sql = `
            SELECT DISTINCT u.id, u.name, u.phone, u.fcm_token
            FROM users u
            INNER JOIN geofence_users gu ON u.id = gu.user_id
            WHERE gu.geofence_id = ? AND u.is_active = 1 AND u.fcm_token IS NOT NULL AND u.fcm_token != ''
        `;
        return this.query(sql, [geofenceId]);
    }

    async getLastGeofenceEvent(vehicleId, geofenceId) {
        const sql = `
            SELECT id, vehicle_id, geofence_id, is_inside, last_event_type, last_event_at, created_at, updated_at
            FROM geofence_events
            WHERE vehicle_id = ? AND geofence_id = ?
            LIMIT 1
        `;
        const results = await this.query(sql, [vehicleId, geofenceId]);
        return results[0] || null;
    }

    async insertGeofenceEvent(data) {
        const sql = `
            INSERT INTO geofence_events (vehicle_id, geofence_id, is_inside, last_event_type, last_event_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.vehicleId,
            data.geofenceId,
            data.isInside ? 1 : 0,
            data.eventType,
            data.eventAt,
            data.eventAt,
            data.eventAt
        ];
        return this.query(sql, params);
    }

    async updateGeofenceEvent(vehicleId, geofenceId, data) {
        const sql = `
            UPDATE geofence_events 
            SET is_inside = ?, last_event_type = ?, last_event_at = ?, updated_at = ?
            WHERE vehicle_id = ? AND geofence_id = ?
        `;
        const params = [
            data.isInside ? 1 : 0,
            data.eventType,
            data.eventAt,
            data.eventAt,
            vehicleId,
            geofenceId
        ];
        return this.query(sql, params);
    }

    // ==================== ALERT SWITCH LOOKUP ====================

    async getAlertSwitchByImei(imei) {
        const sql = `
            SELECT 
                s.id,
                s.institute_id AS instituteId,
                s.latitude,
                s.longitude,
                s.primary_phone AS primaryPhone,
                s.secondary_phone AS secondaryPhone,
                s.title AS name
            FROM alert_switches s
            INNER JOIN devices d ON s.device_id = d.id
            WHERE d.imei = ?
            LIMIT 1
        `;
        const results = await this.query(sql, [imei]);
        return results[0] || null;
    }

    async getCommunitySirenSwitchByImei(imei) {
        const sql = `
            SELECT 
                s.id,
                s.institute_id AS instituteId,
                s.latitude,
                s.longitude,
                s.primary_phone AS primaryPhone,
                s.secondary_phone AS secondaryPhone,
                s.title AS name
            FROM community_siren_switches s
            INNER JOIN devices d ON s.device_id = d.id
            WHERE d.imei = ?
            LIMIT 1
        `;
        const results = await this.query(sql, [imei]);
        return results[0] || null;
    }

    // ==================== BUZZER STATUS METHODS ====================

    async insertBuzzerStatus(data) {
        const sql = `
            INSERT INTO buzzer_status (device_id, imei, battery, \`signal\`, ignition, charging, relay, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.deviceId,
            data.imei,
            data.battery,
            data.signal,
            data.ignition,
            data.charging,
            data.relay,
            data.createdAt || new Date(),
            data.createdAt || new Date()  // Use same Nepal time as created_at
        ];
        return this.query(sql, params);
    }

    // ==================== SOS STATUS METHODS ====================

    async insertSosStatus(data) {
        const sql = `
            INSERT INTO sos_switch_status (device_id, imei, battery, \`signal\`, ignition, charging, relay, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.deviceId,
            data.imei,
            data.battery,
            data.signal,
            data.ignition,
            data.charging,
            data.relay,
            data.createdAt || new Date(),
            data.createdAt || new Date()  // Use same Nepal time as created_at
        ];
        return this.query(sql, params);
    }

    async getLatestBuzzerStatus(imei) {
        const sql = `
            SELECT * FROM buzzer_status 
            WHERE imei = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        const results = await this.query(sql, [imei]);
        return results.length > 0 ? results[0] : null;
    }

    async getLatestSosStatus(imei) {
        const sql = `
            SELECT * FROM sos_switch_status 
            WHERE imei = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        const results = await this.query(sql, [imei]);
        return results.length > 0 ? results[0] : null;
    }

    async updateBuzzerStatusTimestamp(id, updatedAt) {
        const sql = `UPDATE buzzer_status SET updated_at = ? WHERE id = ?`;
        return this.query(sql, [updatedAt, id]);
    }

    async updateSosStatusTimestamp(id, updatedAt) {
        const sql = `UPDATE sos_switch_status SET updated_at = ? WHERE id = ?`;
        return this.query(sql, [updatedAt, id]);
    }

    // ==================== ALARM DATA METHODS ====================

    async insertAlarmData(data) {
        const sql = `
            INSERT INTO alarm_data (device_id, imei, latitude, longitude, speed, real_time_gps, course, satellite, battery, \`signal\`, alarm, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            data.deviceId,
            data.imei,
            data.latitude,
            data.longitude,
            data.speed,
            data.realTimeGps,
            data.course,
            data.satellite,
            data.battery,
            data.signal,
            data.alarm,
            data.createdAt,
            data.createdAt  // Use same Nepal time as created_at
        ];
        return this.query(sql, params);
    }

    // ==================== SCHOOL BUS PARENT METHODS ====================

    async getSchoolBusParentsByImei(imei) {
        const sql = `
            SELECT 
                u.id, 
                u.name, 
                u.fcm_token, 
                sp.latitude, 
                sp.longitude
            FROM vehicles v
            INNER JOIN school_buses sb ON sb.bus_id = v.id
            INNER JOIN school_parents_school_buses spsb ON spsb.schoolbus_id = sb.id
            INNER JOIN school_parents sp ON sp.id = spsb.schoolparent_id
            INNER JOIN users u ON u.id = sp.parent_id
            WHERE v.imei = ? 
                AND v.vehicle_type = 'SchoolBus'
                AND v.is_active = 1
                AND u.is_active = 1
                AND u.fcm_token IS NOT NULL 
                AND u.fcm_token != ''
                AND sp.latitude IS NOT NULL
                AND sp.longitude IS NOT NULL
        `;
        return this.query(sql, [imei]);
    }

    // ==================== PUBLIC VEHICLE SUBSCRIPTION METHODS ====================

    async getPublicVehicleSubscriptionsByImei(imei) {
        const sql = `
            SELECT 
                pvs.id,
                u.id as user_id,
                u.name, 
                u.fcm_token, 
                pvs.latitude, 
                pvs.longitude
            FROM vehicles v
            INNER JOIN public_vehicle_subscriptions pvs ON pvs.vehicle_id = v.id
            INNER JOIN users u ON u.id = pvs.user_id
            WHERE v.imei = ? 
                AND v.is_active = 1
                AND u.is_active = 1
                AND u.fcm_token IS NOT NULL 
                AND u.fcm_token != ''
                AND pvs.notification = 1
                AND pvs.latitude IS NOT NULL
                AND pvs.longitude IS NOT NULL
        `;
        return this.query(sql, [imei]);
    }

    // ==================== GARBAGE VEHICLE SUBSCRIPTION METHODS ====================

    async getGarbageVehicleSubscriptionsByImei(imei) {
        const sql = `
            SELECT 
                gvs.id,
                u.id as user_id,
                u.name, 
                u.fcm_token, 
                gvs.latitude, 
                gvs.longitude
            FROM vehicles v
            INNER JOIN garbage_vehicle_subscriptions gvs ON gvs.vehicle_id = v.id
            INNER JOIN users u ON u.id = gvs.user_id
            WHERE v.imei = ? 
                AND v.is_active = 1
                AND u.is_active = 1
                AND u.fcm_token IS NOT NULL 
                AND u.fcm_token != ''
                AND gvs.notification = 1
                AND gvs.latitude IS NOT NULL
                AND gvs.longitude IS NOT NULL
        `;
        return this.query(sql, [imei]);
    }
}

module.exports = new MySQLService();
