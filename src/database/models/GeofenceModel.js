const prisma = require('../prisma');
const datetimeService = require('../../utils/datetime_service');

class GeofenceModel {
    // Create new geofence
    async createGeofence(data) {
        try {
        const nepalTime = datetimeService.nepalTimeDate();
        const geofence = await prisma.getClient().geofence.create({
                data: {
                    title: data.title,
                    type: data.type,
                    boundary: data.boundary, // Prisma will automatically convert to JSON
                    // Remove createdBy field - it doesn't exist in schema
                    createdAt: nepalTime,
                    updatedAt: nepalTime
                }
            });
    
            return geofence;
        } catch (error) {
            console.error('Error creating geofence:', error);
            throw error;
        }
    }

// Fix table naming consistency - use the correct Prisma model names
async assignGeofenceToVehicles(geofenceId, vehicleIds) {
    try {
        
        const assignments = vehicleIds.map(vehicleId => ({
            geofenceId: geofenceId,
            vehicleId: vehicleId
        }));

        // Use correct Prisma model name (camelCase)
        await prisma.getClient().geofenceVehicle.createMany({
            data: assignments,
            skipDuplicates: true
        });

    } catch (error) {
        console.error('Error assigning vehicles to geofence:', error);
        throw error;
    }
}

async assignGeofenceToUsers(geofenceId, userIds) {
    try {
        
        const assignments = userIds.map(userId => ({
            geofenceId: geofenceId,
            userId: userId
        }));

        // Use correct Prisma model name (camelCase)
        await prisma.getClient().geofenceUser.createMany({
            data: assignments,
            skipDuplicates: true
        });

    } catch (error) {
        console.error('Error assigning users to geofence:', error);
        throw error;
    }
}

    // Get all geofences
    async getAllGeofences() {
        try {
            return await prisma.getClient().geofence.findMany({
                include: {
                    vehicles: {
                        include: {
                            vehicle: true
                        }
                    },
                    users: {
                        include: {
                            user: {
                                include: {
                                    role: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING ALL GEOFENCES: ', error);
            throw error;
        }
    }

    // Get geofence by ID
    async getGeofenceById(id) {
        try {
            return await prisma.getClient().geofence.findUnique({
                where: { id: parseInt(id) },
                include: {
                    vehicles: {
                        include: {
                            vehicle: true
                        }
                    },
                    users: {
                        include: {
                            user: {
                                include: {
                                    role: true
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING GEOFENCE BY ID: ', error);
            throw error;
        }
    }

    // Get geofences by IMEI
    async getGeofencesByImei(imei) {
        try {
            return await prisma.getClient().geofence.findMany({
                where: {
                    vehicles: {
                        some: {
                            vehicle: {
                                imei: imei
                            }
                        }
                    }
                },
                include: {
                    vehicles: {
                        include: {
                            vehicle: true
                        }
                    },
                    users: {
                        include: {
                            user: {
                                include: {
                                    role: true
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING GEOFENCES BY IMEI: ', error);
            throw error;
        }
    }

    // Update geofence
    async updateGeofence(id, data) {
        const nepalTime = datetimeService.nepalTimeDate();
        try {
            const allowedFields = ['title', 'type', 'boundary'];
            const updateData = {};

            for (const [key, value] of Object.entries(data)) {
                if (allowedFields.includes(key)) {
                    updateData[key] = value;
                }
            }

            if (Object.keys(updateData).length === 0) {
                return null;
            }

            updateData.updatedAt = nepalTime;

            return await prisma.getClient().geofence.update({
                where: { id: parseInt(id) },
                data: updateData,
                include: {
                    vehicles: {
                        include: {
                            vehicle: true
                        }
                    },
                    users: {
                        include: {
                            user: {
                                include: {
                                    role: true
                                }
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('ERROR UPDATING GEOFENCE: ', error);
            throw error;
        }
    }

    // Delete geofence
    async deleteGeofence(id) {
        try {
            return await prisma.getClient().geofence.delete({
                where: { id: parseInt(id) }
            });
        } catch (error) {
            console.error('ERROR DELETING GEOFENCE: ', error);
            throw error;
        }
    }

    // Assign geofence to vehicles
    async assignGeofenceToVehicles(geofenceId, vehicleIds) {
        try {
            // Remove existing assignments
            await prisma.getClient().geofenceVehicle.deleteMany({
                where: { geofenceId: parseInt(geofenceId) }
            });

            // Create new assignments
            if (vehicleIds && vehicleIds.length > 0) {
                const assignments = vehicleIds.map(vehicleId => ({
                    geofenceId: parseInt(geofenceId),
                    vehicleId: parseInt(vehicleId)
                }));

                await prisma.getClient().geofenceVehicle.createMany({
                    data: assignments
                });
            }

            return await this.getGeofenceById(geofenceId);
        } catch (error) {
            console.error('ERROR ASSIGNING GEOFENCE TO VEHICLES: ', error);
            throw error;
        }
    }

    // Assign geofence to users
    async assignGeofenceToUsers(geofenceId, userIds) {
        try {
            // Remove existing assignments
            await prisma.getClient().geofenceUser.deleteMany({
                where: { geofenceId: parseInt(geofenceId) }
            });

            // Create new assignments
            if (userIds && userIds.length > 0) {
                const assignments = userIds.map(userId => ({
                    geofenceId: parseInt(geofenceId),
                    userId: parseInt(userId)
                }));

                await prisma.getClient().geofenceUser.createMany({
                    data: assignments
                });
            }

            return await this.getGeofenceById(geofenceId);
        } catch (error) {
            console.error('ERROR ASSIGNING GEOFENCE TO USERS: ', error);
            throw error;
        }
    }
}

module.exports = GeofenceModel;