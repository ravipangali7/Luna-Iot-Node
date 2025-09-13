const express = require('express');
const router = express.Router();
const UserPermissionController = require('../controllers/user_permission_controller');
const AuthMiddleware = require('../middleware/auth_middleware');

// All routes require authentication
router.use(AuthMiddleware.verifyToken);

// Get all permissions for a user
router.get('/user/:userId/permissions', UserPermissionController.getUserPermissions);

// Get combined permissions (role + direct) for a user
router.get('/user/:userId/combined-permissions', UserPermissionController.getCombinedUserPermissions);

// Assign permission to user
router.post('/user/assign-permission', UserPermissionController.assignPermissionToUser);

// Remove permission from user
router.delete('/user/remove-permission', UserPermissionController.removePermissionFromUser);

// Assign multiple permissions to user
router.post('/user/assign-multiple-permissions', UserPermissionController.assignMultiplePermissionsToUser);

// Remove all permissions from user
router.delete('/user/:userId/permissions', UserPermissionController.removeAllPermissionsFromUser);

// Check if user has specific permission
router.get('/user/:userId/has-permission/:permissionName', UserPermissionController.checkUserPermission);

// Get all available permissions
router.get('/permissions', UserPermissionController.getAllPermissions);

// Get users with specific permission
router.get('/permission/:permissionId/users', UserPermissionController.getUsersWithPermission);

module.exports = router;
