const chatModel = require("../model/chatmodel");
const redis = require("../config/reddis");
const { createPresignedUrl } = require("../utils/helper");
const { sendOfferSentEmail, sendOfferReceivedEmail, sendHireRequestEmail, sendHireRequestReceivedEmail } = require("../utils/offerEmails");

// Save a web notification to DB and emit live to recipient if online.
// For new_message: skips save and emit entirely if recipient is already in that chat room.
async function emitWebNotification(io, recipientId, senderId, eventType, title, body, actionType = 'none', actionRoute = null) {
  try {
    if (eventType === 'new_message') {
      const recipientActiveRoom = await redis.get(`user:${recipientId}:activeRoom`);
      if (recipientActiveRoom === actionRoute) return;
    }

    const savedNotif = await chatModel.saveWebNotification(
      recipientId, senderId, eventType, title, body, actionType, actionRoute
    );
    const recipientSocketId = await redis.get(`user:${recipientId}:socketId`);
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
      });
    }
  } catch (error) {
    console.error("Error emitting web notification:", error);
  }
}

const chatController = (io) => {
  io.on("connection", (socket) => {
    const userId = socket.user.user_id;
    const username = socket.user.name;
    const userRole = socket.user.role;
    const roleWiseId = socket.user.roleWiseId;

    console.log(`User connected: ${username} (${userId})`);


    // ========== SUPPORT CHAT HANDLER ==========
    socket.on("contact-support", async () => {
      try {
        console.log(`${username} (${userId}) is contacting support`);

        // Admins cannot contact support
        if (userRole === 'admin') {
          socket.emit("error", { message: "Admins cannot contact support" });
          return;
        }

        // Check for existing assignment
        let assignment = await chatModel.getSupportAssignment(userId);

        if (assignment) {
          // Existing assignment found - reuse same admin and room
          console.log(`Existing support assignment found for user ${userId}: admin=${assignment.admin_id}, room=${assignment.room_id}`);

          const chatRoomId = assignment.room_id;
          const adminId = assignment.admin_id;

          // Leave previous rooms and join support room
          for (const room of socket.rooms) {
            if (room !== socket.id) socket.leave(room);
          }
          socket.join(chatRoomId);
          await redis.set(`user:${userId}:activeRoom`, chatRoomId, "EX", 3600);

          // Get chat history and participants
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

          await chatModel.markMessagesAsRead(chatRoomId, userId);

          socket.emit("support-chat-joined", {
            chatRoomId,
            adminId,
            chatHistory: chatHistory || [],
            participants,
            isNewAssignment: false,
          });

          const unreadCount = await chatModel.getUnreadCount(userId);
          socket.emit("unread-count", { count: unreadCount });

          console.log(`${username} rejoined existing support chat: ${chatRoomId}`);
        } else {
          // No existing assignment - perform load balancing
          console.log(`No existing assignment for user ${userId}, assigning admin...`);

          const adminIds = await chatModel.getAllAdminIds();
          if (!adminIds || adminIds.length === 0) {
            socket.emit("error", { message: "No admins available at the moment. Please try again later." });
            return;
          }

          // Query Redis for each admin's assignment count
          const adminCounts = await Promise.all(
            adminIds.map(async (adminId) => {
              const count = await redis.get(`admin:${adminId}:assigned_count`);
              return { adminId, count: parseInt(count) || 0 };
            })
          );

          // Select admin with minimum count
          adminCounts.sort((a, b) => a.count - b.count);
          const selectedAdmin = adminCounts[0].adminId;

          console.log(`Selected admin ${selectedAdmin} with count ${adminCounts[0].count}`);

          // Increment counter
          await redis.incr(`admin:${selectedAdmin}:assigned_count`);

          // Create chat room with standard format
          const [smallerId, largerId] = [userId, selectedAdmin].sort((a, b) => a - b);
          const roomId = `${smallerId}-${largerId}`;
          await chatModel.getOrCreateSupportChatRoom(userId, selectedAdmin);

          // Save assignment
          await chatModel.createSupportAssignment(userId, selectedAdmin, roomId);

          // Join room
          for (const room of socket.rooms) {
            if (room !== socket.id) socket.leave(room);
          }
          socket.join(roomId);
          await redis.set(`user:${userId}:activeRoom`, roomId, "EX", 3600);

          // Get participants
          const [chatHistory, participants] = await Promise.all([
            chatModel.getChatHistory(roomId),
            chatModel.getRoomParticipants(roomId),
          ]);

          if (participants) {
            [participants.user1_avatar, participants.user2_avatar] = await Promise.all([
              createPresignedUrl(participants.user1_avatar),
              createPresignedUrl(participants.user2_avatar),
            ]);
          }

          socket.emit("support-chat-joined", {
            chatRoomId: roomId,
            adminId: selectedAdmin,
            chatHistory: chatHistory || [],
            participants,
            isNewAssignment: true,
          });

          // Notify the assigned admin
          const adminSocketId = await redis.get(`user:${selectedAdmin}:socketId`);
          if (adminSocketId) {
            io.to(adminSocketId).emit("new-support-request", {
              userId,
              username,
              roomId,
              message: `${username} has contacted support and been assigned to you.`,
            });
          }

          await emitWebNotification(
            io,
            selectedAdmin,
            userId,
            'support_request',
            'New Support Request',
            `${username} needs support assistance.`,
            'link',
            roomId
          );

          console.log(`Support assignment created: user=${userId}, admin=${selectedAdmin}, room=${roomId}`);
        }
      } catch (error) {
        console.error("Error handling contact-support:", error);
        socket.emit("error", { message: "Failed to contact support" });
      }
    });

    // Admin: Proactively initiate chat with any user
    socket.on("admin-initiate-chat", async ({ userId: targetUserId }) => {
      try {
        console.log(`[admin-initiate-chat] START - Admin: ${username} (ID: ${userId}), Target User: ${targetUserId}`);

        if (userRole !== 'admin') {
          console.log(`[admin-initiate-chat] REJECTED - User ${userId} is not an admin (role: ${userRole})`);
          socket.emit("error", { message: "Only admins can initiate support chats" });
          return;
        }

        console.log(`[admin-initiate-chat] Admin ${username} (${userId}) initiating chat with user ${targetUserId}`);

        // Validate target user exists and is not an admin
        const targetUserRole = await chatModel.getUserRole(targetUserId);
        console.log(`[admin-initiate-chat] Target user ${targetUserId} role: ${targetUserRole}`);

        if (!targetUserRole) {
          console.log(`[admin-initiate-chat] REJECTED - Target user ${targetUserId} not found`);
          socket.emit("error", { message: "User not found" });
          return;
        }

        if (targetUserRole === 'admin') {
          console.log(`[admin-initiate-chat] REJECTED - Cannot contact another admin (target: ${targetUserId})`);
          socket.emit("error", { message: "Cannot initiate support chat with another admin" });
          return;
        }

        // Check if assignment already exists
        let assignment = await chatModel.getSupportAssignment(targetUserId);
        console.log(`[admin-initiate-chat] Existing assignment check:`, assignment ? `Found - admin_id: ${assignment.admin_id}, room_id: ${assignment.room_id}` : 'None');

        if (!assignment) {
          // Create new assignment - admin proactively reaching out
          console.log(`[admin-initiate-chat] Creating NEW support assignment: user=${targetUserId}, admin=${userId}`);

          // Increment admin counter
          const newCount = await redis.incr(`admin:${userId}:assigned_count`);
          console.log(`[admin-initiate-chat] Admin counter incremented. New count: ${newCount}`);

          // Create chat room with standard format
          const [smallerId, largerId] = [targetUserId, userId].sort((a, b) => a - b);
          const roomId = `${smallerId}-${largerId}`;
          console.log(`[admin-initiate-chat] Creating chat room: ${roomId}`);
          await chatModel.getOrCreateSupportChatRoom(targetUserId, userId);

          // Save assignment
          assignment = await chatModel.createSupportAssignment(targetUserId, userId, roomId);
          console.log(`[admin-initiate-chat] Assignment created:`, { user_id: assignment.user_id, admin_id: assignment.admin_id, room_id: assignment.room_id });
        } else {
          // Assignment exists - verify it's assigned to this admin
          if (assignment.admin_id !== userId) {
            console.log(`[admin-initiate-chat] REJECTED - User ${targetUserId} already assigned to admin ${assignment.admin_id}, requester is ${userId}`);
            socket.emit("error", { message: "This user is already assigned to another admin" });
            return;
          }
          console.log(`[admin-initiate-chat] Using EXISTING assignment for user ${targetUserId}`);
        }

        const chatRoomId = assignment.room_id;
        console.log(`[admin-initiate-chat] Chat room ID: ${chatRoomId}`);

        // Leave previous rooms and join support room
        const previousRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        console.log(`[admin-initiate-chat] Admin leaving previous rooms:`, previousRooms);
        for (const room of socket.rooms) {
          if (room !== socket.id) socket.leave(room);
        }

        socket.join(chatRoomId);
        console.log(`[admin-initiate-chat] Admin joined socket room: ${chatRoomId}`);

        await redis.set(`user:${userId}:activeRoom`, chatRoomId, "EX", 3600);
        console.log(`[admin-initiate-chat] Set Redis activeRoom for admin ${userId}: ${chatRoomId}`);

        // Get chat history and participants
        console.log(`[admin-initiate-chat] Fetching chat history and participants for room: ${chatRoomId}`);
        const [chatHistory, participants] = await Promise.all([
          chatModel.getChatHistory(chatRoomId),
          chatModel.getRoomParticipants(chatRoomId),
        ]);
        console.log(`[admin-initiate-chat] Chat history: ${chatHistory?.length || 0} messages`);
        console.log(`[admin-initiate-chat] Participants:`, participants);

        if (participants) {
          [participants.user1_avatar, participants.user2_avatar] = await Promise.all([
            createPresignedUrl(participants.user1_avatar),
            createPresignedUrl(participants.user2_avatar),
          ]);
          console.log(`[admin-initiate-chat] Avatar URLs generated for participants`);
        }

        await chatModel.markMessagesAsRead(chatRoomId, userId);
        console.log(`[admin-initiate-chat] Marked messages as read for admin ${userId}`);

        const responseData = {
          chatRoomId,
          targetUserId,
          chatHistory: chatHistory || [],
          participants,
          isAdminInitiated: true,
        };
        console.log(`[admin-initiate-chat] Emitting 'support-chat-joined' to admin with data:`, {
          chatRoomId: responseData.chatRoomId,
          targetUserId: responseData.targetUserId,
          historyCount: responseData.chatHistory.length,
          hasParticipants: !!responseData.participants,
          isAdminInitiated: responseData.isAdminInitiated
        });
        socket.emit("support-chat-joined", responseData);

        const unreadCount = await chatModel.getUnreadCount(userId);
        console.log(`[admin-initiate-chat] Admin unread count: ${unreadCount}`);
        socket.emit("unread-count", { count: unreadCount });

        // Notify the target user that admin wants to chat
        const targetSocketId = await redis.get(`user:${targetUserId}:socketId`);
        console.log(`[admin-initiate-chat] Target user socket ID:`, targetSocketId || 'Not online');

        if (targetSocketId) {
          const notificationData = {
            adminId: userId,
            adminName: username,
            roomId: chatRoomId,
            message: `${username} from support wants to chat with you.`,
          };
          console.log(`[admin-initiate-chat] Emitting 'admin-contacted-you' to target user`, notificationData);
          io.to(targetSocketId).emit("admin-contacted-you", notificationData);
        } else {
          console.log(`[admin-initiate-chat] Target user ${targetUserId} not online, skipping socket notification`);
        }

        console.log(`[admin-initiate-chat] Creating web notification for user ${targetUserId}`);
        await emitWebNotification(
          io,
          targetUserId,
          userId,
          'admin_contact',
          'Support Reaching Out',
          `${username} from support wants to chat with you.`,
          'link',
          chatRoomId
        );

        console.log(`[admin-initiate-chat] SUCCESS - Admin ${username} (${userId}) initiated/joined support chat: ${chatRoomId}`);
      } catch (error) {
        console.error(`[admin-initiate-chat] ERROR - Admin ${userId}, Target ${targetUserId}:`, error);
        socket.emit("error", { message: "Failed to initiate support chat" });
      }
    });

    // Admin: Join support chat room (allows admin to view their assigned support chats)
    socket.on("admin-join-support-chat", async ({ userId: supportUserId }) => {
      try {
        console.log(`[admin-join-support-chat] START - Admin: ${username} (ID: ${userId}), Support User: ${supportUserId}`);

        if (userRole !== 'admin') {
          console.log(`[admin-join-support-chat] REJECTED - User ${userId} is not an admin (role: ${userRole})`);
          socket.emit("error", { message: "Only admins can access support chats" });
          return;
        }

        console.log(`[admin-join-support-chat] Checking assignment for user ${supportUserId}`);
        const assignment = await chatModel.getSupportAssignment(supportUserId);
        console.log(`[admin-join-support-chat] Assignment:`, assignment || 'None found');

        if (!assignment) {
          console.log(`[admin-join-support-chat] REJECTED - No assignment found for user ${supportUserId}`);
          socket.emit("error", { message: "No support assignment found for this user" });
          return;
        }

        if (assignment.admin_id !== userId) {
          console.log(`[admin-join-support-chat] REJECTED - User ${supportUserId} assigned to admin ${assignment.admin_id}, requester is ${userId}`);
          socket.emit("error", { message: "This support chat is assigned to another admin" });
          return;
        }

        const chatRoomId = assignment.room_id;
        console.log(`[admin-join-support-chat] Assignment verified. Room ID: ${chatRoomId}`);

        // Leave previous rooms
        const previousRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        console.log(`[admin-join-support-chat] Admin leaving previous rooms:`, previousRooms);
        for (const room of socket.rooms) {
          if (room !== socket.id) socket.leave(room);
        }

        socket.join(chatRoomId);
        console.log(`[admin-join-support-chat] Admin joined socket room: ${chatRoomId}`);

        await redis.set(`user:${userId}:activeRoom`, chatRoomId, "EX", 3600);
        console.log(`[admin-join-support-chat] Set Redis activeRoom for admin ${userId}: ${chatRoomId}`);

        console.log(`[admin-join-support-chat] Fetching chat history and participants for room: ${chatRoomId}`);
        const [chatHistory, participants] = await Promise.all([
          chatModel.getChatHistory(chatRoomId),
          chatModel.getRoomParticipants(chatRoomId),
        ]);
        console.log(`[admin-join-support-chat] Chat history: ${chatHistory?.length || 0} messages`);
        console.log(`[admin-join-support-chat] Participants:`, participants);

        if (participants) {
          [participants.user1_avatar, participants.user2_avatar] = await Promise.all([
            createPresignedUrl(participants.user1_avatar),
            createPresignedUrl(participants.user2_avatar),
          ]);
          console.log(`[admin-join-support-chat] Avatar URLs generated for participants`);
        }

        await chatModel.markMessagesAsRead(chatRoomId, userId);
        console.log(`[admin-join-support-chat] Marked messages as read for admin ${userId}`);

        const responseData = {
          chatRoomId,
          supportUserId,
          chatHistory: chatHistory || [],
          participants,
        };
        console.log(`[admin-join-support-chat] Emitting 'support-chat-joined' to admin with data:`, {
          chatRoomId: responseData.chatRoomId,
          supportUserId: responseData.supportUserId,
          historyCount: responseData.chatHistory.length,
          hasParticipants: !!responseData.participants
        });
        socket.emit("support-chat-joined", responseData);

        const unreadCount = await chatModel.getUnreadCount(userId);
        console.log(`[admin-join-support-chat] Admin unread count: ${unreadCount}`);
        socket.emit("unread-count", { count: unreadCount });

        console.log(`[admin-join-support-chat] SUCCESS - Admin ${username} (${userId}) joined support chat: ${chatRoomId}`);
      } catch (error) {
        console.error(`[admin-join-support-chat] ERROR - Admin ${userId}, Support User ${supportUserId}:`, error);
        socket.emit("error", { message: "Failed to join support chat" });
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
        console.log(`Chat history for room ${chatRoomId}:`, chatHistory);

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
            `${username} has sent you a hire request.`,
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
                chatRoomId,
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

        console.log(`Message saved: ${username} to ${recipientId}`);
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

        // // await sendMessageNotification(io, recipientId, userId, username, "Package rejected", chatRoomId);
        // await emitNotification(io, recipientId, `Package revoked by ${username}`, "A custom package sent to you has been revoked", 'info', { chatRoomId, packageId });

        console.log(`Package ${packageId} revoked by ${username} (${userId})`);
      } catch (error) {
        console.error("Error revoking package:", error);
        socket.emit("error", { message: "Failed to revoke package" });
      }
    });

    socket.on("deadline-extension-request", async (extensionData, recipientId) => {
      try {
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

        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
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

        await emitWebNotification(io, recipientId, userId, 'deadline_extension_accepted',
          'Deadline Extension Accepted',
          `${username} has accepted your deadline extension request.`,
          'link', chatRoomId
        );

        console.log(`Deadline extension ${requestId} accepted by ${username} (${userId})`);
      } catch (error) {
        console.error("Error accepting deadline extension:", error);
        socket.emit("error", { message: "Failed to accept deadline extension" });
      }
    });

    socket.on("reject-deadline-extension", async (requestId, recipientId) => {
      try {
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
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

        await emitWebNotification(io, recipientId, userId, 'deadline_extension_rejected',
          'Deadline Extension Rejected',
          `${username} has rejected your deadline extension request.`,
          'link', chatRoomId
        );

        console.log(`Deadline extension ${requestId} rejected by ${username} (${userId})`);
      } catch (error) {
        console.error("Error rejecting deadline extension:", error);
        socket.emit("error", { message: "Failed to reject deadline extension" });
      }
    });
    // Send a message
    socket.on("send-message", async ({ recipientId, message }) => {
      try {
        console.log(`[send-message] User ${username} (${userId}, role: ${userRole}) sending to ${recipientId}`);

        // Standard room ID format for all chats (regular and support)
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;
        console.log(`[send-message] Using chat room: ${chatRoomId}`);

        const messageType = "text";

        // Save message to database
        console.log(`[send-message] Saving message to room: ${chatRoomId}`);
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
        console.log(`[send-message] Message saved to database:`, { id: messageData.id, chatRoomId: messageData.chatRoomId, sender: messageData.senderId });

        // Send message to the chat room (both users)
        io.to(chatRoomId).emit("receive-message", messageData);
        console.log(`[send-message] Message emitted to room: ${chatRoomId}`);

        await emitWebNotification(io, recipientId, userId, 'new_message', 'New Message', `You have received a new message from ${username}`, 'link', chatRoomId);

        console.log(`[send-message] SUCCESS - Message saved: ${username} to ${recipientId} in room ${chatRoomId}`);
      } catch (error) {
        console.error(`[send-message] ERROR - Sender ${userId}, Recipient ${recipientId}:`, error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Send a file message (image, video, audio, document)
    socket.on("send-file-message", async ({ recipientId, file_url, object_name, filename, file_size, file_type, message }) => {
      try {
        console.log(`[send-file-message] User ${username} (${userId}) sending file to ${recipientId}`);

        // Standard room ID format for all chats (regular and support)
        const [smallerId, largerId] = [userId, recipientId].sort((a, b) => parseInt(a) - parseInt(b));
        const chatRoomId = `${smallerId}-${largerId}`;
        console.log(`[send-file-message] Using chat room: ${chatRoomId}`);

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
        console.log(`[send-file-message] Saving file message to room: ${chatRoomId}`);
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
        console.log(`[send-file-message] File message saved to database:`, {
          id: messageData.id,
          chatRoomId: messageData.chatRoomId,
          sender: messageData.senderId,
          file_type: messageType
        });

        // Send message to the chat room (both users)
        io.to(chatRoomId).emit("receive-file-message", messageData);
        console.log(`[send-file-message] File message emitted to room: ${chatRoomId}`);

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
        socket.emit("initial_notifications", recentNotifications.map(notif => ({
          id: notif.id,
          event_type: notif.event_type,
          title: notif.title,
          body: notif.body,
          action_type: notif.action_type,
          action_route: notif.action_route,
          is_read: notif.is_read,
          created_at: notif.created_at,
        })));

      } catch (error) {
        console.error("Error on connection setup:", error);
      }
    })();

  });
};

//add another event for project creattion

module.exports = { chatController };
