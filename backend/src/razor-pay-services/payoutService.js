const { pool: db } = require('../../config/dbConfig');
const { getLogger } = require('../../utils/logger');
const logger = getLogger('payout-service');

class PayoutService {
  async getFreelancerPayouts(userId, freelancerId, { status, from_date, to_date, page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;

    const VALID_STATUSES = ['REQUESTED', 'PROCESSED', 'CREDITED', 'REJECTED', 'FAILED', 'REVERSED'];
    if (status) {
      const upperStatus = status.toUpperCase();
      if (!VALID_STATUSES.includes(upperStatus)) {
        throw new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`);
      }
    }

    const STATUS_LABEL = {
      REQUESTED: 'In process',
      PROCESSED: 'Releasing',
      CREDITED:  'Credited',
      REJECTED:  'Rejected',
      FAILED:    'Failed',
      REVERSED:  'Reversed',
    };

    // Build date filter fragment (applied to both sides of the UNION via the outer wrapper)
    const dateParams = [];
    let dateWhere = '';
    let dIdx = 3; // $1 = userId (payouts), $2 = freelancerId (transactions)

    if (from_date) {
      dateWhere += ` AND date_time >= $${dIdx++}::date`;
      dateParams.push(from_date);
    }
    if (to_date) {
      dateWhere += ` AND date_time < ($${dIdx++}::date + interval '1 day')`;
      dateParams.push(to_date);
    }

    // Status filter only applies to the payouts side (order payments are always COMPLETED)
    const statusWhere = status ? ` AND py_status = '${status.toUpperCase()}'` : '';

    const unionQuery = `
      SELECT
        t.id                                                          AS id,
        t.created_at                                                  AS date_time,
        'Order Payment'                                               AS type,
        CONCAT('Payment received for order #', p.id)                 AS description,
        t.freelancer_amount                                           AS amount,
        'INR'                                                         AS currency,
        'COMPLETED'                                                   AS py_status,
        NULL::text                                                    AS rejection_reason,
        NULL::text                                                    AS failure_reason,
        NULL::timestamptz                                             AS rejected_at,
        NULL::text                                                    AS bank_name,
        NULL::text                                                    AS bank_account_no
      FROM transactions t
      JOIN projects p ON t.project_id = p.id
      WHERE t.freelancer_id = $2 AND t.status = 'COMPLETED'

      UNION ALL

      SELECT
        py.id,
        py.requested_at                                               AS date_time,
        'Withdrawal'                                                  AS type,
        CONCAT('Bank Transfer to ', COALESCE(f.bank_name, 'Bank'), ' ****', RIGHT(COALESCE(f.bank_account_no, '0000'), 4)) AS description,
        -py.amount                                                    AS amount,
        py.currency,
        py.status                                                     AS py_status,
        py.rejection_reason,
        py.failure_reason,
        py.rejected_at,
        f.bank_name,
        '****' || RIGHT(COALESCE(f.bank_account_no, '0000'), 4)      AS bank_account_no
      FROM payouts py
      JOIN freelancer f ON f.user_id = py.freelancer_id
      WHERE py.freelancer_id = $1
    `;

    const baseParams = [userId, freelancerId, ...dateParams];
    const wrappedWhere = `WHERE 1=1 ${dateWhere} ${statusWhere}`;

    const [dataRows, countRows, statusCounts] = await Promise.all([
      db.query(
        `SELECT * FROM (${unionQuery}) combined ${wrappedWhere} ORDER BY date_time DESC LIMIT $${dIdx++} OFFSET $${dIdx++}`,
        [...baseParams, limit, offset]
      ),
      db.query(
        `SELECT COUNT(*) AS total FROM (${unionQuery}) combined ${wrappedWhere}`,
        baseParams
      ),
      db.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'REQUESTED')                 AS pending,
          COUNT(*) FILTER (WHERE status IN ('PROCESSED', 'CREDITED'))  AS completed,
          COUNT(*) FILTER (WHERE status = 'REJECTED')                  AS rejected
         FROM payouts WHERE freelancer_id = $1`,
        [userId]
      ),
    ]);

    const total = parseInt(countRows.rows[0].total);

    const payouts = dataRows.rows.map((row) => {
      const reason = row.rejection_reason || row.failure_reason || null;
      return {
        id: row.id,
        type: row.type,
        reference_id: row.type === 'Withdrawal' ? `WDL-${row.id}` : `ORD-${row.id}`,
        description: row.description,
        amount: parseFloat(row.amount),
        currency: row.currency || 'INR',
        status: row.py_status,
        status_label: STATUS_LABEL[row.py_status] || 'Completed',
        reason,
        requested_at: row.date_time,
        rejected_at: row.rejected_at,
        bank_name: row.bank_name,
        bank_account_no: row.bank_account_no,
      };
    });

    return {
      payouts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit),
      },
      summary: {
        pending:   parseInt(statusCounts.rows[0].pending),
        completed: parseInt(statusCounts.rows[0].completed),
        rejected:  parseInt(statusCounts.rows[0].rejected),
      },
    };
  }

  async updatePayoutStatus(razorpayPayoutId, status, utr = null) {
    const upperStatus = status.toUpperCase();

    const { rowCount } = await db.query(
      `UPDATE payouts
       SET status = $1,
           utr = COALESCE($2, utr),
           updated_at = NOW()
       WHERE razorpay_payout_id = $3`,
      [upperStatus, utr, razorpayPayoutId]
    );

    if (rowCount > 0) {
      logger.info(`[updatePayoutStatus] Payout ${razorpayPayoutId} → ${upperStatus}${utr ? `, UTR: ${utr}` : ''}`);
    } else {
      logger.warn(`[updatePayoutStatus] No payout found for razorpay_payout_id=${razorpayPayoutId}`);
    }

    return rowCount;
  }
}

module.exports = new PayoutService();
