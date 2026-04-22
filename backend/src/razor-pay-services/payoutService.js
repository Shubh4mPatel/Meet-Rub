const { pool: db } = require('../../config/dbConfig');
const razorpayX = require('../../config/razorpayX');
const { getLogger } = require('../../utils/logger');
const logger = getLogger('payout-service');

class PayoutService {
  // Step 1: Create a RazorpayX Contact
  async createContact(freelancer) {
    try {
      const contactData = {
        name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
        email: freelancer.freelancer_email || '',
        contact: freelancer.phone_number || '',
        type: 'vendor',
        reference_id: `freelancer_${freelancer.freelancer_id}`,
        notes: {
          freelancer_id: String(freelancer.freelancer_id)
        }
      };
      logger.info(`[createContact] Creating contact for freelancer_id=${freelancer.freelancer_id}`);

      const response = await razorpayX.post('/contacts', contactData);
      logger.info(`[createContact] Contact created: contact_id=${response.data.id}`);
      return response.data.id;
    } catch (err) {
      const errMsg = err.response?.data?.error?.description || err.message;
      logger.error(`[createContact] Failed for freelancer_id=${freelancer?.freelancer_id}: ${errMsg}`);
      throw new Error(`Contact creation failed: ${errMsg}`);
    }
  }

  // Step 2: Create a Fund Account linked to a contact
  async createFundAccount(contactId, freelancer) {
    try {
      if (!freelancer.bank_account_holder_name && !freelancer.freelancer_full_name) {
        throw new Error('Missing account holder name and freelancer name');
      }
      if (!freelancer.bank_ifsc_code) {
        throw new Error(`Missing IFSC code for freelancer ${freelancer.freelancer_id}`);
      }
      if (!freelancer.bank_account_no) {
        throw new Error(`Missing bank account number for freelancer ${freelancer.freelancer_id}`);
      }

      const fundAccountData = {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: {
          name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
          ifsc: freelancer.bank_ifsc_code,
          account_number: freelancer.bank_account_no
        }
      };
      logger.info(`[createFundAccount] Creating fund account for freelancer_id=${freelancer.freelancer_id}, contact_id=${contactId}`, JSON.stringify({
        ...fundAccountData,
        bank_account: { ...fundAccountData.bank_account, account_number: '****' + freelancer.bank_account_no.slice(-4) }
      }, null, 2));

      const response = await razorpayX.post('/fund_accounts', fundAccountData);
      logger.info(`[createFundAccount] Fund account created: fund_account_id=${response.data.id}`);
      return response.data.id;
    } catch (err) {
      const errMsg = err.response?.data?.error?.description || err.message;
      logger.error(`[createFundAccount] Failed for freelancer_id=${freelancer?.freelancer_id}: ${errMsg}`);
      throw new Error(`Fund account creation failed: ${errMsg}`);
    }
  }

  // Step 3: Create a Payout to a fund account
  async createPayout(fundAccountId, amount, payoutId, freelancerId, currency, mode) {
    try {
      const payoutData = {
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
        fund_account_id: fundAccountId,
        amount: Math.round(amount * 100),
        currency: currency || 'INR',
        mode: mode || 'IMPS',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: `payout_${payoutId}`,
        narration: `Freelancer payout ${payoutId}`,
        notes: {
          payout_id: String(payoutId),
          freelancer_id: String(freelancerId)
        }
      };
      logger.info(`[createPayout] Creating payout for payout_id=${payoutId}, amount=${amount}`);

      const response = await razorpayX.post('/payouts', payoutData);
      logger.info(`[createPayout] Payout created: razorpay_payout_id=${response.data.id}, status=${response.data.status}`);
      return response.data;
    } catch (err) {
      const errMsg = err.response?.data?.error?.description || err.message;
      logger.error(`[createPayout] Failed for payout_id=${payoutId}: ${errMsg}`);
      throw new Error(`Payout creation failed: ${errMsg}`);
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
        // Step 1: Create Contact
        const contactId = await this.createContact(payout);

        // Step 2: Create Fund Account
        fundAccountId = await this.createFundAccount(contactId, payout);

        await db.query(
          `UPDATE freelancer SET razorpay_account_id = $1 WHERE freelancer_id = $2`,
          [fundAccountId, payout.freelancer_id]
        );
      }

      // Step 3: Create Payout
      const razorpayPayout = await this.createPayout(
        fundAccountId, payout.amount, payoutId,
        payout.freelancer_id, payout.currency, payout.mode
      );

      await db.query(
        `UPDATE payouts
         SET razorpay_payout_id = $1, razorpay_fund_account_id = $2,
             status = 'PROCESSING', utr = $3
         WHERE id = $4`,
        [razorpayPayout.id, fundAccountId, razorpayPayout.utr || null, payoutId]
      );

      return razorpayPayout;
    } catch (error) {
      logger.error(`[processPayout] ERROR processing payout_id=${payoutId}:`, {
        errorMessage: error.message,
        envAccountNumber: !!process.env.RAZORPAY_ACCOUNT_NUMBER
      });

      await client.query('ROLLBACK');

      // Get payout details and refund to available_balance
      const { rows: payoutDetails } = await db.query(
        `SELECT po.amount, po.freelancer_id, f.freelancer_id AS f_id,
                f.freelancer_full_name, f.bank_account_no, f.bank_ifsc_code,
                f.bank_account_holder_name
         FROM payouts po
         JOIN users u ON po.freelancer_id = u.id
         JOIN freelancer f ON f.user_id = u.id
         WHERE po.id = $1`,
        [payoutId]
      );

      // Build detailed failure reason
      let detailedReason = `${error.message}`;

      if (payoutDetails.length > 0) {
        const details = payoutDetails[0];
        detailedReason += ` | Freelancer: ${details.freelancer_full_name} (ID: ${details.f_id})`;

        // Add validation details
        const validationIssues = [];
        if (!details.bank_account_no) validationIssues.push('missing_account_no');
        if (!details.bank_ifsc_code) validationIssues.push('missing_ifsc');
        if (!details.bank_account_holder_name) validationIssues.push('missing_holder_name');

        if (validationIssues.length > 0) {
          detailedReason += ` | Validation: ${validationIssues.join(', ')}`;
        }
      }

      // Update payout status to FAILED with detailed reason
      await db.query(
        `UPDATE payouts SET status = 'FAILED', failure_reason = $1 WHERE id = $2`,
        [detailedReason, payoutId]
      );

      logger.error(`[processPayout] Updated payout status to FAILED with reason: ${detailedReason}`);

      // Refund to available_balance
      if (payoutDetails.length > 0) {
        await db.query(
          `UPDATE freelancer SET available_balance = available_balance + $1
           WHERE freelancer_id = $2`,
          [payoutDetails[0].amount, payoutDetails[0].f_id]
        );
        logger.warn(`[processPayout] Refunded ${payoutDetails[0].amount} to freelancer ${payoutDetails[0].f_id} (user_id: ${payoutDetails[0].freelancer_id}) due to processing failure`);
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
