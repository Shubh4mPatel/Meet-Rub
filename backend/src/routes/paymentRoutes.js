const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authMiddleware');
const { createPaymentOrder, verifyPayment, getTransaction } = require('../controller/razor-pay-controllers/paymentController');


router.post('/create-order', requireRole(['creator']), createPaymentOrder);


router.post('/verify', requireRole(['creator']), verifyPayment);


router.get('/transactions/:id', getTransaction);





module.exports = router;
