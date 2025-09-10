const express = require('express');
const router = express.Router();
const RechargeController = require('../controllers/recharge_controller');
const authMiddleware = require('../middleware/auth_middleware');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get all recharges
router.get('/', RechargeController.getAllRecharges);

// Get recharges with pagination
router.get('/paginated', RechargeController.getRechargesWithPagination);

// Get recharge by ID
router.get('/:id', RechargeController.getRechargeById);

// Get recharges by device ID
router.get('/device/:deviceId', RechargeController.getRechargesByDeviceId);

// Get recharge statistics for a device
router.get('/device/:deviceId/stats', RechargeController.getRechargeStats);

// Get total recharge amount for a device
router.get('/device/:deviceId/total', RechargeController.getTotalRecharge);

// Create new recharge
router.post('/', RechargeController.createRecharge);

// Delete recharge (only Super Admin)
router.delete('/:id', RechargeController.deleteRecharge);

module.exports = router;
