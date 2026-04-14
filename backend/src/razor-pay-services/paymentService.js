const { pool: db } = require('../../config/dbConfig');
const razorpay = require('../../config/razorpay');
const crypto = require('crypto');
const { getLogger } = require('../../utils/logger');
const logger = getLogger('payment-service');

class PaymentService {
  // Calculate commission
  calculateCommission(amount) {
    const commissionPercentage = parseInt(process.env.PLATFORM_COMMISSION_PERCENTAGE || 20, 10);
    const amountInPaise = Math.round(parseFloat(amount) * 100);
    const commission = Math.round((amountInPaise * commissionPercentage) / 100);
    const gst = Math.round((commission * 18) / 100);
    const freelancerAmount = amountInPaise - commission;
    const totalAmount = amountInPaise + gst;

    return {
      serviceAmount: amountInPaise / 100,
      totalAmount: totalAmount / 100,
      platformCommission: commission / 100,
      platformCommissionPercentage: commissionPercentage,
      freelancerAmount: freelancerAmount / 100,
      gst: gst / 100
    };
  }

  // Verify Razorpay payment signature
  verifyPaymentSignature(orderId, paymentId, signature) {
    const text = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    return expectedSignature === signature;
  }

  // Create Razorpay order for direct service payment
  async createServicePaymentOrder(clientId, projectId, userId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      logger.info(`[createServicePaymentOrder] Looking up project_id=${projectId} creator_id(clientId)=${clientId}`);
      const { rows: projects } = await client.query(
        `SELECT p.*, so.service_name
         FROM projects p
         LEFT JOIN service_options so ON p.service_id = so.id
         WHERE p.id = $1 AND p.creator_id = $2`,
        [projectId, clientId]
      );
      logger.info(`[createServicePaymentOrder] Project query result: ${JSON.stringify(projects)}`);

      if (projects.length === 0) {
        throw new Error('Project not found');
      }

      const project = projects[0];
      const amounts = this.calculateCommission(project.amount);

      const { rows: result } = await client.query(
        `INSERT INTO transactions
        (project_id, creator_id, freelancer_id, total_amount, platform_commission,
        platform_commission_percentage, freelancer_amount, gst, payment_source, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RAZORPAY', 'INITIATED')
        RETURNING id`,
        [
          projectId,
          clientId,
          project.freelancer_id,
          amounts.totalAmount,
          amounts.platformCommission,
          amounts.platformCommissionPercentage,
          amounts.freelancerAmount,
          amounts.gst
        ]
      );

      const transactionId = result[0].id;

      const receiptId = `project_${projectId}_${Date.now()}`;
      const orderOptions = {
        amount: Math.round(amounts.totalAmount * 100),
        currency: process.env.CURRENCY || 'INR',
        receipt: receiptId,
        notes: {
          transaction_id: transactionId,
          project_id: projectId,
          client_id: clientId,
          service_charge: String(Math.round(amounts.serviceAmount * 100)),
          gst_amount: String(Math.round(amounts.gst * 100)),
          gst_percentage: '18',
          description: project.service_name ? `Payment for ${project.service_name}` : `Payment for project ${projectId}`
        }
      };

      const razorpayOrder = await razorpay.orders.create(orderOptions);

      await client.query(
        'UPDATE transactions SET razorpay_order_id = $1 WHERE id = $2',
        [razorpayOrder.id, transactionId]
      );

      await client.query(
        `INSERT INTO razorpay_orders
        (user_id, order_type, razorpay_order_id, amount, currency, receipt, reference_id, status)
        VALUES ($1, 'SERVICE_PAYMENT', $2, $3, $4, $5, $6, 'CREATED')`,
        [userId, razorpayOrder.id, amounts.totalAmount, razorpayOrder.currency, receiptId, transactionId]
      );

      await client.query('COMMIT');
      return {
        transactionId,
        razorpayOrder,
        ...amounts
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Process service payment after successful Razorpay payment
  async processServicePayment(orderId, paymentId, signature) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      if (!this.verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new Error('Invalid payment signature');
      }

      const { rows: orders } = await client.query(
        'SELECT * FROM razorpay_orders WHERE razorpay_order_id = $1 FOR UPDATE',
        [orderId]
      );

      if (orders.length === 0) {
        throw new Error('Order not found');
      }

      const order = orders[0];

      // Idempotency check: if order is already PAID, verify transaction is also HELD
      if (order.status === 'PAID') {
        logger.info(`[processServicePayment] Order ${orderId} already PAID, checking transaction status`);
        const { rows: txCheck } = await client.query(
          'SELECT id, status FROM transactions WHERE id = $1',
          [order.reference_id]
        );

        if (txCheck.length > 0 && txCheck[0].status === 'HELD') {
          logger.info(`[processServicePayment] Transaction ${order.reference_id} already HELD, returning success`);
          await client.query('COMMIT');
          return { success: true, transactionId: order.reference_id };
        }

        // Order is PAID but transaction is not HELD - this shouldn't happen but let's fix it
        logger.warn(`[processServicePayment] Order PAID but transaction ${order.reference_id} is ${txCheck[0]?.status || 'NOT FOUND'}, will attempt to update`);
      }

      await client.query(
        'UPDATE razorpay_orders SET status = $1, updated_at = NOW() WHERE id = $2',
        ['PAID', order.id]
      );

      logger.info(`[processServicePayment] Updating transaction id=${order.reference_id} to HELD`);
      const { rowCount } = await client.query(
        `UPDATE transactions
        SET status = 'HELD', razorpay_payment_id = $1, held_at = NOW(), updated_at = NOW()
        WHERE id = $2 AND status = 'INITIATED'`,
        [paymentId, order.reference_id]
      );
      logger.info(`[processServicePayment] Transaction update rowCount=${rowCount}`);

      if (rowCount === 0) {
        // Check what status the transaction actually has
        const { rows: txStatus } = await client.query(
          'SELECT id, status, razorpay_payment_id FROM transactions WHERE id = $1',
          [order.reference_id]
        );

        if (txStatus.length === 0) {
          logger.error(`[processServicePayment] Transaction ${order.reference_id} not found!`);
          throw new Error(`Transaction ${order.reference_id} not found`);
        }

        const currentStatus = txStatus[0].status;
        logger.error(`[processServicePayment] Transaction ${order.reference_id} is in ${currentStatus} status, expected INITIATED`);
        throw new Error(`Transaction ${order.reference_id} already processed (current status: ${currentStatus})`);
      }

      // Mark the linked custom package as paid
      // Match on creator, freelancer, service, price, and units to ensure we update only the correct package
      logger.info(`[processServicePayment] Updating custom_packages to paid for transaction id=${order.reference_id}`);
      const { rowCount: cpRowCount, rows: cpRows } = await client.query(
        `UPDATE custom_packages cp
         SET status = 'paid', updated_at = NOW()
         FROM transactions t
         JOIN projects p ON t.project_id = p.id
         WHERE t.id = $1
           AND cp.creator_id = p.creator_id
           AND cp.freelancer_id = p.freelancer_id
           AND cp.status = 'accepted'
           AND (cp.service_id = p.service_id OR (cp.service_id IS NULL AND p.service_id IS NULL))
           AND cp.price = p.amount
           AND (cp.units = p.number_of_units OR (cp.units IS NULL AND p.number_of_units IS NULL))
         RETURNING cp.id, cp.status, cp.creator_id, cp.freelancer_id, cp.price`,
        [order.reference_id]
      );
      logger.info(`[processServicePayment] custom_packages update rowCount=${cpRowCount}, rows=${JSON.stringify(cpRows)}`);
      
      if (cpRowCount === 0) {
        logger.warn(`[processServicePayment] No custom_package found matching project criteria for transaction ${order.reference_id} - this may be a direct project without a custom package`);
      } else if (cpRowCount > 1) {
        logger.warn(`[processServicePayment] Multiple custom_packages (${cpRowCount}) updated to paid for transaction ${order.reference_id} - this may indicate duplicate packages`);
      }
      await client.query('COMMIT');
      return { success: true, transactionId: order.reference_id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get transaction details
  async getTransaction(transactionId) {
    const { rows } = await db.query(
      `SELECT t.*,
        c.full_name as client_name, c.email as client_email,
        f.full_name as freelancer_name, f.email as freelancer_email,
        p.title as project_title
      FROM transactions t
      JOIN users c ON t.creator_id = c.id
      JOIN users f ON t.freelancer_id = f.id
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1`,
      [transactionId]
    );
    return rows[0] || null;
  }

  // Get all transactions in escrow (for admin)
  async getEscrowTransactions(status = 'HELD') {
    const { rows } = await db.query(
      `SELECT t.*,
        c.full_name as client_name,
        f.freelancer_full_name as freelancer_name,
        p.title as project_title,
        p.status as project_status
      FROM transactions t
      JOIN users c ON t.creator_id = c.id
      JOIN users f ON t.freelancer_id = f.id
      JOIN projects p ON t.project_id = p.id
      WHERE t.status = $1
      ORDER BY t.created_at DESC`,
      [status]
    );
    return rows;
  }
}

module.exports = new PaymentService();
