const paymentService = require('../../razor-pay-services/paymentService');
const {pool:db} = require('../../../config/dbConfig');


class PaymentController {
  // Create payment from wallet
  async payFromWallet(req, res) {
    try {
      const { project_id } = req.body;
      const clientId = req.user.id;

      if (!project_id) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      // Verify project belongs to client
      const [projects] = await db.query(
        'SELECT * FROM projects WHERE id = ? AND client_id = ?',
        [project_id, clientId]
      );

      if (projects.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const result = await paymentService.createWalletPayment(clientId, project_id);

      res.json({
        message: 'Payment successful. Funds held in escrow.',
        transaction: result
      });
    } catch (error) {
      console.error('Pay from wallet error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Create Razorpay order for service payment
  async createPaymentOrder(req, res) {
    try {
      const { project_id } = req.body;
      const clientId = req.user.id;

      if (!project_id) {
        return res.status(400).json({ error: 'Project ID is required' });
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
      res.status(400).json({ error: error.message });
    }
  }

  // Verify service payment
  async verifyPayment(req, res) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing payment details' });
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
      res.status(400).json({ error: error.message });
    }
  }

  // Get transaction details
  async getTransaction(req, res) {
    try {
      const transactionId = req.params.id;
      const userId = req.user.id;

      const transaction = await paymentService.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Check if user is involved in transaction
      if (transaction.client_id !== userId && 
          transaction.freelancer_id !== userId && 
          req.user.user_type !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(transaction);
    } catch (error) {
      console.error('Get transaction error:', error);
      res.status(500).json({ error: 'Failed to get transaction' });
    }
  }

  // Get user's transactions
  async getMyTransactions(req, res) {
    try {
      const userId = req.user.id;
      const userType = req.user.user_type;

      let query;
      if (userType === 'CLIENT') {
        query = 'SELECT * FROM transactions WHERE client_id = ? ORDER BY created_at DESC';
      } else if (userType === 'FREELANCER') {
        query = 'SELECT * FROM transactions WHERE freelancer_id = ? ORDER BY created_at DESC';
      } else {
        return res.status(400).json({ error: 'Invalid user type' });
      }

      const [transactions] = await db.query(query, [userId]);

      res.json(transactions);
    } catch (error) {
      console.error('Get my transactions error:', error);
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  }
}

module.exports = new PaymentController();
