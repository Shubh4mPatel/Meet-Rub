const { pool: db } = require('../../../config/dbConfig');
const payoutService = require('../../razor-pay-services/payoutService');
const AppError = require("../../../utils/appError");

// Add/Update bank account details
const addBankAccount = async (req, res, next) => {
  try {
    const freelancerId = req.user.id;
    const {
      bank_account_name,
      bank_account_number,
      bank_ifsc_code,
      bank_name,
      upi_id
    } = req.body;

    if (!bank_account_name || !bank_account_number || !bank_ifsc_code) {
      return next(new AppError('Bank account name, number, and IFSC code are required', 400));
    }

    const { rows: existing } = await db.query(
      'SELECT id FROM freelancer_accounts WHERE user_id = $1',
      [freelancerId]
    );

    let result;
    if (existing.length > 0) {
      await db.query(
        `UPDATE freelancer_accounts
        SET bank_account_name = $1, bank_account_number = $2,
            bank_ifsc_code = $3, bank_name = $4, upi_id = $5,
            verification_status = 'PENDING', updated_at = NOW()
        WHERE user_id = $6`,
        [bank_account_name, bank_account_number, bank_ifsc_code,
          bank_name, upi_id, freelancerId]
      );
      result = { message: 'Bank account updated successfully' };
    } else {
      const { rows: insertResult } = await db.query(
        `INSERT INTO freelancer_accounts
        (user_id, bank_account_name, bank_account_number, bank_ifsc_code,
         bank_name, upi_id, verification_status)
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
        RETURNING id`,
        [freelancerId, bank_account_name, bank_account_number,
          bank_ifsc_code, bank_name, upi_id]
      );
      result = {
        message: 'Bank account added successfully',
        account_id: insertResult[0].id
      };
    }

    res.json(result);
  } catch (error) {
    console.error('Add bank account error:', error);
    return next(new AppError('Failed to add bank account', 500));
  }
}

// Get bank account details
const getBankAccount = async (req, res, next) => {
  try {
    const freelancerId = req.user.id;

    const { rows: accounts } = await db.query(
      `SELECT id, bank_account_name, bank_account_number, bank_ifsc_code,
              bank_name, upi_id, verification_status, is_active, created_at
       FROM freelancer_accounts
       WHERE user_id = $1`,
      [freelancerId]
    );

    if (accounts.length === 0) {
      return next(new AppError('Bank account not found', 404));
    }

    // Mask account number for security
    const account = accounts[0];
    if (account.bank_account_number) {
      const accountNumber = account.bank_account_number;
      account.bank_account_number =
        'X'.repeat(accountNumber.length - 4) + accountNumber.slice(-4);
    }

    res.json(account);
  } catch (error) {
    console.error('Get bank account error:', error);
    return next(new AppError('Failed to get bank account', 500));
  }
}

// Get freelancer's payouts
const getMyPayouts = async (req, res, next) => {
  try {
    const freelancerId = req.user.id;
    const payouts = await payoutService.getFreelancerPayouts(freelancerId);

    res.json({
      count: payouts.length,
      payouts
    });
  } catch (error) {
    console.error('Get my payouts error:', error);
    return next(new AppError('Failed to get payouts', 500));
  }
}

// Get earnings summary
const getEarningsSummary = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;

    const { rows: completed } = await db.query(
      `SELECT COUNT(*) as count, SUM(freelancer_amount) as total
       FROM transactions
       WHERE freelancer_id = $1 AND status = 'COMPLETED'`,
      [freelancerId]
    );

    const { rows: pending } = await db.query(
      `SELECT COUNT(*) as count, SUM(freelancer_amount) as total
       FROM transactions
       WHERE freelancer_id = $1 AND status = 'HELD'`,
      [freelancerId]
    );

    const { rows: processing } = await db.query(
      `SELECT COUNT(*) as count, SUM(freelancer_amount) as total
       FROM transactions
       WHERE freelancer_id = $1 AND status = 'RELEASED'`,
      [freelancerId]
    );

    res.json({
      pending_release: {
        count: pending[0].count,
        total: parseFloat(pending[0].total || 0)
      },
      available_balance: {
        count: processing[0].count,
        total: parseFloat(processing[0].total || 0)
      },
      total_lifetime_earnings: parseFloat(completed[0].total || 0)
    });
  } catch (error) {
    console.error('Get earnings summary error:', error);
    return next(new AppError('Failed to get earnings summary', 500));
  }
}

