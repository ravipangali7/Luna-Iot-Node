const express = require('express');
const router = express.Router();
const BloodDonationController = require('../controllers/blood_donation_controller');
const { corsMiddleware } = require('../middleware/cors_middleware');

router.use(corsMiddleware);

// Blood donation routes
router.get('/blood-donation', BloodDonationController.getAllBloodDonations);
router.get('/blood-donation/:id', BloodDonationController.getBloodDonationById);
router.post('/blood-donation/create', BloodDonationController.createBloodDonation);
router.put('/blood-donation/update/:id', BloodDonationController.updateBloodDonation);
router.delete('/blood-donation/delete/:id', BloodDonationController.deleteBloodDonation);

// Filtered routes
router.get('/blood-donation/type/:type', BloodDonationController.getBloodDonationsByType);
router.get('/blood-donation/blood-group/:bloodGroup', BloodDonationController.getBloodDonationsByBloodGroup);

module.exports = router;
