const express = require('express');
const router = express.Router();
const webhookController = require('../controller/razor-pay-controllers/webhookController');

/**
 * @swagger
 * /webhooks/razorpay:
 *   post:
 *     summary: Razorpay webhook handler
 *     description: Handle Razorpay webhook events for payment and payout status updates. This endpoint is called by Razorpay servers and verified using webhook signature. No authentication required as verification is done via Razorpay signature.
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 description: Type of Razorpay event
 *                 example: payment.captured
 *               payload:
 *                 type: object
 *                 description: Event payload containing payment/payout details
 *                 properties:
 *                   payment:
 *                     type: object
 *                   payout:
 *                     type: object
 *           example:
 *             event: payment.captured
 *             payload:
 *               payment:
 *                 entity:
 *                   id: pay_XXXXXXXXXXXXXX
 *                   amount: 100000
 *                   currency: INR
 *                   status: captured
 *                   order_id: order_YYYYYYYYYY
 *                   method: card
 *                   captured: true
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *             example:
 *               status: ok
 *       400:
 *         description: Invalid webhook signature or malformed request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               invalidSignature:
 *                 value:
 *                   error: Invalid webhook signature
 *               malformedRequest:
 *                 value:
 *                   error: Malformed webhook request
 *       500:
 *         description: Internal server error while processing webhook
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Webhook processing failed
 */
router.post('/razorpay', webhookController.handleWebhook.bind(webhookController));

module.exports = router;
