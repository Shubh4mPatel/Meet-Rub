const { pool: db } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");
const { logger } = require('../../../utils/logger');
const { createPresignedUrl } = require('../../../utils/helper');
const { sendNotification } = require('../notification/notificationServicer');
const { sendDeliverySubmittedEmail, sendDeliveryReceivedEmail } = require('../../../utils/deliveryEmails');
const { sendAdminDisputeEmail } = require('../../../utils/welcomeEmail');

// Create a new project
const createProject = async (req, res, next) => {
  try {
    const clientId = req.user.roleWiseId;
    const { freelancer_id, service_id, number_of_units, amount, project_end_date } = req.body;

    if (!freelancer_id || !amount || !service_id || !number_of_units || !project_end_date) {
      return next(new AppError('Freelancer ID, service ID, number of units, amount, and project end date are required', 400));
    }

    if (amount <= 0) {
      return next(new AppError('Invalid amount', 400));
    }

    // Verify freelancer exists (PostgreSQL syntax)
    const freelancerResult = await db.query(
      `SELECT f.freelancer_id 
      FROM freelancer f
      INNER JOIN users u ON f.user_id = u.id
      WHERE f.freelancer_id = $1 
        AND u.user_role = 'freelancer' 
        AND u.approval_status = 'approved'`,
      [freelancer_id]
    );

    if (freelancerResult.rows.length === 0) {
      return next(new AppError('Freelancer not found or inactive', 404));
    }

    // Create project (PostgreSQL syntax with RETURNING)
    const result = await db.query(
      `INSERT INTO projects (creator_id, freelancer_id, service_id, number_of_units, amount, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'CREATED')
       RETURNING id`,
      [clientId, freelancer_id, service_id, number_of_units, amount, project_end_date]
    );

    res.status(201).json({
      message: 'Project created successfully',
      project_id: result.rows[0].id,
      amount
    });

  } catch (error) {
    console.error('Create project error:', error);
    return next(new AppError('Failed to create project', 500));
  }
};

