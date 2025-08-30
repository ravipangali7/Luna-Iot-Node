const DeviceModel = require('./models/DeviceModel');
const VehicleModel = require('./models/VehicleModel');
const LocationModel = require('./models/LocationModel');
const StatusModel = require('./models/StatusModel');
const prisma = require('./prisma');

class DatabaseUtils {

    constructor() {
        this.deviceModel = new DeviceModel();
        this.vehicleModel = new VehicleModel();
        this.locationModel = new LocationModel();
        this.statusModel = new StatusModel();
    }

    // Cleanup Old Data
    async cleanupOldData(locationDays = 90, statusDays = 90) {
        try {
            const locationCount = await this.locationModel.deleteOldData(locationDays);
            const statusCount = await this.statusModel.deleteOldData(statusDays);
            return {locationCount, statusCount};
        }
        catch (error) {
            console.log('ERROR CLEANUP OLD DATA: ', error);
            throw error;
        }
    }


    // Get Activity by imei of Device|Vehicle
    async getActivityByImei(imei, startDate, endDate) {
        try {
            const [locations, statuses] = await Promise.all([
                this.locationModel.getDataByDateRange(imei, startDate, endDate),
                this.statusModel.getDataByDateRange(imei, startDate, endDate)
            ]);
            return {locations, statuses};
        }
        catch (error) {
            console.error('ERROR FETCHING ACTIVITY BY IMEI: ', error);
            throw error;
        }
    }

}

module.exports = DatabaseUtils