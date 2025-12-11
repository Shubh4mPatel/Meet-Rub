const express = require('express');
const router = express.Router();
const webhookController = require('../controller/razor-pay-controllers/webhookController');
// Webhook endpoint (no authentication - verified by signature)
router.post('/razorpay', webhookController.handleWebhook.bind(webhookController));

module.exports = router;
