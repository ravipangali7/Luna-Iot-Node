const VehicleModel = require('../../database/models/VehicleModel');
const DeviceModel = require('../../database/models/DeviceModel');
const UserModel = require('../../database/models/UserModel');
const { successResponse, errorResponse } = require('../utils/response_handler');
const prisma = require('../../database/prisma')

class VehicleController {

    // Get all vehicles with complete data (ownership, today's km, latest status and location)
    static async getAllVehicles(req, res) {
        try {
            const user = req.user;
            const vehicleModel = new VehicleModel();

            const vehicles = await vehicleModel.getAllVehiclesWithCompleteData(user.id, user.role.name);

            return successResponse(res, vehicles, 'Vehicles retrieved successfully');
        } catch (error) {
            console.error('Error in getAllVehicles:', error);
            return errorResponse(res, 'Failed to retrieve vehicles', 500);
        }
    }

    // Get vehicle by IMEI with complete data and role-based access
    static async getVehicleByImei(req, res) {
        try {
            const { imei } = req.params;
            const user = req.user;
            const vehicleModel = new VehicleModel();

            const vehicle = await vehicleModel.getVehicleByImeiWithCompleteData(imei, user.id, user.role.name);

            if (!vehicle) {
                return errorResponse(res, 'Vehicle not found or access denied', 404);
            }

            return successResponse(res, vehicle, 'Vehicle retrieved successfully');
        } catch (error) {
            console.error('Error in getVehicleByImei:', error);
            return errorResponse(res, 'Failed to retrieve vehicle', 500);
        }
    }

    // Create new vehicle with user-vehicle relationship
    static async createVehicle(req, res) {
        try {
            const user = req.user;
            const vehicleData = req.body;

            // Validate required fields
            if (!vehicleData.imei || !vehicleData.name || !vehicleData.vehicleNo || !vehicleData.vehicleType) {
                return errorResponse(res, 'Missing required fields: IMEI, name, vehicle number, and vehicle type are required', 400);
            }

            // Validate IMEI format
            if (!/^\d{15}$/.test(vehicleData.imei)) {
                return errorResponse(res, 'IMEI must be exactly 15 digits', 400);
            }

            // Check if device IMEI exists
            const deviceModel = new DeviceModel();
            const device = await deviceModel.getDataByImei(vehicleData.imei);

            if (!device) {
                return errorResponse(res, 'Device with this IMEI does not exist. Please create the device first.', 400);
            }

            const vehicleModel = new VehicleModel();
            const existingVehicle = await vehicleModel.getDataByImei(vehicleData.imei);

            if (existingVehicle) {
                return errorResponse(res, 'Vehicle with this IMEI already exists', 400);
            }

            // Create vehicle with user-vehicle relationship
            const vehicle = await vehicleModel.createData(vehicleData, user.id);
            return successResponse(res, vehicle, 'Vehicle created successfully', 201);
        } catch (error) {
            return errorResponse(res, 'Failed to create vehicle: ' + error.message, 500);
        }
    }


    // Update vehicle with role-based access
    static async updateVehicle(req, res) {
        try {
            const { imei } = req.params;
            const user = req.user;
            const updateData = req.body;

            // Only check for device existence and vehicle duplicates if IMEI is being changed
            if (updateData.imei && updateData.imei !== imei) {

                // Check if device exists
                const deviceModel = new DeviceModel();
                const device = await deviceModel.getDataByImei(updateData.imei);

                if (!device) {
                    return errorResponse(res, 'Device with this IMEI does not exist', 400);
                }

                // Check if another vehicle with the new IMEI already exists
                const vehicleModel = new VehicleModel();
                const existingVehicle = await vehicleModel.getDataByImei(updateData.imei);

                if (existingVehicle) {
                    return errorResponse(res, 'Vehicle with this IMEI already exists', 400);
                }
            }

            const vehicleModel = new VehicleModel();

            // Check access based on role
            const vehicle = await vehicleModel.getVehicleByImeiWithCompleteData(imei, user.id, user.role.name);

            if (!vehicle) {
                return errorResponse(res, 'Vehicle not found or access denied', 404);
            }

            const updatedVehicle = await vehicleModel.updateData(imei, updateData);

            if (!updatedVehicle) {
                return errorResponse(res, 'Vehicle not found', 404);
            }

            return successResponse(res, updatedVehicle, 'Vehicle updated successfully');
        } catch (error) {
            console.error('Error in updateVehicle:', error);
            return errorResponse(res, 'Failed to update vehicle', 500);
        }
    }