// Get project details
const getProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { role } = req.user;
    const roleWiseId = parseInt(req.user.roleWiseId);
    logger.info('[getProject] raw roleWiseId=%s (type=%s) parsed=%s role=%s projectId=%s',
      req.user.roleWiseId, typeof req.user.roleWiseId, roleWiseId, role, projectId);

    const { rows: projects } = await db.query(
      `SELECT
        p.id, p.number_of_units, p.amount, p.status,
        p.created_at, p.updated_at, p.completed_at, p.end_date,
        p.creator_id, p.freelancer_id, p.service_id,
        s.service_name,
        c.full_name          AS creator_name,
        c.profile_image_url  AS creator_avatar,
        f.freelancer_full_name AS freelancer_name,
        f.profile_image_url  AS freelancer_avatar
       FROM projects p
       JOIN creators c   ON p.creator_id   = c.creator_id
       JOIN freelancer f ON p.freelancer_id = f.freelancer_id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    const project = projects[0];
    logger.info('[getProject] DB project.creator_id=%s (type=%s) project.freelancer_id=%s (type=%s)',
      project.creator_id, typeof project.creator_id, project.freelancer_id, typeof project.freelancer_id);
    logger.info('[getProject] access check: role=%s roleWiseId=%s (type=%s) creator_match=%s freelancer_match=%s',
      role, roleWiseId, typeof roleWiseId,
      project.creator_id === roleWiseId,
      project.freelancer_id === roleWiseId);

    // Check access
    if (role !== 'admin' && project.creator_id !== roleWiseId && project.freelancer_id !== roleWiseId) {
      return next(new AppError('Access denied', 403));
    }

    // Fetch deliverables
    const { rows: deliverables } = await db.query(
      `SELECT id, deliverable_url, project_description
       FROM deliverables
       WHERE service_id = $1 AND creator_id = $2 AND freelancer_id = $3`,
      [project.service_id, project.creator_id, project.freelancer_id]
    );

    // Resolve deliverable files — s3 gets a presigned URL, google_drive is returned as-is
    const deliverablesWithUrls = await Promise.all(
      deliverables.map(async (d) => {
        const files = Array.isArray(d.deliverable_url) ? d.deliverable_url : [d.deliverable_url];
        const resolvedFiles = await Promise.all(
          files.filter(Boolean).map(async (file) => {
            if (file.type === 'google_drive') {
              return { type: 'google_drive', urls: file.urls };
            }
            // default: s3
            const bucket = process.env.MINIO_BUCKET_NAME;
            const objectName = file.key;
            const signedUrl = await createPresignedUrl(bucket, objectName, 4 * 60 * 60).catch(() => null);
            return { type: 's3', key: file.key, url: signedUrl };
          })
        );
        return {
          id: d.id,
          project_description: d.project_description,
          files: resolvedFiles,
        };
      })
    );

    // Generate presigned URL for creator avatar
    if (project.creator_avatar) {
      const avatarParts = project.creator_avatar.split('/');
      const avatarBucket = avatarParts[0];
      const avatarObject = avatarParts.slice(1).join('/');
      project.creator_avatar = await createPresignedUrl(avatarBucket, avatarObject, 4 * 60 * 60).catch(() => project.creator_avatar);
    }

    // Generate presigned URL for freelancer avatar
    if (project.freelancer_avatar) {
      const avatarParts = project.freelancer_avatar.split('/');
      const avatarBucket = avatarParts[0];
      const avatarObject = avatarParts.slice(1).join('/');
      project.freelancer_avatar = await createPresignedUrl(avatarBucket, avatarObject, 4 * 60 * 60).catch(() => project.freelancer_avatar);
    }

    res.status(200).json({
      status: 'success',
      message: 'Project fetched successfully',
      project,
      deliverables: deliverablesWithUrls,
    });
  } catch (error) {
    console.error('Get project error:', error);
    return next(new AppError('Failed to get project', 500));
  }
}

// Get user's projects
const getMyProjects = async (req, res, next) => {
  try {
    const userId = req.user.roleWiseId;
    const userType = req.user.role;
    const status = req.query.status;
    const service = req.query.service;
    const search = req.query.search ? req.query.search.trim() : null;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const filterParams = [];
    let paramIndex = 1;
    const whereClauses = [];

    if (userType === 'creator') {
      whereClauses.push(`p.creator_id = $${paramIndex++}`);
      filterParams.push(userId);
    } else if (userType === 'freelancer') {
      whereClauses.push(`p.freelancer_id = $${paramIndex++}`);
      filterParams.push(userId);
    } else {
      return next(new AppError('Invalid user type', 400));
    }

    if (status) {
      whereClauses.push(`p.status = $${paramIndex++}`);
      filterParams.push(status);
    }

    if (service) {
      whereClauses.push(`s.service_name ILIKE $${paramIndex++}`);
      filterParams.push(`%${service}%`);
    }

    if (search) {
      whereClauses.push(`(f.freelancer_full_name ILIKE $${paramIndex} OR c.full_name ILIKE $${paramIndex})`);
      paramIndex++;
      filterParams.push(`%${search}%`);
    }

    const joins = `
FROM projects p
JOIN creators c        ON p.creator_id   = c.creator_id
JOIN freelancer f      ON p.freelancer_id = f.freelancer_id
LEFT JOIN services s   ON p.service_id   = s.id`;

    const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

    const countQuery = `SELECT COUNT(*) AS total ${joins} ${whereClause}`;

    const dataQuery = `
SELECT
  p.*,
  c.full_name               AS client_name,
  c.profile_image_url       AS creator_profile_image,
  f.freelancer_full_name    AS freelancer_name,
  f.profile_image_url       AS freelancer_profile_image,
  s.service_name
${joins}
${whereClause}
ORDER BY p.created_at DESC
LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

    const paginatedParams = [...filterParams, limit, offset];

    const [{ rows: projects }, { rows: countResult }] = await Promise.all([
      db.query(dataQuery, paginatedParams),
      db.query(countQuery, filterParams),
    ]);

    const totalCount = parseInt(countResult[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    // Generate presigned URL for the other party's profile image
    const profileImageKey = userType === 'creator' ? 'freelancer_profile_image' : 'creator_profile_image';
    const projectsWithImages = await Promise.all(
      projects.map(async (project) => {
        const rawUrl = project[profileImageKey];
        if (rawUrl) {
          try {
            const parts = rawUrl.split('/');
            const bucketName = parts[0];
            const objectName = parts.slice(1).join('/');
            project[profileImageKey] = await createPresignedUrl(bucketName, objectName, 4 * 60 * 60);
          } catch {
            project[profileImageKey] = null;
          }
        }
        // Remove the unused party's image from response
        const unusedKey = userType === 'creator' ? 'creator_profile_image' : 'freelancer_profile_image';
        delete project[unusedKey];
        return project;
      })
    );

    res.status(200).json({
      status: 'success',
      message: 'Projects fetched successfully',
      data: {
        projects: projectsWithImages,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    console.error('Get my projects error:', error);
    return next(new AppError('Failed to get projects', 500));
  }
}

// Update project status
const updateProjectStatus = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { status } = req.body;
    const userId = req.user.roleWiseId;

    if (!status) {
      return next(new AppError('Status is required', 400));
    }

    const validStatuses = ['CREATED', 'IN_PROGRESS', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid status', 400));
    }

    // Get project
    const { rows: projects } = await db.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    const project = projects[0];

    // Check permissions
    if (req.user.user_type !== 'ADMIN') {
      if (status === 'COMPLETED' && project.freelancer_id !== userId) {
        return next(new AppError('Only freelancer can mark project as completed', 403));
      }
    }

    // Update status
    const updateData = { status };
    if (status === 'COMPLETED') {
      updateData.completed_at = new Date();
    }

    await db.query(
      'UPDATE projects SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3',
      [status, updateData.completed_at || null, projectId]
    );

    res.json({
      message: 'Project status updated successfully',
      project_id: projectId,
      new_status: status
    });
  } catch (error) {
    console.error('Update project status error:', error);
    return next(new AppError('Failed to update project status', 500));
  }
}

// Delete project (only if not paid)
const deleteProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.roleWiseId;

    // Get project
    const { rows: projects } = await db.query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    const project = projects[0];

    // Check if user is client
    if (project.creator_id !== userId && req.user.user_type !== 'ADMIN') {
      return next(new AppError('Only client can delete project', 403));
    }

    // Check if payment has been made
    const { rows: transactions } = await db.query(
      'SELECT id FROM transactions WHERE project_id = $1',
      [projectId]
    );

    if (transactions.length > 0) {
      return next(new AppError('Cannot delete project with associated transactions', 400));
    }

    // Delete project
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);

    res.json({
      message: 'Project deleted successfully',
      project_id: projectId
    });
  } catch (error) {
    console.error('Delete project error:', error);
    return next(new AppError('Failed to delete project', 500));
  }
}

