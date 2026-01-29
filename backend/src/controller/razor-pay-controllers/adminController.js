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

// Release payment to freelancer
const releasePayment = async (req, res, next) => {
  try {
    const transactionId = req.params.id;
    const adminId = req.user.id;

    // Verify transaction exists and is in HELD status
    const transaction = await paymentService.getTransaction(transactionId);

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    if (transaction.status !== 'HELD') {
      return next(new AppError(`Cannot release payment. Transaction status: ${transaction.status}`, 400));
    }

    // Check if project is completed
    const [projects] = await db.query(
      'SELECT status FROM projects WHERE id = ?',
      [transaction.project_id]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    if (projects[0].status !== 'COMPLETED') {
      return next(new AppError('Project must be completed before releasing payment', 400));
    }

    // Release payment
    const result = await payoutService.releasePayment(transactionId, adminId);

    res.json({
      message: 'Payment released successfully. Payout initiated.',
      ...result
    });
  } catch (error) {
    console.error('Release payment error:', error);
    return next(new AppError(error.message, 500));
  }
}

// Get all payouts
const getAllPayouts = async (req, res, next) => {
  try {
    const status = req.query.status;

    let query = `
        SELECT p.*,
          t.project_id, t.total_amount, t.platform_commission,
          f.freelancer_full_name as freelancer_name, f.email as freelancer_email
        FROM payouts p
        JOIN transactions t ON p.transaction_id = t.id
        JOIN users f ON p.freelancer_id = f.id
      `;

    const params = [];

    if (status) {
      query += ' WHERE p.status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC';

    const [payouts] = await db.query(query, params);

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
    // Total transactions
    const [totalTransactions] = await db.query(
      'SELECT COUNT(*) as count FROM transactions'
    );

    // Total revenue (commissions)
    const [totalRevenue] = await db.query(
      'SELECT SUM(platform_commission) as revenue FROM transactions WHERE status IN ("HELD", "RELEASED", "COMPLETED")'
    );

    // Pending releases
    const [pendingReleases] = await db.query(
      'SELECT COUNT(*) as count, SUM(total_amount) as amount FROM transactions WHERE status = "HELD"'
    );

    // Completed payouts
    const [completedPayouts] = await db.query(
      'SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status = "PROCESSED"'
    );

    // Pending payouts
    const [pendingPayouts] = await db.query(
      'SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status IN ("QUEUED", "PENDING", "PROCESSING")'
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
      'UPDATE platform_settings SET setting_value = ? WHERE setting_key = "commission_percentage"',
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
      ['VERIFIED  ', '', freelancer_id]
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


module.exports = {
  getEscrowTransactions,
  releasePayment,
  getAllPayouts,
  getPayoutDetails,
  getPlatformStats,
  updateCommission,
  approveKYCByAdmin,
  rejectKYCByAdmin,
  suspendFreelancerByAdmin
}