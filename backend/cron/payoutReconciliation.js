const { pool: db } = require('../config/dbConfig');
const razorpayX = require('../config/razorpayX');
const { getLogger } = require('../utils/logger');
const logger = getLogger('payout-reconciliation');

// Configuration from env or defaults
const RECONCILIATION_INTERVAL_MINUTES = parseInt(process.env.PAYOUT_RECONCILIATION_INTERVAL_MINUTES || '15', 10);
const MIN_AGE_MINUTES = parseInt(process.env.PAYOUT_RECONCILIATION_MIN_AGE_MINUTES || '5', 10);

async function reconcilePayouts() {
  logger.info('[reconcilePayouts] Starting payout reconciliation...');
  
  try {
    // Get all payouts stuck in PENDING or PROCESSING status
    // Only check payouts older than MIN_AGE_MINUTES to avoid race with webhooks
    const { rows: pendingPayouts } = await db.query(
      `SELECT p.id, p.razorpay_payout_id, p.amount, p.freelancer_id, p.status,
              f.freelancer_id AS f_id
       FROM payouts p
       JOIN users u ON p.freelancer_id = u.id
       JOIN freelancer f ON f.user_id = u.id
       WHERE p.status IN ('PENDING', 'PROCESSING')
       AND p.razorpay_payout_id IS NOT NULL
       AND p.initiated_at < NOW() - INTERVAL '${MIN_AGE_MINUTES} minutes'
       ORDER BY p.initiated_at ASC
       LIMIT 50`
    );

    if (pendingPayouts.length === 0) {
      logger.info('[reconcilePayouts] No stuck payouts found');
      return;
    }

    logger.info(`[reconcilePayouts] Found ${pendingPayouts.length} payouts to reconcile`);

    let reconciledCount = 0;
    let errorCount = 0;

    for (const payout of pendingPayouts) {
      try {
        // Fetch actual payout status from Razorpay
        logger.info(`[reconcilePayouts] Checking payout ${payout.id} (razorpay_id: ${payout.razorpay_payout_id})`);
        
        const response = await razorpayX.get(`/payouts/${payout.razorpay_payout_id}`);
        const razorpayPayout = response.data;
        
        logger.info(`[reconcilePayouts] Payout ${payout.id}: DB status=${payout.status}, Razorpay status=${razorpayPayout.status}`);

        // Check if status mismatch exists and update
        if (razorpayPayout.status === 'processed' && payout.status !== 'PROCESSED') {
          await db.query(
            `UPDATE payouts 
             SET status = 'PROCESSED', utr = $1, processed_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [razorpayPayout.utr || null, payout.id]
          );
          logger.info(`[reconcilePayouts] ✅ Payout ${payout.id} reconciled: PROCESSED, UTR=${razorpayPayout.utr}`);
          reconciledCount++;
        } 
        else if (razorpayPayout.status === 'failed' && payout.status !== 'FAILED') {
          const client = await db.connect();
          try {
            await client.query('BEGIN');

            const failureReason = razorpayPayout.status_details?.reason || razorpayPayout.status_details?.description || 'Unknown error';
            
            // Update payout status
            await client.query(
              `UPDATE payouts 
               SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
               WHERE id = $2`,
              [failureReason, payout.id]
            );

            // Refund to available_balance
            await client.query(
              `UPDATE freelancer 
               SET available_balance = available_balance + $1
               WHERE freelancer_id = $2`,
              [payout.amount, payout.f_id]
            );

            await client.query('COMMIT');
            logger.warn(`[reconcilePayouts] ⚠️  Payout ${payout.id} reconciled: FAILED (${failureReason}), refunded ${payout.amount}`);
            reconciledCount++;
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }
        }
        else if (razorpayPayout.status === 'reversed' && payout.status !== 'REVERSED') {
          await db.query(
            `UPDATE payouts 
             SET status = 'REVERSED', utr = $1, updated_at = NOW()
             WHERE id = $2`,
            [razorpayPayout.utr || null, payout.id]
          );
          logger.warn(`[reconcilePayouts] ⚠️  Payout ${payout.id} reconciled: REVERSED, UTR=${razorpayPayout.utr}`);
          reconciledCount++;
        }
        else if (razorpayPayout.status === 'queued' || razorpayPayout.status === 'processing') {
          logger.info(`[reconcilePayouts] Payout ${payout.id} still in progress (${razorpayPayout.status}), will check next cycle`);
        }
        else if (razorpayPayout.status === payout.status.toLowerCase()) {
          logger.info(`[reconcilePayouts] Payout ${payout.id} status matches, no action needed`);
        }
        else {
          logger.warn(`[reconcilePayouts] Unexpected Razorpay status for payout ${payout.id}: ${razorpayPayout.status}`);
        }

      } catch (err) {
        errorCount++;
        if (err.response?.status === 404) {
          logger.error(`[reconcilePayouts] Payout ${payout.id} not found in Razorpay (razorpay_id: ${payout.razorpay_payout_id})`);
        } else if (err.response?.status === 429) {
          logger.error(`[reconcilePayouts] Rate limit hit, stopping reconciliation for this cycle`);
          break;
        } else {
          logger.error(`[reconcilePayouts] Failed to reconcile payout ${payout.id}:`, {
            errorMessage: err.message,
            statusCode: err.response?.status,
            razorpayError: err.response?.data
          });
        }
      }

      // Add small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.info(`[reconcilePayouts] Reconciliation completed: ${reconciledCount} reconciled, ${errorCount} errors`);
  } catch (error) {
    logger.error('[reconcilePayouts] Reconciliation error:', {
      errorMessage: error.message,
      errorStack: error.stack
    });
  }
}

// Schedule reconciliation to run periodically
const intervalMs = RECONCILIATION_INTERVAL_MINUTES * 60 * 1000;
logger.info(`[payoutReconciliation] Starting reconciliation cron: interval=${RECONCILIATION_INTERVAL_MINUTES} minutes, min_age=${MIN_AGE_MINUTES} minutes`);

setInterval(reconcilePayouts, intervalMs);

// Run immediately on startup (after 30 seconds to let server initialize)
setTimeout(() => {
  logger.info('[payoutReconciliation] Running initial reconciliation check...');
  reconcilePayouts();
}, 30000);

module.exports = { reconcilePayouts };
