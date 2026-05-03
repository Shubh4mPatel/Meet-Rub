const { pool: db } = require('../../../config/dbConfig');
const payoutService = require('../../razor-pay-services/payoutService');
const linkedAccountService = require('../../razor-pay-services/linkedAccountService');
const AppError = require("../../../utils/appError");

// Add/Update bank account details
const addBankAccount = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const {
      bank_account_holder_name,
      bank_account_no,
      bank_ifsc_code,
      bank_name,
      bank_branch_name
    } = req.body;

    if (!bank_account_holder_name || !bank_account_no || !bank_ifsc_code) {
      return next(new AppError('bank_account_holder_name, bank_account_no, and bank_ifsc_code are required', 400));
    }

    // Razorpay validation: bank account number must be 5-35 characters
    if (bank_account_no.length < 5 || bank_account_no.length > 35) {
      return next(new AppError('Bank account number must be between 5 and 35 characters', 400));
    }

    // Razorpay validation: IFSC code must be 11 characters (4 alpha + 0 + 6 alphanumeric)
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(bank_ifsc_code)) {
      return next(new AppError('Invalid IFSC code format. Must be 11 characters: 4 letters + 0 + 6 alphanumeric', 400));
    }

    // Razorpay validation: bank account holder name must be 4-200 characters
    if (bank_account_holder_name.length < 4 || bank_account_holder_name.length > 200) {
      return next(new AppError('Bank account holder name must be between 4 and 200 characters', 400));
    }

    // Check if Razorpay linked account exists
    const { rows: checkRows } = await db.query(
      'SELECT razorpay_linked_account_id, razorpay_account_status FROM freelancer WHERE user_id = $1',
      [userId]
    );

    if (checkRows[0]?.razorpay_linked_account_id) {
      return next(new AppError(
        'Cannot update bank details after Razorpay account is created. Contact admin to reset your Razorpay account first.',
        403
      ));
    }

    // Update bank details and reset razorpay_account_id (legacy payout fund account)
    const { rowCount } = await db.query(
      `UPDATE freelancer
       SET bank_account_holder_name = $1,
           bank_account_no = $2,
           bank_ifsc_code = $3,
           bank_name = $4,
           bank_branch_name = $5,
           razorpay_account_id = NULL,
           updated_at = NOW()
       WHERE user_id = $6`,
      [bank_account_holder_name, bank_account_no, bank_ifsc_code,
        bank_name || null, bank_branch_name || null, userId]
    );

    if (rowCount === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    return res.json({ message: 'Bank account updated successfully' });
  } catch (error) {
    console.error('Add bank account error:', error);
    return next(new AppError('Failed to add bank account', 500));
  }
}

