const Gt06 = require('gt06x22')
const DeviceModel = require('../../database/models/DeviceModel');
const StatusModel = require('../../database/models/StatusModel');
const LocationModel = require('../../database/models/LocationModel');
const socketService = require('../../socket/socket_service');
const GT06NotificationService = require('../../utils/gt06_notification_service');
const datetimeService = require('../../utils/datetime_service');

class GT06Handler {

    constructor(data, socket) {
        var gt06 = new Gt06();

        try {
            gt06.parse(data);
        } catch (e) {
            console.log('Error while parsing gt06 data: ', e);
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
        // console.log("DATA: ",data);

        var device = new DeviceModel();
        device = await device.getDataByImei(data.imei);

        if (device === null) {
            socketService.deviceMonitoringMessage('imei_not_registered', data.imei, null, null);
            return;
        }

        if (data.event.string === 'status') {
            const battery = this.getBattery(data.voltageLevel);
            const signal = this.getSignal(data.gsmSigStrength);
            const nepalTime = datetimeService.getNepalDateTime(new Date());
            const statusData = {
                imei: data.imei.toString(),
                battery: battery,
                signal: signal,
                ignition: data.terminalInfo.ignition,
                charging: data.terminalInfo.charging,
                relay: data.terminalInfo.relayState,
                createdAt: nepalTime
            };

            // Check ignition change and send notification BEFORE saving
            await GT06NotificationService.checkIgnitionChangeAndNotify(data.imei, statusData.ignition);


            // Filter: Check if status data has changed from latest
            const statusModel = new StatusModel();
            const latestStatus = await statusModel.getLatest(data.imei);

            let shouldSave = true;
            if (latestStatus) {
                // Check if all status fields are the same
                shouldSave = !(
                    latestStatus.battery === statusData.battery &&
                    latestStatus.signal === statusData.signal &&
                    latestStatus.ignition === statusData.ignition &&
                    latestStatus.charging === statusData.charging &&
                    latestStatus.relay === statusData.relay
                );
            }

            if (shouldSave) {
                // Save to database and send socket message
                await statusModel.createData(statusData);
                socketService.statusUpdateMessage(statusData.imei, statusData.battery, statusData.signal, statusData.ignition, statusData.charging, statusData.relay, nepalTime);
                socketService.deviceMonitoringMessage('status', data.imei, null, null);
            }
        } else if (data.event.string === 'location') {
            const nepalTime = datetimeService.getNepalDateTime(data.fixTime);
            const locationData = {
                imei: data.imei.toString(),
                latitude: data.lat,
                longitude: data.lon,
                speed: data.speed,
                satellite: data.satCnt,
                course: data.course,
                realTimeGps: data.realTimeGps,
                createdAt: nepalTime
            };

            // First Phase: Check speed limit and send overspeeding notification
            GT06NotificationService.checkSpeedLimitAndNotify(data.imei, locationData.speed);

            // Second Phase: Check if vehicle is moving after ignition off
            GT06NotificationService.checkMovingAfterIgnitionOffAndNotify(data.imei);

            // Filter: Check speed conditions
            // let shouldSave = false;
            // if (locationData.speed > 0 && locationData.speed >= 3) {
            //     shouldSave = true;
            // }

            // if (shouldSave) {
            // Save to database and send socket message
            const locationModel = new LocationModel();
            await locationModel.createData(locationData);
            socketService.locationUpdateMessage(locationData.imei, locationData.latitude, locationData.longitude, locationData.speed, locationData.course, locationData.satellite, locationData.realTimeGps, nepalTime);
            socketService.deviceMonitoringMessage('location', data.imei, data.lat, data.lon);
            // }
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