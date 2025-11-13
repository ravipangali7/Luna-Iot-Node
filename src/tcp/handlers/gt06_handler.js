const Gt06 = require('gt06x22')
const mysqlService = require('../../database/mysql');
const socketService = require('../../socket/socket_service');
const tcpService = require('../../tcp/tcp_service');
const GT06NotificationService = require('../../utils/gt06_notification_service');
const geofenceService = require('../../utils/geofence_service');
const datetimeService = require('../../utils/datetime_service');
const SchoolBusNotificationService = require('../../utils/school_bus_notification_service');

// Device status map to track relay state per IMEI
const deviceStatus = {};

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
                const imei = msg.imei.toString();
                socket.deviceImei = imei;
                
                // Immediately register IMEI in tcpService to ensure it's available right away
                // This matches the guide example's direct devices[imei] = client approach
                tcpService.registerDeviceImei(imei, socket);
                
                console.log(`GT06Handler: Device logged in with IMEI ${imei} - immediately registered in tcpService`);
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
            
            // Initialize device status if not exists
            if (data.imei && !deviceStatus[data.imei]) {
                deviceStatus[data.imei] = {
                    imei: data.imei,
                    relay: false,
                    relayState: false,
                    lastUpdate: Date.now()
                };
            }
            
            // Update device status from terminal info if available
            if (data.imei && deviceStatus[data.imei] && data.terminalInfo && data.terminalInfo.relayState !== undefined) {
                deviceStatus[data.imei].relay = data.terminalInfo.relayState;
                deviceStatus[data.imei].relayState = data.terminalInfo.relayState;
                deviceStatus[data.imei].lastUpdate = Date.now();
            }
            
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
            // Initialize device status when device logs in
            if (data.imei && !deviceStatus[data.imei]) {
                deviceStatus[data.imei] = {
                    imei: data.imei,
                    relay: false,
                    relayState: false,
                    lastUpdate: Date.now()
                };
            }
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

// Parse relay response message (Type 0x15)
function parseRelayResponseMessage(data, imei) {
    let responseText = "";
    
    try {
        // Skip header(2) + length(1) + type(1) + some control bytes, extract until CRC
        let dataStart = 8; // Skip initial control bytes after type
        let dataEnd = data.length - 4; // Before CRC(2) + footer(2)
        
        // Extract the ASCII text portion
        for (let i = dataStart; i < dataEnd; i++) {
            let byte = data[i];
            if (byte >= 0x20 && byte <= 0x7E) { // Printable ASCII range
                responseText += String.fromCharCode(byte);
            } else if (byte === 0x00) {
                // Skip null bytes
                continue;
            } else {
                // Stop at non-ASCII bytes (likely reached CRC)
                break;
            }
        }
        
        // Clean up the response text
        responseText = responseText.trim();
        
    } catch (error) {
        console.error('Error parsing relay response:', error);
        responseText = "Parse error";
    }
    
    return {
        imei: imei,
        event: { string: "relayresponse", number: 0x15 },
        str: responseText,
        responseText: responseText,
        parseTime: Date.now()
    };
}

// Parse relay status message (Header 7979)
function parseRelayStatusMessage(data, imei) {
    let str = "";
    let relayState = null;
    
    try {
        // Extract ASCII data from 7979 message
        // Start after header (2) + type (1) + length (1) + control bytes
        let dataStart = 6; // Skip 7979 + type + length + some control bytes
        let dataEnd = data.length - 4; // Before CRC (2 bytes) + footer 0D0A (2 bytes)
        
        // Look for ASCII data
        for (let i = dataStart; i < Math.min(dataEnd, data.length - 6); i++) {
            if (data[i] >= 0x20 && data[i] <= 0x7E) {
                dataStart = i;
                break;
            }
        }
        
        if (dataEnd > dataStart) {
            let ndata = data.slice(dataStart, dataEnd);
            str = ndata.toString('ascii');
            
            console.log('7979 status message ASCII:', str);
            
            // Parse DYD value (DYD=01 means ON, DYD=00 means OFF)
            const dydMatch = str.match(/DYD=(\d+)/);
            if (dydMatch) {
                relayState = dydMatch[1] === '01';
                console.log('Parsed relay state from DYD:', dydMatch[1], '-> Relay:', relayState ? 'ON' : 'OFF');
            }
        }
    } catch (error) {
        console.error('Error parsing relay status message:', error);
    }
    
    return {
        imei: imei,
        str: str,
        relayState: relayState,
        event: { string: "relaystatus", number: data[4] },
        parseTime: Date.now()
    };
}

// Process relay message and update device status
function processRelayMessage(msg, imei) {
    if (!msg) return;
    
    // Initialize device status if not exists
    if (imei && imei !== 'Unknown' && !deviceStatus[imei]) {
        deviceStatus[imei] = {
            imei: imei,
            relay: false,
            relayState: false,
            lastUpdate: Date.now()
        };
    }
    
    // Handle relay response (0x15)
    if (msg.event && msg.event.string === "relayresponse") {
        console.log('RELAY RESPONSE from', imei, ':', msg.str);
        
        // Check for error indicators in response
        const isError = msg.str && (
            msg.str.toLowerCase().includes('error') ||
            msg.str.toLowerCase().includes('fail') ||
            msg.str.toLowerCase().includes('invalid') ||
            msg.str.toLowerCase().includes('denied')
        );
        
        if (isError) {
            console.log('ERROR detected in relay response:', msg.str);
            return;
        }
        
        // Update relay state if response indicates success
        if (imei && imei !== 'Unknown' && deviceStatus[imei] && msg.str && !isError) {
            // Check if response indicates relay state change
            const success = msg.str.includes('Success') || 
                         msg.str.includes('DYD') || 
                         msg.str.includes('HFYD') ||
                         msg.str.toLowerCase().includes('on') ||
                         msg.str.toLowerCase().includes('off');
            
            if (success) {
                // Try to determine new state from response string
                const isOn = msg.str.toLowerCase().includes('on') || 
                            msg.str.includes('DYD') || 
                            msg.str.includes('HFYD');
                
                deviceStatus[imei].relay = isOn;
                deviceStatus[imei].relayState = isOn;
                deviceStatus[imei].lastUpdate = Date.now();
                console.log('Updated relay state for', imei, 'to:', isOn ? 'ON' : 'OFF');
            }
        }
    }
    
    // Handle relay status (7979)
    if (msg.event && msg.event.string === "relaystatus") {
        console.log('RELAY STATUS MESSAGE from', imei, ':', msg.str);
        console.log('Relay state from status:', msg.relayState !== null ? (msg.relayState ? 'ON' : 'OFF') : 'unknown');
        
        // Update relay state from status message
        if (imei && imei !== 'Unknown' && deviceStatus[imei] && msg.relayState !== null) {
            const now = Date.now();
            deviceStatus[imei].relay = msg.relayState;
            deviceStatus[imei].relayState = msg.relayState;
            deviceStatus[imei].lastUpdate = now;
            console.log('Updated relay state from 7979 status message for', imei, 'to:', msg.relayState ? 'ON' : 'OFF');
        }
    }
}

module.exports = {
    GT06Handler,
    parseRelayResponseMessage,
    parseRelayStatusMessage,
    processRelayMessage,
    deviceStatus
}