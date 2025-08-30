const PopupModel = require('../../database/models/PopupModel');
const { successResponse, errorResponse } = require('../utils/response_handler');
const fs = require('fs');
const path = require('path');

class PopupController {
    // Get all active popups (public endpoint)
    static async getActivePopups(req, res) {
        try {
            const popupModel = new PopupModel();
            const popups = await popupModel.getActivePopups();

            // Add full image URLs to popups
            const popupsWithImages = popups.map(popup => ({
                ...popup,
                imageUrl: popup.image ? `http://84.247.131.246:7070/uploads/popups/${popup.image}` : null
            }));

            return successResponse(res, popupsWithImages, 'Active popups retrieved successfully');
        } catch (error) {
            console.error('Error in getActivePopups: ', error);
            return errorResponse(res, 'Failed to retrieve popups', 500);
        }
    }

    // Get all popups (only Super Admin)
    static async getAllPopups(req, res) {
        try {
            const user = req.user;

            // Only Super Admin can view all popups
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can view all popups', 403);
            }

            const popupModel = new PopupModel();
            const popups = await popupModel.getAllPopups();

            // Add full image URLs to popups
            const popupsWithImages = popups.map(popup => ({
                ...popup,
                imageUrl: popup.image ? `http://84.247.131.246:7070/uploads/popups/${popup.image}` : null
            }));

            return successResponse(res, popupsWithImages, 'All popups retrieved successfully');
        } catch (error) {
            console.error('Error in getAllPopups: ', error);
            return errorResponse(res, 'Failed to retrieve popups', 500);
        }
    }

    // Get popup by ID (only Super Admin)
    static async getPopupById(req, res) {
        try {
            const { id } = req.params;
            const user = req.user;
            // Only Super Admin can view popup details
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can view popup details', 403);
            }

            const popupModel = new PopupModel();
            const popup = await popupModel.getPopupById(id);

            if (!popup) {
                return errorResponse(res, 'Popup not found', 404);
            }

            // Add full image URL
            const popupWithImage = {
                ...popup,
                imageUrl: popup.image ? `http://84.247.131.246:7070/uploads/popups/${popup.image}` : null
            };

            return successResponse(res, popupWithImage, 'Popup retrieved successfully');
        } catch (error) {
            console.error('Error in getPopupById: ', error);
            return errorResponse(res, 'Failed to retrieve popup', 500);
        }
    }

    // Create new popup (only Super Admin)
    static async createPopup(req, res) {
        try {
            const user = req.user;

            // Only Super Admin can create popups
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can create popups', 403);
            }

            const popupData = {
                title: req.body.title,
                message: req.body.message,
                isActive: req.body.isActive !== undefined ? req.body.isActive === 'true' : true,
                image: req.file ? req.file.filename : null
            };

            const popupModel = new PopupModel();
            const popup = await popupModel.createPopup(popupData);

            // Add full image URL
            const popupWithImage = {
                ...popup,
                imageUrl: popup.image ? `http://84.247.131.246:7070/uploads/popups/${popup.image}` : null
            };

            return successResponse(res, popupWithImage, 'Popup created successfully', 201);
        } catch (error) {
            console.error('Error in createPopup:', error);
            return errorResponse(res, 'Failed to create popup', 500);
        }
    }

    // Update popup (only Super Admin)
    static async updatePopup(req, res) {
        try {
            const { id } = req.params;
            const user = req.user;

            // Only Super Admin can update popups
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can update popups', 403);
            }

            const updateData = {
                title: req.body.title,
                message: req.body.message,
                isActive: req.body.isActive !== undefined ? req.body.isActive === 'true' : undefined
            };

            // Handle image update
            if (req.file) {
                // Get current popup to delete old image
                const popupModel = new PopupModel();
                const currentPopup = await popupModel.getPopupById(id);

                if (currentPopup && currentPopup.image) {
                    // Delete old image file
                    const oldImagePath = path.join(__dirname, '../../../uploads/popups', currentPopup.image);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }

                updateData.image = req.file.filename;
            }

            const popupModel = new PopupModel();
            const popup = await popupModel.updatePopup(id, updateData);

            // Add full image URL
            const popupWithImage = {
                ...popup,
                imageUrl: popup.image ? `${req.protocol}://${req.protocol}://${req.get('host')}/uploads/popups/${popup.image}` : null
            };

            return successResponse(res, popupWithImage, 'Popup updated successfully');
        } catch (error) {
            console.error('Error in updatePopup:', error);
            return errorResponse(res, 'Failed to update popup', 500);
        }
    }

    // Delete popup (only Super Admin)
    static async deletePopup(req, res) {
        try {
            const { id } = req.params;
            const user = req.user;

            // Only Super Admin can delete popups
            if (user.role.name !== 'Super Admin') {
                return errorResponse(res, 'Access denied. Only Super Admin can delete popups', 403);
            }
            

            // Get popup to delete associated image
            const popupModel = new PopupModel();
            const popup = await popupModel.getPopupById(id);

            if (!popup) {
                return errorResponse(res, 'Popup not found', 404);
            }

            if (popup && popup.image) {
                try {
                    const imagePath = path.join(__dirname, '../../../uploads/popups', popup.image);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                } catch (imageError) {
                    console.error('Error deleting image file:', imageError);
                    // Continue with popup deletion even if image deletion fails
                }
            }
            const deleteResult = await popupModel.deletePopup(id);
        
            if (deleteResult) {
                return successResponse(res, { success: true }, 'Popup deleted successfully');
            } else {
                return errorResponse(res, 'Failed to delete popup', 500);
            }
        } catch (error) {
            console.error('Error in deletePopup:', error);
            return errorResponse(res, 'Failed to delete popup', 500);
        }
    }
}

module.exports = PopupController;