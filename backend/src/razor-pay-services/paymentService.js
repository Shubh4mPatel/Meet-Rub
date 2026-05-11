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

      // Guard: Check for existing active transactions
      // If old INITIATED transaction exists (>15 min), auto-expire it and allow retry
      const { rows: activeTx } = await client.query(
        `SELECT id, status, created_at, razorpay_order_id
         FROM transactions
         WHERE project_id = $1 AND status IN ('INITIATED', 'HELD')
         ORDER BY created_at DESC
         LIMIT 1`,
        [projectId]
      );

      if (activeTx.length > 0) {
        const tx = activeTx[0];
        const ageMinutes = (Date.now() - new Date(tx.created_at).getTime()) / (1000 * 60);

        // Block HELD transactions - payment is completed and in escrow
        if (tx.status === 'HELD') {
          throw new Error(`Payment already completed for this project. Transaction is in escrow.`);
        }

        if (ageMinutes > 15) {
          // Razorpay orders expire after 15 minutes - mark as expired and allow retry
          logger.warn(`[createServicePaymentOrder] Transaction ${tx.id} expired (age: ${ageMinutes.toFixed(1)} min), marking as FAILED`);
          await client.query(
            `UPDATE transactions SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
            [tx.id]
          );
        } else if (tx.razorpay_order_id) {
          // Check if the Razorpay order is still valid
          try {
            const order = await razorpay.orders.fetch(tx.razorpay_order_id);
            logger.info(`[createServicePaymentOrder] Checking Razorpay order ${tx.razorpay_order_id}: status=${order.status}`);

            // If order is paid, attempted, or still active - handle accordingly
            if (order.status === 'paid') {
              throw new Error(`Payment already completed. Please refresh the page.`);
            } else if (order.status === 'attempted') {
              // User started payment but didn't complete - wait for them to complete or timeout
              throw new Error(`Payment in progress. Please complete the payment or wait ${Math.ceil(15 - ageMinutes)} minutes to retry.`);
            } else if (order.status === 'created') {
              // Reuse order only if < 10 minutes old (5 min buffer before 15 min Razorpay expiration)
              if (ageMinutes < 10) {
                // Order still has sufficient validity - reuse it
                logger.info(`[createServicePaymentOrder] Reusing existing order ${tx.razorpay_order_id} for transaction ${tx.id} (age: ${ageMinutes.toFixed(1)} min)`);

                // Get transaction details to return the breakdown
                const { rows: existingTx } = await client.query(
                  `SELECT total_amount, platform_commission, freelancer_amount, gst
                   FROM transactions
                   WHERE id = $1`,
                  [tx.id]
                );

                await client.query('COMMIT');

                return {
                  transactionId: tx.id,
                  razorpayOrder: {
                    id: order.id,
                    amount: order.amount / 100, // Convert paise to rupees
                    currency: order.currency
                  },
                  totalAmount: existingTx[0].total_amount,
                  serviceAmount: (order.amount / 100) - existingTx[0].gst,
                  platformCommission: existingTx[0].platform_commission,
                  freelancerAmount: existingTx[0].freelancer_amount,
                  gst: existingTx[0].gst
                };
              } else {
                // Order approaching expiration (10-15 min) - create new order to avoid mid-payment expiry
                logger.warn(`[createServicePaymentOrder] Transaction ${tx.id} approaching expiration (age: ${ageMinutes.toFixed(1)} min), marking as FAILED and creating new order`);
                await client.query(
                  `UPDATE transactions SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
                  [tx.id]
                );
              }
            }
          } catch (razorpayError) {
            // If order not found or API error, assume expired and allow retry
            logger.warn(`[createServicePaymentOrder] Razorpay order fetch failed: ${razorpayError.message}. Marking transaction ${tx.id} as FAILED`);
            await client.query(
              `UPDATE transactions SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
              [tx.id]
            );
          }
        } else {
          // No razorpay_order_id - orphaned transaction, mark as FAILED
          logger.warn(`[createServicePaymentOrder] Transaction ${tx.id} has no razorpay_order_id, marking as FAILED`);
          await client.query(
            `UPDATE transactions SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
            [tx.id]
          );
        }
      }

      logger.info(`[createServicePaymentOrder] Looking up project_id=${projectId} creator_id(clientId)=${clientId}`);
      const { rows: projects } = await client.query(
        `SELECT p.*, so.service_name,
                f.razorpay_linked_account_id, f.razorpay_account_status
         FROM projects p
         LEFT JOIN service_options so ON p.service_id = so.id
         LEFT JOIN freelancer f ON p.freelancer_id = f.freelancer_id
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

      // Razorpay Routes: Add transfer instructions if freelancer has activated linked account
      if (!project.razorpay_linked_account_id || project.razorpay_account_status !== 'activated') {
        const status = project.razorpay_account_status || 'not_started';
        throw new Error(`Payment cannot be processed: freelancer's Razorpay account is not activated (status: ${status}). Please contact support.`);
      }

      orderOptions.transfers = [{
        account: project.razorpay_linked_account_id,
        amount: Math.round(amounts.freelancerAmount * 100),
        currency: process.env.CURRENCY || 'INR',
        on_hold: 1,
        notes: {
          project_id: String(projectId),
          transaction_id: String(transactionId),
        },
        linked_account_notes: ['project_id', 'transaction_id'],
      }];
      logger.info(`[createServicePaymentOrder] ✅ Added transfer instructions for transaction_id=${transactionId}: account=${project.razorpay_linked_account_id}, amount=${amounts.freelancerAmount}, on_hold=indefinite, freelancer_id=${project.freelancer_id}`);

      logger.info(`[createServicePaymentOrder] 📤 Creating Razorpay order with options: ${JSON.stringify({ ...orderOptions, transfers: orderOptions.transfers ? `[${orderOptions.transfers.length} transfer(s)]` : 'none' })}`);
      const razorpayOrder = await razorpay.orders.create(orderOptions);
      logger.info(`[createServicePaymentOrder] ✅ Razorpay order created: id=${razorpayOrder.id}, amount=${razorpayOrder.amount}, status=${razorpayOrder.status}`);

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
          // Check if the project was also updated; if not (partial failure), fix it now
          const { rows: projCheck } = await client.query(
            `SELECT p.id, p.status, p.custom_package_id
             FROM transactions t
             JOIN projects p ON t.project_id = p.id
             WHERE t.id = $1`,
            [order.reference_id]
          );

          logger.info(`[processServicePayment] Idempotency projCheck result=${JSON.stringify(projCheck)}`);

          if (projCheck.length === 0) {
            logger.warn(`[processServicePayment] No project found for transaction ${order.reference_id}`);
          } else if (projCheck[0].status !== 'CREATED') {
            logger.info(`[processServicePayment] Project ${projCheck[0].id} already in status=${projCheck[0].status}, no recovery needed`);
          } else {
            logger.warn(`[processServicePayment] Project ${projCheck[0].id} still CREATED after HELD transaction — completing update now`);

            let endDate = null;

            // If project has a custom_package_id, update it and get delivery info
            if (projCheck[0].custom_package_id) {
              const { rows: cpRows } = await client.query(
                `UPDATE custom_packages
                 SET status = 'paid', updated_at = NOW()
                 WHERE id = $1 AND status IN ('accepted', 'paid')
                 RETURNING id, delivery_days, delivery_time`,
                [projCheck[0].custom_package_id]
              );

              logger.info(`[processServicePayment] Idempotency recovery: custom_package updated=${JSON.stringify(cpRows[0])}`);

              if (cpRows[0]) {
                const deliveryDays = parseInt(cpRows[0].delivery_days) || 0;
                const deliveryHours = parseInt(cpRows[0].delivery_time) || 0;
                endDate = new Date();
                endDate.setDate(endDate.getDate() + deliveryDays);
                endDate.setHours(endDate.getHours() + deliveryHours);
                logger.info(`[processServicePayment] Idempotency recovery: computed end_date=${endDate.toISOString()} from delivery_days=${deliveryDays} delivery_hours=${deliveryHours}`);
              }
            }

            if (endDate) {
              await client.query(
                `UPDATE projects SET status = 'IN_PROGRESS', end_date = $2, updated_at = NOW() WHERE id = $1`,
                [projCheck[0].id, endDate]
              );
            } else {
              await client.query(
                `UPDATE projects SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
                [projCheck[0].id]
              );
            }
            logger.info(`[processServicePayment] Idempotency recovery: Project ${projCheck[0].id} updated to IN_PROGRESS`);
          }

          await client.query('COMMIT');
          logger.info(`[processServicePayment] Transaction ${order.reference_id} already HELD, returning success`);
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

      // Razorpay Routes: fetch transfer ID from payment using dedicated transfers endpoint
      try {
        logger.info(`[processServicePayment] 🔍 Fetching transfers for payment_id=${paymentId}...`);
        const transfersResponse = await razorpay.payments.fetchTransfer(paymentId);

        logger.info(`[processServicePayment] Transfers response: count=${transfersResponse.count || 0}, items_length=${transfersResponse.items?.length || 0}`);

        if (transfersResponse.items && transfersResponse.items.length > 0) {
          const transferId = transfersResponse.items[0].id;
          const transferAmount = transfersResponse.items[0].amount;
          const transferOnHold = transfersResponse.items[0].on_hold;

          logger.info(`[processServicePayment] ✅ Transfer found: id=${transferId}, amount=${transferAmount}, on_hold=${transferOnHold}`);

          await client.query(
            `UPDATE transactions SET razorpay_transfer_id = $1 WHERE id = $2`,
            [transferId, order.reference_id]
          );
          logger.info(`[processServicePayment] ✅ Successfully stored razorpay_transfer_id=${transferId} for transaction ${order.reference_id}`);
        } else {
          logger.error(`[processServicePayment] ❌ No transfer items found for payment_id=${paymentId}, transaction_id=${order.reference_id}. This payment was likely created without transfer instructions.`);
        }
      } catch (transferFetchErr) {
        // Non-fatal: transfer ID can be fetched later via reconciliation
        logger.error(`[processServicePayment] ❌ Failed to fetch transfer details for payment_id=${paymentId}: ${transferFetchErr.message}`);
        logger.error(`[processServicePayment] Stack trace: ${transferFetchErr.stack}`);
      }

      // Get project and custom_package_id from transaction
      const { rows: txRows } = await client.query(
        `SELECT p.id as project_id, p.custom_package_id
         FROM transactions t
         JOIN projects p ON t.project_id = p.id
         WHERE t.id = $1`,
        [order.reference_id]
      );

      if (txRows.length === 0) {
        logger.error(`[processServicePayment] No project found for transaction ${order.reference_id}`);
        throw new Error(`Project not found for transaction ${order.reference_id}`);
      }

      const projectId = txRows[0].project_id;
      const customPackageId = txRows[0].custom_package_id;

      logger.info(`[processServicePayment] Processing payment for project_id=${projectId} custom_package_id=${customPackageId}`);

      let endDate = null;

      // If project has a custom_package_id, update it to 'paid' and get delivery info
      if (customPackageId) {
        const { rows: cpRows } = await client.query(
          `UPDATE custom_packages
           SET status = 'paid', updated_at = NOW()
           WHERE id = $1
           RETURNING id, delivery_days, delivery_time`,
          [customPackageId]
        );

        if (cpRows.length > 0 && cpRows[0]) {
          logger.info(`[processServicePayment] Custom package updated: ${JSON.stringify(cpRows[0])}`);

          const deliveryDays = parseInt(cpRows[0].delivery_days) || 0;
          const deliveryHours = parseInt(cpRows[0].delivery_time) || 0;

          logger.info(`[processServicePayment] Delivery: days=${deliveryDays}, hours=${deliveryHours}`);

          endDate = new Date();
          endDate.setDate(endDate.getDate() + deliveryDays);
          endDate.setHours(endDate.getHours() + deliveryHours);

          logger.info(`[processServicePayment] Computed end_date=${endDate.toISOString()}`);
        } else {
          logger.warn(`[processServicePayment] Custom package ${customPackageId} not found or already updated`);
        }
      } else {
        logger.warn(`[processServicePayment] No custom_package_id for project ${projectId} - direct project without custom package`);
      }

      // Update project status to IN_PROGRESS with end_date
      if (endDate) {
        const updateResult = await client.query(
          `UPDATE projects SET status = 'IN_PROGRESS', end_date = $2, updated_at = NOW() 
           WHERE id = $1 
           RETURNING id, status, end_date`,
          [projectId, endDate]
        );
        logger.info(`[processServicePayment] Project updated: ${JSON.stringify(updateResult.rows[0])}`);
      } else {
        await client.query(
          `UPDATE projects SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1`,
          [projectId]
        );
        logger.info(`[processServicePayment] Project ${projectId} updated to IN_PROGRESS (no end_date)`);
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
        f.freelancer_full_name as freelancer_name, f.freelancer_email as freelancer_email,
        p.amount as project_amount
      FROM transactions t
      JOIN creators c ON t.creator_id = c.creator_id
      JOIN freelancer f ON t.freelancer_id = f.freelancer_id
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
        p.status as project_status
      FROM transactions t
      JOIN creators c ON t.creator_id = c.creator_id
      JOIN freelancer f ON t.freelancer_id = f.freelancer_id
      JOIN projects p ON t.project_id = p.id
      WHERE t.status = $1
        AND p.status = 'COMPLETED'
      ORDER BY t.created_at DESC`,
      [status]
    );
    return rows;
  }

  // Release a transfer on-hold — releases freelancer funds via Razorpay Routes
  async releaseTransfer(transactionId, adminId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const { rows: transactions } = await client.query(
        `SELECT t.*, f.razorpay_linked_account_id
         FROM transactions t
         JOIN freelancer f ON t.freelancer_id = f.freelancer_id
         WHERE t.id = $1 FOR UPDATE`,
        [transactionId]
      );

      if (transactions.length === 0) {
        throw new Error('Transaction not found');
      }

      const tx = transactions[0];

      if (tx.status !== 'HELD') {
        throw new Error(`Transaction is not in HELD status (current: ${tx.status})`);
      }

      if (!tx.razorpay_transfer_id) {
        throw new Error('No transfer ID found — this transaction may be using the legacy payout flow');
      }

      // Release the hold on Razorpay
      logger.info(`[releaseTransfer] Releasing transfer ${tx.razorpay_transfer_id} for transaction ${transactionId}`);
      await razorpay.transfers.edit(tx.razorpay_transfer_id, {
        on_hold: 0,
      });

      // Update transaction status to COMPLETED
      await client.query(
        `UPDATE transactions SET status = 'COMPLETED', released_by = $1, released_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [adminId, transactionId]
      );

      // // Update project status to COMPLETED
      // await client.query(
      //   `UPDATE projects SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
      //   [tx.project_id]
      // );

      // Credit freelancer earnings tracking balance.
      // Actual funds are auto-settled by Razorpay to the linked account's bank.
      await client.query(
        `UPDATE freelancer SET earnings_balance = earnings_balance + $1, updated_at = NOW() WHERE freelancer_id = $2`,
        [tx.freelancer_amount, tx.freelancer_id]
      );

      await client.query('COMMIT');

      logger.info(`[releaseTransfer] Transfer ${tx.razorpay_transfer_id} released by admin ${adminId} for transaction ${transactionId}`);

      return {
        transactionId,
        transferId: tx.razorpay_transfer_id,
        status: 'COMPLETED',
        freelancerAmount: tx.freelancer_amount,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`[releaseTransfer] Failed for transaction_id=${transactionId}:`, { errorMessage: error.message });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new PaymentService();
