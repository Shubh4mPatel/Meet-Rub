const chatModel = require('../model/chatmodel');
const redis = require('../config/reddis');

const chatController = (io) => {
  io.on('connection', async (socket) => {
    console.log(socket.user)
    const userId = socket.user.user_id;
    const username = socket.user.name;

    console.log(`User connected: ${username} (${userId})`);

    try {
      // Create or update user in database
      await chatModel.GetUser(userId, username);

      // Store user's socket connection in Redis
      await redis.set(`user:${userId}:socketId`, socket.id, "EX", 3600);
      await redis.set(`user:${userId}:username`, username, "EX", 3600);
      await redis.set(`user:${userId}:online`, "true", "EX", 3600);

      // Add user to online users set
      await redis.sAdd("online_users", `${userId}`);

      // Get all online users from Redis
      const onlineUserIds = await redis.sMembers("online_users");

      // Emit online users list to all clients
      io.emit('online-users', onlineUserIds);

      // Get unread count for this user
      const unreadCount = await chatModel.getUnreadCount(userId);
      socket.emit('unread-count', { count: unreadCount });

    } catch (error) {
      console.error('Error on connection:', error);
    }

    // Join a private chat room
    socket.on('join-chat', async ({ recipientId }) => {
      try {
        console.log(`${username} is joining chat with user ID: ${recipientId}`);
        // Create a unique room ID (sorted to ensure same room for both users)
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        // Create or get chat room from database
        await chatModel.getOrCreateChatRoom(userId, recipientId);

        socket.join(chatRoomId);

        // Store active chat room in Redis
        await redis.set(`user:${userId}:activeRoom`, chatRoomId, "EX", 3600);

        console.log(`${username} joined chat room: ${chatRoomId}`);

        // Get chat history
        const chatHistory = await chatModel.getChatHistory(chatRoomId);

        // Mark messages as read
        await chatModel.markMessagesAsRead(chatRoomId, userId);

        // Send chat history to the user
        socket.emit('chat-joined', {
          chatRoomId,
          recipientId,
          chatHistory
        });

        // Update unread count
        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit('unread-count', { count: unreadCount });

      } catch (error) {
        console.error('Error joining chat:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Leave a chat room
    socket.on('leave-chat', async ({ recipientId }) => {
      const [smallerId, largerId] = [userId, recipientId].sort();
      const chatRoomId = `${smallerId}-${largerId}`;

      socket.leave(chatRoomId);

      // Remove active room from Redis
      await redis.del(`user:${userId}:activeRoom`);

      console.log(`${username} left chat room: ${chatRoomId}`);
    });

    // Send a message
    socket.on('send-message', async ({ recipientId, message }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        // Save message to database
        const savedMessage = await chatModel.saveMessage(
          chatRoomId,
          userId,
          recipientId,
          message
        );

        const messageData = {
          id: savedMessage.id,
          senderId: userId,
          senderUsername: username,
          recipientId,
          message,
          timestamp: savedMessage.created_at,
          chatRoomId,
          isRead: false
        };

        // Send message to the chat room (both users)
        io.to(chatRoomId).emit('receive-message', messageData);

        // Check if recipient is online using Redis
        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(`user:${recipientId}:socketId`);

          if (recipientSocketId) {
            // Check if recipient is in the same chat room
            const recipientActiveRoom = await redis.get(`user:${recipientId}:activeRoom`);

            if (recipientActiveRoom !== chatRoomId) {
              // Only send notification if recipient is not in the same chat room
              io.to(recipientSocketId).emit('new-message-notification', {
                senderId: userId,
                senderUsername: username,
                message,
                chatRoomId
              });
            }
          }
        }

        console.log(`Message saved: ${username} to ${recipientId}`);

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator
    socket.on('typing', async ({ recipientId, isTyping }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        // Store typing status in Redis with short expiry
        if (isTyping) {
          await redis.setex(`typing:${chatRoomId}:${userId}`, 5, "true");
        } else {
          await redis.del(`typing:${chatRoomId}:${userId}`);
        }

        socket.to(chatRoomId).emit('user-typing', {
          userId,
          username,
          isTyping
        });
      } catch (error) {
        console.error('Error handling typing indicator:', error);
      }
    });

    // Get user's all chat rooms
    socket.on('get-chat-rooms', async () => {
      try {
        const chatRooms = await chatModel.getUserChatRooms(userId);

        // Enhance chat rooms with online status from Redis
        const enhancedChatRooms = await Promise.all(
          chatRooms.map(async (room) => {
            const otherUserId = room.user1_id === userId ? room.user2_id : room.user1_id;
            const isOnline = await redis.get(`user:${otherUserId}:online`);

            return {
              ...room,
              isOnline: !!isOnline
            };
          })
        );

        socket.emit('chat-rooms-list', { chatRooms: enhancedChatRooms });
      } catch (error) {
        console.error('Error getting chat rooms:', error);
        socket.emit('error', { message: 'Failed to get chat rooms' });
      }
    });

    socket.on('mark-as-read', async ({ recipientId }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        await chatModel.markMessagesAsRead(chatRoomId, userId);

        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit('unread-count', { count: unreadCount });

        // Check if recipient is online and notify them
        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(`user:${recipientId}:socketId`);

          if (recipientSocketId) {
            io.to(recipientSocketId).emit('messages-read', {
              userId,
              chatRoomId
            });
          }
        }
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    });

    // Delete message
    socket.on('delete-message', async ({ messageId }) => {
      try {
        const deletedMessage = await chatModel.deleteMessage(messageId, userId);

        if (deletedMessage) {
          io.to(deletedMessage.room_id).emit('message-deleted', {
            messageId: deletedMessage.id,
            roomId: deletedMessage.room_id
          });
        }
      } catch (error) {
        console.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });

    // Search messages
    socket.on('search-messages', async ({ searchTerm }) => {
      try {
        const results = await chatModel.searchMessages(userId, searchTerm);
        socket.emit('search-results', { results });
      } catch (error) {
        console.error('Error searching messages:', error);
        socket.emit('error', { message: 'Failed to search messages' });
      }
    });

    // Get online status of specific user
    socket.on('check-user-status', async ({ targetUserId }) => {
      try {
        const isOnline = await redis.get(`user:${targetUserId}:online`);
        socket.emit('user-status', {
          userId: targetUserId,
          isOnline: !!isOnline
        });
      } catch (error) {
        console.error('Error checking user status:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${username} (${userId})`);

      try {
        // Remove user data from Redis
        await redis.del(`user:${userId}:online`);
        await redis.del(`user:${userId}:socketId`);
        await redis.del(`user:${userId}:username`);
        await redis.del(`user:${userId}:activeRoom`);

        // Remove from online users set
        await redis.sRem("online_users", `${userId}`);

        // Get updated online users list
        const onlineUserIds = await redis.sMembers("online_users");

        // Notify all clients about updated online users
        io.emit('online-users', onlineUserIds);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
};

//add another event for project creattion

module.exports = { chatController };