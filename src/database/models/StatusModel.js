const prisma = require('../prisma')

class StatusModel {

    // Create new status
    async createData(data) {
        try {
            const status = await prisma.getClient().status.create({
                data: {
                    imei: data.imei.toString(),
                    battery: data.battery,
                    signal: data.signal,
                    ignition: data.ignition,
                    charging: data.charging,
                    relay: data.relay,
                    createdAt: data.createdAt
                }
            });
            // If ignition is off, create a new location record with speed = 0
            if (data.ignition === false) {
                await this.createIgnitionOffLocation(data.imei.toString(), data.createdAt);
            }
            return status;
        } catch (error) {
            console.error('STATUS CREATION ERROR', error);
            throw error;
        }
    }

    // Create location record when ignition is off
    async createIgnitionOffLocation(imei, createdAt) {
        try {
            // Get the latest location data for this IMEI
            const latestLocation = await prisma.getClient().location.findFirst({
                where: { imei },
                orderBy: { createdAt: 'desc' }
            });

            if (latestLocation) {
                // Create new location record with same data but speed = 0
                const newLocation = await prisma.getClient().location.create({
                    data: {
                        imei: latestLocation.imei,
                        latitude: latestLocation.latitude,
                        longitude: latestLocation.longitude,
                        speed: 0, // Set speed to 0 for ignition off
                        course: latestLocation.course,
                        realTimeGps: latestLocation.realTimeGps,
                        satellite: latestLocation.satellite,
                        createdAt: createdAt
                    }
                });

                return newLocation;
            } else {
                console.log(`No previous location data found for IMEI ${imei}, skipping ignition-off location creation`);
                return null;
            }
        } catch (error) {
            console.error('ERROR CREATING IGNITION-OFF LOCATION:', error);
            // Don't throw error - location creation failure shouldn't break status save
            return null;
        }
    }

    // Get latest status data
    async getLatest(imei) {
        imei = imei.toString();
        try {
            const status = await prisma.getClient().status.findFirst({
                where: { imei },
                orderBy: { createdAt: 'desc' }
            });
            return status;
        } catch (error) {
            console.error('ERROR FETCHING LATEST STATUS: ', error);
            throw error;
        }
    }

    // Get status history
    async deleteOldData(daysOld = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await prisma.getClient().status.deleteMany({
                where: {
                    createdAt: { lt: cutoffDate }
                }
            });
            return result.count;
        }
        catch (error) {
            console.error('ERROR ON DELETEING OLD STATUS: ', error);
            throw error;
        }
    }

    // Get location by date range
    async getDataByDateRange(imei, startDate, endDate) {
        imei = imei.toString();
        try {
            return await prisma.getClient().status.findMany({
                where: {
                    imei,
                    createdAt: {
                        gte: startDate,
                        lte: endDate
                    },
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING STATUS BY DATE RANGE: ', error);
            throw error;
        }
    }

    // Get status by imei
    async getDataByImei(imei) {
        imei = imei.toString();
        try {
            const status = await prisma.getClient().status.findMany({ where: { imei }, orderBy: { createdAt: 'asc' } });
            return status;
        } catch (error) {
            console.error('STATUS FETCH ERROR', error);
            throw error;
        }
    }

}

module.exports = StatusModel