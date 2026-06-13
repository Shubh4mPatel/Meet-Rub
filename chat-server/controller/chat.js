const chatModel = require("../model/chatmodel");
const redis = require("../config/reddis");
const { createPresignedUrl } = require("../utils/helper");
const { sendOfferSentEmail, sendOfferReceivedEmail, sendHireRequestEmail, sendHireRequestReceivedEmail } = require("../utils/offerEmails");
const { sendDeadlineExtensionRequestEmail, sendDeadlineExtensionAcceptedEmail, sendDeadlineExtensionRejectedEmail, sendPackageRejectedEmail, sendPackageAcceptedEmail } = require("../utils/deliveryEmails");
const { sendHireAcceptedEmail, sendHireDeclinedEmail } = require("../utils/offerEmails");

// Save a web notification to DB and emit live to recipient if online.
// For new_message: skips save and emit entirely if recipient is already in that chat room.
async function emitWebNotification(io, recipientId, senderId, eventType, title, body, actionType = 'none', actionRoute = null) {
  try {
    if (eventType === 'new_message') {
      const recipientActiveRoom = await redis.get(`user:${recipientId}:activeRoom`);
      if (recipientActiveRoom === actionRoute) return;
    }

    const [savedNotif, senderImage] = await Promise.all([
      chatModel.saveWebNotification(recipientId, senderId, eventType, title, body, actionType, actionRoute),
      chatModel.getSenderProfileImage(senderId),
    ]);
    const [recipientSocketId, senderImageUrl] = await Promise.all([
      redis.get(`user:${recipientId}:socketId`),
      senderImage ? createPresignedUrl(senderImage) : Promise.resolve(null),
    ]);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('notification', {
        id: savedNotif.id,
        event_type: savedNotif.event_type,
        title: savedNotif.title,
        body: savedNotif.body,
        action_type: savedNotif.action_type,
        action_route: savedNotif.action_route,
        is_read: false,
        created_at: savedNotif.created_at,
        sender_image: senderImageUrl,
      });
    }
  } catch (error) {
    console.error("Error emitting web notification:", error);
  }
}

