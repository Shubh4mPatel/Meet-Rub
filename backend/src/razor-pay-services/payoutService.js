const {pool:db} = require('../../config/dbConfig');
const razorpay = require('../../config/razorpay');

class PayoutService {
  // Create fund account for freelancer
  async createFundAccount(freelancerAccountId) {
    try {
      const [accounts] = await db.query(
        'SELECT * FROM freelancer_accounts WHERE id = ?',
        [freelancerAccountId]
      );

      if (accounts.length === 0) {
        throw new Error('Freelancer account not found');
      }

      const account = accounts[0];

      // Create contact in Razorpay
      const contact = await razorpay.contacts.create({
        name: account.bank_account_name,
        email: '', // Add email if available
        contact: '', // Add phone if available
        type: 'vendor',
        reference_id: `freelancer_${account.user_id}`,
        notes: {
          user_id: account.user_id
        }
      });

      // Create fund account
      const fundAccount = await razorpay.fundAccount.create({
        contact_id: contact.id,
        account_type: 'bank_account',
        bank_account: {
          name: account.bank_account_name,
          ifsc: account.bank_ifsc_code,
          account_number: account.bank_account_number
        }
      });

      return fundAccount;
    } catch (error) {
      throw new Error(`Failed to create fund account: ${error.message}`);
    }
  }

