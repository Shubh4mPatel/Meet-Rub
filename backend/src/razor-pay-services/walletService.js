const {pool:db} = require('../../config/dbConfig');

class WalletService {
  // Create wallet for new user
  async createWallet(userId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'INSERT INTO wallets (user_id, balance, currency) VALUES ($1, 0.00, $2) RETURNING id',
        [userId, process.env.CURRENCY || 'INR']
      );

      await client.query('COMMIT');
      return rows[0].id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get wallet by user ID
  async getWalletByUserId(userId) {
    const { rows } = await db.query(
      'SELECT * FROM wallets WHERE user_id = $1',
      [userId]
    );
    return rows[0] || null;
  }

  // Get wallet balance
  async getBalance(userId) {
    const wallet = await this.getWalletByUserId(userId);
    return wallet ? parseFloat(wallet.balance) : 0;
  }

  // Credit amount to wallet
  async credit(walletId, amount, referenceType, referenceId, description) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: wallets } = await client.query(
        'SELECT balance FROM wallets WHERE id = $1 FOR UPDATE',
        [walletId]
      );

      if (wallets.length === 0) {
        throw new Error('Wallet not found');
      }

      const balanceBefore = parseFloat(wallets[0].balance);
      const balanceAfter = balanceBefore + parseFloat(amount);

      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, walletId]
      );

      await client.query(
        `INSERT INTO wallet_transactions
        (wallet_id, transaction_type, amount, balance_before, balance_after,
        reference_type, reference_id, description)
        VALUES ($1, 'CREDIT', $2, $3, $4, $5, $6, $7)`,
        [walletId, amount, balanceBefore, balanceAfter, referenceType, referenceId, description]
      );

      await client.query('COMMIT');
      return { balanceBefore, balanceAfter, amount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Debit amount from wallet
  async debit(walletId, amount, referenceType, referenceId, description) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: wallets } = await client.query(
        'SELECT balance FROM wallets WHERE id = $1 FOR UPDATE',
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

      await client.query(
        'UPDATE wallets SET balance = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, walletId]
      );

      await client.query(
        `INSERT INTO wallet_transactions
        (wallet_id, transaction_type, amount, balance_before, balance_after,
        reference_type, reference_id, description)
        VALUES ($1, 'DEBIT', $2, $3, $4, $5, $6, $7)`,
        [walletId, amount, balanceBefore, balanceAfter, referenceType, referenceId, description]
      );

      await client.query('COMMIT');
      return { balanceBefore, balanceAfter, amount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get wallet transactions
  async getTransactions(userId, limit = 50, offset = 0) {
    const { rows } = await db.query(
      `SELECT wt.*, w.user_id
      FROM wallet_transactions wt
      JOIN wallets w ON wt.wallet_id = w.id
      WHERE w.user_id = $1
      ORDER BY wt.created_at DESC
      LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  }

  // Get transaction by ID
  async getTransactionById(transactionId, userId) {
    const { rows } = await db.query(
      `SELECT wt.*, w.user_id
      FROM wallet_transactions wt
      JOIN wallets w ON wt.wallet_id = w.id
      WHERE wt.id = $1 AND w.user_id = $2`,
      [transactionId, userId]
    );
    return rows[0] || null;
  }
}

module.exports = new WalletService();
