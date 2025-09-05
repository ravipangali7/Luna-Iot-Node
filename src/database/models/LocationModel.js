const prisma = require('../prisma')


class LocationModel {

    // Create new location
    async createData(data) {
        try {

            const location = await prisma.getClient().location.create({
                data: {
                    imei: data.imei.toString(),
                    latitude: data.latitude,
                    longitude: data.longitude,
                    speed: data.speed,
                    course: data.course,
                    realTimeGps: data.realTimeGps,
                    satellite: data.satellite || 0,
                    createdAt: data.createdAt
                }
            });

            // Then update odometer
            await this.updateVehicleOdometer(data.imei, data.latitude, data.longitude);

            return location;
        } catch (error) {
            console.error('LOCATION CREATION ERROR', error);
            throw error;
        }
    }

    // Get latest location data
    async getLatest(imei) {
        imei = imei.toString();
        try {
            const location = await prisma.getClient().location.findFirst({
                where: { imei },
                orderBy: { createdAt: 'desc' }
            });
            return location;
        } catch (error) {
            console.error('ERROR FETCHING LATEST LOCATION: ', error);
            throw error;
        }
    }

    // Get location history
    async deleteOldData(daysOld = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const result = await prisma.getClient().location.deleteMany({
                where: {
                    createdAt: { lt: cutoffDate }
                }
            });
            return result.count;
        }
        catch (error) {
            console.error('ERROR ON DELETEING OLD LOCATION: ', error);
            throw error;
        }
    }

    // Get location by date range
    async getDataByDateRange(imei, startDate, endDate) {
        imei = imei.toString();
        try {
            return await prisma.getClient().location.findMany({
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
            console.error('ERROR FETCHING LOCATION BY DATE RANGE: ', error);
            throw error;
        }
    }

    // Get location by imei
    async getDataByImei(imei) {
        imei = imei.toString();
        try {
            const location = await prisma.getClient().location.findMany({ where: { imei }, orderBy: { createdAt: 'asc' } });
            return location;
        } catch (error) {
            console.error('LOCATION FETCH ERROR', error);
            throw error;
        }
    }

    // Get combined history data (location + status with ignition off)
    // async getCombinedHistoryByDateRange(imei, startDate, endDate) {
    //     imei = imei.toString();
    //     try {
    //         // Get location data with strict date filtering
    //         const locations = await prisma.getClient().location.findMany({
    //             where: {
    //                 imei,
    //                 createdAt: {
    //                     gte: startDate,
    //                     lte: endDate
    //                 }
    //             },
    //             orderBy: {
    //                 createdAt: 'asc'
    //             }
    //         });


    //         // Get status data with strict date filtering
    //         const statuses = await prisma.getClient().status.findMany({
    //             where: {
    //                 imei,
    //                 ignition: false,
    //                 createdAt: {
    //                     gte: startDate,
    //                     lte: endDate
    //                 }
    //             },
    //             orderBy: {
    //                 createdAt: 'asc'
    //             }
    //         });

    //         console.log(`Found ${statuses.length} status records`);

    //         // CRITICAL: Double-check dates and log any out-of-range data
    //         const outOfRangeLocations = locations.filter(loc => {
    //             const locDate = new Date(loc.createdAt);
    //             return locDate < startDate || locDate > endDate;
    //         });

    //         const outOfRangeStatuses = statuses.filter(status => {
    //             const statusDate = new Date(status.createdAt);
    //             return statusDate < startDate || statusDate > endDate;
    //         });

    //         if (outOfRangeLocations.length > 0) {
    //             console.log(`WARNING: ${outOfRangeLocations.length} location records outside range:`);
    //             outOfRangeLocations.slice(0, 3).forEach(loc => {
    //                 console.log(`  - ${loc.createdAt} (${loc.imei})`);
    //             });
    //         }

    //         if (outOfRangeStatuses.length > 0) {
    //             console.log(`WARNING: ${outOfRangeStatuses.length} status records outside range:`);
    //             outOfRangeStatuses.slice(0, 3).forEach(status => {
    //                 console.log(`  - ${status.createdAt} (${status.imei})`);
    //             });
    //         }

    //         // Combine and sort by createdAt
    //         const combinedData = [
    //             ...locations.map(loc => ({
    //                 ...loc,
    //                 type: 'location',
    //                 dataType: 'location'
    //             })),
    //             ...statuses.map(status => ({
    //                 ...status,
    //                 type: 'status',
    //                 dataType: 'status'
    //             }))
    //         ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    //         return combinedData;
    //     } catch (error) {
    //         console.error('ERROR FETCHING COMBINED HISTORY: ', error);
    //         throw error;
    //     }
    // }
    async generateReportData(imei, startDate, endDate) {
        imei = imei.toString();
        try {
            // Use raw SQL for complex aggregations instead of loading all data
            const stats = await prisma.getClient().$queryRaw`
                SELECT 
                    COUNT(*) as total_records,
                    AVG(speed) as avg_speed,
                    MAX(speed) as max_speed,
                    MIN(speed) as min_speed,
                    SUM(CASE WHEN speed > 80 THEN 1 ELSE 0 END) as overspeed_count,
                    COUNT(CASE WHEN speed > 0 THEN 1 END) as moving_records,
                    COUNT(CASE WHEN speed = 0 THEN 1 END) as stopped_records
                FROM locations 
                WHERE imei = ${imei} 
                AND created_at BETWEEN ${startDate} AND ${endDate}
            `;

            // Get status statistics using SQL
            const statusStats = await prisma.getClient().$queryRaw`
                SELECT 
                    COUNT(*) as total_status_records,
                    AVG(battery) as avg_battery,
                    MIN(battery) as min_battery,
                    MAX(battery) as max_battery,
                    AVG(signal) as avg_signal,
                    COUNT(CASE WHEN ignition = 1 THEN 1 END) as ignition_on_count,
                    COUNT(CASE WHEN ignition = 0 THEN 1 END) as ignition_off_count,
                    COUNT(CASE WHEN charging = 1 THEN 1 END) as charging_count,
                    COUNT(CASE WHEN relay = 1 THEN 1 END) as relay_on_count
                FROM statuses 
                WHERE imei = ${imei} 
                AND created_at BETWEEN ${startDate} AND ${endDate}
            `;

            // Get daily aggregated data using SQL
            const dailyData = await prisma.getClient().$queryRaw`
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as location_count,
                    AVG(speed) as avg_speed,
                    MAX(speed) as max_speed,
                    MIN(speed) as min_speed,
                    COUNT(CASE WHEN speed > 80 THEN 1 END) as overspeed_count,
                    COUNT(CASE WHEN speed > 0 THEN 1 END) as moving_count,
                    COUNT(CASE WHEN speed = 0 THEN 1 END) as stopped_count
                FROM locations 
                WHERE imei = ${imei} 
                AND created_at BETWEEN ${startDate} AND ${endDate}
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            `;

            // Get hourly data for the first day to show detailed pattern
            const hourlyData = await prisma.getClient().$queryRaw`
                SELECT 
                    HOUR(created_at) as hour,
                    COUNT(*) as location_count,
                    AVG(speed) as avg_speed,
                    MAX(speed) as max_speed
                FROM locations 
                WHERE imei = ${imei} 
                AND DATE(created_at) = DATE(${startDate})
                GROUP BY HOUR(created_at)
                ORDER BY hour ASC
            `;

            // Calculate total distance using optimized SQL (if needed)
            const distanceData = await prisma.getClient().$queryRaw`
                SELECT 
                    latitude,
                    longitude,
                    created_at
                FROM locations 
                WHERE imei = ${imei} 
                AND created_at BETWEEN ${startDate} AND ${endDate}
                ORDER BY created_at ASC
            `;

            // Calculate distance in JavaScript (only for final result)
            let totalKm = 0;
            for (let i = 1; i < distanceData.length; i++) {
                const prev = distanceData[i - 1];
                const curr = distanceData[i];
                if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
                    const distance = this.calculateDistance(
                        parseFloat(prev.latitude), parseFloat(prev.longitude),
                        parseFloat(curr.latitude), parseFloat(curr.longitude)
                    );
                    totalKm += distance;
                }
            }

            return {
                stats: {
                    ...stats[0],
                    ...statusStats[0],
                    totalKm: Math.round(totalKm * 100) / 100
                },
                dailyData: dailyData.map(day => ({
                    date: day.date.toISOString().split('T')[0],
                    locationCount: parseInt(day.location_count),
                    avgSpeed: Math.round(parseFloat(day.avg_speed) * 10) / 10,
                    maxSpeed: parseInt(day.max_speed),
                    minSpeed: parseInt(day.min_speed),
                    overspeedCount: parseInt(day.overspeed_count),
                    movingCount: parseInt(day.moving_count),
                    stoppedCount: parseInt(day.stopped_count)
                })),
                hourlyData: hourlyData.map(hour => ({
                    hour: parseInt(hour.hour),
                    locationCount: parseInt(hour.location_count),
                    avgSpeed: Math.round(parseFloat(hour.avg_speed) * 10) / 10,
                    maxSpeed: parseInt(hour.max_speed)
                }))
            };
        } catch (error) {
            console.error('ERROR GENERATING REPORT DATA: ', error);
            throw error;
        }
    }

    async getCombinedHistoryByDateRange(imei, startDate, endDate) {
        imei = imei.toString();
        try {
            // Use SQL UNION to combine location and status data efficiently
            const combinedData = await prisma.getClient().$queryRaw`
            SELECT 
                'location' as type,
                id,
                imei,
                latitude,
                longitude,
                speed,
                course,
                real_time_gps as realTimeGps,
                satellite,
                created_at as createdAt,
                NULL as battery,
                NULL as \`signal\`,
                NULL as ignition,
                NULL as charging,
                NULL as relay
            FROM locations 
            WHERE imei = ${imei} 
            AND created_at BETWEEN ${startDate} AND ${endDate}
            
            UNION ALL
            
            SELECT 
                'status' as type,
                id,
                imei,
                NULL as latitude,
                NULL as longitude,
                NULL as speed,
                NULL as course,
                NULL as realTimeGps,
                NULL as satellite,
                created_at as createdAt,
                battery,
                \`signal\`,
                ignition,
                charging,
                relay
            FROM statuses 
            WHERE imei = ${imei} 
            AND ignition = 0
            AND created_at BETWEEN ${startDate} AND ${endDate}
            
            ORDER BY createdAt ASC
        `;

            return combinedData;
        } catch (error) {
            console.error('ERROR FETCHING COMBINED HISTORY: ', error);
            throw error;
        }
    }


    // ------ Report --------
    // Generate comprehensive report data
    // async generateReportData(imei, startDate, endDate) {
    //     imei = imei.toString();
    //     try {
    //         // Get all location data for the date range
    //         const locations = await prisma.getClient().location.findMany({
    //             where: {
    //                 imei,
    //                 createdAt: {
    //                     gte: startDate,
    //                     lte: endDate
    //                 }
    //             },
    //             orderBy: {
    //                 createdAt: 'asc'
    //             }
    //         });

    //         // Get all status data for the date range
    //         const statuses = await prisma.getClient().status.findMany({
    //             where: {
    //                 imei,
    //                 createdAt: {
    //                     gte: startDate,
    //                     lte: endDate
    //                 }
    //             },
    //             orderBy: {
    //                 createdAt: 'asc'
    //             }
    //         });

    //         // Calculate statistics
    //         const stats = this.calculateReportStats(locations, statuses);

    //         // Generate daily data for charts
    //         const dailyData = this.generateDailyData(locations, startDate, endDate);

    //         return {
    //             stats,
    //             dailyData,
    //             rawData: {
    //                 locations,
    //                 statuses
    //             }
    //         };
    //     } catch (error) {
    //         console.error('ERROR GENERATING REPORT DATA: ', error);
    //         throw error;
    //     }
    // }

    // Calculate report statistics
    calculateReportStats(locations, statuses) {
        if (locations.length === 0) {
            return {
                totalKm: 0,
                totalTime: 0,
                averageSpeed: 0,
                maxSpeed: 0,
                totalIdleTime: 0,
                totalRunningTime: 0,
                totalOverspeedTime: 0,
                totalStopTime: 0
            };
        }

        // Calculate total distance
        let totalKm = 0;
        for (let i = 1; i < locations.length; i++) {
            const prev = locations[i - 1];
            const curr = locations[i];
            if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
                const distance = this.calculateDistance(
                    prev.latitude, prev.longitude,
                    curr.latitude, curr.longitude
                );
                totalKm += distance;
            }
        }

        // Calculate time periods
        const totalTime = locations.length > 1
            ? (new Date(locations[locations.length - 1].createdAt) - new Date(locations[0].createdAt)) / 1000 / 60 // in minutes
            : 0;

        // Calculate speeds
        const speeds = locations.map(loc => loc.speed || 0).filter(speed => speed > 0);
        const averageSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
        const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

        // Calculate time periods based on status
        let totalIdleTime = 0;
        let totalRunningTime = 0;
        let totalOverspeedTime = 0;
        let totalStopTime = 0;

        // Group statuses by day and calculate time periods
        const statusByDay = {};
        statuses.forEach(status => {
            const day = new Date(status.createdAt).toDateString();
            if (!statusByDay[day]) {
                statusByDay[day] = [];
            }
            statusByDay[day].push(status);
        });

        // Calculate time periods for each day
        Object.values(statusByDay).forEach(dayStatuses => {
            dayStatuses.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            for (let i = 0; i < dayStatuses.length - 1; i++) {
                const current = dayStatuses[i];
                const next = dayStatuses[i + 1];
                const duration = (new Date(next.createdAt) - new Date(current.createdAt)) / 1000 / 60; // in minutes

                if (current.ignition === false) {
                    totalStopTime += duration;
                } else if (current.ignition === true) {
                    totalRunningTime += duration;
                }
            }
        });

        // Calculate idle time (when ignition is off but not moving)
        totalIdleTime = totalStopTime;

        // Calculate overspeed time (speed > 80 km/h)
        const overspeedLocations = locations.filter(loc => (loc.speed || 0) > 80);
        if (overspeedLocations.length > 1) {
            for (let i = 1; i < overspeedLocations.length; i++) {
                const duration = (new Date(overspeedLocations[i].createdAt) - new Date(overspeedLocations[i - 1].createdAt)) / 1000 / 60;
                totalOverspeedTime += duration;
            }
        }

        return {
            totalKm: Math.round(totalKm * 100) / 100,
            totalTime: Math.round(totalTime),
            averageSpeed: Math.round(averageSpeed * 10) / 10,
            maxSpeed: Math.round(maxSpeed),
            totalIdleTime: Math.round(totalIdleTime),
            totalRunningTime: Math.round(totalRunningTime),
            totalOverspeedTime: Math.round(totalOverspeedTime),
            totalStopTime: Math.round(totalStopTime)
        };
    }

    // Generate daily data for charts
    generateDailyData(locations, startDate, endDate) {
        const dailyData = {};
        const currentDate = new Date(startDate);
        const end = new Date(endDate);

        // Initialize daily data structure
        while (currentDate <= end) {
            const dateKey = currentDate.toISOString().split('T')[0];
            dailyData[dateKey] = {
                date: dateKey,
                averageSpeed: 0,
                maxSpeed: 0,
                totalKm: 0,
                locationCount: 0
            };
            currentDate.setDate(currentDate.getDate() + 1);
        }

        // Group locations by day
        const locationsByDay = {};
        locations.forEach(location => {
            const dateKey = new Date(location.createdAt).toISOString().split('T')[0];
            if (!locationsByDay[dateKey]) {
                locationsByDay[dateKey] = [];
            }
            locationsByDay[dateKey].push(location);
        });

        // Calculate daily statistics
        Object.keys(locationsByDay).forEach(dateKey => {
            const dayLocations = locationsByDay[dateKey];
            if (dayLocations.length === 0) return;

            // Calculate speeds for the day
            const speeds = dayLocations.map(loc => loc.speed || 0).filter(speed => speed > 0);
            const averageSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
            const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;

            // Calculate distance for the day
            let totalKm = 0;
            for (let i = 1; i < dayLocations.length; i++) {
                const prev = dayLocations[i - 1];
                const curr = dayLocations[i];
                if (prev.latitude && prev.longitude && curr.latitude && curr.longitude) {
                    const distance = this.calculateDistance(
                        prev.latitude, prev.longitude,
                        curr.latitude, curr.longitude
                    );
                    totalKm += distance;
                }
            }

            dailyData[dateKey] = {
                date: dateKey,
                averageSpeed: Math.round(averageSpeed * 10) / 10,
                maxSpeed: Math.round(maxSpeed),
                totalKm: Math.round(totalKm * 100) / 100,
                locationCount: dayLocations.length
            };
        });

        return Object.values(dailyData);
    }

    // Calculate distance between two points using Haversine formula
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of the Earth in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }


    // Update vehicle odometer based on new location
    async updateVehicleOdometer(imei, newLat, newLon) {
        try {
            // Get the previous location for this vehicle
            const previousLocation = await prisma.getClient().location.findFirst({
                where: { imei: imei.toString() },
                orderBy: { createdAt: 'desc' },
                skip: 1 // Skip the current location we just created
            });

            if (!previousLocation) {
                console.log(`First location for vehicle ${imei}, odometer remains 0`);
                return; // First location, no distance to add
            }

            // Calculate distance between previous and current location
            const distance = this.calculateDistance(
                previousLocation.latitude,
                previousLocation.longitude,
                newLat,
                newLon
            );

            // Filter out very small distances (GPS noise)
            if (distance < 0.001) { // Less than 1 meter
                return;
            }

            // Get current vehicle odometer
            const vehicle = await prisma.getClient().vehicle.findUnique({
                where: { imei: imei.toString() },
                select: { odometer: true }
            });

            if (!vehicle) {
                console.log(`Vehicle ${imei} not found, skipping odometer update`);
                return;
            }

            // Calculate new odometer value
            const currentOdometer = parseFloat(vehicle.odometer) || 0;
            const newOdometer = currentOdometer + distance;

            // Update vehicle odometer
            await prisma.getClient().vehicle.update({
                where: { imei: imei.toString() },
                data: {
                    odometer: Math.round(newOdometer * 100) / 100,
                }
            });


        } catch (error) {
            console.error('ERROR UPDATING ODOMETER:', error);
            // Don't throw error - odometer update failure shouldn't break location save
        }
    }


}

module.exports = LocationModel