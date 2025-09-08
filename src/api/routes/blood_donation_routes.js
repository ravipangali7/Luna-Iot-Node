const express = require('express');
const router = express.Router();
const BloodDonationController = require('../controllers/blood_donation_controller');
const { corsMiddleware } = require('../middleware/cors_middleware');

// Add body parsing middleware specifically for this router
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.use(corsMiddleware);

// Blood donation routes
router.get('/blood-donation', BloodDonationController.getAllBloodDonations);
router.get('/blood-donation/:id', BloodDonationController.getBloodDonationById);
router.post('/blood-donation/create', (req, res, next) => {
    console.log('POST /blood-donation/create - Request received');
    console.log('Body:', req.body);
    console.log('Headers:', req.headers);
    next();
}, BloodDonationController.createBloodDonation);
router.put('/blood-donation/update/:id', BloodDonationController.updateBloodDonation);
router.delete('/blood-donation/delete/:id', BloodDonationController.deleteBloodDonation);

// Filtered routes
router.get('/blood-donation/type/:type', BloodDonationController.getBloodDonationsByType);
router.get('/blood-donation/blood-group/:bloodGroup', BloodDonationController.getBloodDonationsByBloodGroup);

module.exports = router;
