const crypto = require('crypto');
const {pool:db} = require('../../../config/dbConfig');
const payoutService = require('../../razor-pay-services/payoutService');

class WebhookController {
  // Verify Razorpay webhook signature
  verifyWebhookSignature(body, signature) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');
    
    return expectedSignature === signature;
  }

  // Handle Razorpay webhooks
  async handleWebhook(req, res) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      
      if (!signature) {
        return res.status(400).json({ error: 'Missing signature' });
      }

      // Verify signature
      if (!this.verifyWebhookSignature(req.body, signature)) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      const event = req.body.event;
      const payload = req.body.payload;

      // Log webhook
      await db.query(
        `INSERT INTO webhook_logs (event_type, razorpay_event_id, payload) 
         VALUES (?, ?, ?)`,
        [event, req.body.id || null, JSON.stringify(req.body)]
      );

      // Handle different event types
      switch (event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(payload);
          break;
        
        case 'payment.failed':
          await this.handlePaymentFailed(payload);
          break;
        
        case 'payout.processed':
          await this.handlePayoutProcessed(payload);
          break;
        
        case 'payout.failed':
          await this.handlePayoutFailed(payload);
          break;
        
        case 'payout.reversed':
          await this.handlePayoutReversed(payload);
          break;
        
        default:
          console.log('Unhandled webhook event:', event);
      }

      // Update webhook log as processed
      await db.query(
        'UPDATE webhook_logs SET processed = TRUE WHERE razorpay_event_id = ?',
        [req.body.id]
      );

      res.json({ status: 'ok' });
    } catch (error) {
      console.error('Webhook handling error:', error);
      
      // Log error
      await db.query(
        'UPDATE webhook_logs SET error_message = ? WHERE razorpay_event_id = ?',
        [error.message, req.body.id]
      );
      
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  // Handle payment captured event
  async handlePaymentCaptured(payload) {
    const payment = payload.payment.entity;
    const orderId = payment.order_id;

    console.log('Payment captured:', payment.id, 'for order:', orderId);

    // Update order status if needed
    await db.query(
      'UPDATE razorpay_orders SET status = "PAID" WHERE razorpay_order_id = ?',
      [orderId]
    );

    // Additional processing can be added here if needed
  }

  // Handle payment failed event
  async handlePaymentFailed(payload) {
    const payment = payload.payment.entity;
    const orderId = payment.order_id;

    console.log('Payment failed:', payment.id, 'for order:', orderId);

    // Update order status
    await db.query(
      'UPDATE razorpay_orders SET status = "FAILED" WHERE razorpay_order_id = ?',
      [orderId]
    );

    // Update transaction status if it's a service payment
    await db.query(
      'UPDATE transactions SET status = "FAILED" WHERE razorpay_order_id = ?',
      [orderId]
    );
  }

  // Handle payout processed event
  async handlePayoutProcessed(payload) {
    const payout = payload.payout.entity;
    
    console.log('Payout processed:', payout.id);

    await payoutService.updatePayoutStatus(payout.id, 'processed', payout.utr);
  }

  // Handle payout failed event
  async handlePayoutFailed(payload) {
    const payout = payload.payout.entity;
    
    console.log('Payout failed:', payout.id);

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Update payout status
      await payoutService.updatePayoutStatus(payout.id, 'failed');

      // Update failure reason
      await connection.query(
        'UPDATE payouts SET failure_reason = ? WHERE razorpay_payout_id = ?',
        [payout.status_details?.reason || 'Unknown error', payout.id]
      );

      // Optionally: Refund to client wallet or mark for manual processing
      // This depends on your business logic

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Handle payout reversed event
  async handlePayoutReversed(payload) {
    const payout = payload.payout.entity;
    
    console.log('Payout reversed:', payout.id);

    await payoutService.updatePayoutStatus(payout.id, 'reversed', payout.utr);
  }
}

module.exports = new WebhookController();
