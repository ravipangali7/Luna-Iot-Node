const DeviceModel = require('../../database/models/DeviceModel');
const { successResponse, errorResponse } = require('../utils/response_handler');
const UserModel = require('../../database/models/UserModel');
const smsService = require('../../utils/sms_service');

class DeviceController {
    // Get all devices
    static async getAllDevices(req, res) {
        try {
            const user = req.user;
            const deviceModel = new DeviceModel();
            
            // Super Admin: all access
            if (user.role.name === 'Super Admin') {
                const devices = await deviceModel.getAllData();
                return successResponse(res, devices, 'Devices retrieved successfully');
            } 
            // Dealer: only view assigned devices
            else if (user.role.name === 'Dealer') {
                const devices = await deviceModel.getDevicesByUserId(user.id);
                return successResponse(res, devices, 'Dealer devices retrieved successfully');
            } 
            // Customer: no access to devices
            else {
                return errorResponse(res, 'Access denied. Customers cannot view devices', 403);
            }
        }
        catch (error) {
            console.error('Error in get all device: ', error);
            return errorResponse(res, 'Failed to retrieve devices', 500);
        }
    }

    // Get device by IMEI
    static async getDeviceByImei(req, res) {
        try {
            const { imei } = req.params;
            const user = req.user;
            const deviceModel = new DeviceModel();
            
            let device;
            
            // Super Admin: can access any device
            if (user.role.name === 'Super Admin') {
                device = await deviceModel.getDataByImei(imei);
            } 
            // Dealer: can only access assigned devices
            else if (user.role.name === 'Dealer') {
                device = await deviceModel.getDeviceByImeiForUser(imei, user.id);
            } 
            // Customer: no access to devices
            else {
                return errorResponse(res, 'Access denied. Customers cannot view devices', 403);
            }
            
            if (!device) {
                return errorResponse(res, 'Device not found or access denied', 404);
            }
            
            return successResponse(res, device, 'Device retrieved successfully');
        } catch (error) {
            console.error('Error in getDeviceByImei:', error);
            return errorResponse(res, 'Failed to retrieve device', 500);
        }
    }

    // Create new device (only Super Admin)
    static async createDevice(req, res) {
        try {
            const user = req.user;
            
            // Only Super Admin can create devices
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can create devices', 403);
            }
            
            const deviceData = req.body;
            const deviceModel = new DeviceModel();
            const device = await deviceModel.createData(deviceData);
            
            return successResponse(res, device, 'Device created successfully', 201);
        } catch (error) {
            console.error('Error in createDevice:', error);
            return errorResponse(res, 'Failed to create device', 500);
        }
    }

    // Update device (only Super Admin)
    static async updateDevice(req, res) {
        try {
            const { imei } = req.params;
            const user = req.user;
            
            // Only Super Admin can update devices
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can update devices', 403);
            }
            
            const updateData = req.body;
            const deviceModel = new DeviceModel();
            const device = await deviceModel.updateData(imei, updateData);
            
            if (!device) {
                return errorResponse(res, 'Device not found', 404);
            }
            
            return successResponse(res, device, 'Device updated successfully');
        } catch (error) {
            console.error('Error in updateDevice:', error);
            return errorResponse(res, 'Failed to update device', 500);
        }
    }

    // Delete device (only Super Admin)
    static async deleteDevice(req, res) {
        try {
            const user = req.user;
            
            // Only Super Admin can delete devices
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can delete devices', 403);
            }
            
            const { imei } = req.params;
            const deviceModel = new DeviceModel();
            const result = await deviceModel.deleteData(imei);
            
            if (!result) {
                return errorResponse(res, 'Device not found', 404);
            }
            
            return successResponse(res, null, 'Device deleted successfully');
        } catch (error) {
            console.error('Error in deleteDevice:', error);
            return errorResponse(res, 'Failed to delete device', 500);
        }
    }

    // More
    // Assign device to user
    static async assignDeviceToUser(req, res) {
        try {
            const user = req.user;
            
            // Only Super Admin can assign devices
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can assign devices', 403);
            }
            
            const { imei, userPhone } = req.body;
            
            if (!imei || !userPhone) {
                return errorResponse(res, 'IMEI and user phone are required', 400);
            }

            const deviceModel = new DeviceModel();
            

            // Check if user exists and is a dealer
            const targetUser = await UserModel.getUserByPhone(userPhone);
            if (!targetUser) {
                return errorResponse(res, 'User not found', 404);
            }

            if (targetUser.role.name !== 'Dealer') {
                return errorResponse(res, 'Only dealers can be assigned devices', 400);
            }

            // Assign device to user
            const assignment = await deviceModel.assignDeviceToUser(imei, targetUser.id);
            
            return successResponse(res, assignment, 'Device assigned successfully');
        } catch (error) {
            console.error('Error in assignDeviceToUser:', error);
            if (error.message === 'Device not found') {
                return errorResponse(res, 'Device not found', 404);
            } else if (error.message === 'User not found or is not a dealer') {
                return errorResponse(res, 'User not found or is not a dealer', 404);
            } else if (error.message === 'Device is already assigned to this user') {
                return errorResponse(res, 'Device is already assigned to this user', 400);
            }
            return errorResponse(res, 'Failed to assign device', 500);
        }
    }

    // Remove device assignment
    static async removeDeviceAssignment(req, res) {
        try {
            const user = req.user;
            
            // Only Super Admin can remove device assignments
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can remove device assignments', 403);
            }
            
            const { imei, userPhone } = req.body;
            
            if (!imei || !userPhone) {
                return errorResponse(res, 'IMEI and user phone are required', 400);
            }

            const deviceModel = new DeviceModel();
            
            // Check if user exists
            const targetUser = await UserModel.getUserByPhone(userPhone);
            if (!targetUser) {
                return errorResponse(res, 'User not found', 404);
            }

            // Remove device assignment
            const result = await deviceModel.removeDeviceAssignment(imei, targetUser.id);
            
            if (!result) {
                return errorResponse(res, 'Device assignment not found', 404);
            }
            
            return successResponse(res, null, 'Device assignment removed successfully');
        } catch (error) {
            console.error('Error in removeDeviceAssignment:', error);
            return errorResponse(res, 'Failed to remove device assignment', 500);
        }
    }

    // Send server point command via SMS
    static async sendServerPoint(req, res) {
        try {
            const user = req.user;
            
            // Only Super Admin can send server point commands
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can send server point commands', 403);
            }
            
            const { phone } = req.body;
            
            if (!phone) {
                return errorResponse(res, 'Phone number is required', 400);
            }

            // Server point command message
            const serverPointMessage = 'SERVER,0,38.54.71.218,7777,0#';
            
            // Send SMS
            const smsResult = await smsService.sendSMS(phone, serverPointMessage);
            
            if (smsResult.success) {
                return successResponse(res, {
                    phone: phone,
                    message: serverPointMessage,
                    sent: true
                }, 'Server point command sent successfully');
            } else {
                return errorResponse(res, 'Failed to send server point command', 500);
            }
        } catch (error) {
            console.error('Error in sendServerPoint:', error);
            return errorResponse(res, 'Failed to send server point command', 500);
        }
    }
}

module.exports = DeviceController;