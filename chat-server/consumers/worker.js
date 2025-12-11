// workers/masterWorker.js
require('dotenv').config();
const { connect, closeConnection } = require('../config/rabbitmq');
const { startInAppConsumer } = require('./inAppConsumer');

/**
 * Start all consumers in a single process
 * Useful for development or smaller deployments
 */
async function startMasterWorker() {
  try {
    console.log('🔧 Starting in app Worker \n');
    
    // Connect to RabbitMQ
    await connect();
    // Start all consumers
    await Promise.all([
      // startInAppConsumer(),
    ]);
    
    console.log('\n✅ consumer started successfully!');
    console.log('📊 Master Worker is now processing all notification types\n');
  } catch (error) {
    console.error('❌ Failed to start master worker:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(' Shutting down in app Worker...');
  await closeConnection();
  process.exit(0);
});

// Error handling
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await closeConnection();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await closeConnection();
  process.exit(1);
});

module.exports = { startMasterWorker };