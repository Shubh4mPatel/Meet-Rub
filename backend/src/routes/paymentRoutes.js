const express = require('express');
const router = express.Router();
const paymentController = require('../controller/razor-pay-controllers/paymentController');
router.post('/pay-wallet', isClient, paymentController.payFromWallet);
router.post('/create-order', isClient, paymentController.createPaymentOrder);
router.post('/verify', isClient, paymentController.verifyPayment);

// Get transaction details (accessible to client, freelancer, and admin)
router.get('/transactions/:id', paymentController.getTransaction);
router.get('/my-transactions', paymentController.getMyTransactions);

module.exports = router;
