const { pool: db } = require('../config/dbConfig');
const razorpay = require('../config/razorpay');
const { getLogger } = require('../utils/logger');
const logger = getLogger('transfer-reconciliation');

// Configuration
const RECONCILIATION_INTERVAL_MINUTES = parseInt(process.env.TRANSFER_RECONCILIATION_INTERVAL_MINUTES || '60', 10);
const MIN_AGE_MINUTES = parseInt(process.env.TRANSFER_RECONCILIATION_MIN_AGE_MINUTES || '30', 10);
const ALERT_DAYS_BEFORE_AUTO_RELEASE = 5; // Alert when < 5 days before 30-day auto-release

async function reconcileTransfers() {
    logger.info('[reconcileTransfers] Starting transfer reconciliation...');

    try {
        // Get HELD transactions with a transfer ID that are older than MIN_AGE_MINUTES
        const { rows: heldTransfers } = await db.query(
            `SELECT t.id, t.razorpay_transfer_id, t.razorpay_payment_id,
              t.freelancer_amount, t.held_at, t.project_id,
              f.freelancer_full_name, f.freelancer_id
       FROM transactions t
       JOIN freelancer f ON t.freelancer_id = f.freelancer_id
       WHERE t.status = 'HELD'
       AND t.razorpay_transfer_id IS NOT NULL
       AND t.held_at < NOW() - INTERVAL '${MIN_AGE_MINUTES} minutes'
       ORDER BY t.held_at ASC
       LIMIT 50`
        );

        if (heldTransfers.length === 0) {
            logger.info('[reconcileTransfers] No held transfers to reconcile');
            return;
        }

        logger.info(`[reconcileTransfers] Found ${heldTransfers.length} held transfers to check`);

        let synced = 0;
        let alerts = 0;

        for (const tx of heldTransfers) {
            try {
                // Fetch transfer status from Razorpay
                const transfer = await razorpay.transfers.fetch(tx.razorpay_transfer_id);

                // Check if transfer has been processed (released)
                if (transfer.settlement_status === 'settled' || !transfer.on_hold) {
                    await db.query(
                        `UPDATE transactions SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1 AND status = 'HELD'`,
                        [tx.id]
                    );
                    await db.query(
                        `UPDATE projects SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
                        [tx.project_id]
                    );
                    logger.info(`[reconcileTransfers] Transaction ${tx.id} synced to COMPLETED (transfer ${tx.razorpay_transfer_id} already released)`);
                    synced++;
                } else if (transfer.on_hold) {
                    // Check if approaching auto-release deadline (on_hold_until)
                    if (tx.held_at) {
                        const heldAt = new Date(tx.held_at);
                        const daysSinceHeld = (Date.now() - heldAt.getTime()) / (1000 * 60 * 60 * 24);
                        const daysUntilAutoRelease = 30 - daysSinceHeld;

                        if (daysUntilAutoRelease <= ALERT_DAYS_BEFORE_AUTO_RELEASE) {
                            logger.warn(`[reconcileTransfers] ALERT: Transaction ${tx.id} (project ${tx.project_id}) will auto-release in ${daysUntilAutoRelease.toFixed(1)} days! Freelancer: ${tx.freelancer_full_name}, Amount: ${tx.freelancer_amount}`);
                            alerts++;
                        }
                    }
                }

                // Rate limit: 200ms between API calls
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (apiErr) {
                logger.error(`[reconcileTransfers] Error checking transfer ${tx.razorpay_transfer_id}: ${apiErr.message}`);
            }
        }

        logger.info(`[reconcileTransfers] Reconciliation complete: synced=${synced}, alerts=${alerts}, checked=${heldTransfers.length}`);
    } catch (error) {
        logger.error('[reconcileTransfers] Reconciliation error:', {
            errorMessage: error.message,
            errorStack: error.stack,
        });
    }
}

// Start the reconciliation cron
logger.info(`[transferReconciliation] Starting reconciliation cron: interval=${RECONCILIATION_INTERVAL_MINUTES} minutes, min_age=${MIN_AGE_MINUTES} minutes`);

const intervalId = setInterval(reconcileTransfers, RECONCILIATION_INTERVAL_MINUTES * 60 * 1000);

// Run initial check after 60 seconds (give server time to fully start)
setTimeout(() => {
    logger.info('[transferReconciliation] Running initial reconciliation check...');
    reconcileTransfers();
}, 60 * 1000);

module.exports = { reconcileTransfers, intervalId };
