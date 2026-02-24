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
    custom_package_id = null
  ) {
    const query = `
      INSERT INTO messages (room_id, sender_id, recipient_id, message, message_type,custom_package_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
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
    COALESCE(f.user_name, c.user_name) as sender_username,
    CASE 
        WHEN f.freelancer_id IS NOT NULL THEN 'freelancer'
        WHEN c.creator_id IS NOT NULL THEN 'creator'
    END as sender_type
FROM messages m
LEFT JOIN freelancer f ON m.sender_id = f.freelancer_id
LEFT JOIN creators c ON m.sender_id = c.creator_id
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
LEFT JOIN freelancer f1 ON cr.user1_id = f1.freelancer_id
LEFT JOIN creators c1 ON cr.user1_id = c1.creator_id
LEFT JOIN freelancer f2 ON cr.user2_id = f2.freelancer_id
LEFT JOIN creators c2 ON cr.user2_id = c2.creator_id
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
  async saveCustomPackage(
    chatRoomId,
    userId,
    recipientId,
    packageData
  ) {
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
        status || 'pending',
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

module.exports = chatModel;
