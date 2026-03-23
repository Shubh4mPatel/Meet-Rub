const { pool: db } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');

const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 20, unreadOnly = 'false' } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const onlyUnread = unreadOnly === 'true';

    const params = [userId];
    let nextParam = 2;

    const unreadFilter = onlyUnread ? `AND is_read = false` : '';

    const dataQuery = `
      SELECT
        n.id,
        n.sender_id,
        n.event_type,
        n.title,
        n.body,
        n.action_type,
        n.action_route,
        n.is_read,
        n.read_at,
        n.created_at,
        u.user_name   AS sender_name,
        u.user_role   AS sender_role
      FROM web_notifications n
      LEFT JOIN users u ON n.sender_id = u.id
      WHERE n.recipient_id = $1
        ${unreadFilter}
      ORDER BY n.created_at DESC
      LIMIT $${nextParam++} OFFSET $${nextParam++}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM web_notifications
      WHERE recipient_id = $1
        ${unreadFilter}
    `;

    const unreadCountQuery = `
      SELECT COUNT(*) AS unread_count
      FROM web_notifications
      WHERE recipient_id = $1 AND is_read = false
    `;

    const paginatedParams = [...params, limitNum, offset];

    const [dataResult, countResult, unreadResult] = await Promise.all([
      db.query(dataQuery, paginatedParams),
      db.query(countQuery, params),
      db.query(unreadCountQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);
    const unreadCount = parseInt(unreadResult.rows[0].unread_count);

    logger.info(`getNotifications user=${userId} page=${pageNum} total=${total}`);

    return res.status(200).json({
      status: 'success',
      data: {
        notifications: dataResult.rows,
        unread_count: unreadCount,
        pagination: {
          total,
          totalPages,
          currentPage: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    logger.error('getNotifications error:', error);
    return next(new AppError('Failed to fetch notifications', 500));
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    const result = await db.query(
      `UPDATE web_notifications
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND recipient_id = $2 AND is_read = false
       RETURNING id, is_read, read_at`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Notification not found or already read', 404));
    }

    return res.status(200).json({
      status: 'success',
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('markAsRead error:', error);
    return next(new AppError('Failed to mark notification as read', 500));
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.user_id;

    const result = await db.query(
      `UPDATE web_notifications
       SET is_read = true, read_at = NOW()
       WHERE recipient_id = $1 AND is_read = false
       RETURNING id`,
      [userId]
    );

    return res.status(200).json({
      status: 'success',
      message: `${result.rowCount} notification(s) marked as read`,
      data: { updated_count: result.rowCount },
    });
  } catch (error) {
    logger.error('markAllAsRead error:', error);
    return next(new AppError('Failed to mark all notifications as read', 500));
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };
