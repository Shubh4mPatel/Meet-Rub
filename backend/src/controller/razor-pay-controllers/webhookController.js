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

    // Lock the order row first — same lock as /verify, eliminates the race condition
    const { rows: orders } = await client.query(
      'SELECT * FROM razorpay_orders WHERE razorpay_order_id = $1 FOR UPDATE',
      [orderId]
    );

    if (orders.length === 0) {
      logger.warn(`[handlePaymentCaptured] Order not found for razorpay_order_id: ${orderId}`);
      await client.query('ROLLBACK');
      return;
    }

    const order = orders[0];

    // Idempotency: if /verify already ran and set the order to PAID, check whether
    // the project update was also completed; fix it if not, then bail out.
    if (order.status === 'PAID') {
      logger.info(`[handlePaymentCaptured] Order ${orderId} already PAID — checking for partial-update recovery`);

      const { rows: projCheck } = await client.query(
        `SELECT p.id, p.status, p.creator_id, p.freelancer_id
         FROM transactions t
         JOIN projects p ON t.project_id = p.id
         WHERE t.id = $1`,
        [order.reference_id]
      );

      if (projCheck.length > 0 && projCheck[0].status === 'CREATED') {
        logger.warn(`[handlePaymentCaptured] Idempotency recovery: project ${projCheck[0].id} still CREATED — completing update`);

        const { rows: cpAccepted } = await client.query(
          `UPDATE custom_packages
           SET status = 'paid', updated_at = NOW()
           WHERE id = (
             SELECT cp2.id FROM custom_packages cp2
             WHERE cp2.creator_id = $1
               AND cp2.freelancer_id = $2
               AND cp2.status = 'accepted'
               AND cp2.price::numeric = (SELECT amount::numeric FROM projects WHERE id = $3)
             ORDER BY cp2.created_at DESC
             LIMIT 1
           )
           RETURNING id, delivery_days, delivery_time`,
          [projCheck[0].creator_id, projCheck[0].freelancer_id, projCheck[0].id]
        );

        let cpData = cpAccepted[0] || null;
        if (!cpData) {
          const { rows: cpPaid } = await client.query(
            `SELECT delivery_days, delivery_time FROM custom_packages
             WHERE creator_id = $1 AND freelancer_id = $2 AND status = 'paid'
             ORDER BY updated_at DESC LIMIT 1`,
            [projCheck[0].creator_id, projCheck[0].freelancer_id]
          );
          cpData = cpPaid[0] || null;
        }

        let endDate = null;
        if (cpData) {
          endDate = new Date();
          endDate.setDate(endDate.getDate() + (parseInt(cpData.delivery_days) || 0));
          endDate.setHours(endDate.getHours() + (parseInt(cpData.delivery_time) || 0));
        }

        if (endDate) {
          await client.query(
            `UPDATE projects SET status = 'IN_PROGRESS', end_date = $2, updated_at = NOW() WHERE id = $1`,
            [projCheck[0].id, endDate]
          );
        } else {
          await client.query(
            `UPDATE projects SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
            [projCheck[0].id]
          );
        }
        logger.info(`[handlePaymentCaptured] Recovery: project ${projCheck[0].id} set to IN_PROGRESS`);
      } else {
        logger.info(`[handlePaymentCaptured] Order already fully processed — nothing to do`);
      }

      await client.query('COMMIT');
      return;
    }

    // First-time processing: mark order PAID
    await client.query(
      `UPDATE razorpay_orders SET status = 'PAID', updated_at = NOW() WHERE id = $1`,
      [order.id]
    );
    logger.info(`[handlePaymentCaptured] Order ${orderId} marked PAID, reference_id: ${order.reference_id}`);

    // Update transaction to HELD (only if still INITIATED — guard against /verify having won the race)
    const { rowCount } = await client.query(
      `UPDATE transactions
       SET status = 'HELD', razorpay_payment_id = $1, held_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND status = 'INITIATED'`,
      [paymentId, order.reference_id]
    );

    if (rowCount === 0) {
      logger.info(`[handlePaymentCaptured] Transaction ${order.reference_id} already processed by /verify — skipping`);
      await client.query('COMMIT');
      return;
    }

    logger.info(`[handlePaymentCaptured] Transaction ${order.reference_id} updated to HELD via webhook`);

    // Mark the linked custom package as paid.
    // Use a subquery with LIMIT 1 (ORDER BY created_at DESC) so only the most-recent
    // accepted package is updated even if duplicates exist.
    const { rows: cpRows } = await client.query(
      `UPDATE custom_packages
       SET status = 'paid', updated_at = NOW()
       WHERE id = (
         SELECT cp2.id FROM custom_packages cp2
         JOIN transactions t ON t.id = $1
         JOIN projects p ON t.project_id = p.id
         WHERE cp2.creator_id = p.creator_id
           AND cp2.freelancer_id = p.freelancer_id
           AND cp2.status = 'accepted'
           AND cp2.price::numeric = p.amount::numeric
         ORDER BY cp2.created_at DESC
         LIMIT 1
       )
       RETURNING id, delivery_days, delivery_time`,
      [order.reference_id]
    );

    if (cpRows.length === 0) {
      logger.info(`[handlePaymentCaptured] No matching custom_package found — may be a direct project`);
    } else {
      logger.info(`[handlePaymentCaptured] Custom package ${cpRows[0].id} marked as paid`);
    }

    // Compute end_date from delivery info and move project to IN_PROGRESS
    const cpData = cpRows[0] || null;
    let endDate = null;
    if (cpData) {
      endDate = new Date();
      endDate.setDate(endDate.getDate() + (parseInt(cpData.delivery_days) || 0));
      endDate.setHours(endDate.getHours() + (parseInt(cpData.delivery_time) || 0));
    }

    const { rows: txRows } = await client.query(
      'SELECT project_id FROM transactions WHERE id = $1',
      [order.reference_id]
    );

    if (txRows.length > 0) {
      if (endDate) {
        await client.query(
          `UPDATE projects SET status = 'IN_PROGRESS', end_date = $2, updated_at = NOW() WHERE id = $1`,
          [txRows[0].project_id, endDate]
        );
        logger.info(`[handlePaymentCaptured] Project ${txRows[0].project_id} → IN_PROGRESS, end_date=${endDate.toISOString()}`);
      } else {
        await client.query(
          `UPDATE projects SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
          [txRows[0].project_id]
        );
        logger.info(`[handlePaymentCaptured] Project ${txRows[0].project_id} → IN_PROGRESS`);
      }
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
