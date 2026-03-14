const { pool: db } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');

const raiseDispute = async (req, res, next) => {
  try {
    const { role, roleWiseId } = req.user;
    const { other_party_id, reason_of_dispute, description } = req.body;

    if (!other_party_id || !reason_of_dispute) {
      return next(new AppError('other_party_id and reason_of_dispute are required', 400));
    }

    let creator_id, freelancer_id;

    if (role === 'freelancer') {
      freelancer_id = roleWiseId;
      creator_id = other_party_id;
    } else if (role === 'creator') {
      creator_id = roleWiseId;
      freelancer_id = other_party_id;
    } else {
      return next(new AppError('Only creators and freelancers can raise a dispute', 403));
    }

    const disputeResult = await db.query(
      `INSERT INTO disputes (creator_id, freelancer_id, reason_of_dispute, description, raised_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [creator_id, freelancer_id, reason_of_dispute, description || null, role]
    );

    logger.info(`Dispute raised by ${role} (id: ${roleWiseId})`);

    return res.status(201).json({
      status: 'success',
      message: 'Dispute raised successfully',
      data: {
        dispute_id: disputeResult.rows[0].id,
        creator_id,
        freelancer_id,
      },
    });
  } catch (error) {
    logger.error('raiseDispute error:', error);
    return next(new AppError('Failed to raise dispute', 500));
  }
};

const getDisputes = async (req, res, next) => {
  try {
    const { role, roleWiseId } = req.user;
    const { type = 'against_me', search = '', status = '', page = 1, limit = 10 } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    if (role !== 'creator' && role !== 'freelancer') {
      return next(new AppError('Only creators and freelancers can view disputes', 403));
    }

    const raisedByFilter = type === 'against_me'
      ? (role === 'freelancer' ? 'creator' : 'freelancer')
      : role;

    const myCol        = role === 'freelancer' ? 'd.freelancer_id' : 'd.creator_id';
    const searchNameCol = raisedByFilter === 'creator' ? 'c.full_name' : 'f.freelancer_full_name';

    const params = [roleWiseId, raisedByFilter];
    let nextParam = 3;

    const statusFilter = status.trim() ? `AND d.status = $${nextParam++}` : '';
    if (status.trim()) params.push(status.trim());

    const searchFilter = search.trim() ? `AND ${searchNameCol} ILIKE $${nextParam++}` : '';
    if (search.trim()) params.push(`%${search.trim()}%`);

    const dataQuery = `
      SELECT
        d.id                       AS dispute_id,
        d.reason_of_dispute,
        d.description,
        d.admin_note,
        d.created_at,
        d.status,
        d.raised_by,
        c.full_name                AS creator_name,
        c.profile_image_url        AS creator_avatar,
        f.freelancer_full_name     AS freelancer_name,
        f.profile_image_url        AS freelancer_avatar
      FROM disputes d
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      WHERE ${myCol} = $1
        AND d.raised_by = $2
        ${statusFilter}
        ${searchFilter}
      ORDER BY d.created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM disputes d
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      WHERE ${myCol} = $1
        AND d.raised_by = $2
        ${statusFilter}
        ${searchFilter}
    `;

    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, params),
      db.query(countQuery, params),
    ]);

    const total      = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    logger.info(`getDisputes [${type}] for ${role} id=${roleWiseId}, total=${total}`);

    return res.status(200).json({
      status: 'success',
      data: {
        disputes: dataResult.rows,
        pagination: {
          total,
          totalPages,
          currentPage: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    logger.error('getDisputes error:', error);
    return next(new AppError('Failed to fetch disputes', 500));
  }
};

const getAllDisputes = async (req, res, next) => {
  try {
    const { status = '', page = 1, limit = 10 } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    const params = [];
    let nextParam = 1;

    const statusFilter = status.trim() ? `WHERE d.status = $${nextParam++}` : '';
    if (status.trim()) params.push(status.trim());

    const dataQuery = `
      SELECT
        d.id                       AS dispute_id,
        d.creator_id,
        d.freelancer_id,
        d.reason_of_dispute,
        d.description,
        d.admin_note,
        d.status,
        d.raised_by,
        d.created_at,
        d.updated_at,
        c.full_name                AS creator_name,
        c.email                    AS creator_email,
        c.profile_image_url        AS creator_avatar,
        f.freelancer_full_name     AS freelancer_name,
        f.freelancer_email         AS freelancer_email,
        f.profile_image_url        AS freelancer_avatar
      FROM disputes d
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      ${statusFilter}
      ORDER BY d.created_at DESC
      LIMIT $${nextParam++} OFFSET $${nextParam++}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM disputes d
      ${statusFilter}
    `;

    const paginatedParams = [...params, limitNum, offset];

    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, paginatedParams),
      db.query(countQuery, params),
    ]);

    const total      = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    logger.info(`getAllDisputes: total=${total} status=${status || 'all'} page=${pageNum}`);

    return res.status(200).json({
      status: 'success',
      data: {
        disputes: dataResult.rows,
        pagination: {
          total,
          totalPages,
          currentPage: pageNum,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    logger.error('getAllDisputes error:', error);
    return next(new AppError('Failed to fetch disputes', 500));
  }
};

const resolveDispute = async (req, res, next) => {
  try {
    const adminId = req.user.user_id;
    const { id } = req.params;
    const { resolution } = req.body;

    if (!resolution || typeof resolution !== 'object') {
      return next(new AppError('resolution is required and must be a JSON object', 400));
    }

    const result = await db.query(
      `UPDATE disputes
       SET status = 'resolved', admin_note = $1::jsonb, admin_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, status, admin_note, admin_id, updated_at`,
      [JSON.stringify(resolution), adminId, id]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Dispute not found', 404));
    }

    logger.info(`Dispute ${id} resolved by admin ${adminId}`);

    return res.status(200).json({
      status: 'success',
      message: 'Dispute resolved successfully',
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('resolveDispute error:', error);
    return next(new AppError('Failed to resolve dispute', 500));
  }
};

module.exports = { raiseDispute, getDisputes, getAllDisputes, resolveDispute };
