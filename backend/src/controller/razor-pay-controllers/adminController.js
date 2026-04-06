const paymentService = require('../../razor-pay-services/paymentService');
const payoutService = require('../../razor-pay-services/payoutService');
const { pool: db } = require('../../../config/dbConfig');
const { query } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");

// class AdminController {
// Get all escrow transactions
const getEscrowTransactions = async (req, res, next) => {
  try {
    const status = req.query.status || 'HELD';
    const transactions = await paymentService.getEscrowTransactions(status);

    res.json({
      count: transactions.length,
      transactions
    });
  } catch (error) {
    console.error('Get escrow transactions error:', error);
    return next(new AppError('Failed to get escrow transactions', 500));
  }
}

// Approve payout request (admin) — triggers Razorpay payout
const approvePayout = async (req, res, next) => {
  const payoutId = req.params.id;
  const adminId = req.user.roleWiseId;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: payouts } = await client.query(
      `SELECT po.*, f.freelancer_id AS f_id
       FROM payouts po
       JOIN users u ON po.freelancer_id = u.id
       JOIN freelancer f ON f.user_id = u.id
       WHERE po.id = $1 FOR UPDATE`,
      [payoutId]
    );

    if (payouts.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Payout not found', 404));
    }

    const payout = payouts[0];

    if (payout.status !== 'REQUESTED') {
      await client.query('ROLLBACK');
      return next(new AppError(`Payout cannot be approved. Current status: ${payout.status}`, 400));
    }

    // Get freelancer's verified bank account
    const { rows: accounts } = await client.query(
      `SELECT id FROM freelancer WHERE freelancer_id = $1 AND verification_status = 'VERIFIED'`,
      [payout.f_id]
    );

    if (accounts.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Freelancer account not verified', 400));
    }

    // Update payout to QUEUED
    await client.query(
      `UPDATE payouts
       SET status = 'QUEUED', freelancer_account_id = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [payout.f_id, adminId, payoutId]
    );

    // Update linked transaction to RELEASED if exists
    if (payout.transaction_id) {
      await client.query(
        `UPDATE transactions SET status = 'RELEASED', released_by = $1, released_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [adminId, payout.transaction_id]
      );
    }

    await client.query('COMMIT');

    // Trigger Razorpay payout async
    payoutService.processPayout(payoutId).catch((err) => {
      console.error('processPayout error:', err);
    });

    return res.status(200).json({
      status: 'success',
      message: 'Payout approved. Processing initiated.',
      data: { payout_id: payoutId }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('approvePayout error:', error);
    return next(new AppError(error.message, 500));
  } finally {
    client.release();
  }
}