const getAllProjects = async (req, res, next) => {
  try {
    logger.info(`[getAllProjects] START user=${req.user?.user_id} role=${req.user?.role} query=${JSON.stringify(req.query)}`);

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    logger.info(`[getAllProjects] page=${page} limit=${limit} offset=${offset}`);

    // Optional filters
    const statusFilter = req.query.status?.trim() || null;
    const search = req.query.search?.trim() || null;
    const startDate = req.query.startDate?.trim() || null;
    const endDate = req.query.endDate?.trim() || null;
    const service = req.query.service?.trim() || null;

    // Maps frontend-friendly labels → DB values
    const STATUS_MAP = {
      working: { db: 'IN_PROGRESS', table: 'project' },
      dispute: { db: 'DISPUTE', table: 'project' },
      complete: { db: 'COMPLETED', table: 'project' },
      req_rejected: { db: 'rejected', table: 'package' },
      requested: { db: 'pending', table: 'package' },
      req_expired: { db: 'expired', table: 'package' },
    };

    let normalizedStatus = null;
    let isProjectStatus = false;
    let isPackageStatus = false;

    if (statusFilter) {
      const mapped = STATUS_MAP[statusFilter.toLowerCase()];
      if (!mapped) {
        return next(new AppError(
          `Invalid status. Allowed values: working, dispute, complete, req_rejected, requested, req_expired`,
          400
        ));
      }
      normalizedStatus = mapped.db;
      isProjectStatus = mapped.table === 'project';
      isPackageStatus = mapped.table === 'package';
    }

    const params = [];
    let p = 1;

    // Status — routed to correct table only; suppress the other side of the UNION entirely
    const projectStatusWhere = isProjectStatus ? `AND p.status = $${p++}` : (isPackageStatus ? 'AND 1=0' : '');
    const packageStatusWhere = isPackageStatus ? `AND cp2.status = $${p++}` : (isProjectStatus ? 'AND 1=0' : '');
    if (normalizedStatus) params.push(normalizedStatus);

    // Search — applied to both sides using same param index
    let projectSearchWhere = '', packageSearchWhere = '';
    if (search) {
      projectSearchWhere = `AND (c.full_name ILIKE $${p} OR f.freelancer_full_name ILIKE $${p})`;
      packageSearchWhere = `AND (c2.full_name ILIKE $${p} OR f2.freelancer_full_name ILIKE $${p})`;
      p++;
      params.push(`%${search}%`);
    }

    // Date range — applied to both sides using same param indices
    let projectStartWhere = '', packageStartWhere = '';
    if (startDate) {
      projectStartWhere = `AND p.created_at >= $${p}::date`;
      packageStartWhere = `AND cp2.created_at >= $${p}::date`;
      p++;
      params.push(startDate);
    }

    let projectEndWhere = '', packageEndWhere = '';
    if (endDate) {
      projectEndWhere = `AND p.created_at < ($${p}::date + INTERVAL '1 day')`;
      packageEndWhere = `AND cp2.created_at < ($${p}::date + INTERVAL '1 day')`;
      p++;
      params.push(endDate);
    }

    // Service name — applied to both sides using same param index
    let projectServiceWhere = '', packageServiceWhere = '';
    if (service) {
      projectServiceWhere = `AND s.service_name ILIKE $${p}`;
      packageServiceWhere = `AND s2.service_name ILIKE $${p}`;
      p++;
      params.push(`%${service}%`);
    }

    logger.info(`[getAllProjects] filters: status=${statusFilter} search=${search} startDate=${startDate} endDate=${endDate} service=${service} params=${JSON.stringify(params)}`);

    const unionQuery = `
      SELECT
        CASE
          WHEN p.status = 'COMPLETED'   THEN 'completed'
          WHEN p.status = 'IN_PROGRESS' THEN 'in_progress'
          WHEN p.status = 'DISPUTE'     THEN 'on_hold'
          ELSE 'project'
        END                             AS record_type,
        p.id,
        CASE
          WHEN p.status = 'COMPLETED'   THEN 'completed'
          WHEN p.status = 'IN_PROGRESS' THEN 'in_progress'
          WHEN p.status = 'DISPUTE'     THEN 'on_hold'
          ELSE COALESCE(cp.package_type, 'direct')
        END                             AS type,
        p.status                        AS status,
        p.amount                        AS price,
        p.number_of_units,
        p.end_date,
        NULL::integer                   AS delivery_days,
        NULL::text                      AS title,
        NULL::text                      AS description,
        p.creator_id,
        p.freelancer_id,
        c.full_name                     AS creator_name,
        c.email                         AS creator_email,
        c.profile_image_url             AS creator_profile_image,
        f.freelancer_full_name          AS freelancer_name,
        f.freelancer_email              AS freelancer_email,
        f.profile_image_url             AS freelancer_profile_image,
        s.service_name,
        p.created_at,
        p.updated_at,
        cp.room_id                      AS chat_id
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT package_type, initiator_role, room_id
        FROM custom_packages
        WHERE creator_id = p.creator_id
          AND freelancer_id = p.freelancer_id
        ORDER BY created_at DESC
        LIMIT 1
      ) cp ON true
      LEFT JOIN creators  c  ON p.creator_id   = c.creator_id
      LEFT JOIN freelancer f  ON p.freelancer_id = f.freelancer_id
      LEFT JOIN services   s  ON p.service_id   = s.id
      WHERE 1=1
        ${projectStatusWhere}
        ${projectSearchWhere}
        ${projectStartWhere}
        ${projectEndWhere}
        ${projectServiceWhere}

      UNION ALL

      SELECT
        CASE
          WHEN cp2.initiator_role = 'creator'    AND cp2.expires_at IS NOT NULL AND cp2.expires_at < NOW() THEN 'hire_req_expired'
          WHEN cp2.initiator_role = 'creator'    AND cp2.status = 'rejected'                              THEN 'hire_rejected'
          WHEN cp2.initiator_role = 'creator'    AND cp2.status = 'pending'                               THEN 'hire_requested'
          WHEN cp2.initiator_role = 'freelancer' AND cp2.expires_at IS NOT NULL AND cp2.expires_at < NOW() THEN 'package_request_expired'
          WHEN cp2.initiator_role = 'freelancer' AND cp2.status = 'rejected'                              THEN 'package_request_rejected'
          WHEN cp2.initiator_role = 'freelancer' AND cp2.status = 'pending'                               THEN 'package_requested'
          ELSE 'custom_package'
        END                             AS record_type,
        cp2.id,
        CASE
          WHEN cp2.initiator_role = 'creator'    AND cp2.expires_at IS NOT NULL AND cp2.expires_at < NOW() THEN 'hire_req_expired'
          WHEN cp2.initiator_role = 'creator'    AND cp2.status = 'rejected'                              THEN 'hire_rejected'
          WHEN cp2.initiator_role = 'creator'    AND cp2.status = 'pending'                               THEN 'hire_requested'
          WHEN cp2.initiator_role = 'freelancer' AND cp2.expires_at IS NOT NULL AND cp2.expires_at < NOW() THEN 'package_request_expired'
          WHEN cp2.initiator_role = 'freelancer' AND cp2.status = 'rejected'                              THEN 'package_request_rejected'
          WHEN cp2.initiator_role = 'freelancer' AND cp2.status = 'pending'                               THEN 'package_requested'
          ELSE cp2.package_type
        END                             AS type,
        cp2.status                      AS status,
        cp2.price,
        cp2.units                       AS number_of_units,
        NULL::date                      AS end_date,
        cp2.delivery_days               AS delivery_days,
        cp2.service_type                AS title,
        NULL::text                      AS description,
        cp2.creator_id,
        cp2.freelancer_id,
        c2.full_name                    AS creator_name,
        c2.email                        AS creator_email,
        c2.profile_image_url            AS creator_profile_image,
        f2.freelancer_full_name         AS freelancer_name,
        f2.freelancer_email             AS freelancer_email,
        f2.profile_image_url            AS freelancer_profile_image,
        s2.service_name,
        cp2.created_at,
        NULL::timestamptz               AS updated_at,
        cp2.room_id                     AS chat_id
      FROM custom_packages cp2
      JOIN creators  c2  ON cp2.creator_id   = c2.creator_id
      JOIN freelancer f2  ON cp2.freelancer_id = f2.freelancer_id
      LEFT JOIN services  s2  ON cp2.service_id  = s2.id
      WHERE cp2.status IN ('pending', 'rejected', 'expired')
        ${packageStatusWhere}
        ${packageSearchWhere}
        ${packageStartWhere}
        ${packageEndWhere}
        ${packageServiceWhere}
    `;

    const dataQuery = `${unionQuery} ORDER BY created_at DESC LIMIT $${p++} OFFSET $${p++}`;
    const countQuery = `SELECT COUNT(*) AS total FROM (${unionQuery}) AS combined`;

    const dataParams = [...params, limit, offset];
    const countParams = [...params];

    logger.info(`[getAllProjects] executing queries — dataParams=${JSON.stringify(dataParams)}`);
    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, dataParams),
      db.query(countQuery, countParams),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);
    logger.info(`[getAllProjects] DB returned rows=${dataResult.rows.length} total=${total}`);

    // Generate presigned URLs for profile images
    const EXPIRY = 4 * 60 * 60;
    const items = await Promise.all(
      dataResult.rows.map(async (row) => {
        for (const field of ['creator_profile_image', 'freelancer_profile_image']) {
          if (!row[field]) continue;
          try {
            const slash = row[field].indexOf('/');
            if (slash !== -1) {
              row[field] = await createPresignedUrl(
                row[field].substring(0, slash),
                row[field].substring(slash + 1),
                EXPIRY
              );
            }
          } catch {
            row[field] = null;
          }
        }
        return row;
      })
    );

    logger.info(`[getAllProjects] SUCCESS total=${total} page=${page} items=${items.length}`);

    return res.status(200).json({
      status: 'success',
      data: {
        items,
        pagination: { total, totalPages, currentPage: page, limit },
      },
    });
  } catch (error) {
    logger.error(`[getAllProjects] CATCH error=${error.message}`, error.stack);
    return next(new AppError('Failed to fetch projects', 500));
  }
};

