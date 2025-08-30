// src/api/controllers/status_controller.js
const StatusModel = require('../../database/models/StatusModel');
const { successResponse, errorResponse } = require('../utils/response_handler');

class StatusController {
    // Get status history by IMEI
    static async getStatusByImei(req, res) {
        try {
            const { imei } = req.params;
            const statusModel = new StatusModel();
            const statuses = await statusModel.getDataByImei(imei);
            
            return successResponse(res, statuses, 'Status history retrieved successfully');
        } catch (error) {
            console.error('Error in getStatusByImei:', error);
            return errorResponse(res, 'Failed to retrieve status history', 500);
        }
    }

    // Get latest status by IMEI
    static async getLatestStatus(req, res) {
        try {
            const { imei } = req.params;
            const statusModel = new StatusModel();
            const status = await statusModel.getLatest(imei);
            
            if (!status) {
                return errorResponse(res, 'No status data found', 404);
            }
            
            return successResponse(res, status, 'Latest status retrieved successfully');
        } catch (error) {
            console.error('Error in getLatestStatus:', error);
            return errorResponse(res, 'Failed to retrieve latest status', 500);
        }
    }

    // Get status by date range
    static async getStatusByDateRange(req, res) {
        try {
            const { imei } = req.params;
            const { startDate, endDate } = req.query;
            
            if (!startDate || !endDate) {
                return errorResponse(res, 'Start date and end date are required', 400);
            }
            
            const statusModel = new StatusModel();
            const statuses = await statusModel.getDataByDateRange(
                imei, 
                new Date(startDate), 
                new Date(endDate)
            );
            
            return successResponse(res, statuses, 'Status data retrieved successfully');
        } catch (error) {
            console.error('Error in getStatusByDateRange:', error);
            return errorResponse(res, 'Failed to retrieve status data', 500);
        }
    }
}

module.exports = StatusController;