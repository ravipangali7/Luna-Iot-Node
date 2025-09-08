const BloodDonationModel = require('../../database/models/BloodDonationModel');
const { successResponse, errorResponse } = require('../utils/response_handler');

class BloodDonationController {
    // Get all blood donations
    static async getAllBloodDonations(req, res) {
        try {
            const { applyType, bloodGroup, search } = req.query;
            const bloodDonationModel = new BloodDonationModel();
            
            let bloodDonations;
            
            if (search) {
                bloodDonations = await bloodDonationModel.searchData(search, applyType, bloodGroup);
            } else if (applyType) {
                bloodDonations = await bloodDonationModel.getDataByApplyType(applyType);
            } else if (bloodGroup) {
                bloodDonations = await bloodDonationModel.getDataByBloodGroup(bloodGroup);
            } else {
                bloodDonations = await bloodDonationModel.getAllData();
            }
            
            return successResponse(res, bloodDonations, 'Blood donations retrieved successfully');
        } catch (error) {
            console.error('Error in getAllBloodDonations:', error);
            return errorResponse(res, 'Failed to retrieve blood donations', 500);
        }
    }

    // Get blood donation by ID
    static async getBloodDonationById(req, res) {
        try {
            const { id } = req.params;
            const bloodDonationModel = new BloodDonationModel();
            const bloodDonation = await bloodDonationModel.getDataById(id);
            
            if (!bloodDonation) {
                return errorResponse(res, 'Blood donation not found', 404);
            }
            
            return successResponse(res, bloodDonation, 'Blood donation retrieved successfully');
        } catch (error) {
            console.error('Error in getBloodDonationById:', error);
            return errorResponse(res, 'Failed to retrieve blood donation', 500);
        }
    }

    // Create new blood donation
    static async createBloodDonation(req, res) {
        try {
            const { name, phone, address, bloodGroup, applyType, lastDonatedAt } = req.body;
            
            // Validate required fields
            if (!name || !phone || !address || !bloodGroup || !applyType) {
                return errorResponse(res, 'Name, phone, address, blood group, and apply type are required', 400);
            }

            // Validate apply type
            if (!['need', 'donate'].includes(applyType)) {
                return errorResponse(res, 'Apply type must be either "need" or "donate"', 400);
            }

            // Validate blood group (common blood groups)
            const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
            if (!validBloodGroups.includes(bloodGroup)) {
                return errorResponse(res, 'Invalid blood group', 400);
            }

            const bloodDonationModel = new BloodDonationModel();
            const bloodDonation = await bloodDonationModel.createData({
                name: name.trim(),
                phone: phone.trim(),
                address: address.trim(),
                bloodGroup: bloodGroup.trim(),
                applyType: applyType.trim(),
                lastDonatedAt: lastDonatedAt
            });
            
            return successResponse(res, bloodDonation, 'Blood donation created successfully', 201);
        } catch (error) {
            console.error('Error in createBloodDonation:', error);
            return errorResponse(res, 'Failed to create blood donation', 500);
        }
    }

    // Update blood donation
    static async updateBloodDonation(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            
            // Validate apply type if provided
            if (updateData.applyType && !['need', 'donate'].includes(updateData.applyType)) {
                return errorResponse(res, 'Apply type must be either "need" or "donate"', 400);
            }

            // Validate blood group if provided
            if (updateData.bloodGroup) {
                const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
                if (!validBloodGroups.includes(updateData.bloodGroup)) {
                    return errorResponse(res, 'Invalid blood group', 400);
                }
            }

            const bloodDonationModel = new BloodDonationModel();
            
            // Check if blood donation exists
            const existingBloodDonation = await bloodDonationModel.getDataById(id);
            if (!existingBloodDonation) {
                return errorResponse(res, 'Blood donation not found', 404);
            }

            const updatedBloodDonation = await bloodDonationModel.updateData(id, updateData);
            
            return successResponse(res, updatedBloodDonation, 'Blood donation updated successfully');
        } catch (error) {
            console.error('Error in updateBloodDonation:', error);
            return errorResponse(res, 'Failed to update blood donation', 500);
        }
    }

    // Delete blood donation
    static async deleteBloodDonation(req, res) {
        try {
            const { id } = req.params;
            const bloodDonationModel = new BloodDonationModel();
            
            // Check if blood donation exists
            const existingBloodDonation = await bloodDonationModel.getDataById(id);
            if (!existingBloodDonation) {
                return errorResponse(res, 'Blood donation not found', 404);
            }

            await bloodDonationModel.deleteData(id);
            
            return successResponse(res, null, 'Blood donation deleted successfully');
        } catch (error) {
            console.error('Error in deleteBloodDonation:', error);
            return errorResponse(res, 'Failed to delete blood donation', 500);
        }
    }

    // Get blood donations by apply type
    static async getBloodDonationsByType(req, res) {
        try {
            const { type } = req.params;
            
            if (!['need', 'donate'].includes(type)) {
                return errorResponse(res, 'Invalid apply type. Must be "need" or "donate"', 400);
            }

            const bloodDonationModel = new BloodDonationModel();
            const bloodDonations = await bloodDonationModel.getDataByApplyType(type);
            
            return successResponse(res, bloodDonations, `${type} blood donations retrieved successfully`);
        } catch (error) {
            console.error('Error in getBloodDonationsByType:', error);
            return errorResponse(res, 'Failed to retrieve blood donations by type', 500);
        }
    }

    // Get blood donations by blood group
    static async getBloodDonationsByBloodGroup(req, res) {
        try {
            const { bloodGroup } = req.params;
            
            const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
            if (!validBloodGroups.includes(bloodGroup)) {
                return errorResponse(res, 'Invalid blood group', 400);
            }

            const bloodDonationModel = new BloodDonationModel();
            const bloodDonations = await bloodDonationModel.getDataByBloodGroup(bloodGroup);
            
            return successResponse(res, bloodDonations, `Blood donations for ${bloodGroup} retrieved successfully`);
        } catch (error) {
            console.error('Error in getBloodDonationsByBloodGroup:', error);
            return errorResponse(res, 'Failed to retrieve blood donations by blood group', 500);
        }
    }
}

module.exports = BloodDonationController;
