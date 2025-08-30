const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user_controller');
const AuthMiddleware = require('../middleware/auth_middleware');

// List all users
router.get('/users', AuthMiddleware.verifyToken, UserController.getAllUsers);

// Get user by ID
router.get('/user/:phone', UserController.getUserByPhone);

// Create user (admin)
router.post('/user/create', AuthMiddleware.verifyToken, UserController.createUser);
// Update user
router.put('/user/:phone', AuthMiddleware.verifyToken, UserController.updateUser);

// Delete user
router.delete('/user/:phone', AuthMiddleware.verifyToken, UserController.deleteUser);
router.put('/fcm-token', AuthMiddleware.verifyToken, UserController.updateFcmToken);

module.exports = router;