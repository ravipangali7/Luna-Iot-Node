const RoleModel = require('../../database/models/RoleModel');
const PermissionModel = require('../../database/models/PermissionModel');
const { successResponse, errorResponse } = require('../utils/response_handler');

class RoleController {
    static async getAllRoles(req, res) {
        try {
            const roleModel = new RoleModel();
            const roles = await roleModel.getAllRoles();
            return successResponse(res, roles, 'Roles retrieved successfully');
        } catch (error) {
            return errorResponse(res, 'Failed to retrieve roles', 500);
        }
    }

    static async getAllPermissions(req, res) {
        try {
            const permissionModel = new PermissionModel();
            const permissions = await permissionModel.getAllPermissions();
            return successResponse(res, permissions, 'Permissions retrieved successfully');
        } catch (error) {
            return errorResponse(res, 'Failed to retrieve permissions', 500);
        }
    }
    
    static async getRoleById(req, res) {
        try {
            const { id } = req.params;
            const roleModel = new RoleModel();
            const role = await roleModel.getRoleById(Number(id));
            if (!role) {
                return errorResponse(res, 'Role not found', 404);
            }
            return successResponse(res, role, 'Role retrieved successfully');
        } catch (error) {
            return errorResponse(res, 'Failed to retrieve role', 500);
        }
    }

    static async updateRolePermissions(req, res) {
        try {
            const { id } = req.params;
            const { permissionIds } = req.body; // Array of permission IDs
            const roleModel = new RoleModel();
            const updatedRole = await roleModel.updateRolePermissions(Number(id), permissionIds);
            return successResponse(res, updatedRole, 'Role permissions updated successfully');
        } catch (error) {
            return errorResponse(res, 'Failed to update role permissions', 500);
        }
    }

    // Permission Management Methods
    static async createPermission(req, res) {
        try {
            const { name, description } = req.body;
            
            if (!name || name.trim() === '') {
                return errorResponse(res, 'Permission name is required', 400);
            }

            const permissionModel = new PermissionModel();
            const permission = await permissionModel.createPermission({
                name: name.trim(),
                description: description?.trim() || null
            });
            
            return successResponse(res, permission, 'Permission created successfully');
        } catch (error) {
            console.error('Error creating permission:', error);
            if (error.code === 'P2002') {
                return errorResponse(res, 'Permission with this name already exists', 409);
            }
            return errorResponse(res, 'Failed to create permission', 500);
        }
    }

    static async updatePermission(req, res) {
        try {
            const { id } = req.params;
            const { name, description } = req.body;
            
            if (!name || name.trim() === '') {
                return errorResponse(res, 'Permission name is required', 400);
            }

            const permissionModel = new PermissionModel();
            const permission = await permissionModel.updatePermission(Number(id), {
                name: name.trim(),
                description: description?.trim() || null
            });
            
            return successResponse(res, permission, 'Permission updated successfully');
        } catch (error) {
            console.error('Error updating permission:', error);
            if (error.code === 'P2002') {
                return errorResponse(res, 'Permission with this name already exists', 409);
            }
            if (error.code === 'P2025') {
                return errorResponse(res, 'Permission not found', 404);
            }
            return errorResponse(res, 'Failed to update permission', 500);
        }
    }

    static async deletePermission(req, res) {
        try {
            const { id } = req.params;
            const permissionModel = new PermissionModel();
            await permissionModel.deletePermission(Number(id));
            return successResponse(res, null, 'Permission deleted successfully');
        } catch (error) {
            console.error('Error deleting permission:', error);
            if (error.code === 'P2025') {
                return errorResponse(res, 'Permission not found', 404);
            }
            return errorResponse(res, 'Failed to delete permission', 500);
        }
    }

    static async getPermissionById(req, res) {
        try {
            const { id } = req.params;
            const permissionModel = new PermissionModel();
            const permission = await permissionModel.getPermissionById(Number(id));
            
            if (!permission) {
                return errorResponse(res, 'Permission not found', 404);
            }
            
            return successResponse(res, permission, 'Permission retrieved successfully');
        } catch (error) {
            console.error('Error fetching permission:', error);
            return errorResponse(res, 'Failed to retrieve permission', 500);
        }
    }
}

module.exports = RoleController;