const paymentService = require('../../razor-pay-services/paymentService');
const { pool: db } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");
const { getLogger } = require('../../../utils/logger');
const logger = getLogger('payment-controller');
const { createPresignedUrl } = require('../../../utils/helper');

const expirySeconds = 4 * 60 * 60; // 4 hours

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
    const statusCode = error.message.includes('not activated') ? 400 : 500;
    return next(new AppError(error.message, statusCode));
  }
}

// Verify service payment
const verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    logger.info(`[verifyPayment] Received verify request from user_id=${req.user.user_id} role=${req.user.role} order_id=${razorpay_order_id} payment_id=${razorpay_payment_id}`);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      logger.warn(`[verifyPayment] Missing payment details - order_id=${razorpay_order_id} payment_id=${razorpay_payment_id} signature_present=${!!razorpay_signature}`);
      return next(new AppError('Missing payment details', 400));
    }

    logger.info(`[verifyPayment] Calling processServicePayment for order_id=${razorpay_order_id}`);
    const result = await paymentService.processServicePayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );
    logger.info(`[verifyPayment] Payment verified successfully - transaction_id=${result.transactionId} order_id=${razorpay_order_id} payment_id=${razorpay_payment_id}`);

    res.json({
      message: 'Payment verified. Funds held in escrow.',
      transaction_id: result.transactionId
    });
  } catch (error) {
    logger.error(`[verifyPayment] Failed - order_id=${req.body?.razorpay_order_id} payment_id=${req.body?.razorpay_payment_id} error=${error.message}`);
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

// Get user's transactions with pagination, search by freelancer name, and service filter
const getMyTransactions = async (req, res, next) => {
  try {
    const roleWiseId = req.user.roleWiseId;
    const role = req.user.role;

    if (role !== 'creator' && role !== 'freelancer') {
      return next(new AppError('Invalid user type', 400));
    }

    const { search = '', service = '', from_date = '', to_date = '', page = '1', limit = '10' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const params = [roleWiseId];
    let idx = 2;
    const conditions = [
      role === 'creator' ? 't.creator_id = $1' : 't.freelancer_id = $1',
      "t.status IN ('HELD', 'COMPLETED', 'RELEASED')"  // Only show successful transactions
    ];

    if (search && search.trim()) {
      // creator searches by freelancer name, freelancer searches by creator name
      if (role === 'creator') {
        conditions.push(`f.freelancer_full_name ILIKE $${idx++}`);
      } else {
        conditions.push(`c.full_name ILIKE $${idx++}`);
      }
      params.push(`%${search.trim()}%`);
    }

    if (service && service.trim()) {
      conditions.push(`LOWER(s.service_name) = LOWER($${idx++})`);
      params.push(service.trim());
    }

    if (from_date && from_date.trim()) {
      conditions.push(`t.created_at >= $${idx++}::date`);
      params.push(from_date.trim());
    }

    if (to_date && to_date.trim()) {
      conditions.push(`t.created_at < ($${idx++}::date + interval '1 day')`);
      params.push(to_date.trim());
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*) as total
      FROM transactions t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN services s ON p.service_id = s.id
      LEFT JOIN freelancer f ON t.freelancer_id = f.freelancer_id
      LEFT JOIN creators c ON t.creator_id = c.creator_id
      WHERE ${whereClause}
    `;

    const dataQuery = `
      SELECT
        t.id,
        t.project_id,
        t.status,
        t.total_amount,
        t.freelancer_amount,
        t.platform_commission,
        t.currency,
        t.razorpay_payment_id,
        t.created_at,
        s.service_name,
        f.freelancer_full_name as freelancer_name,
        f.user_name as freelancer_username,
        f.profile_image_url as freelancer_profile_image,
        c.full_name as creator_name,
        c.user_name as creator_username
      FROM transactions t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN services s ON p.service_id = s.id
      LEFT JOIN freelancer f ON t.freelancer_id = f.freelancer_id
      LEFT JOIN creators c ON t.creator_id = c.creator_id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params),
      db.query(dataQuery, [...params, limitNum, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total);

    // Generate presigned URLs for freelancer profile images
    const transactionsWithSignedUrls = await Promise.all(
      dataResult.rows.map(async (transaction) => {
        if (transaction.freelancer_profile_image) {
          try {
            const parts = transaction.freelancer_profile_image.split("/");
            const bucketName = parts[0];
            const objectName = parts.slice(1).join("/");

            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            transaction.freelancer_profile_image = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer profile image:`,
              error
            );
            transaction.freelancer_profile_image = null;
          }
        }
        return transaction;
      })
    );

    return res.json({
      status: 'success',
      data: {
        transactions: transactionsWithSignedUrls,
        pagination: {
          total,
          total_pages: Math.ceil(total / limitNum),
          current_page: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    console.error('Get my transactions error:', error);
    return next(new AppError('Failed to get transactions', 500));
  }
}

module.exports = {
  createPaymentOrder,
  verifyPayment,
  getTransaction,
  getMyTransactions,
}
