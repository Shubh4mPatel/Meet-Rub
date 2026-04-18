const paymentService = require('../../razor-pay-services/paymentService');
const { pool: db } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");
const { getLogger } = require('../../../utils/logger');
const { createPresignedUrl, getObjectNameFromUrl } = require('../../../utils/helper');
const logger = getLogger('payment-controller');

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

// Get creator's payment transactions with search and pagination
const getCreatorPayments = async (req, res, next) => {
  try {
    const creatorId = req.user.roleWiseId;
    const role = req.user.role;

    // Only creators can access this endpoint
    // if (role !== 'creator') {
    //   return next(new AppError('Access denied. Only creators can view this', 403));
    // }

    // Extract query parameters
    const {
      search = '',
      service = '',
      start_date = '',
      end_date = '',
      page = '1',
      limit = '10'
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    // Build dynamic query with search on freelancer name only
    const queryParams = [creatorId];
    let paramIndex = 2;

    let searchCondition = '';
    if (search && search.trim()) {
      searchCondition = `
        AND (
          LOWER(f.freelancer_full_name) LIKE LOWER($${paramIndex}) OR
          LOWER(f.first_name) LIKE LOWER($${paramIndex}) OR
          LOWER(f.last_name) LIKE LOWER($${paramIndex})
        )
      `;
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Add service filter
    let serviceCondition = '';
    if (service && service.trim()) {
      serviceCondition = `AND LOWER(s.service_name) = LOWER($${paramIndex})`;
      queryParams.push(service.trim());
      paramIndex++;
    }

    // Add date filter
    let dateCondition = '';
    if (start_date && start_date.trim()) {
      dateCondition += `AND t.created_at >= $${paramIndex}::timestamp `;
      queryParams.push(start_date.trim());
      paramIndex++;
    }
    if (end_date && end_date.trim()) {
      dateCondition += `AND t.created_at <= $${paramIndex}::timestamp `;
      queryParams.push(end_date.trim());
      paramIndex++;
    }

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM transactions t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN services s ON p.service_id = s.id
      LEFT JOIN freelancer f ON t.freelancer_id = f.freelancer_id
      WHERE t.creator_id = $1
      ${searchCondition}
      ${serviceCondition}
      ${dateCondition}
    `;

    const { rows: [{ total }] } = await db.query(countQuery, queryParams);

    // Fetch paginated transactions
    const dataQuery = `
      SELECT
        t.id,
        t.project_id,
        s.service_name as service,
        f.freelancer_full_name as freelancer_name,
        f.user_name as freelancer_username,
        f.profile_image_url as freelancer_profile_image,
        t.total_amount,
        t.razorpay_payment_id as transaction_id,
        t.created_at as date_time
      FROM transactions t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN services s ON p.service_id = s.id
      LEFT JOIN freelancer f ON t.freelancer_id = f.freelancer_id
      WHERE t.creator_id = $1
      ${searchCondition}
      ${serviceCondition}
      ${dateCondition}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limitNum, offset);

    const { rows: transactions } = await db.query(dataQuery, queryParams);

    // Generate presigned URLs for freelancer profile images
    const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'meet-rub';
    const URL_EXPIRY = 60 * 60 * 24 * 7; // 7 days

    const transactionsWithPresignedUrls = await Promise.all(
      transactions.map(async (transaction) => {
        let presignedProfileImage = null;

        if (transaction.freelancer_profile_image) {
          try {
            const objectName = getObjectNameFromUrl(transaction.freelancer_profile_image, BUCKET_NAME);
            presignedProfileImage = await createPresignedUrl(BUCKET_NAME, objectName, URL_EXPIRY);
          } catch (error) {
            logger.error(`[getCreatorPayments] Failed to generate presigned URL for profile image: ${error.message}`);
            presignedProfileImage = null;
          }
        }

        return {
          ...transaction,
          freelancer_profile_image: presignedProfileImage
        };
      })
    );

    res.json({
      success: true,
      data: transactionsWithPresignedUrls,
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total_records: parseInt(total),
        total_pages: Math.ceil(parseInt(total) / limitNum)
      }
    });
  } catch (error) {
    console.error('Get creator payments error:', error);
    logger.error(`[getCreatorPayments] Error: ${error.message}`);
    return next(new AppError('Failed to get payment transactions', 500));
  }
}

module.exports = {
  createPaymentOrder,
  verifyPayment,
  getTransaction,
  getMyTransactions,
  getCreatorPayments
}
