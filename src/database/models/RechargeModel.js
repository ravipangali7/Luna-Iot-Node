const prisma = require('../prisma');
const datetimeService = require('../../utils/datetime_service');

class RechargeModel {

    // Create new recharge
    async createData(data) {
        try {
            const nepalTime = datetimeService.nepalTimeDate();
            const recharge = await prisma.getClient().recharge.create({
                data: {
                    deviceId: data.deviceId,
                    amount: data.amount,
                    createdAt: nepalTime
                }
            });
            return recharge;
        } catch (error) {
            console.error('RECHARGE CREATION ERROR', error);
            throw error;
        }
    }

    // Get all recharges
    async getAllData() {
        try {
            return await prisma.getClient().recharge.findMany({
                include: {
                    device: {
                        include: {
                            userDevices: { include: { user: true } },
                            vehicles: { include: { userVehicles: { include: { user: true } } } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (error) {
            console.error('ERROR FETCHING ALL RECHARGES: ', error);
            throw error;
        }
    }

    // Get recharges by device ID
    async getRechargesByDeviceId(deviceId) {
        try {
            return await prisma.getClient().recharge.findMany({
                where: { deviceId },
                include: {
                    device: {
                        include: {
                            userDevices: { include: { user: true } },
                            vehicles: { include: { userVehicles: { include: { user: true } } } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
        } catch (error) {
            console.error('ERROR FETCHING DEVICE RECHARGES: ', error);
            throw error;
        }
    }

    // Get recharges by user ID (for non-admin users)
    async getRechargesByUserId(userId) {
        try {
            const recharges = await prisma.getClient().recharge.findMany({
                where: {
                    device: {
                        userDevices: {
                            some: {
                                userId: userId
                            }
                        }
                    }
                },
                include: {
                    device: {
                        include: {
                            userDevices: { include: { user: true } },
                            vehicles: { include: { userVehicles: { include: { user: true } } } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            return recharges;
        } catch (error) {
            console.error('ERROR FETCHING USER RECHARGES: ', error);
            throw error;
        }
    }

    // Get recharge by ID
    async getDataById(id) {
        try {
            const recharge = await prisma.getClient().recharge.findUnique({
                where: { id },
                include: {
                    device: {
                        include: {
                            userDevices: { include: { user: true } },
                            vehicles: { include: { userVehicles: { include: { user: true } } } }
                        }
                    }
                }
            });
            return recharge;
        } catch (error) {
            console.error('RECHARGE FETCH ERROR', error);
            throw error;
        }
    }

    // Get recharge by ID for specific user (check access)
    async getRechargeByIdForUser(id, userId) {
        try {
            const recharge = await prisma.getClient().recharge.findFirst({
                where: {
                    id: id,
                    device: {
                        userDevices: {
                            some: {
                                userId: userId
                            }
                        }
                    }
                },
                include: {
                    device: {
                        include: {
                            userDevices: { include: { user: true } },
                            vehicles: { include: { userVehicles: { include: { user: true } } } }
                        }
                    }
                }
            });
            return recharge;
        } catch (error) {
            console.error('RECHARGE FETCH ERROR FOR USER: ', error);
            throw error;
        }
    }

    // Get total recharge amount for a device
    async getTotalRechargeByDeviceId(deviceId) {
        try {
            const result = await prisma.getClient().recharge.aggregate({
                where: { deviceId },
                _sum: { amount: true }
            });
            return result._sum.amount || 0;
        } catch (error) {
            console.error('ERROR FETCHING TOTAL RECHARGE: ', error);
            throw error;
        }
    }

    // Get recharge statistics for a device
    async getRechargeStatsByDeviceId(deviceId) {
        try {
            const stats = await prisma.getClient().recharge.aggregate({
                where: { deviceId },
                _sum: { amount: true },
                _count: { id: true },
                _min: { amount: true },
                _max: { amount: true }
            });

            return {
                totalAmount: stats._sum.amount || 0,
                totalCount: stats._count.id || 0,
                minAmount: stats._min.amount || 0,
                maxAmount: stats._max.amount || 0
            };
        } catch (error) {
            console.error('ERROR FETCHING RECHARGE STATS: ', error);
            throw error;
        }
    }

    // Get recharges with pagination
    async getRechargesWithPagination(page = 1, limit = 10, deviceId = null, userId = null) {
        try {
            const skip = (page - 1) * limit;
            let whereClause = {};

            if (deviceId) {
                whereClause.deviceId = deviceId;
            }

            if (userId) {
                whereClause.device = {
                    userDevices: {
                        some: {
                            userId: userId
                        }
                    }
                };
            }

            const [recharges, total] = await Promise.all([
                prisma.getClient().recharge.findMany({
                    where: whereClause,
                    include: {
                        device: {
                            include: {
                                userDevices: { include: { user: true } },
                                vehicles: { include: { userVehicles: { include: { user: true } } } }
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    skip: skip,
                    take: limit
                }),
                prisma.getClient().recharge.count({
                    where: whereClause
                })
            ]);

            return {
                recharges,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            console.error('ERROR FETCHING RECHARGES WITH PAGINATION: ', error);
            throw error;
        }
    }

    // Delete recharge
    async deleteData(id) {
        try {
            const result = await prisma.getClient().recharge.delete({ where: { id } });
            return result;
        } catch (error) {
            console.error('ERROR DELETE RECHARGE: ', error);
            throw error;
        }
    }
}

module.exports = RechargeModel;
