// config/rabbitmq.js
const amqp = require('amqplib');


const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

// Exchange configuration
const EXCHANGES = {
  NOTIFICATIONS: 'notifications_exchange',
  NOTIFICATIONS_TOPIC: 'notifications_topic_exchange',
  NOTIFICATIONS_FANOUT: 'notifications_fanout_exchange'
};

// Queue names
const QUEUES = {
  EMAIL: 'email_queue',
  INAPP: 'inapp_queue',
  ALL_NOTIFICATIONS: 'all_notifications_queue'
};

// Routing keys for direct/topic exchanges
const ROUTING_KEYS = {
  EMAIL: 'notification.email',
  INAPP: 'notification.inapp',
  EMAIL_URGENT: 'notification.email.urgent',
  INAPP_URGENT: 'notification.inapp.urgent',
  ALL: 'notification.*',
  ALL_URGENT: 'notification.*.urgent'
};

let connection = null;
let channel = null;
let reconnectAttempts = 0;
let isReconnecting = false;
let reconnectCallbacks = [];

/**
 * Reconnect to RabbitMQ with exponential backoff
 */
async function reconnect() {
  if (isReconnecting) {
    console.log('⏳ Reconnection already in progress...');
    return;
  }

  isReconnecting = true;
  
  while (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    try {
      reconnectAttempts++;
      console.log(`🔄 Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
      
      // Reset connection and channel
      connection = null;
      channel = null;
      
      // Try to reconnect
      await connect();
      await getChannel();
      
      console.log('✅ Successfully reconnected to RabbitMQ');
      reconnectAttempts = 0;
      isReconnecting = false;
      
      // Notify all registered callbacks to restart consumers
      for (const callback of reconnectCallbacks) {
        try {
          await callback();
        } catch (error) {
          console.error('Error in reconnect callback:', error);
        }
      }
      
      return;
    } catch (error) {
      console.error(`❌ Reconnection attempt ${reconnectAttempts} failed:`, error.message);
      
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ Max reconnection attempts reached. Exiting...');
        isReconnecting = false;
        process.exit(1);
      }
      
      // Wait before next attempt with exponential backoff
      const delay = Math.min(RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 60000);
      console.log(`⏳ Waiting ${delay/1000}s before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  isReconnecting = false;
}

/**
 * Register callback to be called on reconnection
 */
function onReconnect(callback) {
  reconnectCallbacks.push(callback);
}

/**
 * Connect to RabbitMQ
 */
async function connect() {
  try {
    if (!connection) {
      connection = await amqp.connect(RABBITMQ_URL);
      console.log('✅ Connected to RabbitMQ');

      connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err.message);
        connection = null;
        channel = null;
      });

      connection.on('close', () => {
        console.log('⚠️  RabbitMQ connection closed, attempting to reconnect...');
        connection = null;
        channel = null;
        // Attempt to reconnect
        setTimeout(() => reconnect(), 1000);
      });
    }
    return connection;
  } catch (error) {
    console.error('❌ Failed to connect to RabbitMQ:', error.message);
    throw error;
  }
}

/**
 * Create channel and setup exchanges & queues
 */
async function getChannel() {
  try {
    if (!channel) {
      const conn = await connect();
      channel = await conn.createChannel();
      
      // Handle channel errors
      channel.on('error', (err) => {
        console.error('❌ RabbitMQ channel error:', err.message);
        channel = null;
      });

      channel.on('close', () => {
        console.log('⚠️  RabbitMQ channel closed');
        channel = null;
      });
      
      // Setup exchanges and queues
      await setupExchangesAndQueues(channel);
      
      console.log('✅ Channel created, exchanges and queues setup complete');
    }
    return channel;
  } catch (error) {
    console.error('❌ Failed to create channel:', error.message);
    throw error;
  }
}

/**
 * Setup all exchanges, queues, and bindings
 */
async function setupExchangesAndQueues(channel) {
  // 1. Create DIRECT exchange for specific routing
  await channel.assertExchange(EXCHANGES.NOTIFICATIONS, 'direct', {
    durable: true
  });
  console.log(`📢 Created DIRECT exchange: ${EXCHANGES.NOTIFICATIONS}`);

  // 2. Create TOPIC exchange for pattern-based routing
  await channel.assertExchange(EXCHANGES.NOTIFICATIONS_TOPIC, 'topic', {
    durable: true
  });
  console.log(`📢 Created TOPIC exchange: ${EXCHANGES.NOTIFICATIONS_TOPIC}`);

  // 3. Create FANOUT exchange for broadcasting
  await channel.assertExchange(EXCHANGES.NOTIFICATIONS_FANOUT, 'fanout', {
    durable: true
  });
  console.log(`📢 Created FANOUT exchange: ${EXCHANGES.NOTIFICATIONS_FANOUT}`);

  // 4. Create queues
  await channel.assertQueue(QUEUES.EMAIL, { durable: true });
  await channel.assertQueue(QUEUES.INAPP, { durable: true });
  await channel.assertQueue(QUEUES.ALL_NOTIFICATIONS, { durable: true });
  console.log('📬 Created all queues');

  // 5. Bind queues to DIRECT exchange with specific routing keys
  await channel.bindQueue(
    QUEUES.EMAIL, 
    EXCHANGES.NOTIFICATIONS, 
    ROUTING_KEYS.EMAIL
  );
  await channel.bindQueue(
    QUEUES.INAPP, 
    EXCHANGES.NOTIFICATIONS, 
    ROUTING_KEYS.INAPP
  );
  console.log('🔗 Bound queues to DIRECT exchange');

  // 6. Bind queues to TOPIC exchange with pattern matching
  // Email queue receives: notification.email and notification.email.urgent
  await channel.bindQueue(
    QUEUES.EMAIL, 
    EXCHANGES.NOTIFICATIONS_TOPIC, 
    'notification.email.*'
  );
  // SMS queue receives: notification.sms and notification.sms.urgent
  await channel.bindQueue(
    QUEUES.INAPP, 
    EXCHANGES.NOTIFICATIONS_TOPIC, 
    'notification.inapp.*'
  );

  // All notifications queue receives everything with pattern notification.*.*
  await channel.bindQueue(
    QUEUES.ALL_NOTIFICATIONS, 
    EXCHANGES.NOTIFICATIONS_TOPIC, 
    'notification.#'
  );
  console.log('🔗 Bound queues to TOPIC exchange');

  // 7. Bind all queues to FANOUT exchange (broadcasts to all)
  await channel.bindQueue(
    QUEUES.EMAIL, 
    EXCHANGES.NOTIFICATIONS_FANOUT, 
    '' // Fanout ignores routing key
  );
  await channel.bindQueue(
    QUEUES.INAPP, 
    EXCHANGES.NOTIFICATIONS_FANOUT, 
    ''
  );
  console.log('🔗 Bound queues to FANOUT exchange');
}

/**
 * Close connection
 */
async function closeConnection() {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    console.log('✅ RabbitMQ connection closed');
  } catch (error) {
    console.error('Error closing connection:', error);
  }
}

/**
 * Check if connection is healthy
 */
function isHealthy() {
  return connection !== null && channel !== null && !isReconnecting;
}

/**
 * Get connection status
 */
function getStatus() {
  return {
    connected: connection !== null,
    channelReady: channel !== null,
    reconnecting: isReconnecting,
    reconnectAttempts: reconnectAttempts
  };
}

module.exports = {
  connect,
  getChannel,
  closeConnection,
  reconnect,
  onReconnect,
  isHealthy,
  getStatus,
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS
};