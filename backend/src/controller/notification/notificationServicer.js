const { createClient } = require('redis');
const { pool } = require('../../../config/dbConfig');
const { getLogger } = require('../../../utils/logger');
const { createPresignedUrl } = require('../../../utils/helper');

const logger = getLogger('notification');
const PROFILE_IMAGE_EXPIRY = 4 * 60 * 60; // 4 hours

const publisher = createClient({
  socket: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6378,
  },
  password: process.env.REDIS_PASSWORD,
});

publisher.on('error', (err) => console.error('Notification publisher error:', err));
publisher.connect().catch((err) => console.error('Failed to connect notification publisher:', err));

async function resolveProfileImageUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parts = rawUrl.split('/');
    const bucketName = parts[0];
    const objectName = parts.slice(1).join('/');
    return await createPresignedUrl(bucketName, objectName, PROFILE_IMAGE_EXPIRY);
  } catch {
    return null;
  }
}

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

  // 2. Fetch sender's profile image
  let senderImage = null;
  if (senderId) {
    try {
      const senderResult = await pool.query(
        `SELECT COALESCE(c.profile_image_url, f.profile_image_url) AS profile_image_url
         FROM users u
         LEFT JOIN creators c ON u.id = c.user_id
         LEFT JOIN freelancer f ON u.id = f.user_id
         WHERE u.id = $1`,
        [senderId]
      );
      const rawImageUrl = senderResult.rows[0]?.profile_image_url;
      senderImage = await resolveProfileImageUrl(rawImageUrl);
    } catch (error) {
      logger.warn(`[WARN] Failed to fetch sender profile image for senderId=${senderId}:`, error.message);
    }
  }

  // 3. Add sender_image to notification object
  const notificationWithImage = {
    ...notification,
    sender_image: senderImage
  };

  // 4. Publish to Redis
  await publisher.publish(
    'notifications',
    JSON.stringify({ recipientId, notification: notificationWithImage })
  );

  logger.info(`[SENT] eventType=${eventType} recipientId=${recipientId} senderId=${senderId} notificationId=${notification.id} hasSenderImage=${!!senderImage}`);

  return notificationWithImage;
}

module.exports = { sendNotification };
