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
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'luna_iot',
            port: process.env.DB_PORT || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true
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
            data.updatedAt || new Date()
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
            data.updatedAt || new Date()
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

    async getDeviceByImei(imei) {
        const sql = `
            SELECT id, imei, phone, sim, protocol, iccid, model
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
        const sql = `
            UPDATE statuses 
            SET updated_at = NOW() 
            WHERE imei = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        return this.query(sql, [imei]);
    }

    async updateLocationTimestamp(imei) {
        const sql = `
            UPDATE locations 
            SET updated_at = NOW() 
            WHERE imei = ? 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        return this.query(sql, [imei]);
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('MySQL connection pool closed');
        }
    }
}

module.exports = new MySQLService();