// Get bank account details
const getBankAccount = async (req, res, next) => {
  try {
    const userId = req.user.user_id;

    const { rows } = await db.query(
      `SELECT bank_account_holder_name, bank_account_no, bank_ifsc_code,
              bank_name, bank_branch_name
       FROM freelancer
       WHERE user_id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const account = rows[0];

    if (!account.bank_account_no) {
      return next(new AppError('No bank account added yet', 404));
    }

    // Mask account number
    const acc = account.bank_account_no;
    account.bank_account_no = '****' + acc.slice(-4);

    return res.json(account);
  } catch (error) {
    console.error('Get bank account error:', error);
    return next(new AppError('Failed to get bank account', 500));
  }
}

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

    // Get freelancer with balance (locked)
    const { rows: freelancers } = await client.query(
      `SELECT user_id AS freelancer_id, available_balance, verification_status FROM freelancer WHERE user_id = $1 FOR UPDATE`,
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

    if (requestedAmount > parseFloat(freelancer.available_balance)) {
      await client.query('ROLLBACK');
      return next(new AppError(`Insufficient balance. Available: ₹${freelancer.available_balance}`, 400));
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

    // Deduct from available_balance
    await client.query(
      `UPDATE freelancer SET available_balance = available_balance - $1 WHERE user_id = $2`,
      [requestedAmount, freelancerId]
    );

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
        amount: requestedAmount,
        remaining_balance: parseFloat(freelancer.available_balance) - requestedAmount
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
      // available_balance + earnings_balance + bank details directly from freelancer table
      db.query(
        `SELECT earnings_balance, available_balance, bank_name, bank_account_no 
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
          available_balance: parseFloat(freelancerData?.available_balance || 0),
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

// Trigger Razorpay linked account onboarding for freelancer
const onboardLinkedAccount = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;

    const result = await linkedAccountService.onboardFreelancer(freelancerId);

    return res.status(200).json({
      status: 'success',
      message: result.status === 'already_activated'
        ? 'Linked account already activated.'
        : 'Linked account onboarding initiated.',
      data: result,
    });
  } catch (error) {
    console.error('onboardLinkedAccount error:', error);
    return next(new AppError(error.message || 'Failed to onboard linked account', 500));
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

// Add/Update address details (for Razorpay Routes onboarding)
const addAddress = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const { street_address, city, state, postal_code } = req.body;

    // Required fields validation
    if (!street_address || !city || !state || !postal_code) {
      return next(new AppError('street_address, city, state, and postal_code are required', 400));
    }

    // Razorpay validation: street address must be at least 10 characters (stakeholder requirement)
    if (street_address.trim().length < 10) {
      return next(new AppError('Street address must be at least 10 characters long', 400));
    }

    // Razorpay validation: postal code must be exactly 6 digits
    const postalCodeStr = String(postal_code).trim();
    if (!/^\d{6}$/.test(postalCodeStr)) {
      return next(new AppError('Postal code must be exactly 6 digits', 400));
    }

    // Razorpay validation: city (min 2, max 100 characters)
    if (city.trim().length < 2 || city.trim().length > 100) {
      return next(new AppError('City must be between 2 and 100 characters', 400));
    }

    // Razorpay validation: state (min 2, max 50 characters)
    if (state.trim().length < 2 || state.trim().length > 50) {
      return next(new AppError('State must be between 2 and 50 characters', 400));
    }

    // Check if Razorpay linked account exists
    const { rows: checkRows } = await db.query(
      'SELECT razorpay_linked_account_id, razorpay_account_status FROM freelancer WHERE user_id = $1',
      [userId]
    );

    if (checkRows[0]?.razorpay_linked_account_id) {
      return next(new AppError(
        'Cannot update address after Razorpay account is created. Contact admin to reset your Razorpay account first.',
        403
      ));
    }

    const { rowCount } = await db.query(
      `UPDATE freelancer
       SET street_address = $1,
           city = $2,
           state = $3,
           postal_code = $4,
           updated_at = NOW()
       WHERE user_id = $5`,
      [street_address.trim(), city.trim(), state.trim(), postalCodeStr, userId]
    );

    if (rowCount === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    return res.json({ 
      status: 'success',
      message: 'Address updated successfully',
      data: {
        street_address: street_address.trim(),
        city: city.trim(),
        state: state.trim(),
        postal_code: postalCodeStr
      }
    });
  } catch (error) {
    console.error('Add address error:', error);
    return next(new AppError('Failed to add address', 500));
  }
};

// Get address details
const getAddress = async (req, res, next) => {
  try {
    const userId = req.user.user_id;

    const { rows } = await db.query(
      `SELECT street_address, city, state, postal_code
       FROM freelancer
       WHERE user_id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const address = rows[0];

    if (!address.street_address && !address.city && !address.state && !address.postal_code) {
      return next(new AppError('No address added yet', 404));
    }

    return res.json({
      status: 'success',
      data: address
    });
  } catch (error) {
    console.error('Get address error:', error);
    return next(new AppError('Failed to get address', 500));
  }
};

module.exports = {
  addBankAccount,
  getBankAccount,
  getMyPayouts,
  requestPayout,
  getWalletDashboard,
  getTransactionHistory,
  onboardLinkedAccount,
  getLinkedAccountStatus,
  addAddress,
  getAddress,
}
