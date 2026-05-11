const { pool: db } = require('../../../config/dbConfig');
const payoutService = require('../../razor-pay-services/payoutService');
const AppError = require("../../../utils/appError");

// Get freelancer's withdrawal history with filters and pagination
const getMyPayouts = async (req, res, next) => {
  try {
    const freelancerId = req.user.user_id;
    const { status, from_date, to_date, page = 1, limit = 10 } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedPage) || parsedPage < 1) {
      return next(new AppError('Invalid page number', 400));
    }
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return next(new AppError('Invalid limit. Must be between 1 and 100', 400));
    }

    const result = await payoutService.getFreelancerPayouts(freelancerId, {
      status,
      from_date,
      to_date,
      page: parsedPage,
      limit: parsedLimit
    });

    res.json(result);
  } catch (error) {
    if (error.message && error.message.startsWith('Invalid status')) {
      return next(new AppError(error.message, 400));
    }
    console.error('Get my payouts error:', error);
    return next(new AppError('Failed to get withdrawal history', 500));
  }
}

// Get current earnings balance

// Request payout (partial amount allowed)
const requestPayout = async (req, res, next) => {
  const freelancerId = req.user.user_id; // Standardize on users.id for payouts.freelancer_id
  const { amount } = req.body;

  if (!amount || isNaN(amount)) {
    return next(new AppError('amount is required', 400));
  }

  const requestedAmount = parseFloat(amount);

  if (requestedAmount < 100) {
    return next(new AppError('Minimum payout amount is ₹100', 400));
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Get freelancer verification status (locked)
    const { rows: freelancers } = await client.query(
      `SELECT user_id AS freelancer_id, verification_status FROM freelancer WHERE user_id = $1 FOR UPDATE`,
      [freelancerId]
    );

    if (freelancers.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (freelancer.verification_status !== 'VERIFIED') {
      await client.query('ROLLBACK');
      return next(new AppError('Your account must be verified before requesting a payout', 400));
    }

    // Check no active payout request already exists
    const { rows: activePayout } = await client.query(
      `SELECT id FROM payouts WHERE freelancer_id = $1 AND status IN ('REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING')`,
      [freelancerId]
    );

    if (activePayout.length > 0) {
      await client.query('ROLLBACK');
      return next(new AppError('You already have a payout request in progress', 400));
    }

    // Create payout request
    const { rows: payoutResult } = await client.query(
      `INSERT INTO payouts (freelancer_id, amount, currency, status)
       VALUES ($1, $2, $3, 'REQUESTED')
       RETURNING id`,
      [freelancerId, requestedAmount, process.env.CURRENCY || 'INR']
    );

    await client.query('COMMIT');

    return res.status(201).json({
      status: 'success',
      message: 'Payout request submitted successfully.',
      data: {
        payout_id: payoutResult[0].id,
        amount: requestedAmount
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('requestPayout error:', error);
    return next(new AppError('Failed to request payout', 500));
  } finally {
    client.release();
  }
};

// Get wallet dashboard — summary + last 5 transactions
const getWalletDashboard = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;
    const userId = req.user.user_id;

    // All summary queries in parallel
    const [pendingRows, balanceRows, completedRows] = await Promise.all([
      // HELD transactions — pending release
      db.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(freelancer_amount), 0) as total
         FROM transactions WHERE freelancer_id = $1 AND status = 'HELD'`,
        [freelancerId]
      ),
      // earnings_balance + bank details directly from freelancer table
      db.query(
        `SELECT earnings_balance, bank_name, bank_account_no
         FROM freelancer WHERE freelancer_id = $1`,
        [freelancerId]
      ),
      // Total lifetime earnings from COMPLETED transactions
      db.query(
        `SELECT COALESCE(SUM(freelancer_amount), 0) as total
         FROM transactions WHERE freelancer_id = $1 AND status = 'COMPLETED'`,
        [freelancerId]
      ),
    ]);

    // Prepare masked bank info
    const freelancerData = balanceRows.rows[0];
    let maskedBankInfo = null;
    if (freelancerData?.bank_account_no && freelancerData?.bank_name) {
      const lastFourDigits = freelancerData.bank_account_no.slice(-4);
      maskedBankInfo = `${freelancerData.bank_name} ****${lastFourDigits}`;
    }

    // Last 5 combined transactions (orders + withdrawals) ordered DESC
    const { rows: recentTx } = await db.query(
      `SELECT * FROM (
        SELECT
          t.id,
          t.created_at                                         AS date_time,
          'Order Payment'                                      AS type,
          CONCAT('Payment received for order #', p.id)        AS description,
          t.freelancer_amount                                  AS amount,
          'Completed'                                          AS status
        FROM transactions t
        JOIN projects p ON t.project_id = p.id
        WHERE t.freelancer_id = $1 AND t.status = 'COMPLETED'

        UNION ALL

        SELECT
          py.id,
          py.requested_at                                                                                            AS date_time,
          'Withdrawal'                                                                                               AS type,
          CONCAT('Bank Transfer to ', COALESCE(f.bank_name, 'Bank'), ' ****', RIGHT(COALESCE(f.bank_account_no, '0000'), 4)) AS description,
          -py.amount                                                                                                 AS amount,
          CASE
            WHEN py.status = 'PROCESSED' THEN 'Completed'
            WHEN py.status = 'REJECTED'  THEN 'Rejected'
            WHEN py.status = 'FAILED'    THEN 'Failed'
            ELSE 'Pending'
          END                                                                                                        AS status
        FROM payouts py
        JOIN freelancer f ON f.user_id = py.freelancer_id
        WHERE py.freelancer_id = $2
      ) combined
      ORDER BY date_time DESC
      LIMIT 5`,
      [freelancerId, userId]
    );

    return res.status(200).json({
      status: 'success',
      data: {
        wallet_summary: {
          pending_release: parseFloat(pendingRows.rows[0].total),
          pending_orders_count: parseInt(pendingRows.rows[0].count),
          earnings_balance: parseFloat(freelancerData?.earnings_balance || 0),
          total_lifetime_earnings: parseFloat(completedRows.rows[0].total),
          currency: process.env.CURRENCY || 'INR',
          bank_account: maskedBankInfo,
        },
        recent_transactions: recentTx.map(tx => ({
          id: tx.id,
          date_time: tx.date_time,
          type: tx.type,
          description: tx.description,
          amount: parseFloat(tx.amount),
          status: tx.status,
        })),
      },
    });
  } catch (error) {
    console.error('getWalletDashboard error:', error);
    return next(new AppError('Failed to get wallet dashboard', 500));
  }
};

// Get combined transaction history (order payments + withdrawals) with filters
const getTransactionHistory = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;
    const userId = req.user.user_id;

    const { type = 'all', start_date = '', end_date = '', page = '1', limit = '10' } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const VALID_TYPES = ['all', 'order', 'withdrawal'];
    if (!VALID_TYPES.includes(type)) {
      return next(new AppError('Invalid type. Allowed: all, order, withdrawal', 400));
    }

    // Date conditions — same param indices used in both sides of UNION
    let dateWhere = '';
    const dateParams = [];
    let dateIdx = 3; // $1 = freelancerId, $2 = userId

    if (start_date && start_date.trim()) {
      dateWhere += ` AND date_time >= $${dateIdx++}::date`;
      dateParams.push(start_date.trim());
    }
    if (end_date && end_date.trim()) {
      dateWhere += ` AND date_time < ($${dateIdx++}::date + interval '1 day')`;
      dateParams.push(end_date.trim());
    }

    const orderQuery = `
      SELECT
        t.id,
        t.created_at                                              AS date_time,
        'Order Payment'                                           AS type,
        CONCAT('Payment received for order #', p.id)             AS description,
        t.freelancer_amount                                       AS amount,
        'Completed'                                               AS status,
        t.id                                                      AS transaction_id,
        c.full_name                                               AS creator_name,
        s.service_name                                            AS service_name
      FROM transactions t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN creators c ON p.creator_id = c.creator_id
      LEFT JOIN services s ON p.service_id = s.id
      WHERE t.freelancer_id = $1 AND t.status = 'COMPLETED'
    `;

    const withdrawalQuery = `
      SELECT
        py.id,
        py.requested_at                                                                                       AS date_time,
        'Withdrawal'                                                                                          AS type,
        CONCAT('Bank Transfer to ', COALESCE(f.bank_name, 'Bank'), ' ****', RIGHT(COALESCE(f.bank_account_no, '0000'), 4)) AS description,
        -py.amount                                                                                            AS amount,
        CASE
          WHEN py.status = 'PROCESSED'  THEN 'Completed'
          WHEN py.status = 'REJECTED'   THEN 'Rejected'
          WHEN py.status = 'FAILED'     THEN 'Failed'
          ELSE 'Pending'
        END                                                                                                   AS status,
        NULL                                                      AS transaction_id,
        NULL                                                      AS creator_name,
        NULL                                                      AS service_name
      FROM payouts py
      JOIN freelancer f ON f.user_id = py.freelancer_id
      WHERE py.freelancer_id = $2
    `;

    let unionQuery;
    if (type === 'order') {
      unionQuery = orderQuery;
    } else if (type === 'withdrawal') {
      unionQuery = withdrawalQuery;
    } else {
      unionQuery = `${orderQuery} UNION ALL ${withdrawalQuery}`;
    }

    const wrappedQuery = `SELECT * FROM (${unionQuery}) combined WHERE 1=1 ${dateWhere}`;
    const queryParams = [freelancerId, userId, ...dateParams];

    const [dataResult, countResult] = await Promise.all([
      db.query(`${wrappedQuery} ORDER BY date_time DESC LIMIT $${dateIdx++} OFFSET $${dateIdx++}`, [...queryParams, limitNum, offset]),
      db.query(`SELECT COUNT(*) as total FROM (${wrappedQuery}) counted`, queryParams),
    ]);

    const total = parseInt(countResult.rows[0].total);

    return res.status(200).json({
      status: 'success',
      data: {
        transactions: dataResult.rows.map(tx => ({
          id: tx.id,
          date_time: tx.date_time,
          type: tx.type,
          description: tx.description,
          amount: parseFloat(tx.amount),
          status: tx.status,
          transaction_id: tx.transaction_id,
          creator_name: tx.creator_name,
          service_name: tx.service_name,
        })),
        pagination: {
          total,
          total_pages: Math.ceil(total / limitNum),
          current_page: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    console.error('getTransactionHistory error:', error);
    return next(new AppError('Failed to get transaction history', 500));
  }
};

// Get completed projects for withdrawal — with earnings balance + active payout status
const getWithdrawalList = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;
    const userId = req.user.user_id;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || '';
    const from_date = req.query.from_date?.trim() || '';
    const to_date = req.query.to_date?.trim() || '';

    // Build dynamic WHERE conditions for project query
    const conditions = [`p.freelancer_id = $1`, `p.status = 'COMPLETED'`];
    const params = [freelancerId];
    let idx = 2;

    if (search) {
      conditions.push(`s.service_name ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }
    if (from_date) {
      conditions.push(`p.completed_at >= $${idx++}::date`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`p.completed_at < ($${idx++}::date + interval '1 day')`);
      params.push(to_date);
    }

    const whereClause = conditions.join(' AND ');

    const [balanceResult, activePayoutResult, projectsResult, countResult] = await Promise.all([
      // Earnings balance
      db.query(
        `SELECT earnings_balance FROM freelancer WHERE freelancer_id = $1`,
        [freelancerId]
      ),
      // Any in-progress payout request
      db.query(
        `SELECT id AS payout_id, amount, status, requested_at
         FROM payouts
         WHERE freelancer_id = $1 AND status IN ('REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING')
         ORDER BY requested_at DESC LIMIT 1`,
        [userId]
      ),
      // Completed projects with service name
      db.query(
        `SELECT
           p.id AS project_id,
           s.service_name,
           p.completed_at,
           t.freelancer_amount AS amount
         FROM projects p
         JOIN transactions t ON t.project_id = p.id
         LEFT JOIN services s ON p.service_id = s.id
         WHERE ${whereClause}
         ORDER BY p.completed_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      ),
      // Total count
      db.query(
        `SELECT COUNT(*) AS total
         FROM projects p
         LEFT JOIN services s ON p.service_id = s.id
         WHERE ${whereClause}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].total);

    return res.status(200).json({
      status: 'success',
      data: {
        earnings_balance: parseFloat(balanceResult.rows[0]?.earnings_balance || 0),
        active_payout: activePayoutResult.rows[0] || null,
        projects: projectsResult.rows.map(p => ({
          project_id: p.project_id,
          service_name: p.service_name,
          completed_at: p.completed_at,
          amount: parseFloat(p.amount),
        })),
        pagination: {
          total,
          total_pages: Math.ceil(total / limit),
          current_page: page,
          limit,
        },
      },
    });
  } catch (error) {
    console.error('getWithdrawalList error:', error);
    return next(new AppError('Failed to get withdrawal list', 500));
  }
};

// Get linked account status for the current freelancer
const getLinkedAccountStatus = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;

    const { rows } = await db.query(
      `SELECT razorpay_linked_account_id, razorpay_stakeholder_id,
              razorpay_product_id, razorpay_account_status
       FROM freelancer WHERE freelancer_id = $1`,
      [freelancerId]
    );

    if (rows.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    return res.status(200).json({
      status: 'success',
      data: rows[0],
    });
  } catch (error) {
    console.error('getLinkedAccountStatus error:', error);
    return next(new AppError('Failed to get linked account status', 500));
  }
};

module.exports = {
  getMyPayouts,
  requestPayout,
  getWalletDashboard,
  getTransactionHistory,
  getLinkedAccountStatus,
  getWithdrawalList,
}
