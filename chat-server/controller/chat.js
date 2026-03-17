const chatModel = require("../model/chatmodel");
const redis = require("../config/reddis");

const chatController = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.user.user_id;
    const username = socket.user.name;
    const userRole = socket.user.role;
    const roleWiseId = socket.user.roleWiseId;

    console.log(`User connected: ${username} (${userId})`);

    // Register ALL event handlers synchronously first.
    // If handlers are registered after async operations, clients can emit events
    // before the listeners exist and those events are silently dropped.

    // Join a private chat room
    socket.on("join-chat", async ({ recipientId }) => {
      try {
        console.log(`${username} is joining chat with user ID: ${recipientId}`);
        // Create a unique room ID (sorted to ensure same room for both users)
        const [smallerId, largerId] = [userId, recipientId].sort();
        console.log(`Sorted user IDs for chat room: ${smallerId}, ${largerId}`);
        const chatRoomId = `${smallerId}-${largerId}`;
        console.log(`Generated chat room ID: ${chatRoomId}`);
        // Create or get chat room from database
        await chatModel.getOrCreateChatRoom(userId, recipientId);

        socket.join(chatRoomId);

        // Store active chat room in Redis
        await redis.set(`user:${userId}:activeRoom`, chatRoomId, "EX", 3600);

        console.log(`${username} joined chat room: ${chatRoomId}`);

        // Get chat history
        const chatHistory = await chatModel.getChatHistory(chatRoomId);
        console.log(`Chat history for room ${chatRoomId}:`, chatHistory);

        // Mark messages as read
        await chatModel.markMessagesAsRead(chatRoomId, userId);

        // Send chat history to the user
        socket.emit("chat-joined", {
          chatRoomId,
          recipientId,
          chatHistory: chatHistory && chatHistory.length > 0 ? chatHistory : [],
        });

        // Update unread count
        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit("unread-count", { count: unreadCount });

        // Load freelancer services when chat opens
        const freelancerUserId = userRole === 'freelancer' ? userId : recipientId;
        const services = await chatModel.getFreelancerServices(freelancerUserId);
        socket.emit('services-list', { freelancerId: freelancerUserId, services });

        // Send projects list to the freelancer
        if (userRole === 'freelancer') {
          const projects = await chatModel.getFreelancerProjects(userId, recipientId);
          socket.emit('projects-list', { projects });
        }

        // Refresh pending payments for creator — filtered to this freelancer
        if (userRole === 'creator' && roleWiseId) {
          const pendingPayments = await chatModel.getPendingPaymentPackages(roleWiseId, recipientId);
          socket.emit("pending-payments", { payments: pendingPayments });
        }
      } catch (error) {
        console.error("Error joining chat:", error);
        socket.emit("error", { message: "Failed to join chat" });
      }
    });

    // socket.on('get-services', async ({ freelancerId }) => {
    //   try {
    //     const services = await chatModel.getFreelancerServices(freelancerId);
    //     socket.emit('services-list', { freelancerId, services });
    //   } catch (error) {
    //     console.error('Error getting services:', error);
    //     socket.emit('error', { message: 'Failed to get services' });
    //   }
    // });
    // Leave a chat room
    socket.on("leave-chat", async ({ recipientId }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        socket.leave(chatRoomId);

        // Remove active room from Redis
        await redis.del(`user:${userId}:activeRoom`);

        console.log(`${username} left chat room: ${chatRoomId}`);
      } catch (error) {
        console.error("Error leaving chat:", error);
      }
    });

    socket.on("custom-package", async (packageData, recipientId) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        const customPackage = await chatModel.saveCustomPackage(
          chatRoomId,
          userId,
          recipientId,
          packageData
        );

        const savedMessage = await chatModel.saveMessage(
          chatRoomId,
          userId,
          recipientId,
          "Package sent",
          "package",
          customPackage.id
        );

        const messageData = {
          id: savedMessage.id,
          senderId: userId,
          senderUsername: username,
          recipientId,
          message: "Package sent",
          timestamp: savedMessage.created_at,
          chatRoomId,
          isRead: false,
          customPackage,
        };

        io.to(chatRoomId).emit("receive-custom-package", messageData);

        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(
            `user:${recipientId}:socketId`
          );

          if (recipientSocketId) {
            // Check if recipient is in the same chat room
            const recipientActiveRoom = await redis.get(
              `user:${recipientId}:activeRoom`
            );

            if (recipientActiveRoom !== chatRoomId) {
              // Only send notification if recipient is not in the same chat room
              io.to(recipientSocketId).emit("new-message-notification", {
                senderId: userId,
                senderUsername: username,
                message: "Package sent",
                chatRoomId,
              });
            }
          }
        }

        console.log(`Message saved: ${username} to ${recipientId}`);
      } catch (error) {
        console.error("custom-package error:", error);
        socket.emit("error", { message: "Failed to send package" });
      }
    });

    socket.on("accept-package", async (packageId, recipientId) => {
      try {
        // if (userRole !== "creator") {
        //   socket.emit("error", { message: "Only creators can accept packages" });
        //   return;
        // }

        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedPackage = await chatModel.acceptPackage(packageId, userId);

        if (!updatedPackage) {
          socket.emit("error", {
            message: "Package not found or unauthorized",
          });
          return;
        }

        const project = await chatModel.createProjectFromPackage(updatedPackage);

        io.to(chatRoomId).emit("package-accepted", {
          packageId,
          chatRoomId,
          acceptedBy: userId,
          package: updatedPackage,
          project,
        });

        // Notify the creator to pay — resolve creator's user_id from creator_id
        const creatorUserId = await chatModel.getCreatorUserIdByCreatorId(project.creator_id);
        if (creatorUserId) {
          const creatorSocketId = await redis.get(`user:${creatorUserId}:socketId`);
          if (creatorSocketId) {
            io.to(creatorSocketId).emit("payment-required", {
              project_id: project.id,
              amount: project.amount,
              chatRoomId,
              message: "Package accepted — please complete payment to start the project.",
              customPackage: updatedPackage,
            });
          }
        }

        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(
            `user:${recipientId}:socketId`
          );

          if (recipientSocketId) {
            const recipientActiveRoom = await redis.get(
              `user:${recipientId}:activeRoom`
            );

            if (recipientActiveRoom !== chatRoomId) {
              io.to(recipientSocketId).emit("new-message-notification", {
                senderId: userId,
                senderUsername: username,
                message: "Package accepted",
                chatRoomId,
              });
            }
          }
        }

        console.log(`Package ${packageId} accepted by ${username} (${userId})`);
      } catch (error) {
        console.error("Error accepting package:", error);
        socket.emit("error", { message: "Failed to accept package" });
      }
    });

    socket.on("reject-package", async (packageId, recipientId) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedPackage = await chatModel.rejectPackage(packageId, userId);

        if (!updatedPackage) {
          socket.emit("error", {
            message: "Package not found or unauthorized",
          });
          return;
        }

        io.to(chatRoomId).emit("package-rejected", {
          packageId,
          chatRoomId,
          rejectedBy: userId,
          package: updatedPackage,
        });
        // Check if recipient is online using Redis
        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(
            `user:${recipientId}:socketId`
          );

          if (recipientSocketId) {
            // Check if recipient is in the same chat room
            const recipientActiveRoom = await redis.get(
              `user:${recipientId}:activeRoom`
            );

            if (recipientActiveRoom !== chatRoomId) {
              // Only send notification if recipient is not in the same chat room
              io.to(recipientSocketId).emit("new-message-notification", {
                senderId: userId,
                senderUsername: username,
                message: "Package rejected",
                chatRoomId,
              });
            }
          }
        }

        console.log(`Package ${packageId} rejected by ${username} (${userId})`);
      } catch (error) {
        console.error("Error rejecting package:", error);
        socket.emit("error", { message: "Failed to reject package" });
      }
    });

    socket.on("deadline-extension-request", async (extensionData, recipientId) => {
      try {
        if (userRole !== "freelancer") {
          socket.emit("error", { message: "Only freelancers can request a deadline extension" });
          return;
        }

        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        const extensionRequest = await chatModel.saveDeadlineExtensionRequest(
          chatRoomId,
          userId,
          recipientId,
          extensionData
        );

        const savedMessage = await chatModel.saveMessage(
          chatRoomId,
          userId,
          recipientId,
          "Deadline extension requested",
          "deadline_extension",
          null,
          extensionRequest.id
        );

        const messageData = {
          id: savedMessage.id,
          senderId: userId,
          senderUsername: username,
          recipientId,
          message: "Deadline extension requested",
          timestamp: savedMessage.created_at,
          chatRoomId,
          isRead: false,
          deadlineExtension: extensionRequest,
        };

        io.to(chatRoomId).emit("receive-deadline-extension-request", messageData);

        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(`user:${recipientId}:socketId`);

          if (recipientSocketId) {
            const recipientActiveRoom = await redis.get(`user:${recipientId}:activeRoom`);

            if (recipientActiveRoom !== chatRoomId) {
              io.to(recipientSocketId).emit("new-message-notification", {
                senderId: userId,
                senderUsername: username,
                message: "Deadline extension requested",
                chatRoomId,
              });
            }
          }
        }

        console.log(`Deadline extension request sent by ${username} (${userId})`);
      } catch (error) {
        console.error("Error sending deadline extension request:", error);
        socket.emit("error", { message: "Failed to send deadline extension request" });
      }
    });

    socket.on("accept-deadline-extension", async (requestId, recipientId) => {
      try {
        if (userRole !== "creator") {
          socket.emit("error", { message: "Only creators can accept deadline extensions" });
          return;
        }

        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedRequest = await chatModel.acceptDeadlineExtension(requestId, userId);

        if (!updatedRequest) {
          socket.emit("error", { message: "Request not found or unauthorized" });
          return;
        }

        io.to(chatRoomId).emit("deadline-extension-accepted", {
          requestId,
          chatRoomId,
          acceptedBy: userId,
          deadlineExtension: updatedRequest,
          project: updatedRequest.project,
        });

        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(`user:${recipientId}:socketId`);

          if (recipientSocketId) {
            const recipientActiveRoom = await redis.get(`user:${recipientId}:activeRoom`);

            if (recipientActiveRoom !== chatRoomId) {
              io.to(recipientSocketId).emit("new-message-notification", {
                senderId: userId,
                senderUsername: username,
                message: "Deadline extension accepted",
                chatRoomId,
              });
            }
          }
        }

        console.log(`Deadline extension ${requestId} accepted by ${username} (${userId})`);
      } catch (error) {
        console.error("Error accepting deadline extension:", error);
        socket.emit("error", { message: "Failed to accept deadline extension" });
      }
    });

    socket.on("reject-deadline-extension", async (requestId, recipientId) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedRequest = await chatModel.rejectDeadlineExtension(requestId, userId);

        if (!updatedRequest) {
          socket.emit("error", { message: "Request not found or unauthorized" });
          return;
        }

        io.to(chatRoomId).emit("deadline-extension-rejected", {
          requestId,
          chatRoomId,
          rejectedBy: userId,
          deadlineExtension: updatedRequest,
        });

        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(`user:${recipientId}:socketId`);

          if (recipientSocketId) {
            const recipientActiveRoom = await redis.get(`user:${recipientId}:activeRoom`);

            if (recipientActiveRoom !== chatRoomId) {
              io.to(recipientSocketId).emit("new-message-notification", {
                senderId: userId,
                senderUsername: username,
                message: "Deadline extension rejected",
                chatRoomId,
              });
            }
          }
        }

        console.log(`Deadline extension ${requestId} rejected by ${username} (${userId})`);
      } catch (error) {
        console.error("Error rejecting deadline extension:", error);
        socket.emit("error", { message: "Failed to reject deadline extension" });
      }
    });
    // socket.on("hier-freelancer", async ({ requestId }) => {
    // Send a message
    socket.on("send-message", async ({ recipientId, message }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;
        const messageType = "text";

        // Save message to database
        const savedMessage = await chatModel.saveMessage(
          chatRoomId,
          userId,
          recipientId,
          message,
          messageType
        );

        const messageData = {
          id: savedMessage.id,
          senderId: userId,
          senderUsername: username,
          recipientId,
          message,
          timestamp: savedMessage.created_at,
          chatRoomId,
          isRead: false,
        };
        console.log("Message saved to database:", messageData);
        // Send message to the chat room (both users)
        io.to(chatRoomId).emit("receive-message", messageData);

        // Check if recipient is online using Redis
        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(
            `user:${recipientId}:socketId`
          );

          if (recipientSocketId) {
            // Check if recipient is in the same chat room
            const recipientActiveRoom = await redis.get(
              `user:${recipientId}:activeRoom`
            );

            if (recipientActiveRoom !== chatRoomId) {
              // Only send notification if recipient is not in the same chat room
              io.to(recipientSocketId).emit("new-message-notification", {
                senderId: userId,
                senderUsername: username,
                message,
                chatRoomId,
              });
            }
          }
        }

        console.log(`Message saved: ${username} to ${recipientId}`);
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Typing indicator
    socket.on("typing", async ({ recipientId, isTyping }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        // Store typing status in Redis with short expiry
        if (isTyping) {
          await redis.set(`typing:${chatRoomId}:${userId}`, "true", { EX: 5 });
        } else {
          await redis.del(`typing:${chatRoomId}:${userId}`);
        }

        socket.to(chatRoomId).emit("user-typing", {
          userId,
          username,
          isTyping,
        });
      } catch (error) {
        console.error("Error handling typing indicator:", error);
      }
    });

    // Get user's all chat rooms
    socket.on("get-chat-rooms", async () => {
      try {
        console.log(`Getting chat rooms for user: ${username} ${userId}`);
        const chatRooms = await chatModel.getUserChatRooms(userId);

        // Enhance chat rooms with online status from Redis
        const enhancedChatRooms = await Promise.all(
          chatRooms.map(async (room) => {
            const otherUserId =
              room.user1_id === userId ? room.user2_id : room.user1_id;
            const isOnline = await redis.get(`user:${otherUserId}:online`);

            return {
              ...room,
              isOnline: !!isOnline,
            };
          })
        );

        socket.emit("chat-rooms-list", { chatRooms: enhancedChatRooms });
      } catch (error) {
        console.error("Error getting chat rooms:", error);
        socket.emit("error", { message: "Failed to get chat rooms" });
      }
    });

    socket.on("mark-as-read", async ({ recipientId }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        await chatModel.markMessagesAsRead(chatRoomId, userId);

        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit("unread-count", { count: unreadCount });

        // Check if recipient is online and notify them
        const recipientOnline = await redis.get(`user:${recipientId}:online`);

        if (recipientOnline) {
          const recipientSocketId = await redis.get(
            `user:${recipientId}:socketId`
          );

          if (recipientSocketId) {
            io.to(recipientSocketId).emit("messages-read", {
              userId,
              chatRoomId,
            });
          }
        }
      } catch (error) {
        console.error("Error marking as read:", error);
      }
    });

    // Delete message
    socket.on("delete-message", async ({ messageId }) => {
      try {
        const deletedMessage = await chatModel.deleteMessage(messageId, userId);

        if (deletedMessage) {
          io.to(deletedMessage.room_id).emit("message-deleted", {
            messageId: deletedMessage.id,
            roomId: deletedMessage.room_id,
          });
        }
      } catch (error) {
        console.error("Error deleting message:", error);
        socket.emit("error", { message: "Failed to delete message" });
      }
    });

    // Load older messages (pagination)
    socket.on("load-more-messages", async ({ recipientId, offset = 0, limit = 50 }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort();
        const chatRoomId = `${smallerId}-${largerId}`;

        const messages = await chatModel.getChatHistory(chatRoomId, limit, offset);

        socket.emit("older-messages", {
          chatRoomId,
          messages,
          offset,
          hasMore: messages.length === limit,
        });
      } catch (error) {
        console.error("Error loading older messages:", error);
        socket.emit("error", { message: "Failed to load older messages" });
      }
    });

    // Search messages
    socket.on("search-messages", async ({ searchTerm }) => {
      try {
        const results = await chatModel.searchMessages(userId, searchTerm);
        socket.emit("search-results", { results });
      } catch (error) {
        console.error("Error searching messages:", error);
        socket.emit("error", { message: "Failed to search messages" });
      }
    });

    // Get online status of specific user
    socket.on("check-user-status", async ({ targetUserId }) => {
      try {
        const isOnline = await redis.get(`user:${targetUserId}:online`);
        socket.emit("user-status", {
          userId: targetUserId,
          isOnline: !!isOnline,
        });
      } catch (error) {
        console.error("Error checking user status:", error);
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
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
        io.emit("online-users", onlineUserIds);
      } catch (error) {
        console.error("Error handling disconnect:", error);
      }
    });

    // Run async setup AFTER all handlers are registered
    (async () => {
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
        io.emit("online-users", onlineUserIds);

        // Get unread count for this user
        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit("unread-count", { count: unreadCount });

      } catch (error) {
        console.error("Error on connection setup:", error);
      }
    })();

  });
};

//add another event for project creattion

module.exports = { chatController };
