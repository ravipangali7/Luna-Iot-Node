const express = require('express');
const router = express.Router();
const RechargeController = require('../controllers/recharge_controller');
const AuthMiddleware = require('../middleware/auth_middleware');

// Apply authentication middleware to all routes
router.use((req, res, next) => AuthMiddleware.verifyToken(req, res, next));

// Get recharges with pagination (must come before /:id route)
router.get('/paginated', RechargeController.getRechargesWithPagination);

// Get recharges by device ID
router.get('/device/:deviceId', RechargeController.getRechargesByDeviceId);

// Get recharge statistics for a device
router.get('/device/:deviceId/stats', RechargeController.getRechargeStats);

// Get total recharge amount for a device
router.get('/device/:deviceId/total', RechargeController.getTotalRecharge);

// Get all recharges
router.get('/', RechargeController.getAllRecharges);

// Get recharge by ID (must come after specific routes)
router.get('/:id', RechargeController.getRechargeById);

// Create new recharge
router.post('/', RechargeController.createRecharge);

// Delete recharge (only Super Admin)
router.delete('/:id', RechargeController.deleteRecharge);

module.exports = router;
