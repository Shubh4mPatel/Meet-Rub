const paymentService = require('../../razor-pay-services/paymentService');
const {pool:db} = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");

// Create payment from wallet
const payFromWallet = async (req, res, next) => {
  try {
    const { project_id } = req.body;
    const clientId = req.user.id;

    if (!project_id) {
      return next(new AppError('Project ID is required', 400));
    }

    // Verify project belongs to client
    const [projects] = await db.query(
      'SELECT * FROM projects WHERE id = ? AND client_id = ?',
      [project_id, clientId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    const result = await paymentService.createWalletPayment(clientId, project_id);

    res.json({
      message: 'Payment successful. Funds held in escrow.',
      transaction: result
    });
  } catch (error) {
    console.error('Pay from wallet error:', error);
    return next(new AppError(error.message, 500));
  }
}

// Create Razorpay order for service payment
const createPaymentOrder = async (req, res, next) => {
  try {
    const { project_id } = req.body;
    const clientId = req.user.id;

    if (!project_id) {
      return next(new AppError('Project ID is required', 400));
    }

    const result = await paymentService.createServicePaymentOrder(clientId, project_id);

    res.json({
      message: 'Payment order created',
      transaction_id: result.transactionId,
      order: {
        id: result.razorpayOrder.id,
        amount: result.totalAmount,
        currency: result.razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      },
      breakdown: {
        total: result.totalAmount,
        platform_commission: result.platformCommission,
        freelancer_amount: result.freelancerAmount
      }
    });
  } catch (error) {
    console.error('Create payment order error:', error);
    return next(new AppError(error.message, 500));
  }
}

// Verify service payment
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return next(new AppError('Missing payment details', 400));
    }

    const result = await paymentService.processServicePayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    res.json({
      message: 'Payment verified. Funds held in escrow.',
      transaction_id: result.transactionId
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    return next(new AppError(error.message, 500));
  }
}

// Get transaction details
const getTransaction = async (req, res, next) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.id;

    const transaction = await paymentService.getTransaction(transactionId);

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    // Check if user is involved in transaction
    if (transaction.client_id !== userId &&
        transaction.freelancer_id !== userId &&
        req.user.user_type !== 'ADMIN') {
      return next(new AppError('Access denied', 403));
    }

    res.json(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    return next(new AppError('Failed to get transaction', 500));
  }
}

// Get user's transactions
const getMyTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userType = req.user.user_type;

    let query;
    if (userType === 'CLIENT') {
      query = 'SELECT * FROM transactions WHERE client_id = ? ORDER BY created_at DESC';
    } else if (userType === 'FREELANCER') {
      query = 'SELECT * FROM transactions WHERE freelancer_id = ? ORDER BY created_at DESC';
    } else {
      return next(new AppError('Invalid user type', 400));
    }

    const [transactions] = await db.query(query, [userId]);

    res.json(transactions);
  } catch (error) {
    console.error('Get my transactions error:', error);
    return next(new AppError('Failed to get transactions', 500));
  }
}

module.exports = {
  payFromWallet,
  createPaymentOrder,
  verifyPayment,
  getTransaction,
  getMyTransactions
}
