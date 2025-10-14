const Gt06 = require('gt06x22')
const mysqlService = require('../../database/mysql');
const socketService = require('../../socket/socket_service');
const GT06NotificationService = require('../../utils/gt06_notification_service');
const datetimeService = require('../../utils/datetime_service');

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

            // Show save condition for specific IMEI
            if (data.imei.toString() === '352312094630210') {
                if (shouldSave) {
                    console.log(`💾 SAVING - IMEI: ${data.imei}, Ignition: ${statusData.ignition}, Reason: Data changed`);
                } else {
                    console.log(`⏭️ SKIPPING - IMEI: ${data.imei}, Ignition: ${statusData.ignition}, Reason: Same data`);
                }
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
                console.log(`📅 [SAME STATUS] IMEI: ${data.imei} | created_at from DB: ${createdAt} | current time: ${nepalTime}`);
                // Still send socket message for real-time updates with original created_at
                socketService.statusUpdateMessage(statusData.imei, statusData.battery, statusData.signal, statusData.ignition, statusData.charging, statusData.relay, createdAt);
            }
        } else if (data.event.string === 'location') {
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

            // Show save condition for specific IMEI
            if (data.imei.toString() === '352312094630210') {
                if (shouldSaveLocation) {
                    console.log(`💾 SAVING LOCATION - IMEI: ${data.imei}, Lat: ${locationData.latitude}, Lon: ${locationData.longitude}, Speed: ${locationData.speed}, Reason: Data changed`);
                } else {
                    console.log(`⏭️ SKIPPING LOCATION - IMEI: ${data.imei}, Lat: ${locationData.latitude}, Lon: ${locationData.longitude}, Speed: ${locationData.speed}, Reason: Same data`);
                }
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
                console.log(`📅 [SAME LOCATION] IMEI: ${data.imei} | created_at from DB: ${createdAt} | current time: ${nepalTime}`);
                // Still send socket message for real-time updates with original created_at
                socketService.locationUpdateMessage(locationData.imei, locationData.latitude, locationData.longitude, locationData.speed, locationData.course, locationData.satellite, locationData.realTimeGps, createdAt);
            }
        } else if (data.event.string === 'login') {
            socketService.deviceMonitoringMessage('login', data.imei, null, null);
        } else if (data.event.string === 'alarm') {
        }
        else {
            console.log('SORRY WE DIDNT HANDLE THAT');
            console.log(data);
        }
    }

    getBattery(data) {
        data = data.toLowerCase();
        switch (data) {
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
            default:
                return 0;
        }
    }

    getSignal(data) {
        data = data.toLowerCase();
        switch (data) {
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
            default:
                return 0;
        }
    }

}

module.exports = {
    GT06Handler
}