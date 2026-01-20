// consumers/allNotificationsConsumer.js
const { getChannel, QUEUES, onReconnect } = require('../config/rabbitmq');

let consumerTag = null;

/**
 * Analytics Message Handler
 * Logs all notifications for analytics and monitoring
 */
async function handleAnalyticsMessage(message) {
  const notification = JSON.parse(message.content.toString());
  
  console.log(`\n📊 [ANALYTICS CONSUMER] Logging notification:`);
  console.log(`   ID: ${notification.id}`);
  console.log(`   Type: ${notification.type}`);
  console.log(`   Routing Key: ${notification.routingKey || 'N/A'}`);
  console.log(`   Timestamp: ${notification.timestamp}`);

  // Here you would typically:
  // 1. Save to analytics database (MongoDB, PostgreSQL, etc.)
  // 2. Send metrics to monitoring service (DataDog, New Relic)
  // 3. Update dashboard counters (Redis)
  // 4. Trigger alerts if needed

  // Simulate analytics processing
  await saveToAnalytics(notification);

  console.log(`✅ [ANALYTICS CONSUMER] Logged notification: ${notification.id}`);
  
  return { success: true, notificationId: notification.id };
}

/**
 * Simulate saving to analytics database
 */
async function saveToAnalytics(notification) {
  // Simulate database save
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // In production:
  // await db.collection('notifications_analytics').insertOne({
  //   notificationId: notification.id,
  //   type: notification.type,
  //   routingKey: notification.routingKey,
  //   timestamp: notification.timestamp,
  //   metadata: notification
  // });
}

/**
 * Start Analytics Consumer
 */
async function startAllNotificationsConsumer() {
  try {
    const channel = await getChannel();
    channel.prefetch(5); // Analytics can handle more concurrent messages

    console.log(`📊 [ANALYTICS CONSUMER] Started and waiting for messages...`);
    console.log(`📊 [ANALYTICS CONSUMER] Consuming from queue: ${QUEUES.ALL_NOTIFICATIONS}\n`);

    const { consumerTag: tag } = await channel.consume(
      QUEUES.ALL_NOTIFICATIONS,
      async (message) => {
        if (message !== null) {
          try {
            await handleAnalyticsMessage(message);
            channel.ack(message);
            
          } catch (error) {
            console.error(`❌ [ANALYTICS CONSUMER] Error processing message:`, error.message);
            console.error('Stack:', error.stack);
            
            // For analytics, we don't requeue on failure
            // Just log the error and move on
            console.log(`⚠️  [ANALYTICS CONSUMER] Skipping failed analytics message`);
            channel.nack(message, false, false);
          }
        }
      },
      { noAck: false }
    );

    consumerTag = tag;
    console.log(`📊 [ANALYTICS CONSUMER] Consumer tag: ${consumerTag}`);

    return { consumer: 'analytics', status: 'running', consumerTag };
    
  } catch (error) {
    console.error('❌ [ANALYTICS CONSUMER] Failed to start:', error.message);
    console.error('Stack:', error.stack);
    
    // Retry starting consumer after delay
    console.log('🔄 [ANALYTICS CONSUMER] Retrying in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    return startAllNotificationsConsumer();
  }
}

// Register reconnection handler
onReconnect(async () => {
  console.log('🔄 [ANALYTICS CONSUMER] Restarting consumer after reconnection...');
  consumerTag = null;
  await startAllNotificationsConsumer();
});

/**
 * Get consumer stats
 */
function getConsumerStats() {
  return {
    type: 'analytics',
    queue: QUEUES.ALL_NOTIFICATIONS,
    status: 'active'
  };
}

module.exports = {
  startAllNotificationsConsumer,
  handleAnalyticsMessage,
  getConsumerStats
};