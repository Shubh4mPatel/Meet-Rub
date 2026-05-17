const crypto = require('crypto');
const { pool: db } = require('../../../config/dbConfig');
const razorpay = require('../../../config/razorpay');
const AppError = require("../../../utils/appError");
const { getLogger } = require('../../../utils/logger');
const logger = getLogger('webhook-controller');

const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

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

    // Razorpay Routes: store transfer ID if present in payment entity or fetch from API
    try {
      if (payment.transfers && payment.transfers.items && payment.transfers.items.length > 0) {
        const transferId = payment.transfers.items[0].id;
        await client.query(
          `UPDATE transactions SET razorpay_transfer_id = $1 WHERE id = $2`,
          [transferId, order.reference_id]
        );
        logger.info(`[handlePaymentCaptured] Stored razorpay_transfer_id=${transferId} from webhook payload`);
      } else {
        // Try fetching transfers for this payment
        const transfersResponse = await razorpay.payments.fetchTransfer(paymentId);
        if (transfersResponse.items && transfersResponse.items.length > 0) {
          const transferId = transfersResponse.items[0].id;
          await client.query(
            `UPDATE transactions SET razorpay_transfer_id = $1 WHERE id = $2`,
            [transferId, order.reference_id]
          );
          logger.info(`[handlePaymentCaptured] Stored razorpay_transfer_id=${transferId} from API fetch`);
        }
      }
    } catch (transferErr) {
      logger.warn(`[handlePaymentCaptured] Could not fetch/store transfer ID: ${transferErr.message}`);
    }

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

