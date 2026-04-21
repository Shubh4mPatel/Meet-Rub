const { pool: db } = require('../../config/dbConfig');
const razorpay = require('../../config/razorpayX');

class PayoutService {
  // Create Razorpay contact + fund account using bank details from freelancer table
  async createFundAccount(freelancer) {
    try {
      const contact = await razorpay.contacts.create({
        name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
        email: freelancer.freelancer_email || '',
        contact: freelancer.phone_number || '',
        type: 'vendor',
        reference_id: `freelancer_${freelancer.freelancer_id}`,
        notes: {
          freelancer_id: freelancer.freelancer_id
        }
      });

      const fundAccount = await razorpay.fundAccount.create({
        contact_id: contact.id,
        account_type: 'bank_account',
        bank_account: {
          name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
          ifsc: freelancer.bank_ifsc_code,
          account_number: freelancer.bank_account_no
        }
      });

      return fundAccount;
    } catch (error) {
      throw new Error(`Failed to create fund account: ${error.message}`);
    }
  }

  // Process payout via Razorpay X using bank details from freelancer table
  async processPayout(payoutId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: payouts } = await client.query(
        `SELECT p.*,
          f.freelancer_id, f.freelancer_full_name, f.freelancer_email,
          f.phone_number, f.bank_account_no, f.bank_ifsc_code,
          f.bank_account_holder_name, f.razorpay_account_id
         FROM payouts p
         JOIN users u ON p.freelancer_id = u.id
         JOIN freelancer f ON f.user_id = u.id
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

      if (!payout.bank_account_no || !payout.bank_ifsc_code) {
        throw new Error('Freelancer bank details are incomplete');
      }

      await client.query(
        `UPDATE payouts SET status = 'PENDING', initiated_at = NOW() WHERE id = $1`,
        [payoutId]
      );

      await client.query('COMMIT');

      // Reuse existing Razorpay fund account, or create a new one
      let fundAccountId = payout.razorpay_fund_account_id || payout.razorpay_account_id;

      if (!fundAccountId) {
        const fundAccount = await this.createFundAccount(payout);
        fundAccountId = fundAccount.id;

        await db.query(
          `UPDATE freelancer SET razorpay_account_id = $1 WHERE freelancer_id = $2`,
          [fundAccountId, payout.freelancer_id]
        );
      }

      const razorpayPayout = await razorpay.payouts.create({
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
        fund_account_id: fundAccountId,
        amount: Math.round(payout.amount * 100),
        currency: payout.currency || 'INR',
        mode: payout.mode || 'IMPS',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: payout.reference_id,
        narration: `Payout #${payoutId} for freelancer ${payout.freelancer_id}`,
        notes: {
          payout_id: payoutId,
          freelancer_id: payout.freelancer_id
        }
      });

      await db.query(
        `UPDATE payouts
         SET razorpay_payout_id = $1, razorpay_fund_account_id = $2,
             status = 'PROCESSING', utr = $3
         WHERE id = $4`,
        [razorpayPayout.id, fundAccountId, razorpayPayout.utr || null, payoutId]
      );

      return razorpayPayout;
    } catch (error) {
      await client.query('ROLLBACK');

      // Get payout details and refund to available_balance
      const { rows: payoutDetails } = await db.query(
        `SELECT po.amount, po.freelancer_id, f.freelancer_id AS f_id
         FROM payouts po
         JOIN users u ON po.freelancer_id = u.id
         JOIN freelancer f ON f.user_id = u.id
         WHERE po.id = $1`,
        [payoutId]
      );

      // Update payout status to FAILED
      await db.query(
        `UPDATE payouts SET status = 'FAILED', failure_reason = $1 WHERE id = $2`,
        [error.message, payoutId]
      );

      // Refund to available_balance
      if (payoutDetails.length > 0) {
        await db.query(
          `UPDATE freelancer SET available_balance = available_balance + $1
           WHERE freelancer_id = $2`,
          [payoutDetails[0].amount, payoutDetails[0].f_id]
        );
        console.log(`[processPayout] Refunded ${payoutDetails[0].amount} to freelancer ${payoutDetails[0].f_id} due to processing failure`);
      }

      throw error;
    } finally {
      client.release();
    }
  }

  // Get payout details
  async getPayout(payoutId) {
    const { rows } = await db.query(
      `SELECT p.*,
        u.user_name as freelancer_username,
        f.freelancer_full_name as freelancer_name,
        f.bank_account_no, f.bank_ifsc_code, f.bank_name
      FROM payouts p
      JOIN users u ON p.freelancer_id = u.id
      JOIN freelancer f ON f.user_id = u.id
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
      conditions.push(`p.requested_at >= $${idx++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`p.requested_at <= ($${idx++}::date + interval '1 day')`);
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
        p.utr,
        p.rejection_reason,
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
