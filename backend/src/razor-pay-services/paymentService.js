const {pool:db} = require('../../config/dbConfig');

const razorpay = require('../../config/razorpay');
const walletService = require('./walletService');
const crypto = require('crypto');

class PaymentService {
  // Calculate commission
  calculateCommission(amount) {
    const commissionPercentage = parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE || 10);
    const commission = (amount * commissionPercentage) / 100;
    const freelancerAmount = amount - commission;
    
    return {
      totalAmount: parseFloat(amount),
      platformCommission: parseFloat(commission.toFixed(2)),
      platformCommissionPercentage: commissionPercentage,
      freelancerAmount: parseFloat(freelancerAmount.toFixed(2))
    };
  }

  // Create Razorpay order for wallet load
  async createWalletLoadOrder(userId, amount) {
    try {
      const receiptId = `wallet_${userId}_${Date.now()}`;
      
      const orderOptions = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: process.env.CURRENCY || 'INR',
        receipt: receiptId,
        notes: {
          user_id: userId,
          purpose: 'wallet_load'
        }
      };

      const razorpayOrder = await razorpay.orders.create(orderOptions);

      // Save order in database
      await db.query(
        `INSERT INTO razorpay_orders 
        (user_id, order_type, razorpay_order_id, amount, currency, receipt, status) 
        VALUES (?, 'WALLET_LOAD', ?, ?, ?, ?, 'CREATED')`,
        [userId, razorpayOrder.id, amount, razorpayOrder.currency, receiptId]
      );

      return razorpayOrder;
    } catch (error) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
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

  // Process wallet load after successful payment
  async processWalletLoad(orderId, paymentId, signature) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get order details
      const [orders] = await connection.query(
        'SELECT * FROM razorpay_orders WHERE razorpay_order_id = ? FOR UPDATE',
        [orderId]
      );

      if (orders.length === 0) {
        throw new Error('Order not found');
      }

      const order = orders[0];

      if (order.status === 'PAID') {
        throw new Error('Order already processed');
      }

      // Verify signature
      if (!this.verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new Error('Invalid payment signature');
      }

      // Update order status
      await connection.query(
        'UPDATE razorpay_orders SET status = "PAID", updated_at = NOW() WHERE id = ?',
        [order.id]
      );

      // Get user wallet
      const [wallets] = await connection.query(
        'SELECT id FROM wallets WHERE user_id = ?',
        [order.user_id]
      );

      if (wallets.length === 0) {
        throw new Error('Wallet not found');
      }

      // Credit wallet
      await walletService.credit(
        wallets[0].id,
        order.amount,
        'LOAD',
        order.id,
        `Wallet loaded via Razorpay - ${paymentId}`
      );

      await connection.commit();
      return { success: true, amount: order.amount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Create payment transaction for service (from wallet)
  async createWalletPayment(clientId, projectId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get project details
      const [projects] = await connection.query(
        'SELECT * FROM projects WHERE id = ? AND client_id = ?',
        [projectId, clientId]
      );

      if (projects.length === 0) {
        throw new Error('Project not found');
      }

      const project = projects[0];

      // Calculate commission
      const amounts = this.calculateCommission(project.amount);

      // Get client wallet
      const [wallets] = await connection.query(
        'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE',
        [clientId]
      );

      if (wallets.length === 0) {
        throw new Error('Wallet not found');
      }

      const wallet = wallets[0];

      if (parseFloat(wallet.balance) < amounts.totalAmount) {
        throw new Error('Insufficient wallet balance');
      }

      // Debit from client wallet
      await walletService.debit(
        wallet.id,
        amounts.totalAmount,
        'PAYMENT',
        null,
        `Payment for project: ${project.title}`
      );

      // Create transaction record
      const [result] = await connection.query(
        `INSERT INTO transactions 
        (project_id, client_id, freelancer_id, total_amount, platform_commission, 
        platform_commission_percentage, freelancer_amount, payment_source, status, held_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 'WALLET', 'HELD', NOW())`,
        [
          projectId,
          clientId,
          project.freelancer_id,
          amounts.totalAmount,
          amounts.platformCommission,
          amounts.platformCommissionPercentage,
          amounts.freelancerAmount
        ]
      );

      const transactionId = result.insertId;

      await connection.commit();
      return {
        transactionId,
        ...amounts,
        status: 'HELD'
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Create Razorpay order for direct service payment
  async createServicePaymentOrder(clientId, projectId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get project details
      const [projects] = await connection.query(
        'SELECT * FROM projects WHERE id = ? AND client_id = ?',
        [projectId, clientId]
      );

      if (projects.length === 0) {
        throw new Error('Project not found');
      }

      const project = projects[0];
      const amounts = this.calculateCommission(project.amount);

      // Create transaction record
      const [result] = await connection.query(
        `INSERT INTO transactions 
        (project_id, client_id, freelancer_id, total_amount, platform_commission, 
        platform_commission_percentage, freelancer_amount, payment_source, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 'RAZORPAY', 'INITIATED')`,
        [
          projectId,
          clientId,
          project.freelancer_id,
          amounts.totalAmount,
          amounts.platformCommission,
          amounts.platformCommissionPercentage,
          amounts.freelancerAmount
        ]
      );

      const transactionId = result.insertId;

      // Create Razorpay order
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

      // Update transaction with order ID
      await connection.query(
        'UPDATE transactions SET razorpay_order_id = ? WHERE id = ?',
        [razorpayOrder.id, transactionId]
      );

      // Save Razorpay order
      await connection.query(
        `INSERT INTO razorpay_orders 
        (user_id, order_type, razorpay_order_id, amount, currency, receipt, reference_id, status) 
        VALUES (?, 'SERVICE_PAYMENT', ?, ?, ?, ?, ?, 'CREATED')`,
        [clientId, razorpayOrder.id, amounts.totalAmount, razorpayOrder.currency, receiptId, transactionId]
      );

      await connection.commit();
      return {
        transactionId,
        razorpayOrder,
        ...amounts
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Process service payment after successful Razorpay payment
  async processServicePayment(orderId, paymentId, signature) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Verify signature
      if (!this.verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new Error('Invalid payment signature');
      }

      // Get order details
      const [orders] = await connection.query(
        'SELECT * FROM razorpay_orders WHERE razorpay_order_id = ? FOR UPDATE',
        [orderId]
      );

      if (orders.length === 0) {
        throw new Error('Order not found');
      }

      const order = orders[0];

      // Update order status
      await connection.query(
        'UPDATE razorpay_orders SET status = "PAID", updated_at = NOW() WHERE id = ?',
        [order.id]
      );

      // Update transaction status
      await connection.query(
        `UPDATE transactions 
        SET status = 'HELD', razorpay_payment_id = ?, held_at = NOW() 
        WHERE id = ?`,
        [paymentId, order.reference_id]
      );

      await connection.commit();
      return { success: true, transactionId: order.reference_id };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get transaction details
  async getTransaction(transactionId) {
    const [transactions] = await db.query(
      `SELECT t.*, 
        c.full_name as client_name, c.email as client_email,
        f.full_name as freelancer_name, f.email as freelancer_email,
        p.title as project_title
      FROM transactions t
      JOIN users c ON t.client_id = c.id
      JOIN users f ON t.freelancer_id = f.id
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?`,
      [transactionId]
    );
    return transactions[0] || null;
  }

  // Get all transactions in escrow (for admin)
  async getEscrowTransactions(status = 'HELD') {
    const [transactions] = await db.query(
      `SELECT t.*, 
        c.full_name as client_name,
        f.freelancer_full_name as freelancer_name,
        p.title as project_title,
        p.status as project_status
      FROM transactions t
      JOIN users c ON t.client_id = c.id
      JOIN users f ON t.freelancer_id = f.id
      JOIN projects p ON t.project_id = p.id
      WHERE t.status = ?
      ORDER BY t.created_at DESC`,
      [status]
    );
    return transactions;
  }
}

module.exports = new PaymentService();
