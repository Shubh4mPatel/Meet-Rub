const { createClient } = require('redis');
const { pool } = require('../../../config/dbConfig');

const publisher = createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6378,
  },
  password: process.env.REDIS_PASSWORD,
});

publisher.on('error', (err) => console.error('Notification publisher error:', err));
publisher.connect().catch((err) => console.error('Failed to connect notification publisher:', err));

async function sendNotification({ recipientId, senderId, eventType, title, body, actionType, actionRoute }) {
  // 1. Save to DB
  const result = await pool.query(
    `INSERT INTO web_notifications
      (recipient_id, sender_id, event_type, title, body, action_type, action_route)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [recipientId, senderId, eventType, title, body, actionType, actionRoute]
  );

  const notification = result.rows[0];

  // 2. Publish to Redis
  await publisher.publish(
    'notifications',
    JSON.stringify({ recipientId, notification })
  );

  return notification;
}

module.exports = { sendNotification };
