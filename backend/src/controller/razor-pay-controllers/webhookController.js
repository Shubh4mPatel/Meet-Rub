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
    `UPDATE razorpay_orders SET status = 'PAID' WHERE razorpay_order_id = $1`,
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
    `UPDATE razorpay_orders SET status = 'FAILED' WHERE razorpay_order_id = $1`,
    [orderId]
  );

  // Update transaction status if it's a service payment
  await db.query(
    `UPDATE transactions SET status = 'FAILED' WHERE razorpay_order_id = $1`,
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

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Get payout details to refund earnings_balance
    const { rows: payouts } = await client.query(
      `SELECT po.amount, f.freelancer_id AS f_id
       FROM payouts po
       JOIN users u ON po.freelancer_id = u.id
       JOIN freelancer f ON f.user_id = u.id
       WHERE po.razorpay_payout_id = $1`,
      [payout.id]
    );

    // Update payout status and failure reason
    await client.query(
      `UPDATE payouts SET status = 'FAILED', failure_reason = $1, updated_at = NOW() WHERE razorpay_payout_id = $2`,
      [payout.status_details?.reason || 'Unknown error', payout.id]
    );

    // Refund earnings_balance
    if (payouts.length > 0) {
      await client.query(
        `UPDATE freelancer SET earnings_balance = earnings_balance + $1 WHERE freelancer_id = $2`,
        [payouts[0].amount, payouts[0].f_id]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
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
       VALUES ($1, $2, $3)`,
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
      'UPDATE webhook_logs SET processed = TRUE WHERE razorpay_event_id = $1',
      [req.body.id]
    );

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook handling error:', error);

    // Log error
    await db.query(
      'UPDATE webhook_logs SET error_message = $1 WHERE razorpay_event_id = $2',
      [error.message, req.body.id]
    );

    return next(new AppError('Webhook processing failed', 500));
  }
}

module.exports = {
  handleWebhook
}
