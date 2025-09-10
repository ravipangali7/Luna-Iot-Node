const RechargeModel = require('../../database/models/RechargeModel');
const DeviceModel = require('../../database/models/DeviceModel');
const mobileTopupService = require('../../services/mobileTopupService');
const logger = require('../../services/loggingService');
const { successResponse, errorResponse } = require('../utils/response_handler');
const { validateRequiredFields } = require('../utils/validation');

class RechargeController {
    // Get all recharges
    static async getAllRecharges(req, res) {
        try {
            const user = req.user;
            const rechargeModel = new RechargeModel();
            
            // Super Admin: all access
            if (user.role.name === 'Super Admin') {
                const recharges = await rechargeModel.getAllData();
                return successResponse(res, recharges, 'Recharges retrieved successfully');
            } 
            // Dealer: only view recharges for assigned devices
            else if (user.role.name === 'Dealer') {
                const recharges = await rechargeModel.getRechargesByUserId(user.id);
                return successResponse(res, recharges, 'Dealer recharges retrieved successfully');
            } 
            // Customer: no access to recharges
            else {
                return errorResponse(res, 'Access denied. Customers cannot view recharges', 403);
            }
        }
        catch (error) {
            console.error('Error in get all recharges: ', error);
            return errorResponse(res, 'Failed to retrieve recharges', 500);
        }
    }

    // Get recharges with pagination
    static async getRechargesWithPagination(req, res) {
        try {
            const user = req.user;
            const { page = 1, limit = 10, deviceId } = req.query;
            const rechargeModel = new RechargeModel();
            
            let userId = null;
            
            // Super Admin: all access
            if (user.role.name === 'Super Admin') {
                // No userId restriction
            } 
            // Dealer: only view recharges for assigned devices
            else if (user.role.name === 'Dealer') {
                userId = user.id;
            } 
            // Customer: no access to recharges
            else {
                return errorResponse(res, 'Access denied. Customers cannot view recharges', 403);
            }

            const result = await rechargeModel.getRechargesWithPagination(
                parseInt(page), 
                parseInt(limit), 
                deviceId ? parseInt(deviceId) : null, 
                userId
            );
            
            return successResponse(res, result, 'Recharges retrieved successfully');
        }
        catch (error) {
            console.error('Error in get recharges with pagination: ', error);
            return errorResponse(res, 'Failed to retrieve recharges', 500);
        }
    }

    // Get recharge by ID
    static async getRechargeById(req, res) {
        try {
            const { id } = req.params;
            const user = req.user;
            const rechargeModel = new RechargeModel();
            
            let recharge;
            
            // Super Admin: can access any recharge
            if (user.role.name === 'Super Admin') {
                recharge = await rechargeModel.getDataById(parseInt(id));
            } 
            // Dealer: can only access recharges for assigned devices
            else if (user.role.name === 'Dealer') {
                recharge = await rechargeModel.getRechargeByIdForUser(parseInt(id), user.id);
            } 
            // Customer: no access to recharges
            else {
                return errorResponse(res, 'Access denied. Customers cannot view recharges', 403);
            }
            
            if (!recharge) {
                return errorResponse(res, 'Recharge not found or access denied', 404);
            }
            
            return successResponse(res, recharge, 'Recharge retrieved successfully');
        } catch (error) {
            console.error('Error in getRechargeById:', error);
            return errorResponse(res, 'Failed to retrieve recharge', 500);
        }
    }

    // Get recharges by device ID
    static async getRechargesByDeviceId(req, res) {
        try {
            const { deviceId } = req.params;
            const user = req.user;
            const rechargeModel = new RechargeModel();
            const deviceModel = new DeviceModel();
            
            // Check if device exists and user has access
            let device;
            if (user.role.name === 'Super Admin') {
                device = await deviceModel.getDataById(parseInt(deviceId));
            } else if (user.role.name === 'Dealer') {
                device = await deviceModel.getDeviceByImeiForUser(deviceId, user.id);
            } else {
                return errorResponse(res, 'Access denied. Customers cannot view recharges', 403);
            }
            
            if (!device) {
                return errorResponse(res, 'Device not found or access denied', 404);
            }
            
            const recharges = await rechargeModel.getRechargesByDeviceId(parseInt(deviceId));
            return successResponse(res, recharges, 'Device recharges retrieved successfully');
        } catch (error) {
            console.error('Error in getRechargesByDeviceId:', error);
            return errorResponse(res, 'Failed to retrieve device recharges', 500);
        }
    }

