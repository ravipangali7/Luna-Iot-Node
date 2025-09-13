const UserPermissionModel = require('../../database/models/UserPermissionModel');
const { successResponse, errorResponse } = require('../utils/response_handler');

class UserPermissionController {
    // Get all permissions for a user
    static async getUserPermissions(req, res) {
        try {
            const { userId } = req.params;
            const userPermissionModel = new UserPermissionModel();
            
            const permissions = await userPermissionModel.getUserPermissions(parseInt(userId));
            
            return successResponse(res, permissions, 'User permissions retrieved successfully');
        } catch (error) {
            console.error('Error in getUserPermissions:', error);
            return errorResponse(res, 'Failed to retrieve user permissions', 500);
        }
    }

    // Get combined permissions (role + direct) for a user
    static async getCombinedUserPermissions(req, res) {
        try {
            const { userId } = req.params;
            const userPermissionModel = new UserPermissionModel();
            
            const permissions = await userPermissionModel.getCombinedUserPermissions(parseInt(userId));
            
            return successResponse(res, { permissions }, 'Combined user permissions retrieved successfully');
        } catch (error) {
            console.error('Error in getCombinedUserPermissions:', error);
            return errorResponse(res, 'Failed to retrieve combined user permissions', 500);
        }
    }

    // Assign permission to user
    static async assignPermissionToUser(req, res) {
        try {
            const { userId, permissionId } = req.body;
            
            if (!userId || !permissionId) {
                return errorResponse(res, 'User ID and Permission ID are required', 400);
            }

            const userPermissionModel = new UserPermissionModel();
            const result = await userPermissionModel.assignPermissionToUser(parseInt(userId), parseInt(permissionId));
            
            return successResponse(res, result, 'Permission assigned to user successfully', 201);
        } catch (error) {
            console.error('Error in assignPermissionToUser:', error);
            if (error.code === 'P2002') {
                return errorResponse(res, 'Permission already assigned to user', 400);
            }
            return errorResponse(res, 'Failed to assign permission to user', 500);
        }
    }

    // Remove permission from user
    static async removePermissionFromUser(req, res) {
        try {
            const { userId, permissionId } = req.body;
            
            if (!userId || !permissionId) {
                return errorResponse(res, 'User ID and Permission ID are required', 400);
            }

            const userPermissionModel = new UserPermissionModel();
            const result = await userPermissionModel.removePermissionFromUser(parseInt(userId), parseInt(permissionId));
            
            if (result) {
                return successResponse(res, null, 'Permission removed from user successfully');
            } else {
                return errorResponse(res, 'Permission not found for user', 404);
            }
        } catch (error) {
            console.error('Error in removePermissionFromUser:', error);
            return errorResponse(res, 'Failed to remove permission from user', 500);
        }
    }

    // Assign multiple permissions to user
    static async assignMultiplePermissionsToUser(req, res) {
        try {
            const { userId, permissionIds } = req.body;
            
            if (!userId || !permissionIds || !Array.isArray(permissionIds)) {
                return errorResponse(res, 'User ID and Permission IDs array are required', 400);
            }

            const userPermissionModel = new UserPermissionModel();
            const result = await userPermissionModel.assignMultiplePermissionsToUser(parseInt(userId), permissionIds);
            
            return successResponse(res, result, 'Permissions assigned to user successfully', 201);
        } catch (error) {
            console.error('Error in assignMultiplePermissionsToUser:', error);
            return errorResponse(res, 'Failed to assign permissions to user', 500);
        }
    }

    // Remove all permissions from user
    static async removeAllPermissionsFromUser(req, res) {
        try {
            const { userId } = req.params;
            
            if (!userId) {
                return errorResponse(res, 'User ID is required', 400);
            }

            const userPermissionModel = new UserPermissionModel();
            const count = await userPermissionModel.removeAllPermissionsFromUser(parseInt(userId));
            
            return successResponse(res, { removedCount: count }, 'All permissions removed from user successfully');
        } catch (error) {
            console.error('Error in removeAllPermissionsFromUser:', error);
            return errorResponse(res, 'Failed to remove permissions from user', 500);
        }
    }

    // Check if user has specific permission
    static async checkUserPermission(req, res) {
        try {
            const { userId, permissionName } = req.params;
            
            if (!userId || !permissionName) {
                return errorResponse(res, 'User ID and Permission Name are required', 400);
            }

            const userPermissionModel = new UserPermissionModel();
            const hasPermission = await userPermissionModel.userHasPermission(parseInt(userId), permissionName);
            
            return successResponse(res, { hasPermission }, 'Permission check completed successfully');
        } catch (error) {
            console.error('Error in checkUserPermission:', error);
            return errorResponse(res, 'Failed to check user permission', 500);
        }
    }

    // Get all available permissions
    static async getAllPermissions(req, res) {
        try {
            const userPermissionModel = new UserPermissionModel();
            const permissions = await userPermissionModel.getAllPermissions();
            
            return successResponse(res, permissions, 'All permissions retrieved successfully');
        } catch (error) {
            console.error('Error in getAllPermissions:', error);
            return errorResponse(res, 'Failed to retrieve permissions', 500);
        }
    }

    // Get users with specific permission
    static async getUsersWithPermission(req, res) {
        try {
            const { permissionId } = req.params;
            
            if (!permissionId) {
                return errorResponse(res, 'Permission ID is required', 400);
            }

            const userPermissionModel = new UserPermissionModel();
            const users = await userPermissionModel.getUsersWithPermission(parseInt(permissionId));
            
            return successResponse(res, users, 'Users with permission retrieved successfully');
        } catch (error) {
            console.error('Error in getUsersWithPermission:', error);
            return errorResponse(res, 'Failed to retrieve users with permission', 500);
        }
    }
}

module.exports = UserPermissionController;
