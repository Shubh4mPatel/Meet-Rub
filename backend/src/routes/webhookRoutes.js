const express = require('express');
const router = express.Router();
const webhookController = require('../controller/razor-pay-controllers/webhookController');


router.post('/razorpay', webhookController.handleWebhook.bind(webhookController));

module.exports = router;
