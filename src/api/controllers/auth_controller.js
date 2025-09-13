const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../../database/prisma');
const { successResponse, errorResponse } = require('../utils/response_handler');
const OtpModel = require('../../database/models/OtpModel');
const smsService = require('../../utils/sms_service');


class AuthController {
    // Generate random token
    static generateToken() {
        return crypto.randomBytes(64).toString('hex');
    }

    // Generate OTP
    static generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
    
    // Get Current User
    static async getCurrentUser(req, res) {
        try {
            const userId = req.user.id;
            
            const user = await prisma.getClient().user.findUnique({
                where: { id: userId },
                include: {
                    role: true,
                    userPermissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            });

            if (!user) {
                return errorResponse(res, 'User not found', 404);
            }

            // Get only direct user permissions (ignore role permissions as requested)
            const directPermissions = user.userPermissions.map(up => up.permission.name);
            
            return successResponse(res, 'User data retrieved successfully', {
                id: user.id,
                name: user.name,
                phone: user.phone,
                status: user.status,
                role: user.role.name,
                permissions: directPermissions, // Only direct user permissions
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            });
        } catch (error) {
            return errorResponse(res, error.message, 500);
        }
    }

    // Send OTP for registration
    static async sendRegistrationOTP(req, res) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return errorResponse(res, 'Phone number is required', 400);
            }

            // Check if user already exists
            const existingUser = await prisma.getClient().user.findUnique({
                where: { phone }
            });

            if (existingUser) {
                return errorResponse(res, 'User already exists', 400);
            }

            // Generate OTP
            const otp = AuthController.generateOTP();
            
            const otpModel = new OtpModel();

            // Save OTP to database
            await otpModel.createOTP(phone, otp);

            // Send SMS
            const smsResult = await smsService.sendOTP(phone, otp);

