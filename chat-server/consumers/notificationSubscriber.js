const { createClient } = require('redis');

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

  await subscriber.subscribe('notifications', (message) => {
    const { recipientId, notification } = JSON.parse(message);
    io.to(`user:${recipientId}`).emit('new_notification', notification);
  });

  console.log('✅ Notification subscriber started');
}

async function stopNotificationSubscriber() {
  if (subscriber) await subscriber.quit();
}

module.exports = { startNotificationSubscriber, stopNotificationSubscriber };
