const prisma = require('../prisma')
const datetimeService = require('../../utils/datetime_service');

class PopupModel {
    // Create new popup
    async createPopup(data) {
        try {
        const nepalTime = datetimeService.nepalTimeDate();
        const popup = await prisma.getClient().popup.create({
                data: {
                    title: data.title,
                    message: data.message,
                    image: data.image || null,
                    isActive: data.isActive !== undefined ? data.isActive : true,
                    createdAt: nepalTime,
                    updatedAt: nepalTime
                }
            });
            return popup;
        } catch (error) {
            console.error('POPUP CREATION ERROR', error);
            throw error;
        }
    }

    // Get all active popups
    async getActivePopups() {
        try {
            return await prisma.getClient().popup.findMany({
                where: { isActive: true },
                orderBy: { createdAt: 'desc' }
            });
        } catch (error) {
            console.error('ERROR FETCHING ACTIVE POPUPS: ', error);
            throw error;
        }
    }

    // Get all popups (for admin)
    async getAllPopups() {
        try {
            return await prisma.getClient().popup.findMany({
                orderBy: { createdAt: 'desc' }
            });
        } catch (error) {
            console.error('ERROR FETCHING ALL POPUPS: ', error);
            throw error;
        }
    }

    // Get popup by ID
    async getPopupById(id) {
        try {
            const popup = await prisma.getClient().popup.findUnique({ 
                where: { id: parseInt(id) } 
            });
            return popup;
        } catch (error) {
            console.error('POPUP FETCH ERROR', error);
            throw error;
        }
    }

    // Update popup
    async updatePopup(id, data) {
        const nepalTime = datetimeService.nepalTimeDate();
        try {
            const popup = await prisma.getClient().popup.update({
                where: { id: parseInt(id) },
                data: {
                    title: data.title,
                    message: data.message,
                    image: data.image,
                    isActive: data.isActive,
                    updatedAt: nepalTime
                }
            });
            return popup;
        } catch (error) {
            console.error('POPUP UPDATE ERROR', error);
            throw error;
        }
    }

    // Delete popup
    async deletePopup(id) {
        try {
            await prisma.getClient().popup.delete({
                where: { id: parseInt(id) }
            });
            return true;
        } catch (error) {
            console.error('POPUP DELETE ERROR', error);
            throw error;
        }
    }
}

module.exports = PopupModel;