const express = require('express')
const router = express.Router();
const DeviceController = require('../controllers/device_controller');
const { corsMiddleware } = require('../middleware/cors_middleware');

router.use(corsMiddleware);

router.get('/device', DeviceController.getAllDevices);
router.get('/device/:imei', DeviceController.getDeviceByImei);
router.post('/device/create', DeviceController.createDevice);
router.put('/device/update/:imei', DeviceController.updateDevice);
router.delete('/device/delete/:imei', DeviceController.deleteDevice);

// New device assignment routes
router.post('/device/assign', DeviceController.assignDeviceToUser);
router.delete('/device/assign', DeviceController.removeDeviceAssignment);

module.exports = router;