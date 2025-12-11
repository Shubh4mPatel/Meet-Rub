const paymentService = require('../../razor-pay-services/paymentService');
const payoutService = require('../../razor-pay-services/payoutService');
const {pool:db} = require('../../../config/dbConfig');

// class AdminController {
  // Get all escrow transactions
  const getEscrowTransactions = async (req, res) => {
    try {
      const status = req.query.status || 'HELD';
      const transactions = await paymentService.getEscrowTransactions(status);

      res.json({
        count: transactions.length,
        transactions
      });
    } catch (error) {
      console.error('Get escrow transactions error:', error);
      res.status(500).json({ error: 'Failed to get escrow transactions' });
    }
  }

  // Release payment to freelancer
  const releasePayment = async (req, res) => {
    try {
      const transactionId = req.params.id;
      const adminId = req.user.id;

      // Verify transaction exists and is in HELD status
      const transaction = await paymentService.getTransaction(transactionId);

      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      if (transaction.status !== 'HELD') {
        return res.status(400).json({ 
          error: `Cannot release payment. Transaction status: ${transaction.status}` 
        });
      }

      // Check if project is completed
      const [projects] = await db.query(
        'SELECT status FROM projects WHERE id = ?',
        [transaction.project_id]
      );

      if (projects.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (projects[0].status !== 'COMPLETED') {
        return res.status(400).json({ 
          error: 'Project must be completed before releasing payment',
          project_status: projects[0].status
        });
      }

      // Release payment
      const result = await payoutService.releasePayment(transactionId, adminId);

      res.json({
        message: 'Payment released successfully. Payout initiated.',
        ...result
      });
    } catch (error) {
      console.error('Release payment error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Get all payouts
  const getAllPayouts = async (req, res) => {
    try {
      const status = req.query.status;
      
      let query = `
        SELECT p.*, 
          t.project_id, t.total_amount, t.platform_commission,
          f.full_name as freelancer_name, f.email as freelancer_email
        FROM payouts p
        JOIN transactions t ON p.transaction_id = t.id
        JOIN users f ON p.freelancer_id = f.id
      `;

      const params = [];
      
      if (status) {
        query += ' WHERE p.status = ?';
        params.push(status);
      }

      query += ' ORDER BY p.created_at DESC';

      const [payouts] = await db.query(query, params);

      res.json({
        count: payouts.length,
        payouts
      });
    } catch (error) {
      console.error('Get all payouts error:', error);
      res.status(500).json({ error: 'Failed to get payouts' });
    }
  }

  // Get payout details
  const getPayoutDetails = async (req, res) => {
    try {
      const payoutId = req.params.id;
      const payout = await payoutService.getPayout(payoutId);

      if (!payout) {
        return res.status(404).json({ error: 'Payout not found' });
      }

      res.json(payout);
    } catch (error) {
      console.error('Get payout details error:', error);
      res.status(500).json({ error: 'Failed to get payout details' });
    }
  }

  // Get platform statistics
  const getPlatformStats = async (req, res) => {
    try {
      // Total transactions
      const [totalTransactions] = await db.query(
        'SELECT COUNT(*) as count FROM transactions'
      );

      // Total revenue (commissions)
      const [totalRevenue] = await db.query(
        'SELECT SUM(platform_commission) as revenue FROM transactions WHERE status IN ("HELD", "RELEASED", "COMPLETED")'
      );

      // Pending releases
      const [pendingReleases] = await db.query(
        'SELECT COUNT(*) as count, SUM(total_amount) as amount FROM transactions WHERE status = "HELD"'
      );

      // Completed payouts
      const [completedPayouts] = await db.query(
        'SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status = "PROCESSED"'
      );

      // Pending payouts
      const [pendingPayouts] = await db.query(
        'SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status IN ("QUEUED", "PENDING", "PROCESSING")'
      );

      res.json({
        total_transactions: totalTransactions[0].count,
        total_commission_earned: parseFloat(totalRevenue[0].revenue || 0),
        escrow: {
          count: pendingReleases[0].count,
          total_amount: parseFloat(pendingReleases[0].amount || 0)
        },
        payouts: {
          completed: {
            count: completedPayouts[0].count,
            total_amount: parseFloat(completedPayouts[0].amount || 0)
          },
          pending: {
            count: pendingPayouts[0].count,
            total_amount: parseFloat(pendingPayouts[0].amount || 0)
          }
        }
      });
    } catch (error) {
      console.error('Get platform stats error:', error);
      res.status(500).json({ error: 'Failed to get platform statistics' });
    }
  }

  // Update platform commission percentage
  const updateCommission = async (req, res) => {
    try {
      const { percentage } = req.body;

      if (!percentage || percentage < 0 || percentage > 100) {
        return res.status(400).json({ error: 'Invalid commission percentage' });
      }

      await db.query(
        'UPDATE platform_settings SET setting_value = ? WHERE setting_key = "commission_percentage"',
        [percentage]
      );

      res.json({
        message: 'Commission percentage updated successfully',
        new_percentage: percentage
      });
    } catch (error) {
      console.error('Update commission error:', error);
      res.status(500).json({ error: 'Failed to update commission' });
    }
  }


module.exports ={
  getEscrowTransactions,
  releasePayment,
  getAllPayouts,
  getPayoutDetails,
  getPlatformStats,
  updateCommission
}