    // Create new recharge
    static async createRecharge(req, res) {
        try {
            const user = req.user;
            
            // Only Super Admin and Dealer can create recharges
            if (user.role.name !== 'Super Admin' && user.role.name !== 'Dealer') {
                return errorResponse(res, 'Access denied. Only Super Admin and Dealers can create recharges', 403);
            }
            
            const { deviceId, amount } = req.body;
            
            // Validate required fields
            const validation = validateRequiredFields({ deviceId, amount }, ['deviceId', 'amount']);
            if (!validation.isValid) {
                return errorResponse(res, validation.message, 400);
            }
            
            // Validate amount
            if (isNaN(amount) || parseFloat(amount) <= 0) {
                return errorResponse(res, 'Amount must be a positive number', 400);
            }
            
            const deviceModel = new DeviceModel();
            const rechargeModel = new RechargeModel();
            
            // Check if device exists and user has access
            let device;
            if (user.role.name === 'Super Admin') {
                device = await deviceModel.getDataById(parseInt(deviceId));
            } else if (user.role.name === 'Dealer') {
                device = await deviceModel.getDeviceByImeiForUser(deviceId, user.id);
            }
            
            if (!device) {
                return errorResponse(res, 'Device not found or access denied', 404);
            }
            
            // Check if device has phone number
            if (!device.phone) {
                return errorResponse(res, 'Device does not have a phone number for top-up', 400);
            }
            
            // Check if device has SIM type
            if (!device.sim) {
                return errorResponse(res, 'Device does not have SIM type information', 400);
            }
            
            logger.info('recharge', 'Processing recharge', { 
                deviceId: device.id, 
                imei: device.imei, 
                phone: device.phone, 
                sim: device.sim, 
                amount: amount,
                userId: user.id,
                userRole: user.role.name
            });
            
            // Process mobile top-up first
            const topupResult = await mobileTopupService.processTopup(
                device.phone, 
                parseFloat(amount), 
                device.sim
            );
            
            logger.info('recharge', 'Top-up result', topupResult);
            
            // Only create recharge record if top-up is successful
            if (!topupResult.success) {
                logger.warn('recharge', 'Top-up failed, not creating recharge record', topupResult);
                return errorResponse(res, `Top-up failed: ${topupResult.message}`, 400);
            }
            
            // Create recharge record only after successful top-up
            const rechargeData = {
                deviceId: device.id,
                amount: parseFloat(amount)
            };
            
            const recharge = await rechargeModel.createData(rechargeData);
            
            // Add top-up result to recharge data
            const rechargeWithTopup = {
                ...recharge,
                topupResult: {
                    success: topupResult.success,
                    message: topupResult.message,
                    simType: topupResult.simType,
                    reference: topupResult.reference,
                    statusCode: topupResult.statusCode,
                    state: topupResult.state,
                    creditsConsumed: topupResult.data?.CreditsConsumed || 0,
                    creditsAvailable: topupResult.data?.CreditsAvailable || 0,
                    transactionId: topupResult.data?.Id || null
                }
            };
            
            logger.info('recharge', 'Recharge created successfully after top-up', { 
                rechargeId: recharge.id, 
                deviceId: device.id, 
                amount: amount,
                topupReference: topupResult.reference
            });
            
            return successResponse(res, rechargeWithTopup, 'Recharge and top-up completed successfully', 201);
            
        } catch (error) {
            console.error('Error in createRecharge:', error);
            return errorResponse(res, 'Failed to create recharge', 500);
        }
    }

    // Get recharge statistics for a device
    static async getRechargeStats(req, res) {
        try {
            const { deviceId } = req.params;
            const user = req.user;
            const rechargeModel = new RechargeModel();
            const deviceModel = new DeviceModel();
            
            // Check if device exists and user has access
            let device;
            if (user.role.name === 'Super Admin') {
                device = await deviceModel.getDataById(parseInt(deviceId));
            } else if (user.role.name === 'Dealer') {
                device = await deviceModel.getDeviceByImeiForUser(deviceId, user.id);
            } else {
                return errorResponse(res, 'Access denied. Customers cannot view recharge statistics', 403);
            }
            
            if (!device) {
                return errorResponse(res, 'Device not found or access denied', 404);
            }
            
            const stats = await rechargeModel.getRechargeStatsByDeviceId(parseInt(deviceId));
            return successResponse(res, stats, 'Recharge statistics retrieved successfully');
        } catch (error) {
            console.error('Error in getRechargeStats:', error);
            return errorResponse(res, 'Failed to retrieve recharge statistics', 500);
        }
    }

    // Get total recharge amount for a device
    static async getTotalRecharge(req, res) {
        try {
            const { deviceId } = req.params;
            const user = req.user;
            const rechargeModel = new RechargeModel();
            const deviceModel = new DeviceModel();
            
            // Check if device exists and user has access
            let device;
            if (user.role.name === 'Super Admin') {
                device = await deviceModel.getDataById(parseInt(deviceId));
            } else if (user.role.name === 'Dealer') {
                device = await deviceModel.getDeviceByImeiForUser(deviceId, user.id);
            } else {
                return errorResponse(res, 'Access denied. Customers cannot view recharge totals', 403);
            }
            
            if (!device) {
                return errorResponse(res, 'Device not found or access denied', 404);
            }
            
            const totalAmount = await rechargeModel.getTotalRechargeByDeviceId(parseInt(deviceId));
            return successResponse(res, { totalAmount }, 'Total recharge amount retrieved successfully');
        } catch (error) {
            console.error('Error in getTotalRecharge:', error);
            return errorResponse(res, 'Failed to retrieve total recharge amount', 500);
        }
    }

    // Delete recharge (only Super Admin)
    static async deleteRecharge(req, res) {
        try {
            const user = req.user;
            
            // Only Super Admin can delete recharges
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can delete recharges', 403);
            }
            
            const { id } = req.params;
            const rechargeModel = new RechargeModel();
            const result = await rechargeModel.deleteData(parseInt(id));
            
            if (!result) {
                return errorResponse(res, 'Recharge not found', 404);
            }
            
            return successResponse(res, null, 'Recharge deleted successfully');
        } catch (error) {
            console.error('Error in deleteRecharge:', error);
            return errorResponse(res, 'Failed to delete recharge', 500);
        }
    }
}

module.exports = RechargeController;