// Get current earnings balance
const getEarningsBalance = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;

    const { rows } = await db.query(
      'SELECT earnings_balance FROM freelancer WHERE freelancer_id = $1',
      [freelancerId]
    );

    if (rows.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    return res.status(200).json({
      status: 'success',
      data: {
        earnings_balance: parseFloat(rows[0].earnings_balance)
      }
    });
  } catch (error) {
    console.error('getEarningsBalance error:', error);
    return next(new AppError('Failed to get earnings balance', 500));
  }
};

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
      `SELECT user_id AS freelancer_id, earnings_balance, verification_status FROM freelancer WHERE user_id = $1 FOR UPDATE`,
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

    if (requestedAmount > parseFloat(freelancer.earnings_balance)) {
      await client.query('ROLLBACK');
      return next(new AppError(`Insufficient balance. Available: ₹${freelancer.earnings_balance}`, 400));
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

    // Deduct from earnings_balance
    await client.query(
      `UPDATE freelancer SET earnings_balance = earnings_balance - $1 WHERE user_id = $2`,
      [requestedAmount, freelancerId]
    );

    // Create payout request
    const { rows: payoutResult } = await client.query(
      `INSERT INTO payouts (freelancer_id, amount, currency, status, requested_at)
       VALUES ($1, $2, $3, 'REQUESTED', NOW())
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
        remaining_balance: parseFloat(freelancer.earnings_balance) - requestedAmount
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

// Get wallet dashboard (combined summary + transactions)
const getWalletDashboard = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId; // freelancer_id from freelancer table
    const userId = req.user.user_id; // user_id for payouts table

    // Parse pagination params
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // 1. Get available balance (earnings_balance)
    const { rows: balanceRows } = await db.query(
      'SELECT earnings_balance FROM freelancer WHERE freelancer_id = $1',
      [freelancerId]
    );

    if (balanceRows.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const availableBalance = parseFloat(balanceRows[0].earnings_balance || 0);

    // 2. Get pending earnings (sum of IN_PROGRESS projects)
    const { rows: pendingRows } = await db.query(
      `SELECT COALESCE(SUM(t.freelancer_amount), 0) as pending_total,
              COUNT(*) as active_orders
       FROM projects p
       JOIN transactions t ON p.id = t.project_id
       WHERE p.freelancer_id = $1 AND p.status = 'IN_PROGRESS' AND t.status = 'HELD'`,
      [freelancerId]
    );

    const pendingEarnings = parseFloat(pendingRows[0].pending_total || 0);
    const pendingOrdersCount = parseInt(pendingRows[0].active_orders || 0);

    // 3. Get total lifetime earnings (sum of RELEASED/COMPLETED transactions)
    const { rows: lifetimeRows } = await db.query(
      `SELECT COALESCE(SUM(freelancer_amount), 0) as total_lifetime
       FROM transactions
       WHERE freelancer_id = $1 AND status IN ('RELEASED', 'COMPLETED')`,
      [freelancerId]
    );

    const totalEarnings = parseFloat(lifetimeRows[0].total_lifetime || 0);

    // 4. Get combined recent transactions (order payments + withdrawals)
    const { rows: transactions } = await db.query(
      `(
        SELECT 
          t.created_at as date_time,
          'Order Payment' as type,
          CONCAT('Payment received for order #', p.id) as description,
          t.freelancer_amount as amount,
          CASE 
            WHEN t.status = 'RELEASED' THEN 'Completed'
            WHEN t.status = 'COMPLETED' THEN 'Completed'
            WHEN t.status = 'HELD' THEN 'Pending'
            ELSE t.status
          END as status
        FROM transactions t
        JOIN projects p ON t.project_id = p.id
        WHERE t.freelancer_id = $1 AND t.status IN ('RELEASED', 'COMPLETED')
      )
      UNION ALL
      (
        SELECT
          py.processed_at as date_time,
          'Withdrawal' as type,
          CONCAT('Bank Transfer to ', COALESCE(SUBSTRING(f.bank_name, 1, 4), 'Bank'), ' ****', RIGHT(COALESCE(f.bank_account_no, '000'), 3)) as description,
          -py.amount as amount,
          CASE 
            WHEN py.status = 'PROCESSED' THEN 'Completed'
            WHEN py.status = 'PENDING' THEN 'Processing'
            WHEN py.status = 'QUEUED' THEN 'Processing'
            WHEN py.status = 'PROCESSING' THEN 'Processing'
            ELSE py.status
          END as status
        FROM payouts py
        JOIN freelancer f ON py.freelancer_id = f.user_id
        WHERE py.freelancer_id = $2 AND py.status = 'PROCESSED'
      )
      ORDER BY date_time DESC
      LIMIT $3 OFFSET $4`,
      [freelancerId, userId, limit, offset]
    );

    // Get total transaction count for pagination
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total FROM (
        SELECT t.id FROM transactions t
        WHERE t.freelancer_id = $1 AND t.status IN ('RELEASED', 'COMPLETED')
        UNION ALL
        SELECT py.id FROM payouts py
        WHERE py.freelancer_id = $2 AND py.status = 'PROCESSED'
      ) combined`,
      [freelancerId, userId]
    );

    const totalTransactions = parseInt(countRows[0].total || 0);

    // Format transactions
    const formattedTransactions = transactions.map(tx => ({
      date_time: tx.date_time,
      type: tx.type,
      description: tx.description,
      amount: parseFloat(tx.amount),
      status: tx.status
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        wallet_summary: {
          available_balance: availableBalance,
          pending_earnings: pendingEarnings,
          pending_orders_count: pendingOrdersCount,
          total_earnings: totalEarnings,
          currency: process.env.CURRENCY || 'INR'
        },
        recent_transactions: formattedTransactions,
        pagination: {
          limit,
          offset,
          total: totalTransactions
        }
      }
    });
  } catch (error) {
    console.error('getWalletDashboard error:', error);
    return next(new AppError('Failed to get wallet dashboard', 500));
  }
};

module.exports = {
  addBankAccount,
  getBankAccount,
  getMyPayouts,
  getEarningsSummary,
  getEarningsBalance,
  requestPayout,
  getWalletDashboard
}
