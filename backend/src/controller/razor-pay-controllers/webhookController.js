const crypto = require('crypto');
const { pool: db } = require('../../../config/dbConfig');
const payoutService = require('../../razor-pay-services/payoutService');
const AppError = require("../../../utils/appError");
const { getLogger } = require('../../../utils/logger');
const logger = getLogger('webhook-controller');

// Verify Razorpay webhook signature
// Payout events come from Razorpay X and use RAZORPAY_X_WEBHOOK_SECRET
const PAYOUT_EVENTS = new Set(['payout.processed', 'payout.failed', 'payout.reversed']);

const verifyWebhookSignature = (rawBody, signature, event) => {
  const secret = PAYOUT_EVENTS.has(event)
    ? process.env.RAZORPAY_X_WEBHOOK_SECRET
    : process.env.RAZORPAY_WEBHOOK_SECRET;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return expectedSignature === signature;
}

// Handle payment captured event
const handlePaymentCaptured = async (payload) => {
  const payment = payload.payment.entity;
  const orderId = payment.order_id;
  const paymentId = payment.id;

  logger.info(`[handlePaymentCaptured] Payment captured: ${paymentId} for order: ${orderId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Update order status
    const { rows: orders } = await client.query(
      `UPDATE razorpay_orders SET status = 'PAID', updated_at = NOW() 
       WHERE razorpay_order_id = $1 
       RETURNING id, reference_id, status`,
      [orderId]
    );

    if (orders.length === 0) {
      logger.warn(`[handlePaymentCaptured] Order not found for razorpay_order_id: ${orderId}`);
      await client.query('ROLLBACK');
      return;
    }

    const order = orders[0];
    logger.info(`[handlePaymentCaptured] Order ${orderId} updated to PAID, reference_id: ${order.reference_id}`);

    // Update transaction to HELD if it's still in INITIATED state
    // This handles cases where the client didn't call /payments/verify
    const { rows: transactions, rowCount } = await client.query(
      `UPDATE transactions 
       SET status = 'HELD', 
           razorpay_payment_id = $1, 
           held_at = NOW(), 
           updated_at = NOW()
       WHERE id = $2 AND status = 'INITIATED'
       RETURNING id, status`,
      [paymentId, order.reference_id]
    );

    if (rowCount > 0) {
      logger.info(`[handlePaymentCaptured] Transaction ${order.reference_id} updated to HELD via webhook`);

      // Mark the linked custom package as paid
      // Match on creator, freelancer, service, price, and units to ensure we update only the correct package
      const { rowCount: cpRowCount, rows: cpRows } = await client.query(
        `UPDATE custom_packages cp
         SET status = 'paid', updated_at = NOW()
         FROM transactions t
         JOIN projects p ON t.project_id = p.id
         WHERE t.id = $1
           AND cp.creator_id = p.creator_id
           AND cp.freelancer_id = p.freelancer_id
           AND cp.status = 'accepted'
           AND (cp.service_id = p.service_id OR (cp.service_id IS NULL AND p.service_id IS NULL))
           AND cp.price = p.amount
           AND (cp.units = p.number_of_units OR (cp.units IS NULL AND p.number_of_units IS NULL))
         RETURNING cp.id`,
        [order.reference_id]
      );

      if (cpRowCount > 0) {
        logger.info(`[handlePaymentCaptured] ${cpRowCount} custom package(s) marked as paid for transaction ${order.reference_id}, IDs: ${cpRows.map(r => r.id).join(', ')}`);
        if (cpRowCount > 1) {
          logger.warn(`[handlePaymentCaptured] Multiple custom_packages updated - this may indicate duplicate packages`);
        }
      } else {
        logger.info(`[handlePaymentCaptured] No custom_package found matching project criteria - this may be a direct project`);
      }
    } else {
      logger.info(`[handlePaymentCaptured] Transaction ${order.reference_id} already processed or not in INITIATED state`);
    }

    await client.query('COMMIT');
    logger.info(`[handlePaymentCaptured] Successfully processed payment ${paymentId} for order ${orderId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[handlePaymentCaptured] Error processing payment ${paymentId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

// Handle payment failed event
const handlePaymentFailed = async (payload) => {
  const payment = payload.payment.entity;
  const orderId = payment.order_id;
  const paymentId = payment.id;

  logger.warn(`[handlePaymentFailed] Payment failed: ${paymentId} for order: ${orderId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Update order status
    const { rowCount: orderCount } = await client.query(
      `UPDATE razorpay_orders SET status = 'FAILED', updated_at = NOW() WHERE razorpay_order_id = $1`,
      [orderId]
    );
    logger.info(`[handlePaymentFailed] Updated ${orderCount} order(s) to FAILED`);

    // Update transaction status if it's a service payment
    const { rowCount: txCount } = await client.query(
      `UPDATE transactions SET status = 'FAILED', updated_at = NOW() WHERE razorpay_order_id = $1`,
      [orderId]
    );
    logger.info(`[handlePaymentFailed] Updated ${txCount} transaction(s) to FAILED`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[handlePaymentFailed] Error processing failed payment ${paymentId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

// Handle payout processed event
const handlePayoutProcessed = async (payload) => {
  const payout = payload.payout.entity;

  logger.info(`[handlePayoutProcessed] Payout processed: ${payout.id}, UTR: ${payout.utr}`);

  await payoutService.updatePayoutStatus(payout.id, 'processed', payout.utr);
}

// Handle payout failed event
const handlePayoutFailed = async (payload) => {
  const payout = payload.payout.entity;

  logger.warn(`[handlePayoutFailed] Payout failed: ${payout.id}`);

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
    const failureReason = payout.status_details?.reason || 'Unknown error';
    await client.query(
      `UPDATE payouts SET status = 'FAILED', failure_reason = $1, updated_at = NOW() WHERE razorpay_payout_id = $2`,
      [failureReason, payout.id]
    );
    logger.info(`[handlePayoutFailed] Updated payout status to FAILED, reason: ${failureReason}`);

    // Refund earnings_balance
    if (payouts.length > 0) {
      await client.query(
        `UPDATE freelancer SET earnings_balance = earnings_balance + $1 WHERE freelancer_id = $2`,
        [payouts[0].amount, payouts[0].f_id]
      );
      logger.info(`[handlePayoutFailed] Refunded ${payouts[0].amount} to freelancer ${payouts[0].f_id}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[handlePayoutFailed] Error processing failed payout ${payout.id}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

// Handle payout reversed event
const handlePayoutReversed = async (payload) => {
  const payout = payload.payout.entity;

  logger.warn(`[handlePayoutReversed] Payout reversed: ${payout.id}, UTR: ${payout.utr}`);

  await payoutService.updatePayoutStatus(payout.id, 'reversed', payout.utr);
  logger.info(`[handlePayoutReversed] Successfully updated payout ${payout.id} to reversed`);
}

// Handle Razorpay webhooks
const handleWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      logger.warn('[handleWebhook] Missing signature in webhook request');
      return next(new AppError('Missing signature', 400));
    }

    const rawBody = req.body; // Buffer from express.raw()

    // Parse event type first (needed to pick the right webhook secret)
    const parsedForEvent = JSON.parse(rawBody.toString('utf8'));
    const event = parsedForEvent.event;

    logger.info(`[handleWebhook] Received webhook event: ${event}, id: ${parsedForEvent.id}`);

    // Verify signature on raw bytes BEFORE any further processing
    if (!verifyWebhookSignature(rawBody, signature, event)) {
      logger.warn(`[handleWebhook] Invalid signature for event: ${event}`);
      return next(new AppError('Invalid signature', 400));
    }

    const body = parsedForEvent;
    const payload = body.payload;

    // Log webhook
    await db.query(
      `INSERT INTO webhook_logs (event_type, razorpay_event_id, payload)
       VALUES ($1, $2, $3)`,
      [event, body.id || null, rawBody.toString('utf8')]
    );
    logger.info(`[handleWebhook] Webhook logged to database: ${event}`);

    // Handle different event types
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        logger.info(`[handleWebhook] Successfully processed payment.captured event`);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload);
        logger.info(`[handleWebhook] Successfully processed payment.failed event`);
        break;

      case 'payout.processed':
        await handlePayoutProcessed(payload);
        logger.info(`[handleWebhook] Successfully processed payout.processed event`);
        break;

      case 'payout.failed':
        await handlePayoutFailed(payload);
        logger.info(`[handleWebhook] Successfully processed payout.failed event`);
        break;

      case 'payout.reversed':
        await handlePayoutReversed(payload);
        logger.info(`[handleWebhook] Successfully processed payout.reversed event`);
        break;

      default:
        logger.warn(`[handleWebhook] Unhandled webhook event: ${event}`);
    }

    // Update webhook log as processed
    await db.query(
      'UPDATE webhook_logs SET processed = TRUE WHERE razorpay_event_id = $1',
      [body.id]
    );

    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('[handleWebhook] Webhook handling error:', error);

    // Log error
    try {
      await db.query(
        'UPDATE webhook_logs SET error_message = $1 WHERE razorpay_event_id = $2',
        [error.message, req.body?.id]
      );
    } catch (dbError) {
      logger.error('[handleWebhook] Failed to log error to database:', dbError);
    }

    return next(new AppError('Webhook processing failed', 500));
  }
}

module.exports = {
  handleWebhook
}
