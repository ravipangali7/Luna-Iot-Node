const express = require('express')
const router = express.Router();
const VehicleController = require('../controllers/vehicle_controller');
const { corsMiddleware } = require('../middleware/cors_middleware');

router.use(corsMiddleware);

// Main vehicle endpoints
router.get('/vehicle', VehicleController.getAllVehicles);
router.get('/vehicle/detailed', VehicleController.getAllVehiclesDetailed);
router.get('/vehicle/:imei', VehicleController.getVehicleByImei);
router.post('/vehicle/create', VehicleController.createVehicle);
router.put('/vehicle/update/:imei', VehicleController.updateVehicle);
router.delete('/vehicle/delete/:imei', VehicleController.deleteVehicle);
// Vehicle access routes
router.post('/vehicle/access', VehicleController.assignVehicleAccessToUser);
router.get('/vehicle/access/available', VehicleController.getVehiclesForAccessAssignment);
router.get('/vehicle/:imei/access', VehicleController.getVehicleAccessAssignments);
router.put('/vehicle/access', VehicleController.updateVehicleAccess);
router.delete('/vehicle/access', VehicleController.removeVehicleAccess);

module.exports = router;