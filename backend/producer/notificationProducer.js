// producers/notificationProducer.js
const { getChannel, EXCHANGES, ROUTING_KEYS } = require('../config/rabbitmq');

/**
 * Send notification to exchange with routing key
 * @param {string} exchange - Exchange name
 * @param {string} routingKey - Routing key for message routing
 * @param {Object} notificationData - Notification details
 */
async function publishToExchange(exchange, routingKey, notificationData) {
  try {
    const channel = await getChannel();
    
    const notification = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      routingKey,
      ...notificationData
    };

    const message = Buffer.from(JSON.stringify(notification));

    // Publish to exchange instead of queue
    channel.publish(
      exchange,
      routingKey,
      message,
      {
        persistent: true,
        contentType: 'application/json'
      }
    );
    return { success: true, id: notification.id };
  } catch (error) {
    console.error('Error publishing to exchange:', error);
    throw error;
  }
}

/**
 * Send email notification using DIRECT exchange
 */
async function sendEmailNotification(to, subject, body, urgent = false) {
  const routingKey = urgent ? ROUTING_KEYS.EMAIL_URGENT : ROUTING_KEYS.EMAIL;
  
  return publishToExchange(
    EXCHANGES.NOTIFICATIONS,
    routingKey,
    {
      type: 'email',
      to,
      subject,
      body,
      urgent
    }
  );
}

/**
 * Send SMS notification using DIRECT exchange
 */
async function sendSMSNotification(phone, message, urgent = false) {
  const routingKey = urgent ? ROUTING_KEYS.SMS_URGENT : ROUTING_KEYS.SMS;
  
  return publishToExchange(
    EXCHANGES.NOTIFICATIONS,
    routingKey,
    {
      type: 'sms',
      phone,
      message,
      urgent
    }
  );
}

/**
 * Send push notification using DIRECT exchange
 */
async function sendPushNotification(userId, title, body) {
  return publishToExchange(
    EXCHANGES.NOTIFICATIONS,
    ROUTING_KEYS.PUSH,
    {
      type: 'push',
      userId,
      title,
      body
    }
  );
}

/**
 * Send email using TOPIC exchange (supports pattern matching)
 */
async function sendEmailTopic(to, subject, body, priority = 'normal') {
  // routing key: notification.email.normal or notification.email.urgent
  const routingKey = `notification.email.${priority}`;
  
  return publishToExchange(
    EXCHANGES.NOTIFICATIONS_TOPIC,
    routingKey,
    {
      type: 'email',
      to,
      subject,
      body,
      priority
    }
  );
}

/**
 * Send SMS using TOPIC exchange
 */
async function sendSMSTopic(phone, message, priority = 'normal') {
  const routingKey = `notification.sms.${priority}`;
  
  return publishToExchange(
    EXCHANGES.NOTIFICATIONS_TOPIC,
    routingKey,
    {
      type: 'sms',
      phone,
      message,
      priority
    }
  );
}

/**
 * Broadcast to all notification types using FANOUT exchange
 * This will send the same notification via email, SMS, and push
 */
async function broadcastNotification(data) {
  return publishToExchange(
    EXCHANGES.NOTIFICATIONS_FANOUT,
    '', // Fanout doesn't use routing key
    {
      type: 'broadcast',
      ...data
    }
  );
}

module.exports = {
  publishToExchange,
  sendEmailNotification,
  sendSMSNotification,
  sendPushNotification,
  sendEmailTopic,
  sendSMSTopic,
  broadcastNotification
};