// Handle transfer processed event (Routes)
const handleTransferProcessed = async (payload) => {
  const transfer = payload.transfer.entity;
  const transferId = transfer.id;

  logger.info(`[handleTransferProcessed] Transfer processed: ${transferId}, on_hold=${transfer.on_hold}`);

  // If transfer is on_hold, it means payment was successful but funds are in escrow.
  // Mark transaction as HELD and project as IN_PROGRESS.
  // Admin will release the hold later via POST /admin/payouts/:id/approve.
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE transactions SET status = 'HELD', updated_at = NOW()
       WHERE razorpay_transfer_id = $1 AND status = 'INITIATED'`,
      [transferId]
    );

    if (rowCount > 0) {
      // Payment succeeded — update project to IN_PROGRESS
      await client.query(
        `UPDATE projects SET status = 'IN_PROGRESS', updated_at = NOW()
         WHERE id = (SELECT project_id FROM transactions WHERE razorpay_transfer_id = $1)`,
        [transferId]
      );
      logger.info(`[handleTransferProcessed] Transaction marked HELD, project marked IN_PROGRESS for transfer ${transferId}`);
    } else {
      logger.info(`[handleTransferProcessed] No INITIATED transaction found for transfer ${transferId} — may already be processed`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[handleTransferProcessed] Error: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
};

// Handle transfer failed event (Routes)
const handleTransferFailed = async (payload) => {
  const transfer = payload.transfer.entity;
  const transferId = transfer.id;
  const failureReason = transfer.error?.description || 'Unknown transfer failure';

  logger.warn(`[handleTransferFailed] Transfer failed: ${transferId}, reason: ${failureReason}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rowCount } = await client.query(
      `UPDATE transactions SET status = 'FAILED', updated_at = NOW()
       WHERE razorpay_transfer_id = $1 AND status IN ('HELD', 'INITIATED')`,
      [transferId]
    );

    if (rowCount > 0) {
      // Payment failed — revert project back to CREATED
      await client.query(
        `UPDATE projects SET status = 'CREATED', updated_at = NOW()
         WHERE id = (SELECT project_id FROM transactions WHERE razorpay_transfer_id = $1)`,
        [transferId]
      );
      logger.info(`[handleTransferFailed] Transaction marked FAILED, project reverted to CREATED for transfer ${transferId}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[handleTransferFailed] Error: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
};

// Handle transfer reversed event (Routes)
const handleTransferReversed = async (payload) => {
  const transfer = payload.transfer.entity;
  const transferId = transfer.id;

  logger.warn(`[handleTransferReversed] Transfer reversed: ${transferId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Get the transaction before updating — need to check if balance was credited
    const { rows: txRows } = await client.query(
      `SELECT t.id, t.status, t.freelancer_amount, t.freelancer_id, t.settled_at
       FROM transactions t
       WHERE t.razorpay_transfer_id = $1 AND t.status IN ('HELD', 'COMPLETED')
       FOR UPDATE`,
      [transferId]
    );

    if (txRows.length === 0) {
      logger.info(`[handleTransferReversed] No HELD/COMPLETED transaction found for transfer ${transferId}`);
      await client.query('COMMIT');
      return;
    }

    const tx = txRows[0];

    // Only debit earnings_balance if transfer.settled already fired (settled_at is set).
    // earnings_balance is credited in handleTransferSettled (T+2 days after release),
    // not at approvePayout time — so COMPLETED alone is not a safe signal.
    if (tx.settled_at && tx.freelancer_amount && tx.freelancer_id) {
      await client.query(
        `UPDATE freelancer
         SET earnings_balance = earnings_balance - $1,
             updated_at = NOW()
         WHERE freelancer_id = $2`,
        [tx.freelancer_amount, tx.freelancer_id]
      );
      logger.info(`[handleTransferReversed] Reverted earnings_balance ${tx.freelancer_amount} for freelancer ${tx.freelancer_id}`);
    }

    await client.query(
      `UPDATE transactions SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1`,
      [tx.id]
    );

    // Revert project status
    await client.query(
      `UPDATE projects SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = (SELECT project_id FROM transactions WHERE id = $1)`,
      [tx.id]
    );

    // Mark the linked payout as REVERSED so freelancer history reflects reality
    await client.query(
      `UPDATE payouts SET status = 'REVERSED', updated_at = NOW()
       WHERE transaction_id = $1 AND status = 'PROCESSED'`,
      [tx.id]
    );
    logger.info(`[handleTransferReversed] Marked payout REVERSED for transaction ${tx.id}`);

    logger.info(`[handleTransferReversed] Transaction ${tx.id} marked REFUNDED for transfer ${transferId}`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[handleTransferReversed] Error: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
};

// Handle transfer settled event (Routes) — funds settled to linked account's bank
const handleTransferSettled = async (payload) => {
  const transfer = payload.transfer.entity;
  const transferId = transfer.id;

  logger.info(`[handleTransferSettled] Transfer settled: ${transferId}, amount=${transfer.amount}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT t.id, t.freelancer_id, t.freelancer_amount
       FROM transactions t
       WHERE t.razorpay_transfer_id = $1 AND t.status = 'COMPLETED'`,
      [transferId]
    );

    if (rows.length > 0) {
      await client.query(
        `UPDATE freelancer SET earnings_balance = earnings_balance + $1, updated_at = NOW() WHERE freelancer_id = $2`,
        [rows[0].freelancer_amount, rows[0].freelancer_id]
      );
      await client.query(
        `UPDATE transactions SET settled_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [rows[0].id]
      );
      await client.query(
        `UPDATE payouts SET status = 'CREDITED', updated_at = NOW()
         WHERE transaction_id = $1 AND status = 'PROCESSED'`,
        [rows[0].id]
      );
      logger.info(`[handleTransferSettled] Credited earnings_balance ${rows[0].freelancer_amount} for freelancer ${rows[0].freelancer_id}, payout marked CREDITED`);
    } else {
      logger.info(`[handleTransferSettled] No COMPLETED transaction for transfer ${transferId}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`[handleTransferSettled] Error: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
};

// Shared helper — update freelancer razorpay_account_status by linked account id
const updateAccountStatus = async (accountId, status, eventName) => {
  const { rowCount } = await db.query(
    `UPDATE freelancer SET razorpay_account_status = $1, updated_at = NOW()
     WHERE razorpay_linked_account_id = $2`,
    [status, accountId]
  );
  if (rowCount > 0) {
    logger.info(`[${eventName}] Freelancer account ${accountId} → ${status}`);
  } else {
    logger.warn(`[${eventName}] No freelancer found for razorpay_linked_account_id=${accountId}`);
  }
};

// account.activated — bank verification passed
const handleAccountActivated = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleAccountActivated] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'activated', 'handleAccountActivated');
};

// account.instantly_activated — activated without penny drop delay
const handleAccountInstantlyActivated = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleAccountInstantlyActivated] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'activated', 'handleAccountInstantlyActivated');
};

// account.activated_kyc_pending — can receive transfers but KYC not complete
const handleAccountActivatedKycPending = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleAccountActivatedKycPending] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'activated_kyc_pending', 'handleAccountActivatedKycPending');
};

// account.under_review — Razorpay is reviewing the account
const handleAccountUnderReview = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleAccountUnderReview] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'under_review', 'handleAccountUnderReview');
};

// account.needs_clarification — Razorpay requires more info before activation
const handleAccountNeedsClarification = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleAccountNeedsClarification] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'needs_clarification', 'handleAccountNeedsClarification');
};

// account.rejected — Razorpay rejected the linked account
const handleAccountRejected = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleAccountRejected] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'rejected', 'handleAccountRejected');
};

// account.updated — generic account update; sync whatever status Razorpay reports
const handleAccountUpdated = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleAccountUpdated] Missing account entity'); return; }
  logger.info(`[handleAccountUpdated] Account ${account.id} updated — no status sync needed`);
};

// product.route.activated — Route product activated, freelancer can receive transfers
const handleProductRouteActivated = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleProductRouteActivated] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'activated', 'handleProductRouteActivated');
};

// product.route.needs_clarification
const handleProductRouteNeedsClarification = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleProductRouteNeedsClarification] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'needs_clarification', 'handleProductRouteNeedsClarification');
};

// product.route.under_review
const handleProductRouteUnderReview = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleProductRouteUnderReview] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'under_review', 'handleProductRouteUnderReview');
};

// product.route.rejected
const handleProductRouteRejected = async (payload) => {
  const account = payload.account?.entity;
  if (!account?.id) { logger.warn('[handleProductRouteRejected] Missing account entity'); return; }
  await updateAccountStatus(account.id, 'rejected', 'handleProductRouteRejected');
};

// refund.processed — refund confirmed by Razorpay, money is on its way to creator
const handleRefundProcessed = async (payload) => {
  const refund = payload.refund?.entity;
  if (!refund?.id) { logger.warn('[handleRefundProcessed] Missing refund entity'); return; }

  const { rowCount } = await db.query(
    `UPDATE transactions SET status = 'REFUNDED', updated_at = NOW()
     WHERE razorpay_payment_id = $1 AND status != 'REFUNDED'`,
    [refund.payment_id]
  );
  logger.info(`[handleRefundProcessed] refund_id=${refund.id} payment_id=${refund.payment_id} updated=${rowCount}`);
};

// refund.failed — refund attempt failed, revert transaction to HELD so admin can retry
const handleRefundFailed = async (payload) => {
  const refund = payload.refund?.entity;
  if (!refund?.id) { logger.warn('[handleRefundFailed] Missing refund entity'); return; }

  const { rowCount } = await db.query(
    `UPDATE transactions SET status = 'HELD', updated_at = NOW()
     WHERE razorpay_payment_id = $1 AND status = 'REFUNDED'`,
    [refund.payment_id]
  );
  logger.warn(`[handleRefundFailed] refund_id=${refund.id} payment_id=${refund.payment_id} reverted=${rowCount} — admin must retry refund`);
};

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

    // RazorpayX payout webhooks don't have a top-level id; fall back to entity id
    const webhookEventId = parsedForEvent.id
      || parsedForEvent.payload?.payout?.entity?.id
      || parsedForEvent.payload?.payment?.entity?.id
      || parsedForEvent.payload?.account?.entity?.id
      || null;

    logger.info(`[handleWebhook] Received webhook event: ${event}, id: ${webhookEventId}`);
    logger.info(`[handleWebhook] Raw signature header: ${req.headers['x-razorpay-signature']}`);

    // Verify signature on raw bytes BEFORE any further processing
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn(`[handleWebhook] Invalid signature for event: ${event}`);
      return next(new AppError('Invalid signature', 400));
    }

    const body = parsedForEvent;
    const payload = body.payload;

    // Log webhook
    await db.query(
      `INSERT INTO webhook_logs (event_type, razorpay_event_id, payload)
       VALUES ($1, $2, $3)`,
      [event, webhookEventId, rawBody.toString('utf8')]
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

      case 'transfer.processed':
        await handleTransferProcessed(payload);
        logger.info(`[handleWebhook] Successfully processed transfer.processed event`);
        break;

      case 'transfer.failed':
        await handleTransferFailed(payload);
        logger.info(`[handleWebhook] Successfully processed transfer.failed event`);
        break;

      case 'transfer.reversed':
        await handleTransferReversed(payload);
        logger.info(`[handleWebhook] Successfully processed transfer.reversed event`);
        break;

      case 'transfer.settled':
        await handleTransferSettled(payload);
        logger.info(`[handleWebhook] Successfully processed transfer.settled event`);
        break;

      case 'account.activated':
        await handleAccountActivated(payload);
        logger.info(`[handleWebhook] Successfully processed account.activated event`);
        break;

      case 'account.instantly_activated':
        await handleAccountInstantlyActivated(payload);
        logger.info(`[handleWebhook] Successfully processed account.instantly_activated event`);
        break;

      case 'account.activated_kyc_pending':
        await handleAccountActivatedKycPending(payload);
        logger.info(`[handleWebhook] Successfully processed account.activated_kyc_pending event`);
        break;

      case 'account.under_review':
        await handleAccountUnderReview(payload);
        logger.info(`[handleWebhook] Successfully processed account.under_review event`);
        break;

      case 'account.needs_clarification':
        await handleAccountNeedsClarification(payload);
        logger.info(`[handleWebhook] Successfully processed account.needs_clarification event`);
        break;

      case 'account.rejected':
        await handleAccountRejected(payload);
        logger.info(`[handleWebhook] Successfully processed account.rejected event`);
        break;

      case 'account.updated':
        await handleAccountUpdated(payload);
        logger.info(`[handleWebhook] Successfully processed account.updated event`);
        break;

      case 'product.route.activated':
        await handleProductRouteActivated(payload);
        logger.info(`[handleWebhook] Successfully processed product.route.activated event`);
        break;

      case 'product.route.needs_clarification':
        await handleProductRouteNeedsClarification(payload);
        logger.info(`[handleWebhook] Successfully processed product.route.needs_clarification event`);
        break;

      case 'product.route.under_review':
        await handleProductRouteUnderReview(payload);
        logger.info(`[handleWebhook] Successfully processed product.route.under_review event`);
        break;

      case 'product.route.rejected':
        await handleProductRouteRejected(payload);
        logger.info(`[handleWebhook] Successfully processed product.route.rejected event`);
        break;

      case 'refund.processed':
        await handleRefundProcessed(payload);
        logger.info(`[handleWebhook] Successfully processed refund.processed event`);
        break;

      case 'refund.failed':
        await handleRefundFailed(payload);
        logger.info(`[handleWebhook] Successfully processed refund.failed event`);
        break;

      default:
        logger.warn(`[handleWebhook] Unhandled webhook event: ${event}`);
    }

    // Update webhook log as processed
    await db.query(
      'UPDATE webhook_logs SET processed = TRUE WHERE razorpay_event_id = $1',
      [webhookEventId]
    );

    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('[handleWebhook] Webhook handling error:', error);

    // Log error
    try {
      const fallbackId = JSON.parse(req.body.toString('utf8'));
      const errorEventId = fallbackId.id
        || fallbackId.payload?.payout?.entity?.id
        || fallbackId.payload?.payment?.entity?.id
        || null;
      await db.query(
        'UPDATE webhook_logs SET error_message = $1 WHERE razorpay_event_id = $2',
        [error.message, errorEventId]
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
