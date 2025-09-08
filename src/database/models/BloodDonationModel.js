const prisma = require('../prisma');
const datetimeService = require('../../utils/datetime_service');

class BloodDonationModel {
    // Create new blood donation record
    async createData(data) {
        try {
            const nepalTime = datetimeService.nepalTimeDate();
            const bloodDonation = await prisma.getClient().bloodDonation.create({
                data: {
                    name: data.name,
                    phone: data.phone,
                    address: data.address,
                    bloodGroup: data.bloodGroup,
                    applyType: data.applyType,
                    lastDonatedAt: data.lastDonatedAt ? new Date(data.lastDonatedAt) : null,
                    createdAt: nepalTime,
                    updatedAt: nepalTime
                }
            });
            return bloodDonation;
        } catch (error) {
            console.error('BLOOD DONATION CREATION ERROR', error);
            throw error;
        }
    }

    // Get all blood donation records
    async getAllData() {
        try {
            return await prisma.getClient().bloodDonation.findMany({
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING ALL BLOOD DONATIONS: ', error);
            throw error;
        }
    }

    // Get blood donation by ID
    async getDataById(id) {
        try {
            return await prisma.getClient().bloodDonation.findUnique({
                where: { id: parseInt(id) }
            });
        } catch (error) {
            console.error('BLOOD DONATION FETCH ERROR', error);
            throw error;
        }
    }

    // Get blood donations by apply type
    async getDataByApplyType(applyType) {
        try {
            return await prisma.getClient().bloodDonation.findMany({
                where: { applyType: applyType },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING BLOOD DONATIONS BY TYPE: ', error);
            throw error;
        }
    }

    // Get blood donations by blood group
    async getDataByBloodGroup(bloodGroup) {
        try {
            return await prisma.getClient().bloodDonation.findMany({
                where: { bloodGroup: bloodGroup },
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            console.error('ERROR FETCHING BLOOD DONATIONS BY BLOOD GROUP: ', error);
            throw error;
        }
    }

    // Update blood donation
    async updateData(id, data) {
        try {
            const nepalTime = datetimeService.nepalTimeDate();
            const allowedFields = ['name', 'phone', 'address', 'bloodGroup', 'applyType', 'lastDonatedAt'];
            const updateData = {};

            for (const [key, value] of Object.entries(data)) {
                if (allowedFields.includes(key)) {
                    if (key === 'lastDonatedAt' && value) {
                        updateData[key] = new Date(value);
                    } else {
                        updateData[key] = value;
                    }
                }
            }

            if (Object.keys(updateData).length === 0) {
                return null;
            }

            updateData.updatedAt = nepalTime;

            return await prisma.getClient().bloodDonation.update({
                where: { id: parseInt(id) },
                data: updateData
            });
        } catch (error) {
            console.error('ERROR UPDATE BLOOD DONATION: ', error);
            throw error;
        }
    }

    // Delete blood donation
    async deleteData(id) {
        try {
            return await prisma.getClient().bloodDonation.delete({
                where: { id: parseInt(id) }
            });
        } catch (error) {
            console.error('ERROR DELETE BLOOD DONATION: ', error);
            throw error;
        }
    }

    // Search blood donations
    async searchData(searchTerm, applyType = null, bloodGroup = null) {
        try {
            const whereClause = {
                OR: [
                    { name: { contains: searchTerm, mode: 'insensitive' } },
                    { phone: { contains: searchTerm, mode: 'insensitive' } },
                    { address: { contains: searchTerm, mode: 'insensitive' } }
                ]
            };

            if (applyType) {
                whereClause.applyType = applyType;
            }

            if (bloodGroup) {
                whereClause.bloodGroup = bloodGroup;
            }

            return await prisma.getClient().bloodDonation.findMany({
                where: whereClause,
                orderBy: {
                    createdAt: 'desc'
                }
            });
        } catch (error) {
            console.error('ERROR SEARCHING BLOOD DONATIONS: ', error);
            throw error;
        }
    }
}

module.exports = BloodDonationModel;
