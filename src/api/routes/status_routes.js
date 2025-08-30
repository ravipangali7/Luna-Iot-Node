const express = require('express')
const router = express.Router();
const StatusController = require('../controllers/status_controller');
const { corsMiddleware } = require('../middleware/cors_middleware');

router.use(corsMiddleware);

router.get('/status/:imei', StatusController.getStatusByImei);
router.get('/status/latest/:imei', StatusController.getLatestStatus);
router.get('/status/range/:imei', StatusController.getStatusByDateRange);

module.exports = router;