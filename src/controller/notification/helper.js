const { connectedUsers } = require('../../../utils/globalState');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');
const query = require('../../../config/dbConfig');

async function createNotification(notificationData) {
    const {
        notificationId,
        userId,
        title,
        message,
        type = 'info',
        priority = 'normal',
        isBroadcast = false,
        expiresAt = null,
        metadata = {}
    } = notificationData;

    const sqlquery = `
    INSERT INTO web_notifications (
      notification_id, user_id, title, message, type, priority, 
      is_broadcast, expires_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

    const values = [
        notificationId, userId, title, message, type,
        priority, isBroadcast, expiresAt, JSON.stringify(metadata)
    ];

    try {
        const result = await query(sqlquery, values);
        return result.rows[0];
    } catch (error) {
        logger.error('Error creating notification:', error);
        throw error;
    }
}

// Get unseen notifications for user
async function getUnseenNotifications(userId) {
    const sqlquery = `
    SELECT * FROM web_notifications 
    WHERE user_id = $1 AND is_read = false
    ORDER BY created_at DESC
  `;

    try {
        const result = await query(sqlquery, [userId]);
        return result.rows;
    } catch (error) {
        logger.error('Error fetching unseen notifications:', error);
        throw error;
    }
}

// Mark notification as seen (will be deleted after user reads it)
async function markNotificationAsSeen(notificationId) {
    const sqlquery = `
    UPDATE web_notifications 
    SET is_seen = true, seen_at = NOW() 
    WHERE notification_id = $1
    RETURNING *
  `;

    try {
        const result = await query(sqlquery, [notificationId]);
        return result.rows[0];
    } catch (error) {
        logger.error('Error marking notification as seen:', error);
        throw error;
    }
}

// Mark notification as read and delete it immediately
async function markNotificationAsReadAndDelete(notificationId) {
    try {
        const updateQuery = `
      UPDATE web_notifications 
      SET is_read = true, read_at = NOW() , is_deleted = true    
      WHERE notification_id = $1
      RETURNING *
    `;
        const updateResult = await query(updateQuery, [notificationId]);

        logger.info(`✅ Notification ${notificationId} read and deleted`);
        return updateResult.rows[0];
    } catch (error) {
        logger.error('Error marking notification as read and deleting:', error);
        throw error;
    }
}

// Get user notifications with pagination
async function getUserNotifications(userId, limit = 50, offset = 0, unreadOnly = false) {
    let sqlquery = `
    SELECT * FROM web_notifications 
    WHERE user_id = $1
  `;

    const params = [userId];

    if (unreadOnly) {
        sqlquery += ` AND is_read = false`;
    }

    sqlquery += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    try {
        const result = await query(sqlquery, params);

        const countQuery = `
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_read = false) as unread_count
      FROM web_notifications 
      WHERE user_id = $1 ${unreadOnly ? 'AND is_read = false' : ''}
    `;
        const countResult = await query(countQuery, [userId]);

        return {
            notifications: result.rows,
            total: parseInt(countResult.rows[0].total),
            unreadCount: parseInt(countResult.rows[0].unread_count)
        };
    } catch (error) {
        logger.error('Error fetching user notifications:', error);
        throw error;
    }
}

// Send notification to user
async function sendNotificationToUser(userId, io, { title, message, type = 'info', priority = 'normal', expiresAt = null, metadata = {} }) {
    try {
        logger.info(`Sending notification to user: ${userId} - ${title}`);

        const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const created_at = new Date().toISOString();
        logger.info(created_at);
        const notification = await createNotification({
            notificationId,
            userId,
            title,
            message,
            type,
            priority,
            expiresAt,
            metadata,
            created_at
        });

        const { rows: fcmToken } = await query('select device_token from devices where user_id=$1', [userId]);
        if (fcmToken.length !== 0) {
            logger.info(fcmToken.length);
            const token = fcmToken[0].device_token;
            // Removed Firebase logic
        } else {
            const sqlquery = `Update web_notifications set is_sent_to_mobile = false  where notification_id = $1`;
            await query(sqlquery, [notificationId]);
        }

        const user = connectedUsers.get(Number(userId));
        if (user) {
            io.to(`user_${userId}`).emit('notification', {
                id: notification.notification_id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                priority: notification.priority,
                timestamp: notification.created_at,
                read: false,
                userId,
                metadata,
            });

            logger.info(`📨 Real-time notification sent to ${user.username}: ${title}`);
            return { delivered: true, recipient: user.username, stored: true };
        } else {
            logger.info(`📨 Notification stored for offline user: ${userId} - ${title}`);
            return { delivered: false, stored: true, message: 'User offline, notification stored' };
        }
    } catch (error) {
        logger.error('Error sending notification to user:', error);
        throw error;
    }
}

// Broadcast notification
async function broadcastNotification(io, { title, message, type = 'info', priority = 'normal', excludeUsers = [], metadata = {}, expiresAt = null, sendTo = 'all' }) {
    try {
        let params;
        switch (sendTo) {
            case 'free user':
                params = ' WHERE is_free_plan_active = true';
                break;

            case 'paid user':
                params = `
                JOIN razorpay_subscriptions rs 
                  ON rs.user_id = u.id 
                WHERE rs.status = 'active'`;
                break;

            case "all":
                params = '';
                break;

            default:
                params = '';
        }

        const usersQuery = `
            SELECT u.id, d.device_token
            FROM user_data u
            LEFT JOIN devices d ON u.id = d.user_id
            ${params}
        `;
        const usersResult = await query(usersQuery);
        const allUsers = usersResult.rows;

        let deliveredCount = 0;
        let storedCount = 0;
        let pushNotificationSentCount = 0;

        const notificationPromises = allUsers
            .filter(user => !excludeUsers.includes(user.id))
            .map(async (user) => {
                const { id: userId } = user;

                const notificationId = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${userId}`;

                const notification = await createNotification({
                    notificationId,
                    userId,
                    title,
                    message,
                    type,
                    priority,
                    isBroadcast: true,
                    expiresAt,
                    metadata: metadata
                });

                if (user.device_token) {
                    // Send push notification logic removed
                    pushNotificationSentCount++;
                } else {
                    const sqlquery = `Update web_notifications set is_sent_to_mobile = false  where notification_id = $1`;
                    await query(sqlquery, [notificationId]);
                }

                const connectedUser = connectedUsers.get(userId);
                if (connectedUser) {
                    io.to(`user_${userId}`).emit('notification', {
                        id: notification.notification_id,
                        type: notification.type,
                        title: notification.title,
                        message: notification.message,
                        priority: notification.priority,
                        timestamp: notification.created_at,
                        read: false,
                        userId,
                        broadcast: true,
                        metadata: metadata
                    });
                    deliveredCount++;
                }
                storedCount++;

                return notification;
            });

        await Promise.all(notificationPromises);

        logger.info(`📢 Broadcast: ${title} | Real-time: ${deliveredCount} | Stored: ${storedCount} | Push Notifications Sent: ${pushNotificationSentCount}`);

        return { deliveredCount, storedCount, pushNotificationSentCount, totalUsers: allUsers.length };
    } catch (error) {
        logger.error('Error broadcasting notification:', error);
        throw error;
    }
}

module.exports = {
    createNotification,
    getUnseenNotifications,
    markNotificationAsSeen,
    markNotificationAsReadAndDelete,
    getUserNotifications,
    sendNotificationToUser,
    broadcastNotification
}
