const Gt06 = require('gt06x22')
const mysqlService = require('../../database/mysql');
const socketService = require('../../socket/socket_service');
const GT06NotificationService = require('../../utils/gt06_notification_service');
const geofenceService = require('../../utils/geofence_service');
const datetimeService = require('../../utils/datetime_service');
const SchoolBusNotificationService = require('../../utils/school_bus_notification_service');

class GT06Handler {

    constructor(data, socket) {
        var gt06 = new Gt06();

        try {
            gt06.parse(data);
        } catch (e) {
            // console.log('Error while parsing gt06 data: ', e);
            return;
        }

        if (gt06.expectsResponse) {
            socket.write(gt06.responseMsg);
        }

        gt06.msgBuffer.forEach(msg => {
            if (msg.event && msg.event.string === 'login' && msg.imei) {
                socket.deviceImei = msg.imei;
            } else {
                msg.imei = socket.deviceImei || 'Unknown';
            }

            this.handleData(msg, socket);

        });

        gt06.clearMsgBuffer();
    }

    async handleData(data, socket) {
        const device = await mysqlService.getDeviceByImei(data.imei);

        if (device === null) {
            socketService.deviceMonitoringMessage('imei_not_registered', data.imei, null, null);
            return;
        }

        // Store device type for routing decisions
        const deviceType = device.type || 'gps'; // Default to 'gps' if type not specified

        if (data.event.string === 'status') {
            const battery = this.getBattery(data.voltageLevel);
            const signal = this.getSignal(data.gsmSigStrength);
            const nepalTime = datetimeService.getNepalDateTime(new Date());
            const statusData = {
                deviceId: device.imei,
                imei: data.imei.toString(),
                battery: battery,
                signal: signal,
                ignition: data.terminalInfo.ignition,
                charging: data.terminalInfo.charging,
                relay: data.terminalInfo.relayState,
                createdAt: nepalTime
            };

            // Route based on device type
            if (deviceType === 'sos') {
                const startTime = Date.now();
                
                // Fetch latest status for comparison
                const dbFetchStart = Date.now();
                const latestStatus = await mysqlService.getLatestSosStatus(data.imei);
                
                // Normalize incoming boolean to number: true -> 1, false -> 0
                const currentIgnition = statusData.ignition === true ? 1 : 0;
                const previousIgnition = latestStatus ? Number(latestStatus.ignition) : null;
                
                // Check if ignition changed (force save if ignition changed)
                const ignitionChanged = previousIgnition !== null && previousIgnition !== currentIgnition;
                
                let shouldInsert = true;
                if (latestStatus) {
                    // Check if all status fields are the same
                    shouldInsert = !(
                        latestStatus.battery === statusData.battery &&
                        latestStatus.signal === statusData.signal &&
                        Number(latestStatus.ignition) === Number(statusData.ignition) &&
                        Number(latestStatus.charging) === Number(statusData.charging) &&
                        Number(latestStatus.relay) === Number(statusData.relay)
                    );
                }
                
                // Force insert if ignition changed
                if (ignitionChanged) {
                    shouldInsert = true;
                }
                
                // SAVE TO DATABASE FIRST (immediate, don't wait for alert_history)
                const dbSaveStart = Date.now();
                if (shouldInsert) {
                    // Status changed - insert new row
                    await mysqlService.insertSosStatus(statusData);
                } else {
                    // Status unchanged - update existing row's updated_at
                    await mysqlService.updateSosStatusTimestamp(latestStatus.id, nepalTime);
                }
                socketService.deviceMonitoringMessage('status', data.imei, null, null);

                // NOW check for alert_history creation (non-blocking, fire-and-forget)
                // Check for transition: OFF (0) -> ON (1)
                if (previousIgnition === 0 && currentIgnition === 1) {
                    
                    // Fire-and-forget: Don't await, process in background
                    (async () => {
                        try {
                            const alertSwitchStart = Date.now();
                            const alertSwitch = await mysqlService.getAlertSwitchByImei(data.imei);
                            console.log(`[ALERT HISTORY] ⏱️ Alert switch lookup took ${Date.now() - alertSwitchStart}ms`);
                            
                            if (!alertSwitch) {
                                console.log(`[ALERT HISTORY] ❌ Alert switch not found for IMEI: ${data.imei}`);
                            } else if (!alertSwitch.instituteId) {
                                console.log(`[ALERT HISTORY] ❌ Alert switch found but no instituteId for IMEI: ${data.imei}`, {
                                    alertSwitchId: alertSwitch.id,
                                    name: alertSwitch.name
                                });
                            } else {
                                console.log(`[ALERT HISTORY] ✅ Alert switch found with instituteId for IMEI: ${data.imei}`, {
                                    alertSwitchId: alertSwitch.id,
                                    name: alertSwitch.name,
                                    instituteId: alertSwitch.instituteId,
                                    latitude: alertSwitch.latitude,
                                    longitude: alertSwitch.longitude
                                });
                                
                                const pythonAlertService = require('../../utils/python_alert_service');
                                const payload = {
                                    source: 'switch',
                                    name: alertSwitch.name || 'Unknown',
                                    primary_phone: alertSwitch.primaryPhone || '',
                                    secondary_phone: alertSwitch.secondaryPhone || '',
                                    alert_type: 1,
                                    latitude: alertSwitch.latitude,
                                    longitude: alertSwitch.longitude,
                                    datetime: new Date().toISOString(),
                                    image: null,
                                    remarks: `Auto-created from SOS ignition ON (IMEI: ${data.imei})`,
                                    status: 'pending',
                                    institute: alertSwitch.instituteId
                                };
                                
                                console.log(`[ALERT HISTORY] 📤 Sending payload to Python API (non-blocking):`, JSON.stringify(payload, null, 2));
                                
                                const apiStart = Date.now();
                                const result = await pythonAlertService.createAlertHistory(payload);
                                const apiTime = Date.now() - apiStart;
                                
                                if (result.success) {
                                    console.log(`[ALERT HISTORY] ✅ Successfully created alert_history for IMEI: ${data.imei} (API took ${apiTime}ms)`, {
                                        status: result.status,
                                        data: result.data
                                    });
                                } else {
                                    console.error(`[ALERT HISTORY] ❌ Failed to create alert_history for IMEI: ${data.imei} (API took ${apiTime}ms):`, result);
                                }
                            }
                        } catch (err) {
                            console.error(`[ALERT HISTORY] ❌ Error creating alert history for SOS ignition ON (IMEI: ${data.imei}):`, err.message);
                            console.error(err.stack);
                        }
                    })().catch(err => {
                        console.error(`[ALERT HISTORY] ❌ Unhandled error in alert_history background task:`, err);
                    });
                } else {
                }
            } else if (deviceType === 'buzzer') {
                // Fetch latest status for comparison
                const latestStatus = await mysqlService.getLatestBuzzerStatus(data.imei);
                
                let shouldInsert = true;
                if (latestStatus) {
                    // Check if all status fields are the same
                    shouldInsert = !(
                        latestStatus.battery === statusData.battery &&
                        latestStatus.signal === statusData.signal &&
                        Number(latestStatus.ignition) === Number(statusData.ignition) &&
                        Number(latestStatus.charging) === Number(statusData.charging) &&
                        Number(latestStatus.relay) === Number(statusData.relay)
                    );
                }
                
                if (shouldInsert) {
                    // Status changed - insert new row
                    await mysqlService.insertBuzzerStatus(statusData);
                } else {
                    // Status unchanged - update existing row's updated_at
                    await mysqlService.updateBuzzerStatusTimestamp(latestStatus.id, nepalTime);
                }
                socketService.deviceMonitoringMessage('status', data.imei, null, null);
            } else if (deviceType === 'gps') {
                // Original GPS status handling logic
                // Filter: Check if status data has changed from latest
                const latestStatus = await mysqlService.getLatestStatus(data.imei);

                let shouldSave = true;
                let ignitionChanged = false;
                
                if (latestStatus) {
                    // Check if all status fields are the same (convert boolean to number for comparison)
                    shouldSave = !(
                        latestStatus.battery === statusData.battery &&
                        latestStatus.signal === statusData.signal &&
                        Number(latestStatus.ignition) === Number(statusData.ignition) &&
                        Number(latestStatus.charging) === Number(statusData.charging) &&
                        Number(latestStatus.relay) === Number(statusData.relay)
                    );
                    
                    // Check specifically if ignition changed (convert boolean to number for comparison)
                    ignitionChanged = Number(latestStatus.ignition) !== Number(statusData.ignition);
                } else {
                    // If no previous status, consider ignition as changed
                    ignitionChanged = true;
                }

                // Check ignition change and send notification BEFORE saving to database
                if (ignitionChanged) {
                    const oldIgnitionStatus = latestStatus ? latestStatus.ignition : null;
                    await GT06NotificationService.checkIgnitionChangeAndNotify(data.imei, statusData.ignition, oldIgnitionStatus);
                }

                if (shouldSave) {
                    // Save to database and send socket message
                    await mysqlService.insertStatus(statusData);
                    // For new data, created_at = nepalTime (just inserted)
                    socketService.statusUpdateMessage(statusData.imei, statusData.battery, statusData.signal, statusData.ignition, statusData.charging, statusData.relay, nepalTime);
                    socketService.deviceMonitoringMessage('status', data.imei, null, null);
                } else {
                    // Same data - just update the timestamp
                    await mysqlService.updateStatusTimestamp(data.imei);
                    // Get the original created_at from latest status
                    const latestAfterUpdate = await mysqlService.getLatestStatus(data.imei);
                    const createdAt = latestAfterUpdate?.created_at || nepalTime;
                    // Still send socket message for real-time updates with original created_at
                    socketService.statusUpdateMessage(statusData.imei, statusData.battery, statusData.signal, statusData.ignition, statusData.charging, statusData.relay, createdAt);
                }
            }
        } else if (data.event.string === 'location') {
            // Skip location events for buzzer and sos device types
            if (deviceType === 'buzzer' || deviceType === 'sos') {
                return; // Skip entirely - no DB save, no socket emit
            }

            // Only process location events for GPS devices
            if (deviceType === 'gps') {
                const nepalTime = datetimeService.getNepalDateTime(data.fixTime);
                const locationData = {
                    deviceId: device.imei,
                    imei: data.imei.toString(),
                    latitude: data.lat,
                    longitude: data.lon,
                    speed: data.speed,
                    satellite: data.satCnt,
                    course: data.course,
                    realTimeGps: data.realTimeGps,
                    createdAt: nepalTime
                };

                // Filter: Check if location data has changed from latest
                const latestLocation = await mysqlService.getLatestLocation(data.imei);

                let shouldSaveLocation = true;
                
                if (latestLocation) {
                    // Check if all location fields are the same (convert boolean to number for comparison)
                    shouldSaveLocation = !(
                        Number(latestLocation.latitude) === Number(locationData.latitude) &&
                        Number(latestLocation.longitude) === Number(locationData.longitude) &&
                        Number(latestLocation.speed) === Number(locationData.speed) &&
                        Number(latestLocation.course) === Number(locationData.course) &&
                        Number(latestLocation.realTimeGps) === Number(locationData.realTimeGps) &&
                        Number(latestLocation.satellite) === Number(locationData.satellite) &&
                        latestLocation.imei === locationData.imei
                    );
                }

                // First Phase: Check speed limit and send overspeeding notification
                GT06NotificationService.checkSpeedLimitAndNotify(data.imei, locationData.speed);

                // Second Phase: Check if vehicle is moving after ignition off
                GT06NotificationService.checkMovingAfterIgnitionOffAndNotify(data.imei);

                if (shouldSaveLocation) {
                    // Save to database and send socket message
                    await mysqlService.insertLocation(locationData);
                    // For new data, created_at = nepalTime (just inserted)
                    socketService.locationUpdateMessage(locationData.imei, locationData.latitude, locationData.longitude, locationData.speed, locationData.course, locationData.satellite, locationData.realTimeGps, nepalTime);
                    socketService.deviceMonitoringMessage('location', data.imei, data.lat, data.lon);
                } else {
                    // Same data - just update the timestamp
                    await mysqlService.updateLocationTimestamp(data.imei);
                    // Get the original created_at from latest location
                    const latestAfterUpdate = await mysqlService.getLatestLocation(data.imei);
                    const createdAt = latestAfterUpdate?.created_at || nepalTime;
                    // Still send socket message for real-time updates with original created_at
                    socketService.locationUpdateMessage(locationData.imei, locationData.latitude, locationData.longitude, locationData.speed, locationData.course, locationData.satellite, locationData.realTimeGps, createdAt);
                }

                // Check geofences for this location
                geofenceService.checkGeofenceForLocation(data.imei, locationData.latitude, locationData.longitude);

                // Check school bus proximity to parents and send notifications
                SchoolBusNotificationService.checkSchoolBusProximityAndNotify(data.imei, locationData.latitude, locationData.longitude);
            }
        } else if (data.event.string === 'login') {
            socketService.deviceMonitoringMessage('login', data.imei, null, null);
        } else if (data.event.string === 'alarm') {
            // Handle alarm events - extract alarm type and save to alarm_data table
            const nepalTime = datetimeService.getNepalDateTime(data.fixTime);
            const battery = this.getBattery(data.voltageLevel);
            const signal = this.getSignal(data.gsmSigStrength);
            const alarmType = this.getAlarmType(data.alarmLang);
            
            const alarmData = {
                deviceId: device.imei,
                imei: data.imei.toString(),
                latitude: data.lat,
                longitude: data.lon,
                speed: data.speed,
                realTimeGps: data.realTimeGps,
                course: data.course,
                satellite: data.satCnt,
                battery: battery,
                signal: signal,
                alarm: alarmType,
                createdAt: nepalTime
            };

            // Save alarm data to database
            await mysqlService.insertAlarmData(alarmData);
            
            // Send socket notification for alarm events
            socketService.deviceMonitoringMessage('alarm', data.imei, data.lat, data.lon);
            
            console.log(`🚨 ALARM - IMEI: ${data.imei}, Type: ${alarmType}, Lat: ${data.lat}, Lon: ${data.lon}, AlarmLang: ${data.alarmLang}`);
        }
        else {
            console.log('SORRY WE DIDNT HANDLE THAT');
            console.log(data);
        }
    }

