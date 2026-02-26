const pool = require("../config/dbConfig");

// Converts a time string to UTC.
// If the value already carries a UTC indicator (Z or +00:00) it is returned unchanged.
// If it carries a non-UTC offset the time is shifted to UTC.
// If there is no timezone information at all the value is returned unchanged.
function toUTCTime(timeStr) {
  if (!timeStr) return timeStr;

  const s = String(timeStr).trim();

  // Already UTC
  if (s.endsWith("Z") || s.endsWith("+00:00") || s.endsWith("+0000")) {
    return s;
  }

  // Has a non-UTC numeric offset, e.g. "+05:30" or "-04:00"
  if (/[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(`1970-01-01T${s}`);
    if (!isNaN(d.getTime())) {
      // Return HH:MM:SSZ
      return d.toISOString().slice(11, 19) + "Z";
    }
  }

  // No timezone info — return as-is
  return s;
}

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
    const [smallerId, largerId] = [user1Id, user2Id].sort();
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
    deadline_extension_id = null
  ) {
    const query = `
      INSERT INTO messages (room_id, sender_id, recipient_id, message, message_type, custom_package_id, deadline_extension_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    COALESCE(f.user_name, c.user_name) as sender_username,
    CASE
        WHEN f.freelancer_id IS NOT NULL THEN 'freelancer'
        WHEN c.creator_id IS NOT NULL THEN 'creator'
    END as sender_type,
    der.project_id as der_project_id,
    der.freelancer_id as der_freelancer_id,
    der.creator_id as der_creator_id,
    der.chat_room_id as der_chat_room_id,
    der.new_delivery_date as der_new_delivery_date,
    der.new_delivery_time as der_new_delivery_time,
    der.status as der_status,
    der.requested_at as der_requested_at,
    der.approved_at as der_approved_at,
    der.expires_at as der_expires_at
FROM messages m
LEFT JOIN freelancer f ON m.sender_id = f.user_id
LEFT JOIN creators c ON m.sender_id = c.user_id
LEFT JOIN deadline_extension_requested der ON m.deadline_extension_id = der.id
WHERE m.room_id = $1
ORDER BY m.created_at DESC
LIMIT $2 OFFSET $3;
    `;

    try {
      const result = await pool.query(query, [roomId, limit, offset]);
      console.log(
        `Fetched ${result.rows} messages for room ${roomId} with limit ${limit} and offset ${offset}`
      );
      // Reverse to oldest-first and map to camelCase to match real-time message format
      return result.rows.reverse().map((row) => ({
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
        deadlineExtension: row.deadline_extension_id
          ? {
              id: row.deadline_extension_id,
              project_id: row.der_project_id,
              freelancer_id: row.der_freelancer_id,
              creator_id: row.der_creator_id,
              chat_room_id: row.der_chat_room_id,
              new_delivery_date: row.der_new_delivery_date,
              new_delivery_time: row.der_new_delivery_time,
              status: row.der_status,
              requested_at: row.der_requested_at,
              approved_at: row.der_approved_at,
              expires_at: row.der_expires_at,
            }
          : null,
      }));
    } catch (error) {
      console.error("Error getting chat history:", error);
      throw error;
    }
  },

  // Get user's all chat rooms with last message
  async getUserChatRooms(userId) {
    const query = `
   SELECT
  cr.room_id as id,
  cr.room_id,
  cr.user1_id,
  cr.user2_id,
  cr.created_at as room_created_at,
  COALESCE(f1.user_name, c1.user_name) as user1_name,
  COALESCE(f2.user_name, c2.user_name) as user2_name,
  COALESCE(f1.profile_image_url, c1.profile_image_url) as user1_profile_image_url,
  COALESCE(f2.profile_image_url, c2.profile_image_url) as user2_profile_image_url,
  CASE 
    WHEN f1.freelancer_id IS NOT NULL THEN 'freelancer'
    WHEN c1.creator_id IS NOT NULL THEN 'creator'
    ELSE NULL
  END as user1_role,
  CASE 
    WHEN f2.freelancer_id IS NOT NULL THEN 'freelancer'
    WHEN c2.creator_id IS NOT NULL THEN 'creator'
    ELSE NULL
  END as user2_role,
  m.message as last_message,
  m.created_at as last_message_time,
  m.sender_id as last_message_sender,
  COALESCE(unread.unread_count, 0) as unread_count
FROM chat_rooms cr
LEFT JOIN freelancer f1 ON cr.user1_id = f1.user_id
LEFT JOIN creators c1 ON cr.user1_id = c1.user_id
LEFT JOIN freelancer f2 ON cr.user2_id = f2.user_id
LEFT JOIN creators c2 ON cr.user2_id = c2.user_id
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
WHERE cr.user1_id = $1 OR cr.user2_id = $1
ORDER BY m.created_at DESC NULLS LAST
    `;

    try {
      const result = await pool.query(query, [userId]);
      return result.rows;
    } catch (error) {
      console.error("Error getting user chat rooms:", error);
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

  // Get unread message count
  async getUnreadCount(userId) {
    const query = `
      SELECT COUNT(*) as unread_count
      FROM messages
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
      delivery_date,
      delivery_time,
      status,
    } = packageData;

    // Determine which participant is the freelancer and which is the creator
    const roleCheck = await pool.query(
      `SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1 OR freelancer_id = $2`,
      [userId, recipientId]
    );

    const freelancerIds = roleCheck.rows.map((r) => r.freelancer_id);
    let freelancerId, creatorId;

    if (freelancerIds.includes(userId)) {
      freelancerId = userId;
      creatorId = recipientId;
    } else {
      freelancerId = recipientId;
      creatorId = userId;
    }

    const query = `
      INSERT INTO custom_packages (
        room_id, freelancer_id, creator_id,
        plan_type, price, units, package_type, status, expires_at, created_at,
        delivery_date, delivery_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
        delivery_date || null,
        toUTCTime(delivery_time) || null,
      ]);
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
      SET status = 'accepted'
      WHERE id = $1 AND creator_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [packageId, recipientId]);
      return result.rows[0];
    } catch (error) {
      console.error("Error accepting package:", error);
      throw error;
    }
  },

  // Reject custom package - update status to 'rejected'
  async rejectPackage(packageId, recipientId) {
    const query = `
      UPDATE custom_packages
      SET status = 'rejected'
      WHERE id = $1 AND creator_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [packageId, recipientId]);
      return result.rows[0];
    } catch (error) {
      console.error("Error rejecting package:", error);
      throw error;
    }
  },

  // Create a project from an accepted custom package
  async createProjectFromPackage(pkg) {
    const query = `
      INSERT INTO projects (creator_id, freelancer_id, number_of_units, amount, status, end_date, service_id)
      VALUES ($1, $2, $3, $4, 'CREATED', $5, $6)
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        pkg.creator_id,
        pkg.freelancer_id,
        pkg.units || null,
        pkg.price,
        pkg.delivery_date || null,
        pkg.service_id || null,
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
    const { project_id, new_delivery_date, new_delivery_time } = extensionData;

    const roleCheck = await pool.query(
      `SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1 OR freelancer_id = $2`,
      [userId, recipientId]
    );

    const freelancerIds = roleCheck.rows.map((r) => r.freelancer_id);
    let freelancerId, creatorId;

    if (freelancerIds.includes(userId)) {
      freelancerId = userId;
      creatorId = recipientId;
    } else {
      freelancerId = recipientId;
      creatorId = userId;
    }

    const query = `
      INSERT INTO deadline_extension_requested (
        project_id, freelancer_id, creator_id, chat_room_id,
        new_delivery_date, new_delivery_time, status, expires_at
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
        new_delivery_date,
        toUTCTime(new_delivery_time),
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ]);
      return result.rows[0];
    } catch (error) {
      console.error("Error saving deadline extension request:", error);
      throw error;
    }
  },

  // Accept deadline extension request and update the project's end_date
  async acceptDeadlineExtension(requestId, creatorId) {
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
        return null;
      }

      const projectResult = await client.query(
        `UPDATE projects
         SET end_date = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [extension.new_delivery_date, extension.project_id]
      );

      await client.query("COMMIT");

      return {
        ...extension,
        project: projectResult.rows[0] || null,
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
  async rejectDeadlineExtension(requestId, creatorId) {
    const query = `
      UPDATE deadline_extension_requested
      SET status = 'rejected'
      WHERE id = $1 AND creator_id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [requestId, creatorId]);
      return result.rows[0];
    } catch (error) {
      console.error("Error rejecting deadline extension:", error);
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
};

/// we are storing date time in the custome package and in the project we have only end date col so add date and time and fill that col and also add no of units per service and also we have to ask question about the hire feature will freelancer have to accept that what will happen when i heir a freelancer

module.exports = chatModel;
