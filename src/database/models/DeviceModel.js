const prisma = require('../prisma')
const datetimeService = require('../../utils/datetime_service');

class DeviceModel {

    // Create new device
    async createData(data) {
        try {
        const nepalTime = datetimeService.nepalTimeDate();
        const device = await prisma.getClient().device.upsert({
                where: { imei: data.imei.toString() },
                update: {
                    imei: data.imei.toString(),
                    phone: data.phone,
                    sim: data.sim,
                    protocol: data.protocol,
                    iccid: data.iccid,
                    model: data.model,
                    updatedAt: nepalTime
                },
                create: {
                    imei: data.imei.toString(),
                    phone: data.phone,
                    sim: data.sim,
                    protocol: data.protocol,
                    iccid: data.iccid,
                    model: data.model,
                    createdAt: nepalTime,
                    updatedAt: nepalTime
                },
            });
            return device;
        } catch (error) {
            console.error('DEVICE CREATION ERROR', error);
            throw error;
        }
    }

    // Get all devices
    async getAllData() {
        try {
            return await prisma.getClient().device.findMany({
                include: {
                    userDevices: { 
                        include: { 
                            user: {
                                include: {
                                    role: true
                                }
                            } 
                        } 
                    },
                    vehicles: { 
                        include: { 
                            userVehicles: { 
                                include: { 
                                    user: {
                                        include: {
                                            role: true
                                        }
                                    } 
                                } 
                            } 
                        } 
                    }
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING ALL DEVICES: ', error);
            throw error;
        }
    }

    // Get devices by user ID (for non-admin users)
    async getDevicesByUserId(userId) {
        try {
            const devices = await prisma.getClient().device.findMany({
                where: {
                    userDevices: {
                        some: {
                            userId: userId
                        }
                    }
                },
                include: {
                    userDevices: { 
                        include: { 
                            user: {
                                include: {
                                    role: true
                                }
                            } 
                        } 
                    },
                    vehicles: { 
                        include: { 
                            userVehicles: { 
                                include: { 
                                    user: {
                                        include: {
                                            role: true
                                        }
                                    } 
                                } 
                            } 
                        } 
                    }
                }
            });
            return devices;
        } catch (error) {
            console.error('ERROR FETCHING USER DEVICES: ', error);
            throw error;
        }
    }

    // Get device by imei
    async getDataByImei(imei) {
        imei = imei.toString();
        try {
            const device = await prisma.getClient().device.findUnique({ where: { imei } });
            return device;
        } catch (error) {
            console.error('DEVICE FETCH ERROR', error);
            throw error;
        }
    }

    // Get device by id
    async getDataById(id) {
        try {
            const device = await prisma.getClient().device.findUnique({ where: { id } });
            return device;
        } catch (error) {
            console.error('DEVICE FETCH ERROR', error);
            throw error;
        }
    }

    // Get device by imei for specific user (check access)
    async getDeviceByImeiForUser(imei, userId) {
        imei = imei.toString();
        try {
            const device = await prisma.getClient().device.findFirst({
                where: {
                    imei: imei,
                    userDevices: {
                        some: {
                            userId: userId
                        }
                    }
                }
            });
            return device;
        } catch (error) {
            console.error('DEVICE FETCH ERROR FOR USER: ', error);
            throw error;
        }
    }


    // Update device
    async updateData(imei, data) {
        imei = imei.toString();
        try {
            const allowedFields = ['imei', 'phone', 'sim', 'protocol', 'iccid', 'model'];
            const updateData = {};

            for (const [key, value] of Object.entries(data)) {
                if (allowedFields.includes(key)) {
                    updateData[key] = value;
                }
            }

            if (Object.keys(updateData).length === 0) {
                return null
            }

            return await prisma.getClient().device.update({
                where: { imei },
                data: updateData
            });
        } catch (error) {
            console.error('ERROR UPDATE DEVICE: ', error);
            throw error;
        }
    }

    // Delete device
    async deleteData(imei) {
        imei = imei.toString();
        try {
            const result = await prisma.getClient().device.delete({ where: { imei } });
            return result;
        } catch (error) {
            console.error('ERROR DELETE DEVICE: ', error);
            throw error;
        }
    }

    // MORE 
    // Assign device to user
    async assignDeviceToUser(imei, userId) {
        imei = imei.toString();
        try {
            // First check if device exists
            const device = await prisma.getClient().device.findUnique({
                where: { imei }
            });

            if (!device) {
                throw new Error('Device not found');
            }

            // Check if user exists and is a dealer
            const user = await prisma.getClient().user.findFirst({
                where: {
                    id: userId,
                    role: {
                        name: 'Dealer'
                    }
                },
                include: {
                    role: true
                }
            });

            if (!user) {
                throw new Error('User not found or is not a dealer');
            }

            // Check if assignment already exists
            const existingAssignment = await prisma.getClient().userDevice.findUnique({
                where: {
                    userId_deviceId: {
                        userId: userId,
                        deviceId: device.id
                    }
                }
            });

            if (existingAssignment) {
                throw new Error('Device is already assigned to this user');
            }

            // Create the assignment
            const assignment = await prisma.getClient().userDevice.create({
                data: {
                    userId: userId,
                    deviceId: device.id
                },
                include: {
                    user: {
                        include: {
                            role: true
                        }
                    },
                    device: true
                }
            });

            return assignment;
        } catch (error) {
            console.error('ERROR ASSIGNING DEVICE TO USER: ', error);
            throw error;
        }
    }

    // Remove device assignment
    async removeDeviceAssignment(imei, userId) {
        imei = imei.toString();
        try {
            const device = await prisma.getClient().device.findUnique({
                where: { imei }
            });

            if (!device) {
                throw new Error('Device not found');
            }

            const result = await prisma.getClient().userDevice.deleteMany({
                where: {
                    userId: userId,
                    deviceId: device.id
                }
            });

            return result.count > 0;
        } catch (error) {
            console.error('ERROR REMOVING DEVICE ASSIGNMENT: ', error);
            throw error;
        }
    }
}

module.exports = DeviceModel