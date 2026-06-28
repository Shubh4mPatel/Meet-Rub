const pool = require("../config/dbConfig");
const { logger } = require("../utils/logger");
const { createDownloadablePresignedUrl } = require("../utils/helper");

const chatModel = {
  // Create or get user
  async GetUser(userId, username) {
    const query = `
      SELECT * FROM users WHERE id=$1
    `;

    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error("Error creating/updating user:", error);
      throw error;
    }
  },

  // Get or create chat room
  async getOrCreateChatRoom(user1Id, user2Id) {
    // Ensure user1Id is always less than user2Id for consistency
    const [smallerId, largerId] = [user1Id, user2Id].sort((a, b) => a - b);
    const roomId = `${smallerId}-${largerId}`;

    const query = `
      INSERT INTO chat_rooms (room_id, user1_id, user2_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (room_id) 
      DO UPDATE SET room_id = EXCLUDED.room_id
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [roomId, smallerId, largerId]);
      return result.rows[0];
    } catch (error) {
      console.error("Error creating/getting chat room:", error);
      throw error;
    }
  },

  // Save message
  async saveMessage(
    roomId,
    senderId,
    recipientId,
    message,
    messageType = "text",
    custom_package_id = null,
    deadline_extension_id = null,
    file_url = null
  ) {
    const query = `
      INSERT INTO messages (room_id, sender_id, recipient_id, message, message_type, custom_package_id, deadline_extension_id, file_url, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        roomId,
        senderId,
        recipientId,
        message,
        messageType,
        custom_package_id,
        deadline_extension_id,
        file_url,
        new Date().toISOString(),
      ]);
      return result.rows[0];
    } catch (error) {
      console.error("Error saving message:", error);
      throw error;
    }
  },

  // Get chat history
  async getChatHistory(roomId, limit = 50, offset = 0) {
    const query = `
     SELECT
    m.id,
    m.room_id,
    m.sender_id,
    m.recipient_id,
    m.message,
    m.message_type,
    m.is_read,
    m.created_at,
    m.deadline_extension_id,
    m.custom_package_id,
    m.file_url,
    COALESCE(a.full_name, c.full_name, f.freelancer_full_name, c.user_name, f.user_name, u.user_name) as sender_username,
    CASE
        WHEN f.freelancer_id IS NOT NULL THEN 'freelancer'
        WHEN c.creator_id IS NOT NULL THEN 'creator'
        WHEN a.id IS NOT NULL THEN 'admin'
    END as sender_type,
    der.project_id as der_project_id,
    der.freelancer_id as der_freelancer_id,
    der.creator_id as der_creator_id,
    der.chat_room_id as der_chat_room_id,
    der.days as der_days,
    der.hours as der_hours,
    der.status as der_status,
    der.requested_at as der_requested_at,
    der.approved_at as der_approved_at,
    der.expires_at as der_expires_at,
    dp.status as der_project_status,
    dp.amount as der_project_amount,
    dp.end_date as der_project_end_date,
    ds.service_name as der_service_name,
    ds.plan_type as der_plan_type,
    ds.delivery_time as der_delivery_time,
    cp.id as cp_id,
    cp.room_id as cp_room_id,
    cp.freelancer_id as cp_freelancer_id,
    cp.creator_id as cp_creator_id,
    cp.plan_type as cp_plan_type,
    cp.price as cp_price,
    cp.units as cp_units,
    cp.package_type as cp_package_type,
    cp.status as cp_status,
    cp.delivery_days as cp_delivery_days,
    cp.delivery_time as cp_delivery_time,
    cp.reason_for_revoke as cp_reason_for_revoke,
    cp.reason_for_rejection as cp_reason_for_rejection,
    cp.service_id as cp_service_id,
    cp.service_type as cp_service_type,
    cp.initiator_role as cp_initiator_role,
    cp.expires_at as cp_expires_at,
    cp.created_at as cp_created_at,
    cp_proj.id AS cp_project_id,
    cp_proj.status AS cp_project_status,
    pr_lat.id as pr_id,
    pr_lat.project_id as pr_project_id,
    pr_lat.days as pr_days,
    pr_lat.hours as pr_hours,
    pr_lat.new_end_date as pr_new_end_date,
    pr_lat.requested_at as pr_requested_at,
    pr_proj.id as pr_proj_id,
    pr_proj.status as pr_proj_status,
    pr_proj.amount as pr_proj_amount,
    pr_proj.end_date as pr_proj_end_date,
    pr_serv.service_name as pr_service_name
FROM messages m
LEFT JOIN users u ON m.sender_id = u.id
LEFT JOIN freelancer f ON m.sender_id = f.user_id
LEFT JOIN creators c ON m.sender_id = c.user_id
LEFT JOIN admin a ON m.sender_id = a.user_id
LEFT JOIN deadline_extension_requested der ON m.deadline_extension_id = der.id
LEFT JOIN projects dp ON der.project_id = dp.id
LEFT JOIN services ds ON dp.service_id = ds.id
LEFT JOIN custom_packages cp ON m.custom_package_id = cp.id
LEFT JOIN projects cp_proj ON cp.id = cp_proj.custom_package_id
LEFT JOIN LATERAL (
    SELECT id, project_id, days, hours, new_end_date, requested_at
    FROM project_revisions
    WHERE chat_room_id = m.room_id
    AND ABS(EXTRACT(EPOCH FROM (requested_at - m.created_at))) < 10
    ORDER BY requested_at DESC
    LIMIT 1
) pr_lat ON m.message_type = 'revision'
LEFT JOIN projects pr_proj ON pr_lat.project_id = pr_proj.id
LEFT JOIN services pr_serv ON pr_proj.service_id = pr_serv.id
WHERE m.room_id = $1
ORDER BY m.created_at DESC
LIMIT $2 OFFSET $3;
    `;

    try {
      const result = await pool.query(query, [roomId, limit, offset]);

      // Reverse to oldest-first and map to camelCase to match real-time message format
      const messages = result.rows.reverse().map((row) => ({
        id: row.id,
        chatRoomId: row.room_id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        message: row.message,
        message_type: row.message_type || "text",
        isRead: row.is_read,
        timestamp: row.created_at,
        created_at: row.created_at,
        senderUsername: row.sender_username,
        file_url: row.file_url || null,
        deadlineExtension: row.deadline_extension_id
          ? {
            id: row.deadline_extension_id,
            project_id: row.der_project_id,
            freelancer_id: row.der_freelancer_id,
            creator_id: row.der_creator_id,
            chat_room_id: row.der_chat_room_id,
            days: row.der_days,
            hours: row.der_hours,
            status: row.der_status,
            requested_at: row.der_requested_at,
            approved_at: row.der_approved_at,
            expires_at: row.der_expires_at,
          }
          : null,
        revision: row.pr_id
          ? {
            id: row.pr_id,
            project_id: row.pr_project_id,
            days: row.pr_days,
            hours: row.pr_hours,
            new_end_date: row.pr_new_end_date,
            requested_at: row.pr_requested_at,
          }
          : null,
        project: row.pr_id
          ? {
            id: row.pr_proj_id,
            status: row.pr_proj_status,
            amount: row.pr_proj_amount,
            end_date: row.pr_proj_end_date,
            service_name: row.pr_service_name,
          }
          : (row.deadline_extension_id
          ? {
            id: row.der_project_id,
            status: row.der_project_status,
            amount: row.der_project_amount,
            end_date: row.der_project_end_date,
            service_name: row.der_service_name,
            plan_type: row.der_plan_type,
            delivery_time: row.der_delivery_time,
          }
          : null),
        customPackage: row.custom_package_id
          ? {
            id: row.cp_id,
            room_id: row.cp_room_id,
            freelancer_id: row.cp_freelancer_id,
            creator_id: row.cp_creator_id,
            plan_type: row.cp_plan_type,
            price: row.cp_price,
            units: row.cp_units,
            package_type: row.cp_package_type,
            status: row.cp_status,
            delivery_days: row.cp_delivery_days,
            delivery_time: row.cp_delivery_time,
            reason_for_revoke: row.cp_reason_for_revoke,
            reason_for_rejection: row.cp_reason_for_rejection,
            service_id: row.cp_service_id,
            service_type: row.cp_service_type,
            initiator_role: row.cp_initiator_role,
            expires_at: row.cp_expires_at,
            created_at: row.cp_created_at,
            project_id: row.cp_project_id || null,
            project_status: row.cp_project_status || null,
          }
          : null,
      }));

      // Generate downloadable presigned URLs for file messages
      const messagesWithPresignedUrls = await Promise.all(
        messages.map(async (msg) => {
          if (msg.file_url && msg.message_type !== 'text') {
            // Extract filename from file_url path or use a default
            const pathParts = msg.file_url.split('/');
            const filenameWithTimestamp = pathParts[pathParts.length - 1];
            // Remove timestamp prefix (e.g., "1714723800000-abc123-document.pdf" -> "document.pdf")
            const filenameParts = filenameWithTimestamp.split('-');
            const filename = filenameParts.slice(2).join('-') || 'download';

            msg.file_url = await createDownloadablePresignedUrl(msg.file_url, filename);
          }
          return msg;
        })
      );

      return messagesWithPresignedUrls;
    } catch (error) {
      console.error("Error getting chat history:", error);
      throw error;
    }
  },

  // Get user's all chat rooms with last message.
  // Excludes any room registered in support_rooms — those are surfaced
  // through the dedicated support inbox instead.
  async getUserChatRooms(userId) {
    const query = `
SELECT
  cr.room_id as id,
  cr.room_id,
  cr.user1_id,
  cr.user2_id,
  cr.created_at as room_created_at,
  COALESCE(f1.user_name, c1.user_name, CASE WHEN a1.id IS NOT NULL THEN 'Chat Support' ELSE NULL END) as user1_name,
  COALESCE(f2.user_name, c2.user_name, CASE WHEN a2.id IS NOT NULL THEN 'Chat Support' ELSE NULL END) as user2_name,
  COALESCE(f1.profile_image_url, c1.profile_image_url) as user1_profile_image_url,
  COALESCE(f2.profile_image_url, c2.profile_image_url) as user2_profile_image_url,
  CASE
    WHEN f1.freelancer_id IS NOT NULL THEN 'freelancer'
    WHEN c1.creator_id IS NOT NULL THEN 'creator'
    WHEN a1.id IS NOT NULL THEN 'admin'
    ELSE NULL
  END as user1_role,
  CASE
    WHEN f2.freelancer_id IS NOT NULL THEN 'freelancer'
    WHEN c2.creator_id IS NOT NULL THEN 'creator'
    WHEN a2.id IS NOT NULL THEN 'admin'
    ELSE NULL
  END as user2_role,
  m.message as last_message,
  m.created_at as last_message_time,
  m.sender_id as last_message_sender,
  COALESCE(unread.unread_count, 0) as unread_count
FROM chat_rooms cr
LEFT JOIN freelancer f1 ON cr.user1_id = f1.user_id
LEFT JOIN creators c1 ON cr.user1_id = c1.user_id
LEFT JOIN admin a1 ON cr.user1_id = a1.user_id
LEFT JOIN freelancer f2 ON cr.user2_id = f2.user_id
LEFT JOIN creators c2 ON cr.user2_id = c2.user_id
LEFT JOIN admin a2 ON cr.user2_id = a2.user_id
LEFT JOIN LATERAL (
  SELECT message, created_at, sender_id
  FROM messages
  WHERE room_id = cr.room_id
  ORDER BY created_at DESC
  LIMIT 1
) m ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) as unread_count
  FROM messages
  WHERE room_id = cr.room_id
    AND recipient_id = $1
    AND is_read = FALSE
) unread ON true
WHERE (cr.user1_id = $1 OR cr.user2_id = $1)
  AND NOT EXISTS (SELECT 1 FROM support_rooms sr WHERE sr.room_id = cr.room_id)
ORDER BY m.created_at DESC NULLS LAST; `;
    try {
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error("Error getting user chat rooms:", error);
      throw error;
    }
  },

  async getRoomParticipants(roomId) {
    const query = `
      SELECT
        cr.user1_id,
        cr.user2_id,
        COALESCE(f1.user_name, c1.user_name, CASE WHEN a1.id IS NOT NULL THEN 'Chat Support' ELSE NULL END) AS user1_name,
        COALESCE(f2.user_name, c2.user_name, CASE WHEN a2.id IS NOT NULL THEN 'Chat Support' ELSE NULL END) AS user2_name,
        COALESCE(f1.profile_image_url, c1.profile_image_url) AS user1_avatar,
        COALESCE(f2.profile_image_url, c2.profile_image_url) AS user2_avatar,
        CASE
          WHEN f1.freelancer_id IS NOT NULL THEN 'freelancer'
          WHEN c1.creator_id IS NOT NULL THEN 'creator'
          WHEN a1.id IS NOT NULL THEN 'admin'
          ELSE NULL
        END AS user1_role,
        CASE
          WHEN f2.freelancer_id IS NOT NULL THEN 'freelancer'
          WHEN c2.creator_id IS NOT NULL THEN 'creator'
          WHEN a2.id IS NOT NULL THEN 'admin'
          ELSE NULL
        END AS user2_role
      FROM chat_rooms cr
      LEFT JOIN freelancer f1 ON cr.user1_id = f1.user_id
      LEFT JOIN creators   c1 ON cr.user1_id = c1.user_id
      LEFT JOIN admin      a1 ON cr.user1_id = a1.user_id
      LEFT JOIN freelancer f2 ON cr.user2_id = f2.user_id
      LEFT JOIN creators   c2 ON cr.user2_id = c2.user_id
      LEFT JOIN admin      a2 ON cr.user2_id = a2.user_id
      WHERE cr.room_id = $1
    `;
    try {
      const result = await pool.query(query, [roomId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting room participants:", error);
      throw error;
    }
  },

  // Mark messages as read
  async markMessagesAsRead(roomId, userId) {
    const query = `
      UPDATE messages
      SET is_read = TRUE
      WHERE room_id = $1 
        AND recipient_id = $2 
        AND is_read = FALSE
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [roomId, userId]);
      return result.rows;
    } catch (error) {
      console.error("Error marking messages as read:", error);
      throw error;
    }
  },

  // Get unread notification count
  async getUnreadCount(userId) {
    const query = `
      SELECT COUNT(*) as unread_count
      FROM web_notifications
      WHERE recipient_id = $1 AND is_read = FALSE
    `;

    try {
      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].unread_count);
    } catch (error) {
      console.error("Error getting unread count:", error);
      throw error;
    }
  },

  // Get total unread message count across all chat rooms
  async getTotalUnreadMessages(userId) {
    const query = `
      SELECT COUNT(*) AS unread_count
      FROM messages
      WHERE recipient_id = $1
        AND is_read = FALSE
    `;
    try {
      const result = await pool.query(query, [userId]);
      return parseInt(result.rows[0].unread_count);
    } catch (error) {
      console.error("Error getting total unread messages:", error);
      throw error;
    }
  },

  // Get unread message count for a specific chat room
  async getUnreadCountByRoom(userId, roomId) {
    const query = `
      SELECT COUNT(*) AS unread_count
      FROM messages
      WHERE room_id = $1
        AND recipient_id = $2
        AND is_read = FALSE
    `;
    try {
      const result = await pool.query(query, [roomId, userId]);
      return parseInt(result.rows[0].unread_count);
    } catch (error) {
      console.error("Error getting room unread count:", error);
      throw error;
    }
  },

  // Delete a message
  async deleteMessage(messageId, userId) {
    const query = `
      DELETE FROM messages
      WHERE id = $1 AND sender_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [messageId, userId]);
      return result.rows[0];
    } catch (error) {
      console.error("Error deleting message:", error);
      throw error;
    }
  },

  // Save custom package
  async saveCustomPackage(chatRoomId, userId, recipientId, packageData) {
    const {
      plan_type,
      price,
      units,
      package_type,
      delivery_days,
      delivery_time,
      service,
      service_type,
      status,
    } = packageData;

    // Determine which participant is the freelancer and which is the creator
    // Also fetch service_id by joining with services table using service name
    const roleCheck = await pool.query(
      `SELECT f.freelancer_id, f.user_id, s.id AS service_id
       FROM freelancer f
       LEFT JOIN services s ON s.freelancer_id = f.freelancer_id
         AND s.service_name = $3
       WHERE (f.user_id = $1 OR f.user_id = $2)`,
      [userId, recipientId, service_type]
    );

    const freelancerRow = roleCheck.rows[0];
    const service_id = freelancerRow?.service_id || null;
    let freelancerId, creatorUserId, initiator_role;

    logger.info(`Role check result for userId ${userId} and recipientId ${recipientId}:`, service_id);
    // freelancerRow.freelancer_id is the PK in the freelancer table (not user_id)
    // Use == to handle number/string type mismatch from socket vs DB
    if (freelancerRow?.user_id == userId) {
      freelancerId = freelancerRow.freelancer_id;
      creatorUserId = recipientId;
      initiator_role = "freelancer";
    } else {
      freelancerId = freelancerRow.freelancer_id;
      creatorUserId = userId;
      initiator_role = "creator";
    }

    // creator_id FK references the creators table PK, not user_id
    const creatorRow = await pool.query(
      `SELECT creator_id FROM creators WHERE user_id = $1`,
      [creatorUserId]
    );
    const creatorId = creatorRow.rows[0]?.creator_id;

    const query = `
      INSERT INTO custom_packages (
        room_id, freelancer_id, creator_id,
        plan_type, price, units, package_type, status, expires_at, created_at,
        delivery_days, delivery_time, service_id, service_type, initiator_role
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        chatRoomId,
        freelancerId,
        creatorId,
        plan_type,
        price,
        units,
        package_type,
        status || "pending",
        new Date(Date.now() + 24 * 7 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
        delivery_days != null ? parseInt(delivery_days) : null,
        delivery_time != null ? parseInt(delivery_time) : null,
        service_id,
        service_type,
        initiator_role,
      ]);
      logger.info("Custom package saved:", result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error("Error saving custom package:", error);
      throw error;
    }
  },

  // Accept custom package - update status to 'accepted'
  async acceptPackage(packageId, recipientId) {
    const query = `
      UPDATE custom_packages
      SET status = 'accepted',
          responded_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [packageId]);
      return result.rows[0];
    } catch (error) {
      console.error("Error accepting package:", error);
      throw error;
    }
  },

  // Reject custom package - update status to 'rejected'
  async rejectPackage(packageId, recipientId, reason) {
    const query = `
      UPDATE custom_packages
      SET status = 'rejected',
          reason_for_rejection = $2,
          responded_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [packageId, reason || null]);
      return result.rows[0];
    } catch (error) {
      console.error("Error rejecting package:", error);
      throw error;
    }
  },

  // Revoke custom package - only allowed if status is 'pending'
  async revokePackage(packageId, reason) {
    const query = `
      UPDATE custom_packages
      SET status = 'revoked',
          reason_for_revoke = $2,
          responded_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *
    `;
    try {
      const result = await pool.query(query, [packageId, reason || null]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error revoking package:", error);
      throw error;
    }
  },

  // Create a project from an accepted custom package.
  // end_date is intentionally left NULL here — it will be set once the creator pays.
  async createProjectFromPackage(pkg) {
    const query = `
      INSERT INTO projects (creator_id, freelancer_id, number_of_units, amount, status, end_date, service_id, custom_package_id)
      VALUES ($1, $2, $3, $4, 'CREATED', NULL, $5, $6)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        pkg.creator_id,
        pkg.freelancer_id,
        pkg.units || null,
        pkg.price,
        pkg.service_id || null,
        pkg.id
      ]);
      return result.rows[0];
    } catch (error) {
      console.error("Error creating project from package:", error);
      throw error;
    }
  },

  // Extend deadline on a custom package
  async extendDeadline(packageId, freelancerId, newDeliveryDays, newExpiresAt) {
    const query = `
      UPDATE custom_packages
      SET delivery_days = $3, expires_at = $4
      WHERE id = $1 AND freelancer_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        packageId,
        freelancerId,
        newDeliveryDays,
        newExpiresAt || null,
      ]);
      return result.rows[0];
    } catch (error) {
      console.error("Error extending deadline:", error);
      throw error;
    }
  },

  // Save deadline extension request
  async saveDeadlineExtensionRequest(
    chatRoomId,
    userId,
    recipientId,
    extensionData
  ) {
    const { project_id, days, hours } = extensionData;

    logger.info(
      `[saveDeadlineExtensionRequest] incoming chatRoomId=${chatRoomId} userId=${userId} recipientId=${recipientId} project_id=${project_id} days=${days} hours=${hours}`
    );

    // Relative-duration contract: extension is expressed as days + sub-day hours.
    // On acceptance, projects.end_date is set to NOW() + that interval.
    const daysInt = Number.parseInt(days, 10);
    const hoursInt = Number.parseInt(hours, 10);
    if (!Number.isFinite(daysInt) || !Number.isFinite(hoursInt)) {
      throw new Error('days and hours must be integers');
    }
    if (daysInt < 0 || hoursInt < 0 || hoursInt > 23) {
      throw new Error('Invalid duration: days >= 0, hours between 0 and 23');
    }
    if (daysInt === 0 && hoursInt === 0) {
      throw new Error('Extension duration must be greater than zero');
    }

    const roleCheck = await pool.query(
      `SELECT freelancer_id, user_id FROM freelancer WHERE user_id = $1 OR user_id = $2`,
      [userId, recipientId]
    );

    const freelancerRow = roleCheck.rows[0];
    if (!freelancerRow) throw new Error('No freelancer found for these users');

    const freelancerUserId = freelancerRow.user_id;
    const creatorUserId = freelancerUserId == userId ? recipientId : userId;

    const freelancerId = freelancerRow.freelancer_id;

    const creatorCheck = await pool.query(
      `SELECT creator_id FROM creators WHERE user_id = $1`,
      [creatorUserId]
    );
    if (!creatorCheck.rows[0]) throw new Error('No creator found for these users');
    const creatorId = creatorCheck.rows[0].creator_id;

    const query = `
      INSERT INTO deadline_extension_requested (
        project_id, freelancer_id, creator_id, chat_room_id,
        days, hours, status, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        project_id,
        freelancerId,
        creatorId,
        chatRoomId,
        daysInt,
        hoursInt,
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ]);
      const row = result.rows[0];
      logger.info(
        `[saveDeadlineExtensionRequest] inserted id=${row.id} project_id=${row.project_id} freelancer_id=${row.freelancer_id} creator_id=${row.creator_id} days=${row.days} hours=${row.hours} status=${row.status} expires_at=${row.expires_at}`
      );
      return row;
    } catch (error) {
      console.error("Error saving deadline extension request:", error);
      throw error;
    }
  },

  // Accept deadline extension request and update the project's end_date
  async acceptDeadlineExtension(requestId, creatorUserId) {
    logger.info(
      `[acceptDeadlineExtension] incoming requestId=${requestId} creatorUserId=${creatorUserId}`
    );
    const creatorCheck = await pool.query(
      `SELECT creator_id FROM creators WHERE user_id = $1`,
      [creatorUserId]
    );
    if (!creatorCheck.rows[0]) return null;
    const creatorId = creatorCheck.rows[0].creator_id;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const extResult = await client.query(
        `UPDATE deadline_extension_requested
         SET status = 'accepted', approved_at = NOW()
         WHERE id = $1 AND creator_id = $2
         RETURNING *`,
        [requestId, creatorId]
      );

      const extension = extResult.rows[0];
      if (!extension) {
        await client.query("ROLLBACK");
        logger.info(
          `[acceptDeadlineExtension] no pending request matched requestId=${requestId} for creator_id=${creatorId} (returning null)`
        );
        return null;
      }

      logger.info(
        `[acceptDeadlineExtension] extension matched id=${extension.id} project_id=${extension.project_id} days=${extension.days} hours=${extension.hours} — extending end_date from NOW()`
      );

      // Cumulative behaviour: each accept extends the existing deadline.
      // Baseline = GREATEST(end_date, NOW()) so a deadline already in the future
      // stacks, but a lapsed deadline doesn't anchor the new one in the past.
      // GREATEST ignores NULL arguments, so projects without an end_date still
      // get a sensible NOW()-based baseline.
      const beforeResult = await client.query(
        `SELECT end_date                              AS prev_end_date,
                NOW()                                 AS server_now,
                GREATEST(end_date, NOW())             AS baseline,
                GREATEST(end_date, NOW()) + make_interval(days => $1, hours => $2)
                                                      AS computed_new_end_date
           FROM projects WHERE id = $3`,
        [extension.days, extension.hours, extension.project_id]
      );
      const before = beforeResult.rows[0] || {};
      const fmt = (d) => (d instanceof Date ? d.toISOString() : (d ?? "null"));
      logger.info(
        `[acceptDeadlineExtension] CALC project_id=${extension.project_id} server_now=${fmt(before.server_now)} prev_end_date=${fmt(before.prev_end_date)} baseline=${fmt(before.baseline)} days=${extension.days} hours=${extension.hours} computed_new_end_date=${fmt(before.computed_new_end_date)}`
      );

      // Cumulative: extend from whichever is later — current end_date or NOW().
      const projectResult = await client.query(
        `UPDATE projects
         SET end_date = GREATEST(end_date, NOW()) + make_interval(days => $1, hours => $2),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [extension.days, extension.hours, extension.project_id]
      );

      await client.query("COMMIT");

      const updatedProject = projectResult.rows[0] || null;
      logger.info(
        `[acceptDeadlineExtension] AFTER project_id=${extension.project_id} stored_end_date=${fmt(updatedProject?.end_date)} computed_was=${fmt(before.computed_new_end_date)} (stored may be a few ms later if NOW()>end_date — separate statement re-evaluates NOW())`
      );

      return {
        ...extension,
        project: updatedProject,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error accepting deadline extension:", error);
      throw error;
    } finally {
      client.release();
    }
  },

  // Reject deadline extension request
  async rejectDeadlineExtension(requestId, creatorUserId) {
    logger.info(
      `[rejectDeadlineExtension] incoming requestId=${requestId} creatorUserId=${creatorUserId}`
    );

    const creatorCheck = await pool.query(
      `SELECT creator_id FROM creators WHERE user_id = $1`,
      [creatorUserId]
    );
    if (!creatorCheck.rows[0]) return null;
    const creatorId = creatorCheck.rows[0].creator_id;

    const query = `
      UPDATE deadline_extension_requested
      SET status = 'rejected'
      WHERE id = $1 AND creator_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [requestId, creatorId]);
      const row = result.rows[0];
      if (row) {
        logger.info(
          `[rejectDeadlineExtension] rejected id=${row.id} project_id=${row.project_id}`
        );
      } else {
        logger.info(
          `[rejectDeadlineExtension] no row matched requestId=${requestId} creator_id=${creatorId}`
        );
      }
      return row;
    } catch (error) {
      console.error("Error rejecting deadline extension:", error);
      throw error;
    }
  },

  // Get all services for a freelancer
  async getFreelancerServices(freelancerId) {
    const query = `
      SELECT
        s.id,
        s.service_name,
        s.plan_type,
        s.service_price,
        s.delivery_time
      FROM services s
      JOIN freelancer f ON s.freelancer_id = f.freelancer_id
      WHERE f.user_id = $1
        AND s.is_deleted = FALSE
      ORDER BY s.service_name ASC
    `;

    try {
      const result = await pool.query(query, [freelancerId]);

      // Group plans under each service name
      const grouped = {};
      for (const row of result.rows) {
        if (!grouped[row.service_name]) {
          grouped[row.service_name] = { service_name: row.service_name, plans: [] };
        }
        grouped[row.service_name].plans.push({
          id: row.id,
          plan_type: row.plan_type,
          service_price: row.service_price,
          delivery_time: row.delivery_time,
        });
      }
      return Object.values(grouped);
    } catch (error) {
      console.error("Error getting freelancer services:", error);
      throw error;
    }
  },

  // Search messages
  async searchMessages(userId, searchTerm) {
    const query = `
      SELECT 
        m.id,
        m.room_id,
        m.sender_id,
        m.recipient_id,
        m.message,
        m.created_at,
        u.user_name as sender_username
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      JOIN chat_rooms cr ON m.room_id = cr.room_id
      WHERE (cr.user1_id = $1 OR cr.user2_id = $1)
        AND m.message ILIKE $2
      ORDER BY m.created_at DESC
      LIMIT 50
    `;

    try {
      const result = await pool.query(query, [userId, `%${searchTerm}%`]);
      return result.rows;
    } catch (error) {
      console.error("Error searching messages:", error);
      throw error;
    }
  },

  async getPendingPaymentPackages(creatorId, freelancerUserId = null) {
    const params = [creatorId];
    const freelancerFilter = freelancerUserId
      ? `AND f.user_id = $${params.push(freelancerUserId)}`
      : '';

    const query = `
      SELECT
        cp.id              AS package_id,
        cp.price           AS amount,
        cp.units,
        cp.plan_type,
        cp.package_type,
        cp.service_type,
        cp.delivery_days,
        cp.delivery_time,
        cp.created_at,
        cp.room_id         AS chat_room_id,
        cp.freelancer_id,
        f.freelancer_full_name AS freelancer_name,
        f.profile_image_url    AS freelancer_avatar,
        s.service_name,
        p.id               AS project_id,
        p.status           AS project_status
      FROM custom_packages cp
      JOIN freelancer f ON cp.freelancer_id = f.freelancer_id
      LEFT JOIN services s ON cp.service_id = s.id
      LEFT JOIN LATERAL (
        SELECT id, status
        FROM projects
        WHERE creator_id = cp.creator_id
          AND freelancer_id = cp.freelancer_id
        ORDER BY created_at DESC
        LIMIT 1
      ) p ON true
      WHERE cp.creator_id = $1
        AND cp.status = 'accepted'
        AND cp.created_at >= NOW() - INTERVAL '7 days'
        ${freelancerFilter}
      ORDER BY cp.created_at DESC
    `;
    const result = await pool.query(query, params);
    return result.rows;
  },

  async getCreatorUserIdByCreatorId(creatorId) {
    const result = await pool.query(
      `SELECT user_id FROM creators WHERE creator_id = $1`,
      [creatorId]
    );
    return result.rows[0]?.user_id ?? null;
  },

  async getFreelancerProjects(freelancerUserId, creatorUserId) {
    const query = `
      SELECT
        p.id AS project_id,
        p.status,
        p.amount,
        p.number_of_units,
        p.end_date,
        p.service_id,
        s.service_name,
        cp.package_type,
        cp.delivery_days,
        cp.delivery_time,
        EXISTS (
          SELECT 1 FROM deadline_extension_requested der
          WHERE der.project_id = p.id AND der.status = 'pending'
        ) AS has_pending_extension
      FROM projects p
      JOIN freelancer f ON p.freelancer_id = f.freelancer_id
      JOIN creators cr ON p.creator_id = cr.creator_id
      LEFT JOIN services s ON p.service_id = s.id
      LEFT JOIN custom_packages cp ON cp.freelancer_id = p.freelancer_id
        AND cp.creator_id = p.creator_id
        AND cp.service_id = p.service_id
        AND cp.status = 'accepted'
      WHERE f.user_id = $1
        AND cr.user_id = $2
        AND p.status IN ('IN_PROGRESS')
        AND p.end_date > NOW()
      ORDER BY p.created_at DESC
    `;
    try {
      console.log(`[getFreelancerProjects] freelancerUserId=${freelancerUserId} creatorUserId=${creatorUserId}`);


      // Debug: check projects without end_date/status filters
      const rawProjects = await pool.query(
        `SELECT p.id, p.status, p.end_date FROM projects p
         JOIN freelancer f ON p.freelancer_id = f.freelancer_id
         JOIN creators cr ON p.creator_id = cr.creator_id
         WHERE f.user_id = $1 AND cr.user_id = $2`,
        [freelancerUserId, creatorUserId]
      );
      console.log(`[getFreelancerProjects] all projects (no filters):`, rawProjects.rows);

      const result = await pool.query(query, [freelancerUserId, creatorUserId]);
      console.log(`[getFreelancerProjects] filtered result count=${result.rows.length}`, result.rows);
      return result.rows;
    } catch (error) {
      console.error("Error getting freelancer projects:", error);
      throw error;
    }
  },

  async getCreatorProjects(creatorUserId, freelancerUserId) {
    const query = `
      SELECT
        p.id AS project_id,
        p.status,
        p.amount,
        p.number_of_units,
        p.end_date,
        p.service_id,
        s.service_name,
        cp.package_type,
        cp.delivery_days,
        cp.delivery_time,
        EXISTS (
          SELECT 1 FROM deadline_extension_requested der
          WHERE der.project_id = p.id AND der.status = 'pending'
        ) AS has_pending_extension
      FROM projects p
      JOIN creators cr ON p.creator_id = cr.creator_id
      JOIN freelancer f ON p.freelancer_id = f.freelancer_id
      LEFT JOIN services s ON p.service_id = s.id
      LEFT JOIN custom_packages cp ON cp.freelancer_id = p.freelancer_id
        AND cp.creator_id = p.creator_id
        AND cp.service_id = p.service_id
        AND cp.status = 'accepted'
      WHERE cr.user_id = $1
        AND f.user_id = $2
        AND p.status IN ('IN_PROGRESS')
        AND p.end_date > NOW()
      ORDER BY p.created_at DESC
    `;
    try {
      const result = await pool.query(query, [creatorUserId, freelancerUserId]);
      return result.rows;
    } catch (error) {
      console.error('Error getting creator projects:', error);
      throw error;
    }
  },

  // Save a notification to web_notifications using the current schema
  async saveWebNotification(recipientId, senderId, eventType, title, body, actionType = 'none', actionRoute = null) {
    const query = `
      INSERT INTO web_notifications (recipient_id, sender_id, event_type, title, body, action_type, action_route)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    try {
      const result = await pool.query(query, [
        recipientId, senderId, eventType, title, body, actionType, actionRoute
      ]);
      return result.rows[0];
    } catch (error) {
      console.error("Error saving web notification:", error);
      throw error;
    }
  },

  // Mark a single notification as read
  async markNotificationAsRead(notificationId, userId) {
    const query = `
      UPDATE web_notifications
      SET is_read = true
      WHERE id = $1 AND recipient_id = $2
      RETURNING *
    `;
    try {
      const result = await pool.query(query, [notificationId, userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error marking notification as read:", error);
      throw error;
    }
  },

  // Mark every web_notification for a specific room as read for a user
  // — used when a user/admin opens a support room so the notif badge clears.
  async markNotificationsByRoomAsRead(userId, roomId) {
    const query = `
      UPDATE web_notifications
      SET is_read = true
      WHERE recipient_id = $1 AND action_route = $2 AND is_read = false
      RETURNING id
    `;
    try {
      const result = await pool.query(query, [userId, roomId]);
      return result.rowCount;
    } catch (error) {
      console.error("Error marking notifications by room as read:", error);
      throw error;
    }
  },

  // Mark all notifications as read for a user
  async markAllNotificationsAsRead(userId) {
    const query = `
      UPDATE web_notifications
      SET is_read = true
      WHERE recipient_id = $1 AND is_read = false
      RETURNING id
    `;
    try {
      const result = await pool.query(query, [userId]);
      return result.rowCount;
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      throw error;
    }
  },

  // Get top 5 unread notifications for a user (sent on connect)
  async getRecentNotifications(userId, limit = 5) {
    const query = `
      SELECT wn.*,
        COALESCE(c.profile_image_url, f.profile_image_url) AS sender_image,
        COALESCE(c.full_name, f.freelancer_full_name, u.user_name) AS sender_name
      FROM web_notifications wn
      LEFT JOIN users u ON wn.sender_id = u.id
      LEFT JOIN creators c ON u.id = c.user_id
      LEFT JOIN freelancer f ON u.id = f.user_id
      WHERE wn.recipient_id = $1 AND wn.is_read = false
      ORDER BY wn.created_at DESC LIMIT $2
    `;
    try {
      const result = await pool.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      console.error("Error fetching recent notifications:", error);
      throw error;
    }
  },

  async getProjectInfo(projectId) {
    const result = await pool.query(
      `SELECT p.id, p.status, p.amount, p.end_date,
              s.service_name, s.plan_type, s.delivery_time
       FROM projects p
       LEFT JOIN services s ON p.service_id = s.id
       WHERE p.id = $1`,
      [projectId]
    );
    return result.rows[0] || null;
  },

  async getUserByUserId(userId) {
    const result = await pool.query(
      'SELECT user_email, user_name FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  },

  async getUserRole(userId) {
    const result = await pool.query(
      'SELECT user_role FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0]?.user_role || null;
  },

  async getSenderProfileImage(senderId) {
    const result = await pool.query(
      `SELECT COALESCE(c.profile_image_url, f.profile_image_url) AS profile_image_url
       FROM users u
       LEFT JOIN creators c ON u.id = c.user_id
       LEFT JOIN freelancer f ON u.id = f.user_id
       WHERE u.id = $1`,
      [senderId]
    );
    return result.rows[0]?.profile_image_url || null;
  },

  // ========== SUPPORT CHAT METHODS ==========

  // Get support room by user_id
  async getSupportRoomByUserId(userId) {
    const query = `SELECT * FROM support_rooms WHERE user_id = $1`;
    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting support room:", error);
      throw error;
    }
  },

  // Create-or-fetch support room. Returns { room, isNew }.
  // DO NOTHING + RETURNING only returns rows actually inserted, so we can
  // distinguish a brand-new room from an existing one without a race.
  async createSupportRoom(userId) {
    const roomId = `support-${userId}`;
    try {
      const inserted = await pool.query(
        `INSERT INTO support_rooms (room_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING *`,
        [roomId, userId]
      );
      if (inserted.rows[0]) {
        return { room: inserted.rows[0], isNew: true };
      }
      const existing = await pool.query(
        `SELECT * FROM support_rooms WHERE user_id = $1`,
        [userId]
      );
      return { room: existing.rows[0], isNew: false };
    } catch (error) {
      console.error("Error creating support room:", error);
      throw error;
    }
  },

  // Check if a given room_id belongs to the support system
  async isSupportRoom(roomId) {
    const query = `SELECT 1 FROM support_rooms WHERE room_id = $1`;
    try {
      const result = await pool.query(query, [roomId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error checking support room:", error);
      throw error;
    }
  },

  // Get support room row by room_id (for resolving the owner user_id in admin sends)
  async getSupportRoomByRoomId(roomId) {
    const query = `SELECT * FROM support_rooms WHERE room_id = $1`;
    try {
      const result = await pool.query(query, [roomId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error("Error getting support room by roomId:", error);
      throw error;
    }
  },

  // Latest message id in a room — used to advance read pointer on leave/open
  async getLatestMessageIdInRoom(roomId) {
    const query = `SELECT id FROM messages WHERE room_id = $1 ORDER BY id DESC LIMIT 1`;
    try {
      const result = await pool.query(query, [roomId]);
      return result.rows[0]?.id || null;
    } catch (error) {
      console.error("Error getting latest message id:", error);
      throw error;
    }
  },

  // All active admins whose permissions include chat.view — resolved dynamically
  async getAdminsWithChatPermission() {
    const query = `
      SELECT u.id AS user_id, a.full_name AS name
      FROM users u
      INNER JOIN admin a ON u.id = a.user_id
      WHERE u.is_active = true
        AND a.is_active = true
        AND a.permissions->'chat' ? 'view'
    `;
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error("Error fetching admins with chat permission:", error);
      throw error;
    }
  },

  // Live per-user permission re-check (defense against revoked-mid-session admins)
  async adminHasChatPermission(userId) {
    const query = `
      SELECT 1 FROM admin
      WHERE user_id = $1
        AND is_active = true
        AND permissions->'chat' ? 'view'
    `;
    try {
      const result = await pool.query(query, [userId]);
      return result.rowCount > 0;
    } catch (error) {
      console.error("Error checking admin chat permission:", error);
      throw error;
    }
  },

  // Admin support inbox — all open rooms with last message + unread count
  async getSupportRoomsForAdmin(adminId) {
    const query = `
      SELECT
        sr.room_id,
        sr.user_id,
        sr.status,
        sr.created_at AS room_created_at,
        COALESCE(c.full_name, f.freelancer_full_name, c.user_name, f.user_name, u.user_name) AS user_name,
        COALESCE(f.profile_image_url, c.profile_image_url) AS user_avatar,
        CASE
          WHEN f.freelancer_id IS NOT NULL THEN 'freelancer'
          WHEN c.creator_id IS NOT NULL THEN 'creator'
          ELSE 'user'
        END AS user_role,
        m.message AS last_message,
        m.created_at AS last_message_time,
        m.sender_id AS last_message_sender_id,
        COALESCE(
          (SELECT COUNT(*)::int FROM messages msg
           WHERE msg.room_id = sr.room_id
             AND msg.sender_id != $1
             AND (
               rs.last_read_message_id IS NULL
               OR msg.id > rs.last_read_message_id
             )
          ), 0
        ) AS unread_count
      FROM support_rooms sr
      INNER JOIN users u ON sr.user_id = u.id
      LEFT JOIN freelancer f ON u.id = f.user_id
      LEFT JOIN creators c ON u.id = c.user_id
      LEFT JOIN LATERAL (
        SELECT message, created_at, sender_id
        FROM messages
        WHERE room_id = sr.room_id
        ORDER BY created_at DESC
        LIMIT 1
      ) m ON true
      LEFT JOIN support_room_read_status rs
        ON rs.room_id = sr.room_id AND rs.user_id = $1
      WHERE sr.status = 'open'
      ORDER BY m.created_at DESC NULLS LAST
    `;
    try {
      const result = await pool.query(query, [adminId]);
      return result.rows;
    } catch (error) {
      console.error("Error getting support rooms for admin:", error);
      throw error;
    }
  },

  // Room participants: the user who opened support + all currently eligible admins (dynamic)
  async getSupportRoomParticipants(roomId) {
    const userQuery = `
      SELECT
        sr.user_id,
        COALESCE(c.full_name, f.freelancer_full_name, c.user_name, f.user_name, u.user_name) AS name,
        COALESCE(f.profile_image_url, c.profile_image_url) AS avatar,
        CASE
          WHEN f.freelancer_id IS NOT NULL THEN 'freelancer'
          WHEN c.creator_id IS NOT NULL THEN 'creator'
          ELSE 'user'
        END AS role
      FROM support_rooms sr
      INNER JOIN users u ON sr.user_id = u.id
      LEFT JOIN freelancer f ON u.id = f.user_id
      LEFT JOIN creators c ON u.id = c.user_id
      WHERE sr.room_id = $1
    `;
    const adminsQuery = `
      SELECT u.id AS user_id, a.full_name AS name
      FROM users u
      INNER JOIN admin a ON u.id = a.user_id
      WHERE u.is_active = true
        AND a.is_active = true
        AND a.permissions->'chat' ? 'view'
    `;
    try {
      const [userResult, adminsResult] = await Promise.all([
        pool.query(userQuery, [roomId]),
        pool.query(adminsQuery),
      ]);
      return {
        user: userResult.rows[0] || null,
        admins: adminsResult.rows,
      };
    } catch (error) {
      console.error("Error getting support room participants:", error);
      throw error;
    }
  },

  // Save a support message — recipient_id is NULL (group room, no single recipient)
  async saveSupportMessage(roomId, senderId, message, messageType = 'text', fileUrl = null) {
    const query = `
      INSERT INTO messages (room_id, sender_id, recipient_id, message, message_type, file_url, created_at)
      VALUES ($1, $2, NULL, $3, $4, $5, $6)
      RETURNING *
    `;
    try {
      const result = await pool.query(query, [
        roomId, senderId, message, messageType, fileUrl, new Date().toISOString(),
      ]);
      return result.rows[0];
    } catch (error) {
      console.error("Error saving support message:", error);
      throw error;
    }
  },

  // Upsert read pointer for a user in a support room
  async updateSupportReadStatus(roomId, userId, lastMessageId) {
    if (!lastMessageId) return;
    const query = `
      INSERT INTO support_room_read_status (room_id, user_id, last_read_message_id, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (room_id, user_id)
      DO UPDATE SET last_read_message_id = GREATEST(support_room_read_status.last_read_message_id, EXCLUDED.last_read_message_id),
                    updated_at = NOW()
    `;
    try {
      await pool.query(query, [roomId, userId, lastMessageId]);
    } catch (error) {
      console.error("Error updating support read status:", error);
      throw error;
    }
  },

  // Unread count for one admin in one support room
  async getSupportUnreadCountForRoom(roomId, userId) {
    const query = `
      SELECT COUNT(*)::int AS unread_count
      FROM messages m
      LEFT JOIN support_room_read_status rs
        ON rs.room_id = m.room_id AND rs.user_id = $2
      WHERE m.room_id = $1
        AND m.sender_id != $2
        AND (rs.last_read_message_id IS NULL OR m.id > rs.last_read_message_id)
    `;
    try {
      const result = await pool.query(query, [roomId, userId]);
      return result.rows[0]?.unread_count || 0;
    } catch (error) {
      console.error("Error getting support unread count:", error);
      throw error;
    }
  },

  // Total unread across all support rooms for a user (drives the badge)
  async getSupportUnreadCountTotal(userId) {
    const query = `
      SELECT COALESCE(SUM(
        (SELECT COUNT(*)::int FROM messages m
         WHERE m.room_id = sr.room_id
           AND m.sender_id != $1
           AND (rs.last_read_message_id IS NULL OR m.id > rs.last_read_message_id)
        )
      ), 0)::int AS total
      FROM support_rooms sr
      LEFT JOIN support_room_read_status rs
        ON rs.room_id = sr.room_id AND rs.user_id = $1
      WHERE sr.status = 'open'
    `;
    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0]?.total || 0;
    } catch (error) {
      console.error("Error getting total support unread count:", error);
      throw error;
    }
  },

  // Resolve a user's preferred display name. Prefers full_name (display)
  // over user_name (handle) so chat headers/labels read like real people.
  async getDisplayName(userId) {
    const query = `
      SELECT COALESCE(a.full_name, c.full_name, f.freelancer_full_name,
                      c.user_name, f.user_name, u.user_name) AS name
      FROM users u
      LEFT JOIN admin a ON u.id = a.user_id
      LEFT JOIN creators c ON u.id = c.user_id
      LEFT JOIN freelancer f ON u.id = f.user_id
      WHERE u.id = $1
    `;
    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0]?.name || null;
    } catch (error) {
      console.error("Error resolving display name:", error);
      return null;
    }
  },

  // Get user info (email and name) by userId
  async getUserInfo(userId) {
    try {
      const result = await pool.query(
        `SELECT 
          u.id, 
          u.user_role,
          COALESCE(c.email, f.freelancer_email) AS email,
          COALESCE(c.full_name, f.freelancer_full_name) AS name
         FROM users u
         LEFT JOIN creators c ON u.id = c.user_id
         LEFT JOIN freelancer f ON u.id = f.user_id
         WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error(`User not found: ${userId}`);
      }

      return result.rows[0];
    } catch (error) {
      console.error(`Error getting user info for userId=${userId}:`, error);
      throw error;
    }
  },
};

/// we are storing date time in the custome package and in the project we have only end date col so add date and time and fill that col and also add no of units per service and also we have to ask question about the hire feature will freelancer have to accept that what will happen when i heir a freelancer

module.exports = chatModel;
