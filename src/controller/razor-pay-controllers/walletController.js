const walletService = require('../../razor-pay-services/walletService');
const paymentService = require('../../razor-pay-services/paymentService');

class WalletController {
  // Get wallet balance
  async getBalance(req, res) {
    try {
      const userId = req.user.id;
      const wallet = await walletService.getWalletByUserId(userId);

      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      res.json({
        balance: parseFloat(wallet.balance),
        currency: wallet.currency,
        status: wallet.status
      });
    } catch (error) {
      console.error('Get balance error:', error);
      res.status(500).json({ error: 'Failed to get balance' });
    }
  }

  // Create order for wallet load
  async createLoadOrder(req, res) {
    try {
      const { amount } = req.body;
      const userId = req.user.id;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      const minLoad = parseFloat(process.env.MIN_WALLET_LOAD || 100);
      const maxLoad = parseFloat(process.env.MAX_WALLET_LOAD || 100000);

      if (amount < minLoad) {
        return res.status(400).json({ 
          error: `Minimum wallet load amount is ${minLoad}` 
        });
      }

      if (amount > maxLoad) {
        return res.status(400).json({ 
          error: `Maximum wallet load amount is ${maxLoad}` 
        });
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
      res.status(500).json({ error: error.message });
    }
  }

  // Verify and process wallet load payment
  async verifyLoadPayment(req, res) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing payment details' });
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
      res.status(400).json({ error: error.message });
    }
  }

  // Get wallet transactions
  async getTransactions(req, res) {
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
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  }

  // Get single transaction
  async getTransaction(req, res) {
    try {
      const userId = req.user.id;
      const transactionId = req.params.id;

      const transaction = await walletService.getTransactionById(transactionId, userId);

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json(transaction);
    } catch (error) {
      console.error('Get transaction error:', error);
      res.status(500).json({ error: 'Failed to get transaction' });
    }
  }
}

module.exports = new WalletController();
