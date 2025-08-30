const express = require('express');
const router = express.Router();
const RelayController = require('../controllers/relay_controller');
const AuthMiddleware = require('../middleware/auth_middleware');
const { corsMiddleware } = require('../middleware/cors_middleware');

router.use(corsMiddleware);
router.use(AuthMiddleware.verifyToken);

// Relay control endpoints
router.post('/relay/on', RelayController.turnRelayOn);
router.post('/relay/off', RelayController.turnRelayOff);
router.get('/relay/status/:imei', RelayController.getRelayStatus);

// Debug endpoint
router.get('/debug/connections', RelayController.debugDeviceConnections);

module.exports = router;