const uploadDeliverable = async (req, res, next) => {
  try {
    const freelancerId = req.user.roleWiseId;
    const { role } = req.user;

    if (role !== 'freelancer') {
      return next(new AppError('Only freelancers can upload deliverables', 403));
    }

    const { project_id, project_description, deliverable_url } = req.body;

    if (!project_id || !deliverable_url) {
      return next(new AppError('project_id and deliverable_url are required', 400));
    }

    const files = Array.isArray(deliverable_url) ? deliverable_url : [deliverable_url];
    if (files.length === 0) {
      return next(new AppError('deliverable_url must contain at least one file', 400));
    }

    // Validate each file entry
    for (const file of files) {
      if (!file.type || !['s3', 'google_drive'].includes(file.type)) {
        return next(new AppError('Each file must have a type of "s3" or "google_drive"', 400));
      }
      if (file.type === 's3' && !file.key) {
        return next(new AppError('S3 files must include a "key"', 400));
      }
      if (file.type === 'google_drive') {
        const urls = Array.isArray(file.urls) ? file.urls : [];
        if (urls.length === 0) {
          return next(new AppError('Google Drive files must include a "urls" array with at least one URL', 400));
        }
        for (const u of urls) {
          if (!u.startsWith('https://drive.google.com/')) {
            return next(new AppError(`Invalid Google Drive URL: ${u}`, 400));
          }
        }
      }
    }

    // Verify project belongs to this freelancer and get service_id / creator_id / creator user_id
    const { rows: projects } = await db.query(
      `SELECT p.id, p.service_id, p.creator_id, p.freelancer_id, p.status, p.amount,
              c.user_id AS creator_user_id, s.service_name,
              u_c.user_email AS creator_email, u_c.user_name AS creator_name
       FROM projects p
       JOIN creators c ON p.creator_id = c.creator_id
       JOIN users u_c ON c.user_id = u_c.id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE p.id = $1 AND p.freelancer_id = $2`,
      [project_id, freelancerId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found or access denied', 404));
    }

    const project = projects[0];

    if (project.status !== 'IN_PROGRESS') {
      return next(new AppError(`Cannot upload deliverable for a project in status ${project.status}. Project must be IN_PROGRESS.`, 400));
    }

    const client = await db.connect();
    let inserted;
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO deliverables (deliverable_url, project_description, service_id, creator_id, freelancer_id, project_id)
         VALUES ($1::jsonb, $2, $3, $4, $5, $6)
         RETURNING id, deliverable_url, project_description, created_at`,
        [JSON.stringify(files), project_description || null, project.service_id, project.creator_id, freelancerId, project_id]
      );

      await client.query(
        `UPDATE projects SET status = 'SUBMITTED' WHERE id = $1`,
        [project_id]
      );

      await client.query('COMMIT');
      inserted = rows;
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    logger.info(`Deliverable uploaded by freelancer=${freelancerId} project=${project_id} status set to SUBMITTED`);

    const serviceLabel = project.service_name ? ` for ${project.service_name}` : '';

    const notificationResults = await Promise.allSettled([
      sendNotification({
        recipientId: project.creator_user_id,
        senderId: req.user.user_id,
        eventType: 'deliverable_uploaded',
        title: 'New deliverable uploaded',
        body: `${req.user.name} has uploaded a deliverable${serviceLabel}.`,
        actionType: 'link',
        actionRoute: String(project_id),
      }),
      sendNotification({
        recipientId: project.creator_user_id,
        senderId: req.user.user_id,
        eventType: 'rating_request',
        title: 'Rate your experience',
        body: `Your project${serviceLabel} is complete. Please rate ${req.user.name} for their work.`,
        actionType: 'link',
        actionRoute: String(project_id),
      }),
      sendDeliverySubmittedEmail({
        freelancerEmail: req.user.email,
        freelancerName: req.user.name,
        projectId: project_id,
        amount: project.amount,
      }),
      sendDeliveryReceivedEmail({
        creatorEmail: project.creator_email,
        creatorName: project.creator_name,
        freelancerName: req.user.name,
        projectId: project_id,
        serviceTitle: project.service_name,
        deliveryMessage: project_description,
      }),
    ]);

    notificationResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        const labels = ['deliverable_uploaded notification', 'rating_request notification', 'delivery submitted email', 'delivery received email'];
        logger.error(`uploadDeliverable: ${labels[i]} failed: ${result.reason?.message}`, result.reason?.stack);
      }
    });

    return res.status(201).json({
      status: 'success',
      message: 'Deliverable uploaded successfully',
      data: inserted[0],
    });
  } catch (error) {
    logger.error('uploadDeliverable error:', error);
    return next(new AppError('Failed to upload deliverable', 500));
  }
};

// Send a hire request (custom package) via REST API.
// Creates the chat room if it doesn't exist, saves the package and chat message,
// then publishes a real-time event to the chat-server via Redis.
const sendHireRequest = async (req, res, next) => {
  try {
    const senderUserId = req.user.user_id;
    const senderName = req.user.name;
    const senderRole = req.user.role; // 'creator' | 'freelancer'

    const {
      recipient_user_id,
      plan_type,
      price,
      units,
      package_type,
      service_type,
      delivery_days: bodyDeliveryDays,
      delivery_time: bodyDeliveryTime,
    } = req.body;

    if (!recipient_user_id || !plan_type || !price || !units || !package_type || !service_type) {
      return next(new AppError('recipient_user_id, plan_type, price, units, package_type and service_type are required', 400));
    }

    // Resolve freelancer row + service details (delivery_time in days, service_id)
    const freelancerResult = await db.query(
      `SELECT f.freelancer_id, f.user_id, s.id AS service_id, s.min_delivery_days AS delivery_days
       FROM freelancer f
       LEFT JOIN services s ON s.freelancer_id = f.freelancer_id
         AND s.service_name = $3
         AND LOWER(s.plan_type) = LOWER($4)
       WHERE f.user_id = $1 OR f.user_id = $2`,
      [senderUserId, recipient_user_id, service_type, plan_type]
    );

    if (freelancerResult.rows.length === 0) {
      return next(new AppError('No freelancer found between these two users', 400));
    }

    const freelancerRow = freelancerResult.rows[0];
    let freelancerId, creatorUserId, initiator_role;

    if (freelancerRow.user_id == senderUserId) {
      freelancerId = freelancerRow.freelancer_id;
      creatorUserId = recipient_user_id;
      initiator_role = 'freelancer';
    } else {
      freelancerId = freelancerRow.freelancer_id;
      creatorUserId = senderUserId;
      initiator_role = 'creator';
    }

    const creatorResult = await db.query(
      `SELECT creator_id FROM creators WHERE user_id = $1`,
      [creatorUserId]
    );
    const creatorId = creatorResult.rows[0]?.creator_id;
    if (!creatorId) {
      return next(new AppError('Creator profile not found', 404));
    }

    const service_id = freelancerRow.service_id || null;
    // Use body-provided values if given, otherwise compute from service data
    const delivery_days = bodyDeliveryDays !== undefined
      ? parseInt(bodyDeliveryDays) || 0
      : (parseInt(freelancerRow.delivery_days) || 0) * parseInt(units);
    const delivery_time = bodyDeliveryTime !== undefined ? parseInt(bodyDeliveryTime) || 0 : 0;

    // Get or create chat room
    const [smallerId, largerId] = [senderUserId, recipient_user_id].sort((a, b) => a - b);
    const chatRoomId = `${smallerId}-${largerId}`;

    await db.query(
      `INSERT INTO chat_rooms (room_id, user1_id, user2_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id) DO UPDATE SET room_id = EXCLUDED.room_id`,
      [chatRoomId, smallerId, largerId]
    );

    // Hire number: total custom packages between this creator-freelancer pair (before this one)
    const hireCountResult = await db.query(
      `SELECT COUNT(*) AS count FROM custom_packages WHERE freelancer_id = $1 AND creator_id = $2`,
      [freelancerId, creatorId]
    );
    const hire_number = parseInt(hireCountResult.rows[0].count) + 1;

    // Save custom package
    const packageResult = await db.query(
      `INSERT INTO custom_packages (
         room_id, freelancer_id, creator_id,
         plan_type, price, units, package_type, status, expires_at, created_at,
         delivery_days, delivery_time, service_id, service_type, initiator_role
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        chatRoomId, freelancerId, creatorId,
        plan_type, price, units, package_type,
        new Date(Date.now() + 24 * 7 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString(),
        delivery_days,
        delivery_time,
        service_id, service_type, initiator_role,
      ]
    );
    const customPackage = packageResult.rows[0];

    // Save chat message
    const messageResult = await db.query(
      `INSERT INTO messages (room_id, sender_id, recipient_id, message, message_type, custom_package_id, created_at)
       VALUES ($1,$2,$3,'Package sent','package',$4,$5)
       RETURNING *`,
      [chatRoomId, senderUserId, recipient_user_id, customPackage.id, new Date().toISOString()]
    );
    const savedMessage = messageResult.rows[0];

    // Push notification to recipient
    const notifTitle = initiator_role === 'creator' ? 'New Hire Request' : 'New Package Offer';
    const notifBody = initiator_role === 'creator'
      ? `${senderName} has sent you a hire request.`
      : `${senderName} has sent you a custom package offer.`;
    const eventType = initiator_role === 'creator' ? 'hire_request' : 'package_sent';

    await sendNotification({
      recipientId: recipient_user_id,
      senderId: senderUserId,
      eventType,
      title: notifTitle,
      body: notifBody,
      actionType: 'link',
      actionRoute: chatRoomId,
    });

    logger.info(`[sendHireRequest] package=${customPackage.id} room=${chatRoomId} initiator=${initiator_role}`);

    return res.status(201).json({
      status: 'success',
      data: {
        chatRoomId,
        hire_number,
        customPackage,
        message: savedMessage,
      },
    });
  } catch (error) {
    logger.error('[sendHireRequest] error:', error.message);
    return next(new AppError('Failed to send hire request', 500));
  }
};

const rateFreelancer = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { rating, review } = req.body;
    const creatorId = req.user.roleWiseId;

    if (req.user.role !== 'creator') {
      return next(new AppError('Only creators can rate freelancers', 403));
    }

    const ratingVal = Number(rating);
    if (!ratingVal || ratingVal < 1 || ratingVal > 5) {
      return next(new AppError('Rating must be between 1 and 5', 400));
    }

    // Verify project belongs to this creator and is COMPLETED
    const { rows: projects } = await db.query(
      `SELECT p.id, p.freelancer_id, p.status,
              f.user_id AS freelancer_user_id
       FROM projects p
       JOIN freelancer f ON p.freelancer_id = f.freelancer_id
       WHERE p.id = $1 AND p.creator_id = $2`,
      [projectId, creatorId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found or access denied', 404));
    }

    const project = projects[0];

    if (project.status !== 'COMPLETED') {
      return next(new AppError('You can only rate a completed project', 400));
    }

    // Check if creator has already rated this project
    const { rows: existing } = await db.query(
      `SELECT freelancer_rating FROM ratings WHERE project_id = $1 AND freelancer_rating IS NOT NULL`,
      [projectId]
    );
    if (existing.length > 0) {
      return next(new AppError('You have already rated this freelancer', 409));
    }

    // Upsert rating row — one row per project, set freelancer side
    await db.query(
      `INSERT INTO ratings (project_id, freelancer_id, creator_id, freelancer_rating, freelancer_review)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id) DO NOTHING`,
      [projectId, project.freelancer_id, creatorId, ratingVal, review || null]
    );

    // await sendNotification({
    //   recipientId: project.freelancer_user_id,
    //   senderId: req.user.user_id,
    //   eventType: 'new_rating',
    //   title: 'You received a new rating',
    //   body: `${req.user.name} rated your work ${ratingVal}/5.`,
    //   actionType: 'link',
    //   actionRoute: String(projectId),
    // });

    logger.info(`rateFreelancer: creator=${creatorId} rated freelancer=${project.freelancer_id} project=${projectId} rating=${ratingVal}`);

    return res.status(200).json({
      status: 'success',
      message: 'Freelancer rated successfully',
    });
  } catch (error) {
    logger.error('rateFreelancer error:', error);
    return next(new AppError('Failed to rate freelancer', 500));
  }
};

