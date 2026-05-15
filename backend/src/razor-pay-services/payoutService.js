const { pool: db } = require('../../config/dbConfig');
const { getLogger } = require('../../utils/logger');
const logger = getLogger('payout-service');

class PayoutService {
  async getFreelancerPayouts(freelancerId, { status, from_date, to_date, page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    const params = [freelancerId];
    let idx = 2;
    const conditions = ['p.freelancer_id = $1'];

    const VALID_STATUSES = ['REQUESTED', 'PROCESSED', 'CREDITED', 'REJECTED', 'FAILED', 'REVERSED'];
    if (status) {
      const upperStatus = status.toUpperCase();
      if (!VALID_STATUSES.includes(upperStatus)) {
        throw new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`);
      }
      conditions.push(`p.status = $${idx++}`);
      params.push(upperStatus);
    }

    if (from_date) {
      conditions.push(`p.requested_at >= $${idx++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`p.requested_at <= ($${idx++}::date + interval '1 day')`);
      params.push(to_date);
    }

    const whereClause = conditions.join(' AND ');

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total FROM payouts p WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].total);

    const { rows: statusCounts } = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'REQUESTED')                    AS pending,
        COUNT(*) FILTER (WHERE status IN ('PROCESSED', 'CREDITED'))     AS completed,
        COUNT(*) FILTER (WHERE status = 'REJECTED')                     AS rejected
       FROM payouts
       WHERE freelancer_id = $1`,
      [freelancerId]
    );

    const STATUS_LABEL = {
      REQUESTED: 'In process',
      PROCESSED: 'Releasing',
      CREDITED:  'Credited',
      REJECTED:  'Rejected',
      FAILED:    'Failed',
      REVERSED:  'Reversed',
    };

    const dataParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT
        p.id,
        p.amount,
        p.currency,
        p.status,
        p.rejection_reason,
        p.failure_reason,
        p.rejected_at,
        p.requested_at,
        f.bank_account_no,
        f.bank_name
       FROM payouts p
       JOIN freelancer f ON f.user_id = p.freelancer_id
       WHERE ${whereClause}
       ORDER BY p.requested_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const payouts = rows.map((row) => {
      const masked = row.bank_account_no
        ? '****' + row.bank_account_no.slice(-4)
        : null;

      const reason = row.rejection_reason || row.failure_reason || null;

      return {
        id: row.id,
        reference_id: `WDL-${row.id}`,
        amount: parseFloat(row.amount),
        currency: row.currency,
        status: row.status,
        status_label: STATUS_LABEL[row.status] || row.status,
        reason,
        requested_at: row.requested_at,
        rejected_at: row.rejected_at,
        bank_name: row.bank_name,
        bank_account_no: masked,
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
        pending: parseInt(statusCounts[0].pending),
        completed: parseInt(statusCounts[0].completed),
        rejected: parseInt(statusCounts[0].rejected),
      },
    };
  }
}

module.exports = new PayoutService();
