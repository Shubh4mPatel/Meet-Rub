const paymentService = require('../../razor-pay-services/paymentService');
const { pool: db } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");

// Create Razorpay order for service payment
const createPaymentOrder = async (req, res, next) => {
  try {
    const { project_id } = req.body;
    const clientId = req.user.roleWiseId;
    const userId = req.user.user_id;

    if (!project_id) {
      return next(new AppError('Project ID is required', 400));
    }

    const result = await paymentService.createServicePaymentOrder(clientId, project_id, userId);

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
        service_amount: result.serviceAmount,
        gst: result.gst,
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
    const userId = req.user.roleWiseId;

    const transaction = await paymentService.getTransaction(transactionId);

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    // Check if user is involved in transaction
    if (transaction.creator_id !== userId &&
      transaction.freelancer_id !== userId &&
      req.user.role !== 'admin') {
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
    const roleWiseId = req.user.roleWiseId;
    const role = req.user.role;

    let query;
    if (role === 'creator') {
      query = 'SELECT * FROM transactions WHERE creator_id = $1 ORDER BY created_at DESC';
    } else if (role === 'freelancer') {
      query = 'SELECT * FROM transactions WHERE freelancer_id = $1 ORDER BY created_at DESC';
    } else {
      return next(new AppError('Invalid user type', 400));
    }

    const { rows: transactions } = await db.query(query, [roleWiseId]);

    res.json(transactions);
  } catch (error) {
    console.error('Get my transactions error:', error);
    return next(new AppError('Failed to get transactions', 500));
  }
}

module.exports = {
  createPaymentOrder,
  verifyPayment,
  getTransaction,
  getMyTransactions
}
