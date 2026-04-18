const { pool: db } = require('../../config/dbConfig');
const razorpay = require('../../config/razorpayX');

class PayoutService {
  // Create fund account for freelancer
  async createFundAccount(freelancerAccountId) {
    try {
      const { rows: accounts } = await db.query(
        'SELECT * FROM freelancer_accounts WHERE id = $1',
        [freelancerAccountId]
      );

      if (accounts.length === 0) {
        throw new Error('Freelancer account not found');
      }

      const account = accounts[0];

      const contact = await razorpay.contacts.create({
        name: account.bank_account_name,
        email: '',
        contact: '',
        type: 'vendor',
        reference_id: `freelancer_${account.user_id}`,
        notes: {
          user_id: account.user_id
        }
      });

      const fundAccount = await razorpay.fundAccount.create({
        contact_id: contact.id,
        account_type: 'bank_account',
        bank_account: {
          name: account.bank_account_name,
          ifsc: account.bank_ifsc_code,
          account_number: account.bank_account_number
        }
      });

      return fundAccount;
    } catch (error) {
      throw new Error(`Failed to create fund account: ${error.message}`);
    }
  }


  // Process payout via Razorpay
  async processPayout(payoutId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: payouts } = await client.query(
        `SELECT p.*, fa.*
        FROM payouts p
        JOIN freelancer_accounts fa ON p.freelancer_account_id = fa.id
        WHERE p.id = $1 FOR UPDATE`,
        [payoutId]
      );

      if (payouts.length === 0) {
        throw new Error('Payout not found');
      }

      const payout = payouts[0];

      if (payout.status !== 'QUEUED') {
        throw new Error('Payout already processed');
      }

      await client.query(
        `UPDATE payouts SET status = 'PENDING', initiated_at = NOW() WHERE id = $1`,
        [payoutId]
      );

      await client.query('COMMIT');

      // Create fund account if not exists
      let fundAccountId = payout.razorpay_fund_account_id;

      if (!fundAccountId) {
        const fundAccount = await this.createFundAccount(payout.freelancer_account_id);
        fundAccountId = fundAccount.id;

        await db.query(
          'UPDATE freelancer_accounts SET razorpay_account_id = $1 WHERE id = $2',
          [fundAccountId, payout.freelancer_account_id]
        );
      }

      const razorpayPayout = await razorpay.payouts.create({
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
        fund_account_id: fundAccountId,
        amount: Math.round(payout.amount * 100),
        currency: payout.currency || 'INR',
        mode: 'IMPS',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: payout.reference_id,
        narration: `Payment for transaction ${payout.transaction_id}`,
        notes: {
          transaction_id: payout.transaction_id,
          payout_id: payoutId
        }
      });

      await db.query(
        `UPDATE payouts
        SET razorpay_payout_id = $1, razorpay_fund_account_id = $2,
            status = 'PROCESSING', utr = $3
        WHERE id = $4`,
        [razorpayPayout.id, fundAccountId, razorpayPayout.utr, payoutId]
      );

      await db.query(
        `UPDATE transactions SET payout_id = $1, payout_status = 'PROCESSING' WHERE id = $2`,
        [razorpayPayout.id, payout.transaction_id]
      );

      return razorpayPayout;
    } catch (error) {
      await client.query('ROLLBACK');

      await db.query(
        `UPDATE payouts SET status = 'FAILED', failure_reason = $1 WHERE id = $2`,
        [error.message, payoutId]
      );

      throw error;
    } finally {
      client.release();
    }
  }

  // Get payout details
  async getPayout(payoutId) {
    const { rows } = await db.query(
      `SELECT p.*,
        t.project_id,
        f.freelancer_full_name as freelancer_name,
        fa.bank_account_number, fa.bank_ifsc_code
      FROM payouts p
      JOIN transactions t ON p.transaction_id = t.id
      JOIN freelancer f ON p.freelancer_id = f.freelancer_id
      JOIN freelancer_accounts fa ON p.freelancer_account_id = fa.id
      WHERE p.id = $1`,
      [payoutId]
    );
    return rows[0] || null;
  }

  // Get all payouts for a freelancer with filters and pagination
  async getFreelancerPayouts(freelancerId, { status, from_date, to_date, page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    const params = [freelancerId];
    let idx = 2;
    const conditions = ['p.freelancer_id = $1'];

    const VALID_STATUSES = ['REQUESTED', 'PROCESSED', 'REJECTED'];
    if (status) {
      const upperStatus = status.toUpperCase();
      if (!VALID_STATUSES.includes(upperStatus)) {
        throw new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`);
      }
      conditions.push(`p.status = $${idx++}`);
      params.push(upperStatus);
    }

    if (from_date) {
      conditions.push(`p.created_at >= $${idx++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`p.created_at <= ($${idx++}::date + interval '1 day')`);
      params.push(to_date);
    }

    const whereClause = conditions.join(' AND ');

    // Total count for pagination
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total FROM payouts p WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].total);

    // Status counts for dashboard summary
    const { rows: statusCounts } = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'REQUESTED') AS pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSED') AS completed,
        COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected
       FROM payouts
       WHERE freelancer_id = $1`,
      [freelancerId]
    );

    // Paginated results
    const dataParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT
        p.id,
        p.amount,
        p.currency,
        p.status,
        p.mode,
        p.reference_id,
        p.utr,
        p.rejection_reason,
        p.requested_at,
        p.approved_at,
        p.rejected_at,
        p.processed_at,
        p.created_at,
        f.bank_account_no,
        f.bank_name
       FROM payouts p
       JOIN freelancer f ON f.user_id = p.freelancer_id
       WHERE ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    // Mask bank account numbers
    const payouts = rows.map((row) => {
      if (row.bank_account_no) {
        const acc = row.bank_account_no;
        row.bank_account_no = '****' + acc.slice(-4);
      }
      return row;
    });

    return {
      payouts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / limit)
      },
      summary: {
        pending: parseInt(statusCounts[0].pending),
        completed: parseInt(statusCounts[0].completed),
        rejected: parseInt(statusCounts[0].rejected)
      }
    };
  }

  // Update payout status (called by webhook)
  async updatePayoutStatus(razorpayPayoutId, status, utr = null) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const statusValue = status === 'processed' ? 'PROCESSED' : status.toUpperCase();
      let setClause = 'status = $1, updated_at = NOW()';
      const params = [statusValue];
      let paramIdx = 2;

      if (utr) {
        setClause += `, utr = $${paramIdx++}`;
        params.push(utr);
      }

      if (status === 'processed') {
        setClause += `, processed_at = NOW()`;
      }

      params.push(razorpayPayoutId);
      await client.query(
        `UPDATE payouts SET ${setClause} WHERE razorpay_payout_id = $${paramIdx}`,
        params
      );

      if (status === 'processed') {
        await client.query(
          `UPDATE transactions
          SET status = 'COMPLETED', payout_status = 'PROCESSED', payout_utr = $1
          FROM payouts p
          WHERE transactions.id = p.transaction_id AND p.razorpay_payout_id = $2`,
          [utr, razorpayPayoutId]
        );
      } else if (status === 'failed' || status === 'reversed') {
        await client.query(
          `UPDATE transactions
          SET payout_status = 'FAILED'
          FROM payouts p
          WHERE transactions.id = p.transaction_id AND p.razorpay_payout_id = $1`,
          [razorpayPayoutId]
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
}

module.exports = new PayoutService();
