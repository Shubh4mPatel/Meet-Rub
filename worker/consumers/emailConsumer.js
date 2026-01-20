// consumers/emailConsumer.js
const { getChannel, QUEUES, onReconnect } = require('../config/rabbitmq');
// const notificationService = require('../services/notificationService');
const { sendMail } = require('../config/email');

let consumerTag = null;

/**
 * Email Message Handler
 * This function processes individual email messages
 */
async function handleEmailMessage(message) {
  const notification = JSON.parse(message.content.toString());
  
  console.log(`\n📧 [EMAIL CONSUMER] Processing message:`);
  console.log(`   ID: ${notification.id}`);
  console.log(`   To: ${notification.to}`);
  console.log(`   Subject: ${notification.subject}`);
  console.log(`   Timestamp: ${notification.timestamp}`);

  // Process the email notification
  console.log(`📧 [EMAIL CONSUMER] Sending email to: ${notification.body}`);
  await sendMail(notification.to, notification.subject, notification.body, notification.pdfAttachment);

  console.log(`✅ [EMAIL CONSUMER] Successfully sent email: ${notification.id}`);
  
  return { success: true, notificationId: notification.id };
}

/**
 * Start Email Consumer
 * This sets up the consumer and processes messages
 */
async function startEmailConsumer() {
  try {
    const channel = await getChannel();
    
    // Set prefetch count - process one message at a time
    channel.prefetch(1);

    console.log(`📧 [EMAIL CONSUMER] Started and waiting for messages...`);
    console.log(`📧 [EMAIL CONSUMER] Consuming from queue: ${QUEUES.EMAIL}\n`);

    // Start consuming messages
    const { consumerTag: tag } = await channel.consume(
      QUEUES.EMAIL,
      async (message) => {
        if (message !== null) {
          try {
            // Handle the message
            await handleEmailMessage(message);
            
            // Acknowledge successful processing
            channel.ack(message);
            
          } catch (error) {
            console.error(`❌ [EMAIL CONSUMER] Error processing message:`, error.message);
            console.error('Stack:', error.stack);
            
            // Check if message has been redelivered before
            if (message.fields.redelivered) {
              // If already redelivered once, reject and don't requeue
              console.log(`⚠️  [EMAIL CONSUMER] Message failed after retry, rejecting...`);
              channel.nack(message, false, false);
            } else {
              // First failure, requeue for retry
              console.log(`🔄 [EMAIL CONSUMER] Requeuing message for retry...`);
              channel.nack(message, false, true);
            }
          }
        }
      },
      {
        noAck: false // Manual acknowledgment
      }
    );

    consumerTag = tag;
    console.log(`📧 [EMAIL CONSUMER] Consumer tag: ${consumerTag}`);

    return { consumer: 'email', status: 'running', consumerTag };
    
  } catch (error) {
    console.error('❌ [EMAIL CONSUMER] Failed to start:', error.message);
    console.error('Stack:', error.stack);
    
    // Retry starting consumer after delay
    console.log('🔄 [EMAIL CONSUMER] Retrying in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    return startEmailConsumer();
  }
}

// Register reconnection handler
onReconnect(async () => {
  console.log('🔄 [EMAIL CONSUMER] Restarting consumer after reconnection...');
  consumerTag = null;
  await startEmailConsumer();
});

/**
 * Get consumer stats
 */
function getConsumerStats() {
  return {
    type: 'email',
    queue: QUEUES.EMAIL,
    status: 'active'
  };
}

module.exports = {
  startEmailConsumer,
  handleEmailMessage,
  getConsumerStats
};