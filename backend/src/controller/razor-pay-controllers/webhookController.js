const crypto = require('crypto');
const {pool:db} = require('../../../config/dbConfig');
const payoutService = require('../../razor-pay-services/payoutService');
const AppError = require("../../../utils/appError");

// Verify Razorpay webhook signature
const verifyWebhookSignature = (body, signature) => {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');

  return expectedSignature === signature;
}

// Handle payment captured event
const handlePaymentCaptured = async (payload) => {
  const payment = payload.payment.entity;
  const orderId = payment.order_id;

  console.log('Payment captured:', payment.id, 'for order:', orderId);

  // Update order status if needed
  await db.query(
    'UPDATE razorpay_orders SET status = "PAID" WHERE razorpay_order_id = ?',
    [orderId]
  );

  // Additional processing can be added here if needed
}

// Handle payment failed event
const handlePaymentFailed = async (payload) => {
  const payment = payload.payment.entity;
  const orderId = payment.order_id;

  console.log('Payment failed:', payment.id, 'for order:', orderId);

  // Update order status
  await db.query(
    'UPDATE razorpay_orders SET status = "FAILED" WHERE razorpay_order_id = ?',
    [orderId]
  );

  // Update transaction status if it's a service payment
  await db.query(
    'UPDATE transactions SET status = "FAILED" WHERE razorpay_order_id = ?',
    [orderId]
  );
}

// Handle payout processed event
const handlePayoutProcessed = async (payload) => {
  const payout = payload.payout.entity;

  console.log('Payout processed:', payout.id);

  await payoutService.updatePayoutStatus(payout.id, 'processed', payout.utr);
}

// Handle payout failed event
const handlePayoutFailed = async (payload) => {
  const payout = payload.payout.entity;

  console.log('Payout failed:', payout.id);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Update payout status
    await payoutService.updatePayoutStatus(payout.id, 'failed');

    // Update failure reason
    await connection.query(
      'UPDATE payouts SET failure_reason = ? WHERE razorpay_payout_id = ?',
      [payout.status_details?.reason || 'Unknown error', payout.id]
    );

    // Optionally: Refund to client wallet or mark for manual processing
    // This depends on your business logic

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Handle payout reversed event
const handlePayoutReversed = async (payload) => {
  const payout = payload.payout.entity;

  console.log('Payout reversed:', payout.id);

  await payoutService.updatePayoutStatus(payout.id, 'reversed', payout.utr);
}

// Handle Razorpay webhooks
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      return next(new AppError('Missing signature', 400));
    }

    // Verify signature
    if (!verifyWebhookSignature(req.body, signature)) {
      return next(new AppError('Invalid signature', 400));
    }

    const event = req.body.event;
    const payload = req.body.payload;

    // Log webhook
    await db.query(
      `INSERT INTO webhook_logs (event_type, razorpay_event_id, payload)
       VALUES (?, ?, ?)`,
      [event, req.body.id || null, JSON.stringify(req.body)]
    );

    // Handle different event types
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;

      case 'payout.processed':
        await handlePayoutProcessed(payload);
        break;

      case 'payout.failed':
        await handlePayoutFailed(payload);
        break;

      case 'payout.reversed':
        await handlePayoutReversed(payload);
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    // Update webhook log as processed
    await db.query(
      'UPDATE webhook_logs SET processed = TRUE WHERE razorpay_event_id = ?',
      [req.body.id]
    );

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook handling error:', error);

    // Log error
    await db.query(
      'UPDATE webhook_logs SET error_message = ? WHERE razorpay_event_id = ?',
      [error.message, req.body.id]
    );

    return next(new AppError('Webhook processing failed', 500));
  }
}

module.exports = {
  handleWebhook
}
