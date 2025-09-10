const express = require('express');
const router = express.Router();
const RechargeController = require('../controllers/recharge_controller');
const AuthMiddleware = require('../middleware/auth_middleware');


// Get recharges with pagination (must come before /:id route)
router.get('/recharge/paginated', RechargeController.getRechargesWithPagination);

// Get recharges by device ID
router.get('/recharge/device/:deviceId', RechargeController.getRechargesByDeviceId);

// Get recharge statistics for a device
router.get('/recharge/device/:deviceId/stats', RechargeController.getRechargeStats);

// Get total recharge amount for a device
router.get('/recharge/device/:deviceId/total', RechargeController.getTotalRecharge);

// Get all recharges
router.get('/recharge/', RechargeController.getAllRecharges);

// Get recharge by ID (must come after specific routes)
router.get('/recharge/:id', RechargeController.getRechargeById);

// Create new recharge
router.post('/recharge/', RechargeController.createRecharge);

// Delete recharge (only Super Admin)
router.delete('/recharge/:id', RechargeController.deleteRecharge);

module.exports = router;