    // Delete vehicle (only Super Admin)
    static async deleteVehicle(req, res) {
        try {
            const user = req.user;

            // Only Super Admin can delete vehicles
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can delete vehicles', 403);
            }

            const { imei } = req.params;
            const vehicleModel = new VehicleModel();

            // Get vehicle details before deletion for cleanup
            const vehicle = await vehicleModel.getDataByImei(imei);
            if (!vehicle) {
                return errorResponse(res, 'Vehicle not found', 404);
            }

            await Promise.all([
                // Delete user-vehicle relationships
                prisma.getClient().userVehicle.deleteMany({
                    where: { vehicleId: vehicle.id }
                }),
    
                // Delete geofence-vehicle relationships
                prisma.getClient().geofenceVehicle.deleteMany({
                    where: { vehicleId: vehicle.id }
                }),
    
                // Delete ALL location data with this IMEI
                prisma.getClient().location.deleteMany({
                    where: { imei: imei.toString() }
                }),
    
                // Delete ALL status data with this IMEI
                prisma.getClient().status.deleteMany({
                    where: { imei: imei.toString() }
                }),
    
                // Delete the vehicle record itself
                prisma.getClient().vehicle.delete({
                    where: { imei: imei.toString() }
                })
            ]);

            return successResponse(res, null, 'Vehicle deleted successfully');
        } catch (error) {
            console.error('Error in deleteVehicle:', error);
            return errorResponse(res, 'Failed to delete vehicle', 500);
        }
    }


    // ----- Vehicle Access -----
    // NEW: Assign vehicle access to user
    static async assignVehicleAccessToUser(req, res) {
        try {
            const user = req.user;
            const { imei, userPhone, permissions } = req.body;

            if (!imei || !userPhone || !permissions) {
                return errorResponse(res, 'IMEI, user phone, and permissions are required', 400);
            }

            const vehicleModel = new VehicleModel();

            // Check if target user exists
            const targetUser = await UserModel.getUserByPhone(userPhone);
            if (!targetUser) {
                return errorResponse(res, 'User not found', 404);
            }

            // Check if user has permission to assign access
            if (user.role.name !== 'Super Admin') {
                const mainUserVehicle = await vehicleModel.getVehicleByImeiWithCompleteData(
                    imei,
                    user.id,
                    user.role.name
                );

                if (!mainUserVehicle || !mainUserVehicle.userVehicle?.isMain) {
                    return errorResponse(res, 'Access denied. Only main user or Super Admin can assign access', 403);
                }
            }

            // Assign vehicle access to user (remove assignedByUserId parameter)
            const assignment = await vehicleModel.assignVehicleAccessToUser(
                imei,
                targetUser.id,
                permissions
            );

            return successResponse(res, assignment, 'Vehicle access assigned successfully');
        } catch (error) {
            console.error('Error in assignVehicleAccessToUser:', error);
            if (error.message === 'Vehicle not found') {
                return errorResponse(res, 'Vehicle not found', 404);
            } else if (error.message === 'User not found') {
                return errorResponse(res, 'User not found', 404);
            } else if (error.message === 'Vehicle access is already assigned to this user') {
                return errorResponse(res, 'Vehicle access is already assigned to this user', 400);
            } else if (error.message.includes('Access denied')) {
                return errorResponse(res, error.message, 403);
            }
            return errorResponse(res, 'Failed to assign vehicle access', 500);
        }
    }

    // NEW: Get vehicles for access assignment
    static async getVehiclesForAccessAssignment(req, res) {
        try {
            const user = req.user;
            const vehicleModel = new VehicleModel();

            const vehicles = await vehicleModel.getVehiclesForAccessAssignment(user.id, user.role.name);

            return successResponse(res, vehicles, 'Vehicles for access assignment retrieved successfully');
        } catch (error) {
            console.error('Error in getVehiclesForAccessAssignment:', error);
            return errorResponse(res, 'Failed to retrieve vehicles for access assignment', 500);
        }
    }

    // NEW: Get vehicle access assignments
    static async getVehicleAccessAssignments(req, res) {
        try {
            const user = req.user;
            const { imei } = req.params;

            if (!imei) {
                return errorResponse(res, 'IMEI is required', 400);
            }

            const vehicleModel = new VehicleModel();
            const assignments = await vehicleModel.getVehicleAccessAssignments(
                imei,
                user.id,
                user.role.name
            );

            return successResponse(res, assignments, 'Vehicle access assignments retrieved successfully');
        } catch (error) {
            console.error('Error in getVehicleAccessAssignments:', error);
            if (error.message.includes('Access denied')) {
                return errorResponse(res, error.message, 403);
            }
            return errorResponse(res, 'Failed to retrieve vehicle access assignments', 500);
        }
    }

    // NEW: Update vehicle access
    static async updateVehicleAccess(req, res) {
        try {
            const user = req.user;
            const { imei, userId, permissions } = req.body;

            if (!imei || !userId || !permissions) {
                return errorResponse(res, 'IMEI, user ID, and permissions are required', 400);
            }

            const vehicleModel = new VehicleModel();

            // Check if user has permission to update access
            if (user.role.name !== 'Super Admin') {
                const mainUserVehicle = await vehicleModel.getVehicleByImeiWithCompleteData(
                    imei,
                    user.id,
                    user.role.name
                );

                if (!mainUserVehicle || !mainUserVehicle.userVehicle?.isMain) {
                    return errorResponse(res, 'Access denied. Only main user or Super Admin can update access', 403);
                }
            }

            const assignment = await vehicleModel.updateVehicleAccess(
                imei,
                userId,
                permissions
            );

            return successResponse(res, assignment, 'Vehicle access updated successfully');
        } catch (error) {
            console.error('Error in updateVehicleAccess:', error);
            if (error.message === 'Vehicle not found') {
                return errorResponse(res, 'Vehicle not found', 404);
            } else if (error.message === 'Vehicle access assignment not found') {
                return errorResponse(res, 'Vehicle access assignment not found', 404);
            } else if (error.message.includes('Access denied')) {
                return errorResponse(res, error.message, 403);
            }
            return errorResponse(res, 'Failed to update vehicle access', 500);
        }
    }

    // NEW: Remove vehicle access
    static async removeVehicleAccess(req, res) {
        try {
            const user = req.user;
            const { imei, userId } = req.body;

            if (!imei || !userId) {
                return errorResponse(res, 'IMEI and user ID are required', 400);
            }

            const vehicleModel = new VehicleModel();

            // Check if user has permission to remove access
            if (user.role.name !== 'Super Admin') {
                const mainUserVehicle = await vehicleModel.getVehicleByImeiWithCompleteData(
                    imei,
                    user.id,
                    user.role.name
                );

                if (!mainUserVehicle || !mainUserVehicle.userVehicle?.isMain) {
                    return errorResponse(res, 'Access denied. Only main user or Super Admin can remove access', 403);
                }
            }

            await vehicleModel.removeVehicleAccess(imei, userId);

            return successResponse(res, null, 'Vehicle access removed successfully');
        } catch (error) {
            console.error('Error in removeVehicleAccess:', error);
            if (error.message === 'Vehicle not found') {
                return errorResponse(res, 'Vehicle not found', 404);
            } else if (error.message === 'Vehicle access assignment not found') {
                return errorResponse(res, 'Vehicle access assignment not found', 404);
            } else if (error.message.includes('Access denied')) {
                return errorResponse(res, error.message, 403);
            }
            return errorResponse(res, 'Failed to remove vehicle access', 500);
        }
    }
}

module.exports = VehicleController;