// Get all payouts
const getAllPayouts = async (req, res, next) => {
  try {
    const status = req.query.status;

    let query = `
        SELECT p.*,
          t.project_id, t.total_amount, t.platform_commission,
          fl.freelancer_full_name as freelancer_name, fl.freelancer_email
        FROM payouts p
        LEFT JOIN transactions t ON p.transaction_id = t.id
        JOIN users u ON p.freelancer_id = u.id
        JOIN freelancer fl ON fl.user_id = u.id
      `;

    const params = [];

    if (status) {
      query += ' WHERE p.status = $1';
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC';

    const { rows: payouts } = await db.query(query, params);

    res.json({
      count: payouts.length,
      payouts
    });
  } catch (error) {
    console.error('Get all payouts error:', error);
    return next(new AppError('Failed to get payouts', 500));
  }
}

// Get payout details
const getPayoutDetails = async (req, res, next) => {
  try {
    const payoutId = req.params.id;
    const payout = await payoutService.getPayout(payoutId);

    if (!payout) {
      return next(new AppError('Payout not found', 404));
    }

    res.json(payout);
  } catch (error) {
    console.error('Get payout details error:', error);
    return next(new AppError('Failed to get payout details', 500));
  }
}

// Get platform statistics
const getPlatformStats = async (req, res, next) => {
  try {
    const { rows: totalTransactions } = await db.query(
      'SELECT COUNT(*) as count FROM transactions'
    );

    const { rows: totalRevenue } = await db.query(
      `SELECT SUM(platform_commission) as revenue FROM transactions WHERE status IN ('HELD', 'RELEASED', 'COMPLETED')`
    );

    const { rows: pendingReleases } = await db.query(
      `SELECT COUNT(*) as count, SUM(total_amount) as amount FROM transactions WHERE status = 'HELD'`
    );

    const { rows: completedPayouts } = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status = 'PROCESSED'`
    );

    const { rows: pendingPayouts } = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status IN ('QUEUED', 'PENDING', 'PROCESSING')`
    );

    res.json({
      total_transactions: totalTransactions[0].count,
      total_commission_earned: parseFloat(totalRevenue[0].revenue || 0),
      escrow: {
        count: pendingReleases[0].count,
        total_amount: parseFloat(pendingReleases[0].amount || 0)
      },
      payouts: {
        completed: {
          count: completedPayouts[0].count,
          total_amount: parseFloat(completedPayouts[0].amount || 0)
        },
        pending: {
          count: pendingPayouts[0].count,
          total_amount: parseFloat(pendingPayouts[0].amount || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get platform stats error:', error);
    return next(new AppError('Failed to get platform statistics', 500));
  }
}

// Update platform commission percentage
const updateCommission = async (req, res, next) => {
  try {
    const { percentage } = req.body;

    if (!percentage || percentage < 0 || percentage > 100) {
      return next(new AppError('Invalid commission percentage', 400));
    }

    await db.query(
      `UPDATE platform_settings SET setting_value = $1 WHERE setting_key = 'commission_percentage'`,
      [percentage]
    );

    res.json({
      message: 'Commission percentage updated successfully',
      new_percentage: percentage
    });
  } catch (error) {
    console.error('Update commission error:', error);
    return next(new AppError('Failed to update commission', 500));
  }
}

const approveKYCByAdmin = async (req, res, next) => {
  try {
    const { freelancer_id } = req.params;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    // Check if freelancer exists
    const queryResult = await query(
      'SELECT freelancer_id, user_id, verification_status FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );

    // This is where the error occurs - check if queryResult.rows exists
    const freelancers = queryResult.rows || [];

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (freelancer.verification_status === 'VERIFIED') {
      return next(new AppError('Freelancer KYC is already verified', 400));
    }

    // Update verification_status in freelancer table
    await query(
      'UPDATE freelancer SET verification_status = $1, reason_for_rejection = $2 WHERE freelancer_id = $3',
      ['VERIFIED', '', freelancer_id]
    );

    res.json({
      message: 'KYC approved successfully',
      freelancer_id: freelancer_id,
      verification_status: 'VERIFIED'
    });
  }
  catch (error) {
    console.error('Approve KYC error:', error);
    return next(new AppError('Failed to approve KYC', 500));
  }
}

const rejectKYCByAdmin = async (req, res, next) => {
  try {
    const { reason_for_rejection, freelancer_id } = req.body;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    if (!reason_for_rejection) {
      return next(new AppError('Reason for rejection is required', 400));
    }

    // Check if freelancer exists
    const queryResult = await query(
      'SELECT freelancer_id, user_id, verification_status FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );

    const freelancers = queryResult.rows || [];

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (freelancer.verification_status === 'REJECTED') {
      return next(new AppError('Freelancer KYC is already rejected', 400));
    }

    // Update verification_status and reason_for_rejection in freelancer table
    await query(
      'UPDATE freelancer SET verification_status = $1, reason_for_rejection = $2 WHERE freelancer_id = $3',
      ['REJECTED', reason_for_rejection, freelancer_id]
    );

    res.json({
      message: 'KYC rejected successfully',
      freelancer_id: freelancer_id,
      verification_status: 'REJECTED',
      reason_for_rejection: reason_for_rejection
    });
  }
  catch (error) {
    console.error('Reject KYC error:', error);
    return next(new AppError('Failed to reject KYC', 500));
  }
}


const suspendFreelancerByAdmin = async (req, res, next) =>  {
  try {
    const { reason_for_suspension, freelancer_id } = req.body;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    if (!reason_for_suspension) {
      return next(new AppError('Reason for rejection is required', 400));
    }

    // Check if freelancer exists
    const queryResult = await query(
      'SELECT freelancer_id, user_id, verification_status FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );

    const freelancers = queryResult.rows || [];

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (freelancer.verification_status === 'SUSPENDED') {
      return next(new AppError('Freelancer is already suspended', 400));
    }

    // Update verification_status and reason_for_suspension in freelancer table
    await query(
      'UPDATE freelancer SET verification_status = $1, reason_for_suspension = $2 WHERE freelancer_id = $3',
      ['SUSPENDED', reason_for_suspension, freelancer_id]
    );

    res.json({
      message: 'Freelancer suspended successfully',
      freelancer_id: freelancer_id,
      verification_status: 'SUSPENDED',
      reason_for_suspension: reason_for_suspension
    });
  }
  catch (error) {
    console.error('Suspend Freelancer error:', error);
    return next(new AppError('Failed to suspend freelancer', 500));
  }
}


// Get all payout requests (status = REQUESTED) for admin review
const getPayoutRequests = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const { rows: payouts } = await db.query(
      `SELECT
        po.id              AS payout_id,
        po.amount,
        po.currency,
        po.status,
        po.requested_at,
        po.created_at,
        f.freelancer_id,
        f.freelancer_full_name,
        f.freelancer_email,
        f.earnings_balance,
        f.verification_status  AS account_status
       FROM payouts po
       JOIN users u ON po.freelancer_id = u.id
       JOIN freelancer f ON f.user_id = u.id
       WHERE po.status = 'REQUESTED'
       ORDER BY po.requested_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const { rows: countResult } = await db.query(
      `SELECT COUNT(*) AS total FROM payouts WHERE status = 'REQUESTED'`
    );

    const total = parseInt(countResult[0].total);

    return res.status(200).json({
      status: 'success',
      data: {
        payouts,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit
        }
      }
    });
  } catch (error) {
    console.error('getPayoutRequests error:', error);
    return next(new AppError('Failed to get payout requests', 500));
  }
};

module.exports = {
  getEscrowTransactions,
  approvePayout,
  getAllPayouts,
  getPayoutRequests,
  getPayoutDetails,
  getPlatformStats,
  updateCommission,
  approveKYCByAdmin,
  rejectKYCByAdmin,
  suspendFreelancerByAdmin
}