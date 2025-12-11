const {pool:db} = require('../../config/dbConfig');

class WalletService {
  // Create wallet for new user
  async createWallet(userId) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        'INSERT INTO wallets (user_id, balance, currency) VALUES (?, 0.00, ?)',
        [userId, process.env.CURRENCY || 'INR']
      );

      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get wallet by user ID
  async getWalletByUserId(userId) {
    const [wallets] = await db.query(
      'SELECT * FROM wallets WHERE user_id = ?',
      [userId]
    );
    return wallets[0] || null;
  }

  // Get wallet balance
  async getBalance(userId) {
    const wallet = await this.getWalletByUserId(userId);
    return wallet ? parseFloat(wallet.balance) : 0;
  }

  // Credit amount to wallet
  async credit(walletId, amount, referenceType, referenceId, description) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get current balance with row lock
      const [wallets] = await connection.query(
        'SELECT balance FROM wallets WHERE id = ? FOR UPDATE',
        [walletId]
      );

      if (wallets.length === 0) {
        throw new Error('Wallet not found');
      }

      const balanceBefore = parseFloat(wallets[0].balance);
      const balanceAfter = balanceBefore + parseFloat(amount);

      // Update wallet balance
      await connection.query(
        'UPDATE wallets SET balance = ?, updated_at = NOW() WHERE id = ?',
        [balanceAfter, walletId]
      );

      // Record transaction
      await connection.query(
        `INSERT INTO wallet_transactions 
        (wallet_id, transaction_type, amount, balance_before, balance_after, 
        reference_type, reference_id, description) 
        VALUES (?, 'CREDIT', ?, ?, ?, ?, ?, ?)`,
        [walletId, amount, balanceBefore, balanceAfter, referenceType, referenceId, description]
      );

      await connection.commit();
      return { balanceBefore, balanceAfter, amount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Debit amount from wallet
  async debit(walletId, amount, referenceType, referenceId, description) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Get current balance with row lock
      const [wallets] = await connection.query(
        'SELECT balance FROM wallets WHERE id = ? FOR UPDATE',
        [walletId]
      );

      if (wallets.length === 0) {
        throw new Error('Wallet not found');
      }

      const balanceBefore = parseFloat(wallets[0].balance);

      if (balanceBefore < parseFloat(amount)) {
        throw new Error('Insufficient wallet balance');
      }

      const balanceAfter = balanceBefore - parseFloat(amount);

      // Update wallet balance
      await connection.query(
        'UPDATE wallets SET balance = ?, updated_at = NOW() WHERE id = ?',
        [balanceAfter, walletId]
      );

      // Record transaction
      await connection.query(
        `INSERT INTO wallet_transactions 
        (wallet_id, transaction_type, amount, balance_before, balance_after, 
        reference_type, reference_id, description) 
        VALUES (?, 'DEBIT', ?, ?, ?, ?, ?, ?)`,
        [walletId, amount, balanceBefore, balanceAfter, referenceType, referenceId, description]
      );

      await connection.commit();
      return { balanceBefore, balanceAfter, amount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get wallet transactions
  async getTransactions(userId, limit = 50, offset = 0) {
    const [transactions] = await db.query(
      `SELECT wt.*, w.user_id 
      FROM wallet_transactions wt
      JOIN wallets w ON wt.wallet_id = w.id
      WHERE w.user_id = ?
      ORDER BY wt.created_at DESC
      LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
    return transactions;
  }

  // Get transaction by ID
  async getTransactionById(transactionId, userId) {
    const [transactions] = await db.query(
      `SELECT wt.*, w.user_id 
      FROM wallet_transactions wt
      JOIN wallets w ON wt.wallet_id = w.id
      WHERE wt.id = ? AND w.user_id = ?`,
      [transactionId, userId]
    );
    return transactions[0] || null;
  }
}

module.exports = new WalletService();