const rateCreator = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { rating, review } = req.body;
    const freelancerId = req.user.roleWiseId;

    if (req.user.role !== 'freelancer') {
      return next(new AppError('Only freelancers can rate creators', 403));
    }

    const ratingVal = Number(rating);
    if (!ratingVal || ratingVal < 1 || ratingVal > 5) {
      return next(new AppError('Rating must be between 1 and 5', 400));
    }

    // Verify project belongs to this freelancer and is COMPLETED
    const { rows: projects } = await db.query(
      `SELECT p.id, p.creator_id, p.status,
              c.user_id AS creator_user_id
       FROM projects p
       JOIN creators c ON p.creator_id = c.creator_id
       WHERE p.id = $1 AND p.freelancer_id = $2`,
      [projectId, freelancerId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found or access denied', 404));
    }

    const project = projects[0];

    if (project.status !== 'COMPLETED') {
      return next(new AppError('You can only rate a completed project', 400));
    }

    // Check if freelancer has already rated this project
    const { rows: existing } = await db.query(
      `SELECT creator_rating FROM ratings WHERE project_id = $1 AND creator_rating IS NOT NULL`,
      [projectId]
    );
    if (existing.length > 0) {
      return next(new AppError('You have already rated this creator', 409));
    }

    // Upsert rating row — one row per project, set creator side
    await db.query(
      `INSERT INTO ratings (project_id, freelancer_id, creator_id, creator_rating, creator_review)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id) DO NOTHING`,
      [projectId, freelancerId, project.creator_id, ratingVal, review || null]
    );

    // await sendNotification({
    //   recipientId: project.creator_user_id,
    //   senderId: req.user.user_id,
    //   eventType: 'new_rating',
    //   title: 'You received a new rating',
    //   body: `${req.user.name} rated their experience ${ratingVal}/5.`,
    //   actionType: 'link',
    //   actionRoute: String(projectId),
    // });

    logger.info(`rateCreator: freelancer=${freelancerId} rated creator=${project.creator_id} project=${projectId} rating=${ratingVal}`);

    return res.status(200).json({
      status: 'success',
      message: 'Creator rated successfully',
    });
  } catch (error) {
    logger.error('rateCreator error:', error);
    return next(new AppError('Failed to rate creator', 500));
  }
};

