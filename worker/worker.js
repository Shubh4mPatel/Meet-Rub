// workers/masterWorker.js
require('dotenv').config();
const { connect, closeConnection } = require('./config/rabbitmq');
const { startEmailConsumer } = require('./consumers/emailConsumer');
// const { startInAppConsumer } = require('./consumers/inAppConsumer');
// const { startAllNotificationsConsumer } = require('./consumers/allNotificationsConsumer');

/**
 * Start all consumers in a single process
 * Useful for development or smaller deployments
 */
async function startMasterWorker() {
  try {
    console.log('🔧 Starting Master Worker (All Consumers)...\n');
    
    // Connect to RabbitMQ
    await connect();
    
    // Start all consumers with error handling
    const results = await Promise.allSettled([
      startEmailConsumer(),
      // startInAppConsumer(),
      // startAllNotificationsConsumer()
    ]);
    
    // Check if any consumer failed to start
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error('\n❌ Some consumers failed to start:');
      failures.forEach((f, i) => {
        console.error(`  ${i + 1}. ${f.reason}`);
      });
    }
    
    const successes = results.filter(r => r.status === 'fulfilled');
    if (successes.length > 0) {
      console.log('\n✅ Successfully started consumers:', successes.length);
      console.log('📊 Master Worker is now processing notification types\n');
    } else {
      throw new Error('All consumers failed to start');
    }
  } catch (error) {
    console.error('❌ Failed to start master worker:', error.message);
    console.error('Stack:', error.stack);
    
    // Retry after delay instead of exiting
    console.log('🔄 Retrying in 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    return startMasterWorker();
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Master Worker...');
  await closeConnection();
  process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  // Don't exit immediately, let reconnection logic handle it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit immediately, let reconnection logic handle it
});

startMasterWorker();