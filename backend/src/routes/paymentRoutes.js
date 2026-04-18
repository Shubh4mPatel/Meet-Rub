const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authMiddleware');
const { createPaymentOrder, verifyPayment, getTransaction, getMyTransactions, getCreatorPayments } = require('../controller/razor-pay-controllers/paymentController');


router.post('/create-order', requireRole(['creator']), createPaymentOrder);


router.post('/verify', requireRole(['creator']), verifyPayment);


router.get('/transactions/:id', getTransaction);


router.get('/my-transactions', getMyTransactions);


router.get('/creator/payment-history', requireRole(['creator']), getCreatorPayments);

module.exports = router;
