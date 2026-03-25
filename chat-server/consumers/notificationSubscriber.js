const { createClient } = require('redis');
const { getLogger } = require('../utils/logger');
const redis = require('../config/reddis');

const logger = getLogger('notification');

let subscriber;

async function startNotificationSubscriber(io) {
  subscriber = createClient({
    socket: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT) || 6378,
    },
    password: process.env.REDIS_PASSWORD,
  });

  subscriber.on('error', (err) => console.error('Notification subscriber error:', err));
  await subscriber.connect();

  await subscriber.subscribe('notifications', async (message) => {
    const { recipientId, notification } = JSON.parse(message);
    logger.info(`[RECEIVED] eventType=${notification.event_type} recipientId=${recipientId} notificationId=${notification.id}`);

    const socketId = await redis.get(`user:${recipientId}:socketId`);
    if (socketId) {
      io.to(socketId).emit('notification', notification);
      logger.info(`[EMITTED] notification to socketId=${socketId} recipientId=${recipientId} notificationId=${notification.id}`);
    } else {
      logger.warn(`[SKIPPED] recipientId=${recipientId} not online, notificationId=${notification.id}`);
    }
  });

  await subscriber.subscribe('new_package', async (message) => {
    const { chatRoomId, senderId, senderUsername, recipientId, message: savedMessage, customPackage } = JSON.parse(message);
    logger.info(`[NEW_PACKAGE RECEIVED] room=${chatRoomId} sender=${senderId} package=${customPackage.id}`);

    const messageData = {
      id: savedMessage.id,
      senderId,
      senderUsername,
      recipientId,
      message: 'Package sent',
      timestamp: savedMessage.created_at,
      chatRoomId,
      isRead: false,
      messageType: 'package',
      customPackage,
    };

    io.to(chatRoomId).emit('receive-custom-package', messageData);
    logger.info(`[NEW_PACKAGE EMITTED] receive-custom-package to room=${chatRoomId} package=${customPackage.id}`);
  });

  console.log('✅ Notification subscriber started');
}

async function stopNotificationSubscriber() {
  if (subscriber) await subscriber.quit();
}

module.exports = { startNotificationSubscriber, stopNotificationSubscriber };
