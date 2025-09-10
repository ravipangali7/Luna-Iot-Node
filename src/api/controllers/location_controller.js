// src/api/controllers/location_controller.js
const moment = require('moment-timezone');
const LocationModel = require('../../database/models/LocationModel');
const { successResponse, errorResponse } = require('../utils/response_handler');

class LocationController {
    // Get location history by IMEI
    static async getLocationByImei(req, res) {
        try {
            const { imei } = req.params;
            const locationModel = new LocationModel();
            const locations = await locationModel.getDataByImei(imei);

            return successResponse(res, locations, 'Location history retrieved successfully');
        } catch (error) {
            console.error('Error in getLocationByImei:', error);
            return errorResponse(res, 'Failed to retrieve location history', 500);
        }
    }

    // Get latest location by IMEI
    static async getLatestLocation(req, res) {
        try {
            const { imei } = req.params;
            const locationModel = new LocationModel();
            const location = await locationModel.getLatest(imei);

            if (!location) {
                return errorResponse(res, 'No location data found', 404);
            }

            return successResponse(res, location, 'Latest location retrieved successfully');
        } catch (error) {
            console.error('Error in getLatestLocation:', error);
            return errorResponse(res, 'Failed to retrieve latest location', 500);
        }
    }

    // Get location by date range
    static async getLocationByDateRange(req, res) {
        try {
            const { imei } = req.params;
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return errorResponse(res, 'Start date and end date are required', 400);
            }

            const locationModel = new LocationModel();
            const locations = await locationModel.getDataByDateRange(
                imei,
                new Date(startDate),
                new Date(endDate)
            );

            return successResponse(res, locations, 'Location data retrieved successfully');
        } catch (error) {
            console.error('Error in getLocationByDateRange:', error);
            return errorResponse(res, 'Failed to retrieve location data', 500);
        }
    }

    // Get combined history by date range (location + status with ignition off)
    static async getCombinedHistoryByDateRange(req, res) {
        try {
            const { imei } = req.params;
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return errorResponse(res, 'Start date and end date are required', 400);
            }

            // Start date: 12:00:01 AM (beginning of day)
            const start = new Date(startDate);
            // const start = new Date(startDate + 'T12:00:01');
            start.setUTCHours(12, 0, 1, 0);
            // End date: 11:59:59 PM (end of day)  
            const end = new Date(endDate);
            end.setUTCHours(23, 59, 59, 999);
            // const end = new Date(endDate + 'T23:59:59');

            const locationModel = new LocationModel();
            const combinedData = await locationModel.getCombinedHistoryByDateRange(
                imei,
                start,
                end,
            );

            return successResponse(res, combinedData, 'Combined history data retrieved successfully');
        } catch (error) {
            console.error('Error in getCombinedHistoryByDateRange:', error);
            return errorResponse(res, 'Failed to retrieve combined history data', 500);
        }
    }

    // Generate comprehensive report
    static async generateReport(req, res) {
        try {
            const { imei } = req.params;
            const { startDate, endDate } = req.query;

            if (!startDate || !endDate) {
                return errorResponse(res, 'Start date and end date are required', 400);
            }

            // Validate date range (max 3 months)
            const start = new Date(startDate);
            const end = new Date(endDate);
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            if (start < threeMonthsAgo) {
                return errorResponse(res, 'Date range cannot exceed 3 months', 400);
            }

            const locationModel = new LocationModel();
            const reportData = await locationModel.generateReportData(
                imei,
                start,
                end
            );

            return successResponse(res, reportData, 'Report generated successfully');
        } catch (error) {
            console.error('Error in generateReport:', error);
            return errorResponse(res, 'Failed to generate report', 500);
        }
    }
}

module.exports = LocationController;