// config/rabbitmq.js
const amqp = require('amqplib');


const RABBITMQ_URL = process.env.RABBITMQ_URL;

// Exchange configuration
const EXCHANGES = {
  NOTIFICATIONS: 'notifications_exchange',
  NOTIFICATIONS_TOPIC: 'notifications_topic_exchange',
  NOTIFICATIONS_FANOUT: 'notifications_fanout_exchange'
};

// Queue names
const QUEUES = {
  INAPP: 'inapp_queue',
};

// Routing keys for direct/topic exchanges
const ROUTING_KEYS = {
  INAPP: 'notification.inapp',
};

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ
 */
async function connect() {
  try {
    if (!connection) {
      connection = await amqp.connect(RABBITMQ_URL);
      console.log('✅ Connected to RabbitMQ');

      connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
        connection = null;
      });

      connection.on('close', () => {
        console.log('RabbitMQ connection closed');
        connection = null;
      });
    }
    return connection;
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
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
      
      // Setup exchanges and queues
      await setupExchangesAndQueues(channel);
      
      console.log('✅ Channel created, exchanges and queues setup complete');
    }
    return channel;
  } catch (error) {
    console.error('Failed to create channel:', error);
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
  await channel.assertQueue(QUEUES.INAPP, { durable: true });
  console.log('📬 Created all queues');

  // 5. Bind queues to DIRECT exchange with specific routing keys
 
  await channel.bindQueue(
    QUEUES.INAPP, 
    EXCHANGES.NOTIFICATIONS, 
    ROUTING_KEYS.INAPP
  );
  console.log('🔗 Bound queues to DIRECT exchange');

  // 6. Bind queues to TOPIC exchange with pattern matching

  await channel.bindQueue(
    QUEUES.INAPP, 
    EXCHANGES.NOTIFICATIONS_TOPIC, 
    'notification.inapp.*'
  );



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

module.exports = {
  connect,
  getChannel,
  closeConnection,
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS
};