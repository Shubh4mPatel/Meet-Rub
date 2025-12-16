const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authMiddleware');
const {payFromWallet,createPaymentOrder,verifyPayment,getTransaction,getMyTransactions} = require('../controller/razor-pay-controllers/paymentController');

router.post('/pay-wallet',  requireRole(['creator']), payFromWallet);
router.post('/create-order',  requireRole(['creator']), createPaymentOrder);
router.post('/verify',  requireRole(['creator']), verifyPayment);

// Get transaction details (accessible to client, freelancer, and admin)
router.get('/transactions/:id', getTransaction);
router.get('/my-transactions', getMyTransactions);

module.exports = router;