const chatController = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.user.user_id;
    // Mutable so the async setup below can replace it with a richer display
    // name (admin.full_name / creators.full_name / freelancer.freelancer_full_name)
    // pulled from the DB. JWT-derived names are often the raw user_name handle
    // which can be NULL for older accounts; the resolution gives us a name to show.
    let username = socket.user.name;
    const userRole = socket.user.role;
    const roleWiseId = socket.user.roleWiseId;

    console.log(`User connected: ${username} (${userId})`);


    // ========== SUPPORT CHAT HANDLERS ==========

    // User clicks "Contact Support" — creates or rejoins their group support room
    socket.on("contact-support", async () => {
      try {
        if (userRole === 'admin') {
          socket.emit("error", { message: "Admins cannot contact support" });
          return;
        }

        // Fail early if no admins are available
        const admins = await chatModel.getAdminsWithChatPermission();
        if (!admins || admins.length === 0) {
          socket.emit("error", { message: "Support is unavailable at the moment. Please try again later." });
          return;
        }

        // Race-safe upsert. isNew tells us if this is the user's first contact.
        const { room, isNew } = await chatModel.createSupportRoom(userId);
        const chatRoomId = room.room_id;

        for (const r of socket.rooms) {
          if (r !== socket.id) socket.leave(r);
        }
        socket.join(chatRoomId);
        await redis.set(`user:${userId}:activeRoom`, chatRoomId, "EX", 3600);

        const [chatHistory, participants] = await Promise.all([
          chatModel.getChatHistory(chatRoomId),
          chatModel.getSupportRoomParticipants(chatRoomId),
        ]);

        if (participants?.user?.avatar) {
          participants.user.avatar = await createPresignedUrl(participants.user.avatar);
        }

        const latestMessageId = chatHistory?.length ? chatHistory[chatHistory.length - 1].id : null;
        await chatModel.updateSupportReadStatus(chatRoomId, userId, latestMessageId);

        // Clear any unread notifications the user accumulated for this room
        await chatModel.markNotificationsByRoomAsRead(userId, chatRoomId);
        const unreadCount = await chatModel.getUnreadCount(userId);
        socket.emit("unread-count", { count: unreadCount });

        socket.emit("support-chat-joined", {
          chatRoomId,
          chatHistory: chatHistory || [],
          participants,
          isNewRoom: isNew,
        });

        console.log(`${username} (${userId}) ${isNew ? 'created' : 'rejoined'} support room: ${chatRoomId}`);

        // Only notify admins + push list update on a brand-new room.
        // For re-entries the room already exists in their inbox; no new signal needed.
        if (isNew) {
          await Promise.all(admins.map(async (admin) => {
            const adminActiveRoom = await redis.get(`user:${admin.user_id}:activeRoom`);
            if (adminActiveRoom !== chatRoomId) {
              await emitWebNotification(
                io, admin.user_id, userId,
                'support_request', 'New Support Chat',
                `${username} has opened a support chat.`,
                'link', chatRoomId
              );
            }
          }));

          io.to('support-admins').emit('new-support-room', {
            roomId: chatRoomId,
            userId,
            username,
          });
        }

      } catch (error) {
        console.error("Error handling contact-support:", error);
        socket.emit("error", { message: "Failed to contact support" });
      }
    });

    // Admin: fetch their support inbox list
    socket.on("get-support-rooms", async () => {
      try {
        if (userRole !== 'admin') {
          socket.emit("error", { message: "Access denied" });
          return;
        }
        const hasPermission = await chatModel.adminHasChatPermission(userId);
        if (!hasPermission) {
          socket.emit("error", { message: "Access denied: requires chat permission" });
          return;
        }

        const rooms = await chatModel.getSupportRoomsForAdmin(userId);
        const enhanced = await Promise.all(rooms.map(async (room) => ({
          ...room,
          user_avatar: room.user_avatar ? await createPresignedUrl(room.user_avatar) : null,
        })));

        socket.emit("support-rooms-list", { rooms: enhanced });
      } catch (error) {
        console.error("Error getting support rooms:", error);
        socket.emit("error", { message: "Failed to get support rooms" });
      }
    });

    // Admin: open a specific support room (WhatsApp-style)
    socket.on("admin-open-support-room", async ({ roomId }) => {
      try {
        if (userRole !== 'admin') {
          socket.emit("error", { message: "Access denied" });
          return;
        }

        const hasPermission = await chatModel.adminHasChatPermission(userId);
        if (!hasPermission) {
          socket.emit("error", { message: "Access denied: requires chat permission" });
          return;
        }

        const isSupportRoom = await chatModel.isSupportRoom(roomId);
        if (!isSupportRoom) {
          socket.emit("error", { message: "Support room not found" });
          return;
        }

        for (const r of socket.rooms) {
          if (r !== socket.id) socket.leave(r);
        }
        socket.join(roomId);
        await redis.set(`user:${userId}:activeRoom`, roomId, "EX", 3600);

        const [chatHistory, participants] = await Promise.all([
          chatModel.getChatHistory(roomId),
          chatModel.getSupportRoomParticipants(roomId),
        ]);

        if (participants?.user?.avatar) {
          participants.user.avatar = await createPresignedUrl(participants.user.avatar);
        }

        const latestMessageId = chatHistory?.length ? chatHistory[chatHistory.length - 1].id : null;
        await chatModel.updateSupportReadStatus(roomId, userId, latestMessageId);

        // Clear any web_notifications this admin had for this room
        await chatModel.markNotificationsByRoomAsRead(userId, roomId);

        socket.emit("support-room-opened", {
          chatRoomId: roomId,
          chatHistory: chatHistory || [],
          participants,
        });

        const [totalUnread, generalUnread] = await Promise.all([
          chatModel.getSupportUnreadCountTotal(userId),
          chatModel.getUnreadCount(userId),
        ]);
        socket.emit("support-unread-count", { count: totalUnread });
        socket.emit("unread-count", { count: generalUnread });

        console.log(`Admin ${username} (${userId}) opened support room: ${roomId}`);
      } catch (error) {
        console.error("Error opening support room:", error);
        socket.emit("error", { message: "Failed to open support room" });
      }
    });

    // Send a text message in a support room (user or admin)
    socket.on("send-support-message", async ({ roomId, message }) => {
      try {
        const isSupportRoom = await chatModel.isSupportRoom(roomId);
        if (!isSupportRoom) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        // Admin permission re-check on every send (defense against revoked session)
        if (userRole === 'admin') {
          const hasPermission = await chatModel.adminHasChatPermission(userId);
          if (!hasPermission) {
            socket.emit("error", { message: "Access denied: requires chat permission" });
            return;
          }
        } else {
          // Verify user is the room owner
          const room = await chatModel.getSupportRoomByUserId(userId);
          if (!room || room.room_id !== roomId) {
            socket.emit("error", { message: "Access denied" });
            return;
          }
        }

        const saved = await chatModel.saveSupportMessage(roomId, userId, message, 'text');

        const messageData = {
          id: saved.id,
          senderId: userId,
          senderUsername: username,
          message,
          timestamp: saved.created_at,
          chatRoomId: roomId,
          message_type: 'text',
          isRead: false,
        };

        io.to(roomId).emit("receive-support-message", messageData);

        // Update sender's own read pointer
        await chatModel.updateSupportReadStatus(roomId, userId, saved.id);

        // Notify all participants not currently in this room
        let notifyList = [];
        if (userRole === 'admin') {
          const roomRow = await chatModel.getSupportRoomByRoomId(roomId);
          if (roomRow) notifyList = [{ user_id: roomRow.user_id }];
        } else {
          notifyList = await chatModel.getAdminsWithChatPermission();
        }

        await Promise.all(notifyList.map(async (recipient) => {
          if (recipient.user_id === userId) return; // skip self
          const activeRoom = await redis.get(`user:${recipient.user_id}:activeRoom`);
          if (activeRoom !== roomId) {
            await emitWebNotification(
              io, recipient.user_id, userId,
              'support_message', 'Support Message',
              `${username}: ${message.substring(0, 60)}`,
              'link', roomId
            );
          }
        }));

        // Push list-level update to all admins (keeps their inbox live)
        io.to('support-admins').emit('support-room-updated', {
          roomId,
          lastMessage: message,
          lastMessageTime: saved.created_at,
          lastSenderId: userId,
          lastSenderName: username,
        });

      } catch (error) {
        console.error("Error sending support message:", error);
        socket.emit("error", { message: "Failed to send support message" });
      }
    });

    // Send a file in a support room (user or admin)
    socket.on("send-support-file-message", async ({ roomId, file_url, object_name, filename, file_size, file_type, message }) => {
      try {
        const isSupportRoom = await chatModel.isSupportRoom(roomId);
        if (!isSupportRoom) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        if (!object_name || !filename || !file_type) {
          socket.emit("error", { message: "Missing file information" });
          return;
        }

        if (userRole === 'admin') {
          const hasPermission = await chatModel.adminHasChatPermission(userId);
          if (!hasPermission) {
            socket.emit("error", { message: "Access denied: requires chat permission" });
            return;
          }
        } else {
          const room = await chatModel.getSupportRoomByUserId(userId);
          if (!room || room.room_id !== roomId) {
            socket.emit("error", { message: "Access denied" });
            return;
          }
        }

        const messageText = message || `Sent a ${file_type}`;
        const saved = await chatModel.saveSupportMessage(roomId, userId, messageText, file_type, object_name);

        const messageData = {
          id: saved.id,
          senderId: userId,
          senderUsername: username,
          message: messageText,
          file_url,
          filename,
          file_size,
          message_type: file_type,
          timestamp: saved.created_at,
          chatRoomId: roomId,
          isRead: false,
        };

        io.to(roomId).emit("receive-support-message", messageData);

        await chatModel.updateSupportReadStatus(roomId, userId, saved.id);

        let notifyList = [];
        if (userRole === 'admin') {
          const roomRow = await chatModel.getSupportRoomByRoomId(roomId);
          if (roomRow) notifyList = [{ user_id: roomRow.user_id }];
        } else {
          notifyList = await chatModel.getAdminsWithChatPermission();
        }

        await Promise.all(notifyList.map(async (recipient) => {
          if (recipient.user_id === userId) return;
          const activeRoom = await redis.get(`user:${recipient.user_id}:activeRoom`);
          if (activeRoom !== roomId) {
            await emitWebNotification(
              io, recipient.user_id, userId,
              'support_message', 'Support Message',
              `${username} sent a ${file_type}`,
              'link', roomId
            );
          }
        }));

        io.to('support-admins').emit('support-room-updated', {
          roomId,
          lastMessage: messageText,
          lastMessageTime: saved.created_at,
          lastSenderId: userId,
          lastSenderName: username,
        });

      } catch (error) {
        console.error("Error sending support file message:", error);
        socket.emit("error", { message: "Failed to send support file message" });
      }
    });

    // Typing indicator for support rooms
    socket.on("support-typing", async ({ roomId, isTyping }) => {
      try {
        const isSupportRoom = await chatModel.isSupportRoom(roomId);
        if (!isSupportRoom) return;

        if (isTyping) {
          await redis.set(`typing:${roomId}:${userId}`, "true", { EX: 5 });
        } else {
          await redis.del(`typing:${roomId}:${userId}`);
        }

        socket.to(roomId).emit("user-typing", { userId, username, isTyping });
      } catch (error) {
        console.error("Error handling support typing:", error);
      }
    });

    // Leave a support room (clears activeRoom so notifications resume)
    socket.on("leave-support-chat", async ({ roomId }) => {
      try {
        socket.leave(roomId);
        await redis.del(`user:${userId}:activeRoom`);

        const latestId = await chatModel.getLatestMessageIdInRoom(roomId);
        await chatModel.updateSupportReadStatus(roomId, userId, latestId);

        console.log(`${username} left support room: ${roomId}`);
      } catch (error) {
        console.error("Error leaving support chat:", error);
      }
    });

    // Mark all messages in a support room as read
    socket.on("mark-support-as-read", async ({ roomId }) => {
      try {
        const isSupportRoom = await chatModel.isSupportRoom(roomId);
        if (!isSupportRoom) return;

        const latestId = await chatModel.getLatestMessageIdInRoom(roomId);
        await chatModel.updateSupportReadStatus(roomId, userId, latestId);
        await chatModel.markNotificationsByRoomAsRead(userId, roomId);

        const [totalUnread, generalUnread] = await Promise.all([
          chatModel.getSupportUnreadCountTotal(userId),
          chatModel.getUnreadCount(userId),
        ]);
        socket.emit("support-unread-count", { count: totalUnread });
        socket.emit("unread-count", { count: generalUnread });
      } catch (error) {
        console.error("Error marking support as read:", error);
      }
    });

    // Admin view chat (read-only)
    socket.on("admin-view-chat", async ({ user1Id, user2Id }) => {
      try {
        if (userRole !== 'admin') {
          socket.emit("error", { message: "Access denied" });
          return;
        }

        const [smallerId, largerId] = [parseInt(user1Id), parseInt(user2Id)].sort((a, b) => a - b);
        const chatRoomId = `${smallerId}-${largerId}`;

        socket.join(chatRoomId);

        const [chatHistory, participants] = await Promise.all([
          chatModel.getChatHistory(chatRoomId),
          chatModel.getRoomParticipants(chatRoomId),
        ]);

        if (!participants) {
          socket.emit("error", { message: "Chat not found" });
          return;
        }

        [participants.user1_avatar, participants.user2_avatar] = await Promise.all([
          createPresignedUrl(participants.user1_avatar),
          createPresignedUrl(participants.user2_avatar),
        ]);

        socket.emit("chat-viewed", {
          chatRoomId,
          messages: chatHistory,
          participants,
        });

        console.log(`Admin ${userId} viewing chat: ${chatRoomId}`);
      } catch (error) {
        console.error(`[admin-view-chat] ERROR:`, error);
        socket.emit("error", { message: "Failed to view chat" });
      }
    });

    // Join a private chat room
    socket.on("join-chat", async ({ recipientId }) => {
      try {
        console.log(`${username} is joining chat with user ID: ${recipientId}`);

        // Role-based access: admin cannot join regular chat rooms
        if (userRole === 'admin') {
          socket.emit("error", { message: "Admins cannot join or create chat rooms" });
          return;
        }

        // Fetch recipient's role and validate pairing
        const recipientRole = await chatModel.getUserRole(recipientId);
        if (!recipientRole) {
          socket.emit("error", { message: "Recipient not found" });
          return;
        }

        if (recipientRole === 'admin') {
          socket.emit("error", { message: "Cannot start a chat with an admin" });
          return;
        }

        if (userRole === recipientRole) {
          socket.emit("error", { message: `Two ${userRole}s cannot chat with each other` });
          return;
        }

        // Create a unique room ID (sorted to ensure same room for both users)
        const [smallerId, largerId] = [parseInt(userId), parseInt(recipientId)].sort((a, b) => a - b);
        console.log(`Sorted user IDs for chat room: ${smallerId}, ${largerId}`);
        const chatRoomId = `${smallerId}-${largerId}`;
        console.log(`Generated chat room ID: ${chatRoomId}`);
        // Create or get chat room from database
        await chatModel.getOrCreateChatRoom(userId, recipientId);

        // Leave all previously joined chat rooms before joining the new one.
        // socket.rooms always contains the socket's own ID room — skip that.
        for (const room of socket.rooms) {
          if (room !== socket.id) {
            socket.leave(room);
          }
        }

        socket.join(chatRoomId);

        // Store active chat room in Redis
        await redis.set(`user:${userId}:activeRoom`, chatRoomId, "EX", 3600);

        console.log(`${username} joined chat room: ${chatRoomId}`);

        // Get chat history and participants in parallel
        const [chatHistory, participants] = await Promise.all([
          chatModel.getChatHistory(chatRoomId),
          chatModel.getRoomParticipants(chatRoomId),
        ]);

        if (participants) {
          [participants.user1_avatar, participants.user2_avatar] = await Promise.all([
            createPresignedUrl(participants.user1_avatar),
            createPresignedUrl(participants.user2_avatar),
          ]);
        }

        // Mark messages as read
        await chatModel.markMessagesAsRead(chatRoomId, userId);

        // Send chat history to the user
        socket.emit("chat-joined", {
          chatRoomId,
          recipientId,
          chatHistory: chatHistory && chatHistory.length > 0 ? chatHistory : [],
          participants,
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
          console.log(`[projects-list] Sending project data to freelancer - userId=${userId} recipientId=${recipientId} projectCount=${projects?.length || 0} projectIds=${projects?.map(p => p.id).join(',') || 'none'}`);
          socket.emit('projects-list', { projects });
        }

        // Send projects list to the creator
        if (userRole === 'creator') {
          const projects = await chatModel.getCreatorProjects(userId, recipientId);
          console.log(`[projects-list] Sending project data to creator - userId=${userId} recipientId=${recipientId} projectCount=${projects?.length || 0} projectIds=${projects?.map(p => p.id).join(',') || 'none'}`);
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

    // Get unread message count for a specific chat room
    socket.on("get-room-unread-count", async ({ roomId }) => {
      try {
        if (!roomId) {
          return socket.emit("error", { message: "roomId is required" });
        }
        const count = await chatModel.getUnreadCountByRoom(userId, roomId);
        socket.emit("room-unread-count", { roomId, count });
      } catch (error) {
        console.error("Error getting room unread count:", error);
        socket.emit("error", { message: "Failed to get room unread count" });
      }
    });

    // Get total unread message count across all chat rooms
    socket.on("get-total-unread-messages", async () => {
      try {
        const count = await chatModel.getTotalUnreadMessages(userId);
        socket.emit("total-unread-messages", { count });
      } catch (error) {
        console.error("Error getting total unread messages:", error);
        socket.emit("error", { message: "Failed to get total unread messages" });
      }
    });

    // Leave a chat room
    socket.on("leave-chat", async ({ recipientId }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
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
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        if (await chatModel.isSupportRoom(chatRoomId)) {
          socket.emit("error", { message: "Packages cannot be sent in support chats" });
          return;
        }

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

        if (userRole === 'creator') {
          await emitWebNotification(io, recipientId, userId, 'hire_request',
            'New Hire Request',
            `${username} has sent you a job offer. Check the details.`,
            'link', chatRoomId
          );

          const freelancer = await chatModel.getUserByUserId(recipientId);
          if (freelancer) {
            await Promise.all([
              sendHireRequestEmail({
                creatorEmail: socket.user.email,
                creatorName: username,
                freelancerName: freelancer.user_name,
                serviceTitle: customPackage.service_type,
                amount: customPackage.price,
                deliveryDays: packageData.delivery_days,
                freelancerUserId: recipientId,
              }),
              sendHireRequestReceivedEmail({
                freelancerEmail: freelancer.user_email,
                freelancerName: freelancer.user_name,
                creatorName: username,
                serviceTitle: customPackage.service_type,
                amount: customPackage.price,
                deliveryDays: packageData.delivery_days,
                chatRoomId,
              }),
            ]);
          }
        } else {
          await emitWebNotification(io, recipientId, userId, 'package_sent',
            'New Package Offer',
            `${username} has sent you a custom package offer.`,
            'link', chatRoomId
          );

          const recipient = await chatModel.getUserByUserId(recipientId);
          if (recipient) {
            await Promise.all([
              sendOfferSentEmail({
                freelancerEmail: socket.user.email,
                freelancerName: username,
                creatorName: recipient.user_name,
                serviceTitle: customPackage.service_type,
                amount: customPackage.price,
                deliveryDays: packageData.delivery_days,
                chatRoomId,
              }),
              sendOfferReceivedEmail({
                creatorEmail: recipient.user_email,
                creatorName: recipient.user_name,
                freelancerName: username,
                serviceTitle: customPackage.service_type,
                amount: customPackage.price,
                deliveryDays: packageData.delivery_days,
                chatRoomId,
              }),
            ]);
          }
        }

      } catch (error) {
        console.error("custom-package error:", error);
        socket.emit("error", { message: "Failed to send package" });
      }
    });

    socket.on("accept-package", async (packageId, recipientId) => {
      try {
        console.log(`User ${username} (${userId}) is accepting package ${packageId} for recipient ${recipientId}`);
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
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

        // Notify freelancer that their package was accepted
        await emitWebNotification(io, recipientId, userId, 'package_accepted',
          'Package Accepted',
          `${username} has accepted your package offer.`,
          'link', chatRoomId
        );

        // Send email to the offer sender (recipientId = freelancer)
        try {
          const recipientInfo = await chatModel.getUserInfo(recipientId);
          await sendPackageAcceptedEmail({
            freelancerEmail: recipientInfo.email,
            freelancerName: recipientInfo.name,
            creatorName: username,
            serviceTitle: updatedPackage.service_type,
            amount: updatedPackage.price,
            deliveryDays: updatedPackage.delivery_days,
            chatRoomId,
          });
        } catch (emailError) {
          console.error('Error sending package accepted email:', emailError);
        }

        // Send hire-accepted confirmation to creator with payment link
        try {
          const creatorInfo = await chatModel.getUserInfo(userId);
          await sendHireAcceptedEmail({
            creatorEmail: creatorInfo.email,
            creatorName: creatorInfo.name,
            freelancerName: recipientInfo?.name || username,
            serviceTitle: updatedPackage.service_type,
            amount: updatedPackage.price,
            deadline: updatedPackage.delivery_days,
            chatRoomId,
          });
        } catch (emailError) {
          console.error('Error sending hire accepted email to creator:', emailError);
        }

        console.log(`Package ${packageId} accepted by ${username} (${userId})`);
      } catch (error) {
        console.error("Error accepting package:", error);
        socket.emit("error", { message: "Failed to accept package" });
      }
    });

    socket.on("reject-package", async ({ packageId, reason } = {}, recipientId) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedPackage = await chatModel.rejectPackage(packageId, userId, reason);

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
          reason: updatedPackage.reason_for_rejection,
          package: updatedPackage,
        });

        // Notify freelancer that their package was rejected
        await emitWebNotification(io, recipientId, userId, 'package_rejected',
          'Package Rejected',
          `${username} has rejected your package offer.`,
          'link', chatRoomId
        );

        // Send email to the offer sender (recipientId = freelancer)
        try {
          const recipientInfo = await chatModel.getUserInfo(recipientId);
          await sendPackageRejectedEmail({
            freelancerEmail: recipientInfo.email,
            freelancerName: recipientInfo.name,
            creatorName: username,
            serviceTitle: updatedPackage.service_type,
            amount: updatedPackage.price,
            deliveryDays: updatedPackage.delivery_days,
            chatRoomId,
          });
        } catch (emailError) {
          console.error('Error sending package rejected email:', emailError);
        }

        // Notify creator their hire request was declined
        try {
          const creatorInfo = await chatModel.getUserInfo(userId);
          const freelancerInfo = await chatModel.getUserInfo(recipientId);
          await sendHireDeclinedEmail({
            creatorEmail: creatorInfo.email,
            creatorName: creatorInfo.name,
            freelancerName: freelancerInfo?.name || '',
          });
        } catch (emailError) {
          console.error('Error sending hire declined email to creator:', emailError);
        }

        console.log(`Package ${packageId} rejected by ${username} (${userId})`);
      } catch (error) {
        console.error("Error rejecting package:", error);
        socket.emit("error", { message: "Failed to reject package" });
      }
    });

    socket.on("revoke-custom-package", async ({ packageId, reason } = {}, recipientId) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedPackage = await chatModel.revokePackage(packageId, reason);

        if (!updatedPackage) {
          socket.emit("error", {
            message: "Package cannot be revoked. It may not exist or is no longer pending.",
          });
          return;
        }

        io.to(chatRoomId).emit("custom-package-revoked", {
          packageId,
          chatRoomId,
          revokedBy: userId,
          reason: updatedPackage.reason_for_revoke,
          package: updatedPackage,
        });

        // Notify recipient that package was revoked
        await emitWebNotification(io, recipientId, userId, 'package_revoked',
          'Package Revoked',
          `${username} has revoked their package offer.`,
          'link', chatRoomId
        );

        console.log(`Package ${packageId} revoked by ${username} (${userId})`);
      } catch (error) {
        console.error("Error revoking package:", error);
        socket.emit("error", { message: "Failed to revoke package" });
      }
    });

    socket.on("deadline-extension-request", async (extensionData, recipientId) => {
      try {
        console.log(
          `[deadline-extension-request] received from userId=${userId} role=${userRole} recipientId=${recipientId} payload=${JSON.stringify(extensionData)}`
        );

        const [sId, lId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        if (await chatModel.isSupportRoom(`${sId}-${lId}`)) {
          socket.emit("error", { message: "Deadline extensions are not available in support chats" });
          return;
        }

        if (userRole !== "freelancer") {
          socket.emit("error", { message: "Only freelancers can request a deadline extension" });
          return;
        }

        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        const extensionRequest = await chatModel.saveDeadlineExtensionRequest(
          chatRoomId,
          userId,
          recipientId,
          extensionData
        );

        console.log(
          `[deadline-extension-request] saved id=${extensionRequest.id} project_id=${extensionRequest.project_id} days=${extensionRequest.days} hours=${extensionRequest.hours} chatRoomId=${chatRoomId}`
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

        const projectInfo = await chatModel.getProjectInfo(extensionRequest.project_id);

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
          project: projectInfo,
        };

        io.to(chatRoomId).emit("receive-deadline-extension-request", messageData);

        await emitWebNotification(io, recipientId, userId, 'deadline_extension',
          'Deadline Extension Request',
          `${username} has requested a deadline extension on project #${extensionRequest.project_id}.`,
          'link', chatRoomId
        );

        // Send email to creator
        try {
          const [creatorInfo, freelancerInfo] = await Promise.all([
            chatModel.getUserInfo(recipientId),
            chatModel.getUserInfo(userId)
          ]);

          const extensionText = extensionRequest.days > 0
            ? `${extensionRequest.days} day${extensionRequest.days > 1 ? 's' : ''}${extensionRequest.hours > 0 ? ` and ${extensionRequest.hours} hour${extensionRequest.hours > 1 ? 's' : ''}` : ''}`
            : `${extensionRequest.hours} hour${extensionRequest.hours > 1 ? 's' : ''}`;

          const currentDeadline = projectInfo?.end_date
            ? new Date(projectInfo.end_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })
            : 'TBD';

          // For preview: Calculate from DATE only (ignore time) to match user expectation
          // since we only show date in email, not datetime
          const baseDate = new Date(projectInfo?.end_date || new Date());
          baseDate.setHours(0, 0, 0, 0); // Reset to start of day
          const totalMillisecondsToAdd = (extensionRequest.days * 24 * 60 * 60 * 1000) + (extensionRequest.hours * 60 * 60 * 1000);
          const newEndDate = new Date(baseDate.getTime() + totalMillisecondsToAdd);
          const newDeadline = newEndDate.toLocaleDateString('en-IN', { dateStyle: 'medium' });

          await sendDeadlineExtensionRequestEmail({
            creatorEmail: creatorInfo.email,
            creatorName: creatorInfo.name,
            freelancerName: freelancerInfo.name,
            projectId: extensionRequest.project_id,
            serviceTitle: projectInfo?.service_name || 'Your order',
            extensionTime: extensionText,
            currentDeadline,
            newDeadline,
          });

          console.log(`Deadline extension request email sent to ${creatorInfo.email}`);
        } catch (emailError) {
          console.error('Error sending deadline extension request email:', emailError);
        }

        console.log(`Deadline extension request sent by ${username} (${userId})`);
      } catch (error) {
        console.error("Error sending deadline extension request:", error);
        socket.emit("error", { message: "Failed to send deadline extension request" });
      }
    });

    socket.on("accept-deadline-extension", async (requestId, recipientId) => {
      try {
        console.log(
          `[accept-deadline-extension] received from userId=${userId} role=${userRole} requestId=${requestId} recipientId=${recipientId}`
        );

        if (userRole !== "creator") {
          socket.emit("error", { message: "Only creators can accept deadline extensions" });
          return;
        }

        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedRequest = await chatModel.acceptDeadlineExtension(requestId, userId);

        if (!updatedRequest) {
          console.log(
            `[accept-deadline-extension] no matching pending request for requestId=${requestId} userId=${userId}`
          );
          socket.emit("error", { message: "Request not found or unauthorized" });
          return;
        }

        console.log(
          `[accept-deadline-extension] accepted requestId=${requestId} project_id=${updatedRequest.project_id} new_end_date=${updatedRequest.project?.end_date ?? "unchanged"}`
        );

        io.to(chatRoomId).emit("deadline-extension-accepted", {
          requestId,
          chatRoomId,
          acceptedBy: userId,
          deadlineExtension: updatedRequest,
          project: updatedRequest.project,
        });

        await emitWebNotification(io, recipientId, userId, 'deadline_extension_accepted',
          'Deadline Extension Accepted',
          `${username} has accepted your deadline extension request.`,
          'link', chatRoomId
        );

        // Send email to freelancer
        try {
          const [creatorInfo, freelancerInfo] = await Promise.all([
            chatModel.getUserInfo(userId),
            chatModel.getUserInfo(recipientId)
          ]);

          const extensionText = updatedRequest.days > 0
            ? `${updatedRequest.days} day${updatedRequest.days > 1 ? 's' : ''}${updatedRequest.hours > 0 ? ` and ${updatedRequest.hours} hour${updatedRequest.hours > 1 ? 's' : ''}` : ''}`
            : `${updatedRequest.hours} hour${updatedRequest.hours > 1 ? 's' : ''}`;

          const newDeadline = updatedRequest.project?.end_date
            ? new Date(updatedRequest.project.end_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })
            : 'TBD';

          await sendDeadlineExtensionAcceptedEmail({
            freelancerEmail: freelancerInfo.email,
            freelancerName: freelancerInfo.name,
            creatorName: creatorInfo.name,
            projectId: updatedRequest.project_id,
            serviceTitle: updatedRequest.project?.service_name || 'Your order',
            extensionTime: extensionText,
            newDeadline,
          });

          console.log(`Deadline extension accepted email sent to ${freelancerInfo.email}`);
        } catch (emailError) {
          console.error('Error sending deadline extension accepted email:', emailError);
        }

        console.log(`Deadline extension ${requestId} accepted by ${username} (${userId})`);
      } catch (error) {
        console.error("Error accepting deadline extension:", error);
        socket.emit("error", { message: "Failed to accept deadline extension" });
      }
    });

    socket.on("reject-deadline-extension", async (requestId, recipientId) => {
      try {
        console.log(
          `[reject-deadline-extension] received from userId=${userId} role=${userRole} requestId=${requestId} recipientId=${recipientId}`
        );

        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        const updatedRequest = await chatModel.rejectDeadlineExtension(requestId, userId);

        if (!updatedRequest) {
          console.log(
            `[reject-deadline-extension] no matching request for requestId=${requestId} userId=${userId}`
          );
          socket.emit("error", { message: "Request not found or unauthorized" });
          return;
        }

        io.to(chatRoomId).emit("deadline-extension-rejected", {
          requestId,
          chatRoomId,
          rejectedBy: userId,
          deadlineExtension: updatedRequest,
        });

        await emitWebNotification(io, recipientId, userId, 'deadline_extension_rejected',
          'Deadline Extension Rejected',
          `${username} has rejected your deadline extension request.`,
          'link', chatRoomId
        );

        // Send email to freelancer
        try {
          const [creatorInfo, freelancerInfo] = await Promise.all([
            chatModel.getUserInfo(userId),
            chatModel.getUserInfo(recipientId)
          ]);

          const currentDeadline = updatedRequest.project?.end_date
            ? new Date(updatedRequest.project.end_date).toLocaleDateString('en-IN', { dateStyle: 'medium' })
            : 'TBD';

          await sendDeadlineExtensionRejectedEmail({
            freelancerEmail: freelancerInfo.email,
            freelancerName: freelancerInfo.name,
            creatorName: creatorInfo.name,
            projectId: updatedRequest.project_id,
            serviceTitle: updatedRequest.project?.service_name || 'Your order',
            currentDeadline,
          });

          console.log(`Deadline extension rejected email sent to ${freelancerInfo.email}`);
        } catch (emailError) {
          console.error('Error sending deadline extension rejected email:', emailError);
        }

        console.log(`Deadline extension ${requestId} rejected by ${username} (${userId})`);
      } catch (error) {
        console.error("Error rejecting deadline extension:", error);
        socket.emit("error", { message: "Failed to reject deadline extension" });
      }
    });
    // Send a message
    socket.on("send-message", async ({ recipientId, message }) => {
      try {
        // Standard room ID format for all chats (regular and support)
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        if (await chatModel.isSupportRoom(chatRoomId)) {
          socket.emit("error", { message: "Use send-support-message for support rooms" });
          return;
        }

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

        // Send message to the chat room (both users)
        io.to(chatRoomId).emit("receive-message", messageData);

        await emitWebNotification(io, recipientId, userId, 'new_message', 'New Message', `You have received a new message from ${username}`, 'link', chatRoomId);
      } catch (error) {
        console.error(`[send-message] ERROR - Sender ${userId}, Recipient ${recipientId}:`, error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Send a file message (image, video, audio, document)
    socket.on("send-file-message", async ({ recipientId, file_url, object_name, filename, file_size, file_type, message }) => {
      try {
        // Standard room ID format for all chats (regular and support)
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;

        if (await chatModel.isSupportRoom(chatRoomId)) {
          socket.emit("error", { message: "Use send-support-file-message for support rooms" });
          return;
        }

        // Validate required fields
        if (!object_name || !filename || !file_type) {
          console.error(`[send-file-message] Missing required fields (object_name, filename, or file_type)`);
          socket.emit("error", { message: "Missing file information. Please include object_name." });
          return;
        }

        // Determine message type based on file_type
        const messageType = file_type; // 'image', 'video', 'audio', or 'file'
        const messageText = message || `Sent a ${file_type}`;

        // Store ONLY object_name (path without bucket) in database
        // Format should be: "chat-files/chatRoomId/timestamp-random-filename.ext"
        const fileUrlToStore = object_name;

        // Save message to database
        const savedMessage = await chatModel.saveMessage(
          chatRoomId,
          userId,
          recipientId,
          messageText,
          messageType,
          null, // custom_package_id
          null, // deadline_extension_id
          fileUrlToStore // Store object path, not presigned URL
        );

        const messageData = {
          id: savedMessage.id,
          senderId: userId,
          senderUsername: username,
          recipientId,
          message: messageText,
          file_url,
          filename,
          file_size,
          message_type: messageType,
          timestamp: savedMessage.created_at,
          chatRoomId,
          isRead: false,
        };

        // Send message to the chat room (both users)
        io.to(chatRoomId).emit("receive-file-message", messageData);

        // Send web notification
        await emitWebNotification(
          io,
          recipientId,
          userId,
          'new_message',
          'New Message',
          `You have received a new message from ${username}`,
          'link',
          chatRoomId
        );

        console.log(`[send-file-message] SUCCESS - File message saved: ${username} to ${recipientId} in room ${chatRoomId}`);
      } catch (error) {
        console.error(`[send-file-message] ERROR - Sender ${userId}, Recipient ${recipientId}:`, error);
        socket.emit("error", { message: "Failed to send file message" });
      }
    });

    // Typing indicator
    socket.on("typing", async ({ recipientId, isTyping }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
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

        // Enhance chat rooms with online status and presigned avatar URLs
        const enhancedChatRooms = await Promise.all(
          chatRooms.map(async (room) => {
            const otherUserId =
              room.user1_id === userId ? room.user2_id : room.user1_id;
            const [isOnline, user1_avatar, user2_avatar] = await Promise.all([
              redis.get(`user:${otherUserId}:online`),
              createPresignedUrl(room.user1_profile_image_url),
              createPresignedUrl(room.user2_profile_image_url),
            ]);

            return {
              ...room,
              user1_profile_image_url: user1_avatar,
              user2_profile_image_url: user2_avatar,
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

    // Admin get chat rooms for specific user
    socket.on("admin-get-user-chats", async ({ targetUserId }) => {
      try {
        if (userRole !== 'admin') {
          socket.emit("error", { message: "Access denied" });
          return;
        }

        const chatRooms = await chatModel.getUserChatRooms(targetUserId);

        const enhancedChatRooms = await Promise.all(
          chatRooms.map(async (room) => {
            const [user1_avatar, user2_avatar] = await Promise.all([
              createPresignedUrl(room.user1_profile_image_url),
              createPresignedUrl(room.user2_profile_image_url),
            ]);

            return {
              ...room,
              user1_profile_image_url: user1_avatar,
              user2_profile_image_url: user2_avatar,
            };
          })
        );

        socket.emit("user-chats-list", { chatRooms: enhancedChatRooms });
        console.log(`Admin ${userId} fetched ${enhancedChatRooms.length} chats for user ${targetUserId}`);
      } catch (error) {
        console.error(`[admin-get-user-chats] ERROR:`, error);
        socket.emit("error", { message: "Failed to get user chats" });
      }
    });

    socket.on("mark-as-read", async ({ recipientId }) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
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
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
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

    // Admin: fetch full chat history for a given room
    socket.on("admin-get-chat-history", async ({ roomId, limit = 100, offset = 0 }) => {
      try {
        if (userRole !== 'admin') {
          socket.emit("error", { message: "Unauthorized" });
          return;
        }

        const [chatHistory, participants] = await Promise.all([
          chatModel.getChatHistory(roomId, limit, offset),
          chatModel.getRoomParticipants(roomId),
        ]);

        if (participants) {
          [participants.user1_avatar, participants.user2_avatar] = await Promise.all([
            createPresignedUrl(participants.user1_avatar),
            createPresignedUrl(participants.user2_avatar),
          ]);
        }

        socket.emit("admin-chat-history", {
          roomId,
          chatHistory: chatHistory || [],
          offset,
          hasMore: chatHistory.length === limit,
          participants,
        });
      } catch (error) {
        console.error("Error fetching admin chat history:", error);
        socket.emit("error", { message: "Failed to fetch chat history" });
      }
    });

    // Mark a single notification as read
    socket.on("read-notification", async ({ notificationId }) => {
      try {
        const updated = await chatModel.markNotificationAsRead(notificationId, userId);
        if (updated) {
          const unreadCount = await chatModel.getUnreadCount(userId);
          socket.emit("unread-count", { count: unreadCount });
        }
      } catch (error) {
        console.error("Error marking notification as read:", error);
        socket.emit("error", { message: "Failed to mark notification as read" });
      }
    });

    // Mark all notifications as read
    socket.on("read-all-notifications", async () => {
      try {
        await chatModel.markAllNotificationsAsRead(userId);
        socket.emit("unread-count", { count: 0 });
      } catch (error) {
        console.error("Error marking all notifications as read:", error);
        socket.emit("error", { message: "Failed to mark all notifications as read" });
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
        // Resolve the user's best display name. The JWT's `name` is often the
        // raw user_name handle (or NULL for legacy accounts) — fall back to
        // full_name where available so chat labels read like real people.
        const resolved = await chatModel.getDisplayName(userId);
        if (resolved && resolved !== username) {
          username = resolved;
          socket.user.name = resolved;
        }

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

        // Send top 5 unread notifications to the user on connect
        const recentNotifications = await chatModel.getRecentNotifications(userId, 5);
        const notificationsWithImages = await Promise.all(
          recentNotifications.map(async (notif) => ({
            id: notif.id,
            event_type: notif.event_type,
            title: notif.title,
            body: notif.body,
            action_type: notif.action_type,
            action_route: notif.action_route,
            is_read: notif.is_read,
            created_at: notif.created_at,
            sender_name: notif.sender_name || null,
            sender_image: notif.sender_image ? await createPresignedUrl(notif.sender_image) : null,
          }))
        );
        socket.emit("initial_notifications", notificationsWithImages);

        // Admin setup: join the support-admins broadcast room and receive initial inbox
        if (userRole === 'admin') {
          const hasPermission = await chatModel.adminHasChatPermission(userId);
          if (hasPermission) {
            socket.join('support-admins');

            const rooms = await chatModel.getSupportRoomsForAdmin(userId);
            const enhanced = await Promise.all(rooms.map(async (room) => ({
              ...room,
              user_avatar: room.user_avatar ? await createPresignedUrl(room.user_avatar) : null,
            })));
            socket.emit('support-rooms-list', { rooms: enhanced });

            const supportUnread = await chatModel.getSupportUnreadCountTotal(userId);
            socket.emit('support-unread-count', { count: supportUnread });
          }
        }

      } catch (error) {
        console.error("Error on connection setup:", error);
      }
    })();

  });
};

//add another event for project creattion

module.exports = { chatController };
