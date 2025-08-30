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
}

module.exports = RoleController;