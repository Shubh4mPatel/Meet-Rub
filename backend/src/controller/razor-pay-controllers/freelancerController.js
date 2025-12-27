const {pool:db} = require('../../../config/dbConfig');
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

    // Check if account already exists
    const [existing] = await db.query(
      'SELECT id FROM freelancer_accounts WHERE user_id = ?',
      [freelancerId]
    );

    let result;
    if (existing.length > 0) {
      // Update existing account
      await db.query(
        `UPDATE freelancer_accounts
        SET bank_account_name = ?, bank_account_number = ?,
            bank_ifsc_code = ?, bank_name = ?, upi_id = ?,
            verification_status = 'PENDING', updated_at = NOW()
        WHERE user_id = ?`,
        [bank_account_name, bank_account_number, bank_ifsc_code,
         bank_name, upi_id, freelancerId]
      );
      result = { message: 'Bank account updated successfully' };
    } else {
      // Insert new account
      const [insertResult] = await db.query(
        `INSERT INTO freelancer_accounts
        (user_id, bank_account_name, bank_account_number, bank_ifsc_code,
         bank_name, upi_id, verification_status)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [freelancerId, bank_account_name, bank_account_number,
         bank_ifsc_code, bank_name, upi_id]
      );
      result = {
        message: 'Bank account added successfully',
        account_id: insertResult.insertId
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

    const [accounts] = await db.query(
      `SELECT id, bank_account_name, bank_account_number, bank_ifsc_code,
              bank_name, upi_id, verification_status, is_active, created_at
       FROM freelancer_accounts
       WHERE user_id = ?`,
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
    const freelancerId = req.user.id;

    // Total earnings (completed transactions)
    const [completed] = await db.query(
      `SELECT COUNT(*) as count, SUM(freelancer_amount) as total
       FROM transactions
       WHERE freelancer_id = ? AND status = 'COMPLETED'`,
      [freelancerId]
    );

    // Pending release
    const [pending] = await db.query(
      `SELECT COUNT(*) as count, SUM(freelancer_amount) as total
       FROM transactions
       WHERE freelancer_id = ? AND status = 'HELD'`,
      [freelancerId]
    );

    // Released but processing
    const [processing] = await db.query(
      `SELECT COUNT(*) as count, SUM(freelancer_amount) as total
       FROM transactions
       WHERE freelancer_id = ? AND status = 'RELEASED'`,
      [freelancerId]
    );

    res.json({
      completed_earnings: {
        count: completed[0].count,
        total: parseFloat(completed[0].total || 0)
      },
      pending_release: {
        count: pending[0].count,
        total: parseFloat(pending[0].total || 0)
      },
      processing: {
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

module.exports = {
  addBankAccount,
  getBankAccount,
  getMyPayouts,
  getEarningsSummary
}