    getBattery(data) {
        if (data === null || data === undefined) {
            return 0;
        }
        if (typeof data === 'number') {
            // Clamp expected numeric range 0-6
            const level = Math.max(0, Math.min(6, Math.floor(data)));
            return level;
        }
        const str = String(data).toLowerCase();
        switch (str) {
            case 'no power':
                return 0;
            case 'extremely low battery':
                return 1;
            case 'very low battery':
                return 2;
            case 'low battery':
                return 3;
            case 'medium':
                return 4;
            case 'high':
                return 5;
            case 'very high':
                return 6;
            default: {
                const parsed = parseInt(str, 10);
                return Number.isFinite(parsed) ? Math.max(0, Math.min(6, parsed)) : 0;
            }
        }
    }

    getSignal(data) {
        if (data === null || data === undefined) {
            return 0;
        }
        if (typeof data === 'number') {
            // Clamp expected numeric range 0-4
            const level = Math.max(0, Math.min(4, Math.floor(data)));
            return level;
        }
        const str = String(data).toLowerCase();
        switch (str) {
            case 'no signal':
                return 0;
            case 'extremely weak signal':
                return 1;
            case 'very weak signal':
                return 2;
            case 'good signal':
                return 3;
            case 'strong signal':
                return 4;
            default: {
                const parsed = parseInt(str, 10);
                return Number.isFinite(parsed) ? Math.max(0, Math.min(4, parsed)) : 0;
            }
        }
    }

    getAlarmType(alarmLang) {
        const hexStr = alarmLang.toString(16);
        const firstDigit = parseInt(hexStr[0]);
        const alarmTypes = ['normal', 'sos', 'power_cut', 'shock', 'fence_in', 'fence_out'];
        return alarmTypes[firstDigit] || 'normal';
    }

}

module.exports = {
    GT06Handler
}