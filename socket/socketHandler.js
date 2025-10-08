const {
  getUnseenNotifications,
  markNotificationAsSeen,
  markNotificationAsReadAndDelete
} = require('../src/controller/notification/helper');
const query = require('../config/dbConfig')
const { connectedUsers } = require('../utils/globalState');
const { getLogger } = require('../utils/logger');
const logger = getLogger('socket-handler');


const socketHandler = (io) => {
  io.on('connection', (socket) => {
    logger.info('🔌 Client connected:', socket.id);
    logger.info('hi')
    // Enhanced user registration
    socket.on('register', async (userData) => {
      logger.info('👤 User registration data:', userData);
      try {
        const { userId, username, email } = userData;

        // Validate required data
        if (!userId || !username || !email) {
          socket.emit('error', { message: 'Missing required user data' });
          return;
        }

        connectedUsers.set(userId, {
          socketId: socket.id,
          username,
          email,
          userId,
          connectedAt: new Date()
        });

        socket.join(`user_${userId}`);
        socket.userId = userId; // Store userId on socket for easy access
        logger.info(`👤 User registered: ${username} (${userId})`);

        // Get unseen notifications from database
        const unseenNotifications = await getUnseenNotifications(userId);

        if (unseenNotifications.length > 0) {
          logger.info(`📬 Delivering ${unseenNotifications.length} unseen notifications to ${username}`);

          // Deliver each notification with delay
          unseenNotifications.forEach((notification, index) => {
            setTimeout(async () => {
              try {
                // Mark as seen when delivered to user
                await markNotificationAsSeen(notification.notification_id);

                socket.emit('offline_notification', {
                  id: notification.notification_id,
                  type: notification.type,
                  title: notification.title,
                  message: notification.message,
                  timestamp: notification.created_at,
                  read: notification.is_read,
                  userId: notification.user_id,
                  wasOffline: true,
                  priority: notification.priority
                });
              } catch (error) {
                logger.error('Error delivering notification:', error);
              }
            }, (index + 1) * 200); // 200ms delay between notifications
          });

          // Send unread count
          socket.emit('unread_count', {
            count: unseenNotifications.length,
            total: unseenNotifications.length
          });
        }

        // Emit successful registration
        socket.emit('registration_success', {
          message: 'Successfully registered',
          userId,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Error during user registration:', error);
        socket.emit('error', { message: 'Registration failed' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      logger.info('🔌 Client disconnected:', socket.id, 'Reason:', reason);

      const userId = socket.userId;
      if (userId && connectedUsers.has(userId)) {
        try {
          const userData = connectedUsers.get(userId);
          connectedUsers.delete(userId);
          logger.info(`👤 User went offline: ${userData.username}`);

          // Optional: Update user session in database
          // await updateUserSession(userId, false, false);
        } catch (error) {
          logger.error('Error updating user session on disconnect:', error);
        }
      }
    });

    // Handle graceful logout
    socket.on('logout', async (userId) => {
      try {
        if (!userId) {
          socket.emit('error', { message: 'User ID required for logout' });
          return;
        }

        if (connectedUsers.has(userId)) {
          connectedUsers.delete(userId);
          logger.info(`👋 User ${userId} logged out gracefully`);
        }

        // Optional: Update user session in database
        // await updateUserSession(userId, false, false);

        socket.emit('logout_success', { message: 'Logged out successfully' });
        socket.disconnect();
      } catch (error) {
        logger.error('Error during logout:', error);
        socket.emit('error', { message: 'Logout failed' });
      }
    });

    // Mark notification as read and delete immediately
    socket.on('mark_notification_read', async (notification) => {
      try {
         console.log(notification,'notification data to read')
         const { notificationId,userId } = notification; 
        if (!notificationId) {
          socket.emit('error', { message: 'Notification ID required' });
          return;
        }

        await markNotificationAsReadAndDelete(notificationId);

        // Notify client that notification was read and deleted
        const targetUser = connectedUsers.get(userId);
        if (targetUser) {
          // Send real-time notification
          io.to(`user_${userId}`).emit('notification_read_and_deleted', {
            notificationId
            // deletedAt: new Date()
          });
        }


      } catch (error) {
        logger.error('Error marking notification as read:', error);
        socket.emit('error', { message: 'Failed to mark notification as read' });
      }
    });

    // Mark all notifications as read and delete them
    socket.on('mark_all_read', async (userId) => {
      try {
        if (!userId) {
          socket.emit('error', { message: 'User ID required' });
          return;
        }

        // const sqlquery = `
        //   DELETE FROM web_notifications 
        //   WHERE user_id = $1 AND is_read = false
        //   RETURNING notification_id
        // `;

        const sqlquery = `
        update web_notifications
        set is_read = true, read_at = NOW(), is_deleted = true
        where user_id = $1 and is_read = false
        returning notification_id`


        const result = await query(sqlquery, [userId]);
        const deletedIds = result.rows.map(row => row.notification_id);

        logger.info(`📖 ${deletedIds.length} notifications marked as read and deleted for user: ${userId}`);

        socket.emit('bulk_read_and_deleted', {
          deletedCount: deletedIds.length,
          deletedIds,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error('Error marking all notifications as read:', error);
        socket.emit('error', { message: 'Failed to mark all notifications as read' });
      }
    });

    // Send notification to specific user
    socket.on('send_notification', async (data) => {
      try {
        const { targetUserId, notification } = data;

        if (!targetUserId || !notification) {
          socket.emit('error', { message: 'Target user ID and notification data required' });
          return;
        }

        // Check if target user is connected
        const targetUser = connectedUsers.get(targetUserId);
        if (targetUser) {
          // Send real-time notification
          io.to(`user_${targetUserId}`).emit('new_notification', {
            ...notification,
            timestamp: new Date(),
            realTime: true
          });

          socket.emit('notification_sent', {
            message: 'Notification sent successfully',
            targetUserId
          });
        } else {
          // User is offline - notification will be stored in database
          socket.emit('notification_queued', {
            message: 'User is offline, notification queued',
            targetUserId
          });
        }

      } catch (error) {
        logger.error('Error sending notification:', error);
        socket.emit('error', { message: 'Failed to send notification' });
      }
    });

    // Get online users count
    socket.on('get_online_count', () => {
      socket.emit('online_count', {
        count: connectedUsers.size,
        timestamp: new Date()
      });
    });

    // Ping/Pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

  });

  // Helper function to broadcast to all users
  const broadcastToAll = (event, data) => {
    io.emit(event, data);
  };

  // Helper function to send to specific user
  const sendToUser = (userId, event, data) => {
    io.to(`user_${userId}`).emit(event, data);
  };

  // Helper function to get connected users
  const getConnectedUsers = () => {
    return Array.from(connectedUsers.values());
  };

  // Helper function to check if user is online
  const isUserOnline = (userId) => {
    return connectedUsers.has(userId);
  };

  return {
    broadcastToAll,
    sendToUser,
    getConnectedUsers,
    isUserOnline,
    connectedUsers
  };
};

module.exports = socketHandler;