// Approve project (creator) — credits freelancer earnings_balance
const approveProject = async (req, res, next) => {
  const creatorId = req.user.roleWiseId;
  const projectId = req.params.id;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: projects } = await client.query(
      'SELECT * FROM projects WHERE id = $1 AND creator_id = $2 FOR UPDATE',
      [projectId, creatorId]
    );

    if (projects.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Project not found', 404));
    }

    if (projects[0].status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      return next(new AppError('Project must be SUBMITTED before approving', 400));
    }

    const { rows: transactions } = await client.query(
      `SELECT * FROM transactions WHERE project_id = $1 AND status = 'HELD' FOR UPDATE`,
      [projectId]
    );

    if (transactions.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('No held transaction found for this project', 400));
    }

    const transaction = transactions[0];

    // Change project status from SUBMITTED to COMPLETED after approval
    await client.query(
      `UPDATE projects SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
      [projectId]
    );

    await client.query(
      `UPDATE transactions SET status = 'COMPLETED', released_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [transaction.id]
    );

    await client.query(
      `UPDATE freelancer SET earnings_balance = earnings_balance + $1 , available_balance = available_balance + $1 WHERE freelancer_id = $2`,
      [transaction.freelancer_amount, transaction.freelancer_id]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      status: 'success',
      message: 'Project approved. Earnings credited to freelancer.',
      data: {
        project_id: projectId,
        transaction_id: transaction.id,
        freelancer_amount: transaction.freelancer_amount
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('approveProject error:', error);
    return next(new AppError('Failed to approve project', 500));
  } finally {
    client.release();
  }
};

