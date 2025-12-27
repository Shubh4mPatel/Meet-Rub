const walletService = require('../../razor-pay-services/walletService');
const paymentService = require('../../razor-pay-services/paymentService');
const AppError = require("../../../utils/appError");

// Get wallet balance
const getBalance = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const wallet = await walletService.getWalletByUserId(userId);

    if (!wallet) {
      return next(new AppError('Wallet not found', 404));
    }

    res.json({
      balance: parseFloat(wallet.balance),
      currency: wallet.currency,
      status: wallet.status
    });
  } catch (error) {
    console.error('Get balance error:', error);
    return next(new AppError('Failed to get balance', 500));
  }
}

// Create order for wallet load
const createLoadOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return next(new AppError('Invalid amount', 400));
    }

    const minLoad = parseFloat(process.env.MIN_WALLET_LOAD || 100);
    const maxLoad = parseFloat(process.env.MAX_WALLET_LOAD || 100000);

    if (amount < minLoad) {
      return next(new AppError(`Minimum wallet load amount is ${minLoad}`, 400));
    }

    if (amount > maxLoad) {
      return next(new AppError(`Maximum wallet load amount is ${maxLoad}`, 400));
    }

    const order = await paymentService.createWalletLoadOrder(userId, amount);

    res.json({
      message: 'Order created successfully',
      order: {
        id: order.id,
        amount: amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Create load order error:', error);
    return next(new AppError(error.message, 500));
  }
}

// Verify and process wallet load payment
const verifyLoadPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return next(new AppError('Missing payment details', 400));
    }

    const result = await paymentService.processWalletLoad(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    res.json({
      message: 'Wallet loaded successfully',
      amount: result.amount
    });
  } catch (error) {
    console.error('Verify load payment error:', error);
    return next(new AppError(error.message, 500));
  }
}

// Get wallet transactions
const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const transactions = await walletService.getTransactions(userId, limit, offset);

    res.json({
      transactions,
      pagination: {
        limit,
        offset,
        total: transactions.length
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    return next(new AppError('Failed to get transactions', 500));
  }
}

// Get single transaction
const getTransaction = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const transactionId = req.params.id;

    const transaction = await walletService.getTransactionById(transactionId, userId);

    if (!transaction) {
      return next(new AppError('Transaction not found', 404));
    }

    res.json(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    return next(new AppError('Failed to get transaction', 500));
  }
}

module.exports = {
  getBalance,
  createLoadOrder,
  verifyLoadPayment,
  getTransactions,
  getTransaction
}
