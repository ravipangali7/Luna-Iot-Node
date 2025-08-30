const express = require('express');
const router = express.Router();
const RoleController = require('../controllers/role_controller');
const AuthMiddleware = require('../middleware/auth_middleware');

// Get all roles
router.get('/roles', AuthMiddleware.verifyToken, RoleController.getAllRoles);

// Get role by ID
router.get('/roles/:id', AuthMiddleware.verifyToken, RoleController.getRoleById);

// Update role permissions (edit only permissions)
router.put('/roles/:id/permissions', AuthMiddleware.verifyToken, RoleController.updateRolePermissions);
router.get('/permissions', AuthMiddleware.verifyToken, RoleController.getAllPermissions);

module.exports = router;