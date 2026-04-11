const { pool: db } = require('../../config/dbConfig');

const razorpay = require('../../config/razorpay');
const crypto = require('crypto');

class PaymentService {
  // Calculate commission
  calculateCommission(amount) {
    const commissionPercentage = parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE || 20);
    const amountNum = parseFloat(amount);
    const commission = (amountNum * commissionPercentage) / 100;
    const gst = parseFloat(((commission * 18) / 100).toFixed(2));
    const freelancerAmount = amountNum - commission;
    const totalAmount = parseFloat((amountNum + gst).toFixed(2));

    return {
      serviceAmount: amountNum,
      totalAmount,
      platformCommission: parseFloat(commission.toFixed(2)),
      platformCommissionPercentage: commissionPercentage,
      freelancerAmount: parseFloat(freelancerAmount.toFixed(2)),
      gst
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

      const { rows: projects } = await client.query(
        'SELECT * FROM projects WHERE id = $1 AND creator_id = $2',
        [projectId, clientId]
      );

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
          client_id: clientId
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

      // Idempotency check: if order is already PAID, return success
      if (order.status === 'PAID') {
        await client.query('COMMIT');
        return { success: true, transactionId: order.reference_id };
      }

      await client.query(
        'UPDATE razorpay_orders SET status = $1, updated_at = NOW() WHERE id = $2',
        ['PAID', order.id]
      );

      const { rowCount } = await client.query(
        `UPDATE transactions
        SET status = 'HELD', razorpay_payment_id = $1, held_at = NOW()
        WHERE id = $2 AND status = 'INITIATED'`,
        [paymentId, order.reference_id]
      );

      if (rowCount === 0) {
        throw new Error('Transaction already processed or not in valid state');
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