// Reject project (creator) — auto-creates dispute, keeps funds in escrow
const rejectProject = async (req, res, next) => {
  const creatorId = req.user.roleWiseId;
  const creatorUserId = req.user.user_id;
  const projectId = req.params.id;
  const { reason_of_dispute, description } = req.body;

  if (!reason_of_dispute) {
    return next(new AppError('reason_of_dispute is required', 400));
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: projects } = await client.query(
      `SELECT p.*, f.user_id AS freelancer_user_id, f.freelancer_full_name, f.freelancer_email,
              s.service_name, c.full_name AS creator_name, c.email AS creator_email
       FROM projects p
       JOIN freelancer f ON p.freelancer_id = f.freelancer_id
       JOIN creators c ON p.creator_id = c.creator_id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE p.id = $1 AND p.creator_id = $2 FOR UPDATE`,
      [projectId, creatorId]
    );

    if (projects.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Project not found', 404));
    }

    const project = projects[0];

    if (project.status !== 'SUBMITTED') {
      await client.query('ROLLBACK');
      return next(new AppError('Project must be SUBMITTED before rejecting', 400));
    }

    // Update project to DISPUTE
    await client.query(
      `UPDATE projects SET status = 'DISPUTE', updated_at = NOW() WHERE id = $1`,
      [projectId]
    );

    // Create dispute
    const { rows: disputeResult } = await client.query(
      `INSERT INTO disputes (creator_id, freelancer_id, reason_of_dispute, description, raised_by, project_id)
       VALUES ($1, $2, $3, $4, 'creator', $5)
       RETURNING id`,
      [creatorId, project.freelancer_id, reason_of_dispute, description || null, projectId]
    );

    await client.query('COMMIT');

    const disputeId = disputeResult[0].id;

    // Send admin email
    sendAdminDisputeEmail({
      disputeId,
      projectId,
      creatorName: project.creator_name,
      creatorEmail: project.creator_email,
      freelancerName: project.freelancer_full_name,
      freelancerEmail: project.freelancer_email,
      serviceTitle: project.service_name,
      amount: project.amount,
      disputeReason: reason_of_dispute === 'other' ? description : reason_of_dispute,
    }).catch((err) => logger.error('Failed to send admin dispute email:', err));

    // Notify freelancer
    await Promise.all([
      sendNotification({
        recipientId: project.freelancer_user_id,
        senderId: creatorUserId,
        eventType: 'dispute_raised_against_you',
        title: 'A dispute has been raised against you',
        body: `${project.creator_name} has raised a dispute regarding project #${projectId}.`,
        actionType: 'link',
        actionRoute: disputeId,
      }),
      sendNotification({
        recipientId: creatorUserId,
        senderId: creatorUserId,
        eventType: 'dispute_raised_by_you',
        title: 'Dispute raised successfully',
        body: `Your dispute for project #${projectId} has been submitted. Our team will review it.`,
        actionType: 'link',
        actionRoute: disputeId,
      }),
    ]);

    return res.status(201).json({
      status: 'success',
      message: 'Project rejected. Dispute created. Funds held in escrow.',
      data: {
        project_id: projectId,
        dispute_id: disputeId
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('rejectProject error:', error);
    return next(new AppError('Failed to reject project', 500));
  } finally {
    client.release();
  }
};

module.exports = {
  createProject,
  getProject,
  getMyProjects,
  updateProjectStatus,
  deleteProject,
  getAllProjects,
  uploadDeliverable,
  sendHireRequest,
  rateFreelancer,
  rateCreator,
  approveProject,
  rejectProject,
}
