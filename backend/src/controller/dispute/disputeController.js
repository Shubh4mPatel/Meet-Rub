const { pool: db } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');

const raiseDispute = async (req, res, next) => {
  try {
    const { role, roleWiseId } = req.user;
    const { project_id, reason_of_dispute, description } = req.body;

    if (!project_id || !reason_of_dispute) {
      return next(new AppError('project_id and reason_of_dispute are required', 400));
    }

    // Fetch project and verify the requesting user is a party to it
    const projectResult = await db.query(
      `SELECT creator_id, freelancer_id, status FROM projects WHERE id = $1`,
      [project_id]
    );

    if (projectResult.rows.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    const project = projectResult.rows[0];

    if (project.status === 'DISPUTE') {
      return next(new AppError('A dispute has already been raised for this project', 409));
    }

    if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
      return next(new AppError('Cannot raise a dispute on a completed or cancelled project', 400));
    }

    let creator_id, freelancer_id;

    if (role === 'freelancer') {
      if (project.freelancer_id !== roleWiseId) {
        return next(new AppError('You are not assigned to this project', 403));
      }
      freelancer_id = roleWiseId;
      creator_id = project.creator_id;
    } else if (role === 'creator') {
      if (project.creator_id !== roleWiseId) {
        return next(new AppError('You are not the owner of this project', 403));
      }
      creator_id = roleWiseId;
      freelancer_id = project.freelancer_id;
    } else {
      return next(new AppError('Only creators and freelancers can raise a dispute', 403));
    }

    // Insert dispute and update project status atomically
    await db.query('BEGIN');

    const disputeResult = await db.query(
      `INSERT INTO disputes (creator_id, freelancer_id, project_id, reason_of_dispute, description, raised_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [creator_id, freelancer_id, project_id, reason_of_dispute, description || null, role]
    );

    await db.query(
      `UPDATE projects SET status = 'DISPUTE', updated_at = NOW() WHERE id = $1`,
      [project_id]
    );

    await db.query('COMMIT');

    logger.info(`Dispute raised by ${role} (id: ${roleWiseId}) for project ${project_id}`);

    return res.status(201).json({
      status: 'success',
      message: 'Dispute raised successfully',
      data: {
        dispute_id: disputeResult.rows[0].id,
        project_id,
        creator_id,
        freelancer_id,
      },
    });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    logger.error('raiseDispute error:', error);
    return next(new AppError('Failed to raise dispute', 500));
  }
};

const getDisputes = async (req, res, next) => {
  try {
    const { role, roleWiseId } = req.user;
    // type: 'by_me' | 'against_me'  (default: against_me to match the UI)
    const { type = 'against_me', search = '', status = '', page = 1, limit = 10 } = req.query;

    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset   = (pageNum - 1) * limitNum;

    if (role !== 'creator' && role !== 'freelancer') {
      return next(new AppError('Only creators and freelancers can view disputes', 403));
    }

    // Determine whose name we join and which column to filter on
    // "against_me"  → the OTHER party raised it (raised_by != my role)
    // "by_me"       → I raised it (raised_by = my role)
    const raisedByFilter = type === 'against_me'
      ? (role === 'freelancer' ? 'creator' : 'freelancer')
      : role;

    // My column in disputes
    const myCol        = role === 'freelancer' ? 'd.freelancer_id' : 'd.creator_id';
    // Other party join
    const otherTable   = raisedByFilter === 'creator' ? 'creators' : 'freelancer';
    const otherIdCol   = raisedByFilter === 'creator' ? 'c2.creator_id'    : 'f2.freelancer_id';
    const otherNameCol = raisedByFilter === 'creator' ? 'c2.full_name'     : 'f2.freelancer_full_name';
    const otherAvatarCol = raisedByFilter === 'creator' ? 'c2.profile_image_url' : 'f2.profile_image_url';
    const otherAlias   = raisedByFilter === 'creator' ? 'c2' : 'f2';
    const otherJoinId  = raisedByFilter === 'creator' ? 'd.creator_id'     : 'd.freelancer_id';

    // Build dynamic filters and params
    const params = [roleWiseId, raisedByFilter];
    let nextParam = 3;

    const statusFilter = status.trim()
      ? `AND d.status = $${nextParam++}`
      : '';
    if (status.trim()) params.push(status.trim());

    const searchFilter = search.trim()
      ? `AND ${otherNameCol} ILIKE $${nextParam++}`
      : '';
    if (search.trim()) params.push(`%${search.trim()}%`);

    const dataQuery = `
      SELECT
        d.id AS dispute_id,
        d.reason_of_dispute,
        d.description,
        d.admin_note,
        d.created_at,
        d.status,
        d.raised_by,
        ${otherNameCol}   AS other_party_name,
        ${otherAvatarCol} AS other_party_avatar,
        s.service_name,
        p.id              AS project_id
      FROM disputes d
      JOIN projects p ON d.project_id = p.id
      LEFT JOIN services s ON p.service_id = s.id
      JOIN ${otherTable} ${otherAlias} ON ${otherJoinId} = ${otherIdCol}
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
      JOIN ${otherTable} ${otherAlias} ON ${otherJoinId} = ${otherIdCol}
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

    const statusFilter = status.trim()
      ? `WHERE d.status = $${nextParam++}`
      : '';
    if (status.trim()) params.push(status.trim());

    const dataQuery = `
      SELECT
        d.id              AS dispute_id,
        d.project_id,
        d.creator_id,
        d.freelancer_id,
        d.reason_of_dispute,
        d.description,
        d.admin_note,
        d.status,
        d.raised_by,
        d.created_at,
        d.updated_at,
        c.full_name       AS creator_name,
        c.email           AS creator_email,
        c.profile_image_url AS creator_avatar,
        f.freelancer_full_name AS freelancer_name,
        f.freelancer_email     AS freelancer_email,
        f.profile_image_url    AS freelancer_avatar,
        p.amount,
        p.status          AS project_status,
        p.end_date,
        s.service_name
      FROM disputes d
      JOIN projects p   ON d.project_id   = p.id
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      LEFT JOIN services s ON p.service_id = s.id
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

module.exports = { raiseDispute, getDisputes, getAllDisputes };
