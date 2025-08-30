const express = require('express');
const router = express.Router();
const GeofenceController = require('../controllers/geofence_controller');
const AuthMiddleware = require('../middleware/auth_middleware');
const { corsMiddleware } = require('../middleware/cors_middleware');

router.use(corsMiddleware);

// All geofence routes require authentication
router.use(AuthMiddleware.verifyToken);

// Main geofence endpoints
router.post('/geofence/create', GeofenceController.createGeofence);
router.get('/geofence', GeofenceController.getAllGeofences);
router.get('/geofence/:id', GeofenceController.getGeofenceById);
router.get('/geofence/vehicle/:imei', GeofenceController.getGeofencesByImei);
router.put('/geofence/update/:id', GeofenceController.updateGeofence);
router.delete('/geofence/delete/:id', GeofenceController.deleteGeofence);

module.exports = router;