            if (smsResult.success) {
                return successResponse(res, 'OTP sent successfully', {
                    phone: phone,
                    message: 'OTP sent to your phone number'
                });
            } else {
                return errorResponse(res, 'Failed to send OTP', 500);
            }
        } catch (error) {
            console.error('Send OTP error:', error);
            return errorResponse(res, error.message, 500);
        }
    }


     // Verify OTP and register user
     static async verifyOTPAndRegister(req, res) {
        try {
            const { name, phone, password, otp } = req.body;
    
            if (!name || !phone || !password || !otp) {
                return errorResponse(res, 'All fields are required', 400);
            }
    
            // Check if user already exists
            const existingUser = await prisma.getClient().user.findUnique({
                where: { phone: phone.trim() }
            });
    
            if (existingUser) {
                return errorResponse(res, 'User already exists', 400);
            }
    
            // Verify OTP with better error handling
            const otpModel = new OtpModel();
            let otpRecord;
            
            try {
                otpRecord = await otpModel.verifyOTP(phone.trim(), otp);
            } catch (otpError) {
                console.error('OTP verification error:', otpError);
                return errorResponse(res, 'OTP verification failed', 400);
            }
    
            if (!otpRecord) {
                return errorResponse(res, 'Invalid or expired OTP', 400);
            }
    
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 12);
    
            // Generate token
            const token = AuthController.generateToken();
    
            // Get default role
            const defaultRole = await prisma.getClient().role.findFirst({
                where: { name: 'Customer' }
            });
    
            if (!defaultRole) {
                return errorResponse(res, 'Default role not found', 500);
            }
    
            // Create user
            const user = await prisma.getClient().user.create({
                data: {
                    name: name.trim(),
                    phone: phone.trim(),
                    password: hashedPassword,
                    token,
                    roleId: defaultRole.id
                },
                include: {
                    role: true
                }
            });
    
            // Delete OTP after successful registration
            await otpModel.deleteOTP(phone.trim());
    
            // Send response immediately after user creation
            return successResponse(res, 'User registered successfully', {
                id: user.id,
                name: user.name,
                phone: user.phone,
                token: user.token,
                role: user.role.name
            });
        } catch (error) {
            console.error('Registration error:', error);
            // Provide more specific error messages
            if (error.code === 'P2002') {
                return errorResponse(res, 'User with this phone number already exists', 400);
            } else if (error.code === 'P2025') {
                return errorResponse(res, 'Database operation failed', 500);
            } else {
                return errorResponse(res, `Registration failed: ${error.message}`, 500);
            }
        }
    }

    // Resend OTP
    static async resendOTP(req, res) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return errorResponse(res, 'Phone number is required', 400);
            }

            // Check if user already exists
            const existingUser = await prisma.getClient().user.findUnique({
                where: { phone }
            });

            if (existingUser) {
                return errorResponse(res, 'User already exists', 400);
            }

            // Generate new OTP
            const otp = AuthController.generateOTP();
            const otpModel = new OtpModel();

            // Save new OTP to database
            await otpModel.createOTP(phone, otp);

            // Send SMS
            const smsResult = await smsService.sendOTP(phone, otp);

            if (smsResult.success) {
                return successResponse(res, 'OTP resent successfully', {
                    phone: phone,
                    message: 'New OTP sent to your phone number'
                });
            } else {
                return errorResponse(res, 'Failed to send OTP', 500);
            }
        } catch (error) {
            console.error('Resend OTP error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    // User login
    static async login(req, res) {
        try {
            const { phone, password } = req.body;

            // Find user by phone
            const user = await prisma.getClient().user.findUnique({
                where: { phone },
                include: {
                    role: true
                }
            });

            if (!user) {
                return errorResponse(res, 'User not found', 404);
            }

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return errorResponse(res, 'Invalid credentials', 401);
            }

            // Generate new token and update user
            const token = AuthController.generateToken();
            await prisma.getClient().user.update({
                where: { id: user.id },
                data: {
                    token,
                }
            });

            return successResponse(res, 'Login successful', {
                id: user.id,
                name: user.name,
                phone: user.phone,
                token,
                role: user.role.name
            });
        } catch (error) {
            return errorResponse(res, error.message, 500);
        }
    }

    // User logout
    static async logout(req, res) {
        try {
            const userId = req.user.id;
            await prisma.getClient().user.update({
                where: { id: userId },
                data: { token: null }
            });
            return successResponse(res, 'Logout successful');
        } catch (error) {
            return errorResponse(res, error.message, 500);
        }
    }

    // Send OTP for forgot password
    static async sendForgotPasswordOTP(req, res) {
        try {
            const { phone } = req.body;

            if (!phone) {
                return errorResponse(res, 'Phone number is required', 400);
            }

            // Check if user exists
            const existingUser = await prisma.getClient().user.findUnique({
                where: { phone }
            });

            if (!existingUser) {
                return errorResponse(res, 'User not found with this phone number', 404);
            }

            // Generate OTP
            const otp = AuthController.generateOTP();
            const otpModel = new OtpModel();

            // Save OTP to database
            await otpModel.createOTP(phone, otp);

            // Send SMS
            const smsResult = await smsService.sendOTP(phone, otp);

            if (smsResult.success) {
                return successResponse(res, 'OTP sent successfully', {
                    phone: phone,
                    message: 'OTP sent to your phone number'
                });
            } else {
                return errorResponse(res, 'Failed to send OTP', 500);
            }
        } catch (error) {
            console.error('Send forgot password OTP error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    // Verify OTP for forgot password
    static async verifyForgotPasswordOTP(req, res) {
        try {
            const { phone, otp } = req.body;

            if (!phone || !otp) {
                return errorResponse(res, 'Phone number and OTP are required', 400);
            }

            // Check if user exists
            const existingUser = await prisma.getClient().user.findUnique({
                where: { phone }
            });

            if (!existingUser) {
                return errorResponse(res, 'User not found', 404);
            }

            // Verify OTP
            const otpModel = new OtpModel();
            const otpRecord = await otpModel.verifyOTP(phone, otp);

            if (!otpRecord) {
                return errorResponse(res, 'Invalid or expired OTP', 400);
            }

            // Generate reset token (valid for 10 minutes)
            const resetToken = AuthController.generateToken();
            
            // Store reset token in user record (you might want to add a resetToken field to User model)
            await prisma.getClient().user.update({
                where: { phone },
                data: { 
                    token: resetToken,
                    updatedAt: new Date()
                }
            });

            return successResponse(res, 'OTP verified successfully', {
                phone: phone,
                resetToken: resetToken
            });
        } catch (error) {
            console.error('Verify forgot password OTP error:', error);
            return errorResponse(res, error.message, 500);
        }
    }

    // Reset password
    static async resetPassword(req, res) {
        try {
            const { phone, resetToken, newPassword } = req.body;

            if (!phone || !resetToken || !newPassword) {
                return errorResponse(res, 'Phone number, reset token, and new password are required', 400);
            }

            // Check if user exists
            const existingUser = await prisma.getClient().user.findUnique({
                where: { phone }
            });

            if (!existingUser) {
                return errorResponse(res, 'User not found', 404);
            }

            // Verify reset token
            if (existingUser.token !== resetToken) {
                return errorResponse(res, 'Invalid reset token', 400);
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(newPassword, 12);

            // Generate new token
            const newToken = AuthController.generateToken();

            // Update user with new password and token
            const updatedUser = await prisma.getClient().user.update({
                where: { phone },
                data: {
                    password: hashedPassword,
                    token: newToken,
                    updatedAt: new Date()
                },
                include: {
                    role: true
                }
            });

            // Delete OTP after successful password reset
            const otpModel = new OtpModel();
            await otpModel.deleteOTP(phone);

            return successResponse(res, 'Password reset successfully', {
                id: updatedUser.id,
                name: updatedUser.name,
                phone: updatedUser.phone,
                token: updatedUser.token,
                role: updatedUser.role.name
            });
        } catch (error) {
            console.error('Reset password error:', error);
            return errorResponse(res, error.message, 500);
        }
    }
}


module.exports = AuthController;