  // Release payment to freelancer (Admin action)
  async releasePayment(transactionId, adminId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get transaction details
      const [transactions] = await connection.query(
        'SELECT * FROM transactions WHERE id = ? FOR UPDATE',
        [transactionId]
      );

      if (transactions.length === 0) {
        throw new Error('Transaction not found');
      }

      const transaction = transactions[0];

      if (transaction.status !== 'HELD') {
        throw new Error(`Transaction cannot be released. Current status: ${transaction.status}`);
      }

      // Get freelancer account details
      const [freelancerAccounts] = await connection.query(
        'SELECT * FROM freelancer_accounts WHERE user_id = ? AND is_active = TRUE',
        [transaction.freelancer_id]
      );

      if (freelancerAccounts.length === 0) {
        throw new Error('Freelancer account not found or not active');
      }

      const freelancerAccount = freelancerAccounts[0];

      if (freelancerAccount.verification_status !== 'VERIFIED') {
        throw new Error('Freelancer account not verified');
      }

      // Update transaction status
      await connection.query(
        `UPDATE transactions 
        SET status = 'RELEASED', released_at = NOW(), released_by = ? 
        WHERE id = ?`,
        [adminId, transactionId]
      );

      // Create payout record
      const [payoutResult] = await connection.query(
        `INSERT INTO payouts 
        (transaction_id, freelancer_id, freelancer_account_id, amount, currency, status, reference_id) 
        VALUES (?, ?, ?, ?, ?, 'QUEUED', ?)`,
        [
          transactionId,
          transaction.freelancer_id,
          freelancerAccount.id,
          transaction.freelancer_amount,
          transaction.currency,
          `TXN_${transactionId}_${Date.now()}`
        ]
      );

      const payoutId = payoutResult.insertId;

      await connection.commit();

      // Process payout asynchronously
      this.processPayout(payoutId).catch(error => {
        console.error('Payout processing error:', error);
      });

      return {
        transactionId,
        payoutId,
        amount: transaction.freelancer_amount,
        status: 'RELEASED'
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Process payout via Razorpay
  async processPayout(payoutId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get payout details
      const [payouts] = await connection.query(
        `SELECT p.*, fa.* 
        FROM payouts p
        JOIN freelancer_accounts fa ON p.freelancer_account_id = fa.id
        WHERE p.id = ? FOR UPDATE`,
        [payoutId]
      );

      if (payouts.length === 0) {
        throw new Error('Payout not found');
      }

      const payout = payouts[0];

      if (payout.status !== 'QUEUED') {
        throw new Error('Payout already processed');
      }

      // Update status to pending
      await connection.query(
        'UPDATE payouts SET status = "PENDING", initiated_at = NOW() WHERE id = ?',
        [payoutId]
      );

      await connection.commit();

      // Create fund account if not exists
      let fundAccountId = payout.razorpay_fund_account_id;
      
      if (!fundAccountId) {
        const fundAccount = await this.createFundAccount(payout.freelancer_account_id);
        fundAccountId = fundAccount.id;
        
        await db.query(
          'UPDATE freelancer_accounts SET razorpay_account_id = ? WHERE id = ?',
          [fundAccountId, payout.freelancer_account_id]
        );
      }

      // Create payout in Razorpay
      const razorpayPayout = await razorpay.payouts.create({
        account_number: process.env.RAZORPAY_ACCOUNT_NUMBER,
        fund_account_id: fundAccountId,
        amount: Math.round(payout.amount * 100), // Convert to paise
        currency: payout.currency || 'INR',
        mode: 'IMPS',
        purpose: 'payout',
        queue_if_low_balance: true,
        reference_id: payout.reference_id,
        narration: `Payment for transaction ${payout.transaction_id}`,
        notes: {
          transaction_id: payout.transaction_id,
          payout_id: payoutId
        }
      });

      // Update payout with Razorpay details
      await db.query(
        `UPDATE payouts 
        SET razorpay_payout_id = ?, razorpay_fund_account_id = ?, 
            status = 'PROCESSING', utr = ? 
        WHERE id = ?`,
        [razorpayPayout.id, fundAccountId, razorpayPayout.utr, payoutId]
      );

      // Update transaction
      await db.query(
        'UPDATE transactions SET payout_id = ?, payout_status = "PROCESSING" WHERE id = ?',
        [razorpayPayout.id, payout.transaction_id]
      );

      return razorpayPayout;
    } catch (error) {
      await connection.rollback();
      
      // Update payout status to failed
      await db.query(
        'UPDATE payouts SET status = "FAILED", failure_reason = ? WHERE id = ?',
        [error.message, payoutId]
      );
      
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get payout details
  async getPayout(payoutId) {
    const [payouts] = await db.query(
      `SELECT p.*, 
        t.project_id,
        f.freelancer_full_name as freelancer_name,
        fa.bank_account_number, fa.bank_ifsc_code
      FROM payouts p
      JOIN transactions t ON p.transaction_id = t.id
      JOIN users f ON p.freelancer_id = f.id
      JOIN freelancer_accounts fa ON p.freelancer_account_id = fa.id
      WHERE p.id = ?`,
      [payoutId]
    );
    return payouts[0] || null;
  }

  // Get all payouts for a freelancer
  async getFreelancerPayouts(freelancerId) {
    const [payouts] = await db.query(
      `SELECT p.*, t.project_id, t.total_amount, t.platform_commission
      FROM payouts p
      JOIN transactions t ON p.transaction_id = t.id
      WHERE p.freelancer_id = ?
      ORDER BY p.created_at DESC`,
      [freelancerId]
    );
    return payouts;
  }

  // Update payout status (called by webhook)
  async updatePayoutStatus(razorpayPayoutId, status, utr = null) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const updateData = {
        status: status.toUpperCase(),
        updated_at: new Date()
      };

      if (utr) {
        updateData.utr = utr;
      }

      if (status === 'processed') {
        updateData.processed_at = new Date();
        updateData.status = 'PROCESSED';
      }

      await connection.query(
        'UPDATE payouts SET ?, updated_at = NOW() WHERE razorpay_payout_id = ?',
        [updateData, razorpayPayoutId]
      );

      // Update transaction status
      if (status === 'processed') {
        await connection.query(
          `UPDATE transactions t
          JOIN payouts p ON t.id = p.transaction_id
          SET t.status = 'COMPLETED', t.payout_status = 'PROCESSED', t.payout_utr = ?
          WHERE p.razorpay_payout_id = ?`,
          [utr, razorpayPayoutId]
        );
      } else if (status === 'failed' || status === 'reversed') {
        await connection.query(
          `UPDATE transactions t
          JOIN payouts p ON t.id = p.transaction_id
          SET t.payout_status = 'FAILED'
          WHERE p.razorpay_payout_id = ?`,
          [razorpayPayoutId]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = new PayoutService();
