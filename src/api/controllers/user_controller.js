const UserModel = require('../../database/models/UserModel');
const { successResponse, errorResponse } = require('../utils/response_handler');
const bcrypt = require('bcryptjs');


class UserController {
    static async getAllUsers(req, res) {
        try {
            const users = await UserModel.getAllUsers();
            return successResponse(res, users, 'Users retrieved successfully');
        } catch (error) {
            return errorResponse(res, 'Failed to retrieve users', 500);
        }
    }

    static async getUserByPhone(req, res) {
        try {
            const { phone } = req.params;
            const user = await UserModel.getUserByPhone(phone);
            
            if (!user) {
                return errorResponse(res, 'User not found', 404);
            }
            
            return successResponse(res, user, 'User found');
        } catch (error) {
            console.error('❌ ERROR in getUserByPhone:', error);
            console.error('❌ Error stack:', error.stack);
            return errorResponse(res, 'Internal server error', 500);
        }
    }

    static async createUser(req, res) {
        try {
            const { name, phone, password, roleId, status } = req.body;
            if (!name || !phone || !password || !roleId) {
                return errorResponse(res, 'Missing required fields', 400);
            }
            // Check if user already exists
            const existing = await UserModel.getUserByPhone(phone);
            if (existing) {
                return errorResponse(res, 'User already exists', 400);
            }
            const hashedPassword = await bcrypt.hash(password, 12);
            const user = await UserModel.createUser({
                name,
                phone,
                password: hashedPassword,
                roleId,
                status: status || 'ACTIVE'
            });
            return successResponse(res, user, 'User created successfully', 201);
        } catch (error) {
            return errorResponse(res, 'Failed to create user', 500);
        }
    }

    
static async updateUser(req, res) {
    try {
        const { phone } = req.params;
        const updateData = req.body;
        
        // Fix: Use static methods directly, don't instantiate
        // First check if user exists
        const existingUser = await UserModel.getUserByPhone(phone);
        if (!existingUser) {
            console.log('User not found for phone:', phone);
            return errorResponse(res, 'User not found', 404);
        }
        
        const user = await UserModel.updateUser(phone, updateData);
        return successResponse(res, user, 'User updated successfully');
    } catch (error) {
        console.error('Error in updateUser controller:', error);
        
        // Handle specific Prisma errors
        if (error.code === 'P2025') {
            return errorResponse(res, 'User not found for update', 404);
        }
        
        return errorResponse(res, 'Failed to update user', 500);
    }
}

    static async deleteUser(req, res) {
        try {
            const { phone } = req.params;
            await UserModel.deleteUser(phone);
            return successResponse(res, null, 'User deleted successfully');
        } catch (error) {
            return errorResponse(res, 'Failed to delete user', 500);
        }
    }

    static async updateFcmToken(req, res) {
        try {
            const { phone, fcmToken } = req.body;
            
            if (!phone || !fcmToken) {
                return errorResponse(res, 'Phone number and FCM token are required', 400);
            }
            
            // Fix: Use static methods directly, don't instantiate
            // Check if user exists
            const existingUser = await UserModel.getUserByPhone(phone);
            if (!existingUser) {
                return errorResponse(res, 'User not found', 404);
            }
            
            // Update FCM token
            const user = await UserModel.updateUser(phone, { fcmToken });
            return successResponse(res, { fcmToken: user.fcmToken }, 'FCM token updated successfully');
        } catch (error) {
            console.error('Error in updateFcmToken:', error);
            return errorResponse(res, 'Failed to update FCM token', 500);
        }
    }
}

module.exports = UserController;