const {pool:db} = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");
const {logger} = require('../../../utils/logger');
const { createPresignedUrl } = require('../../../utils/helper');

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
        c.full_name        AS creator_name,
        c.profile_image_url AS creator_avatar,
        f.freelancer_full_name AS freelancer_name
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

    // Generate presigned URLs for each deliverable file
    const deliverablesWithUrls = await Promise.all(
      deliverables.map(async (d) => {
        const files = Array.isArray(d.deliverable_url) ? d.deliverable_url : [d.deliverable_url];
        const signedFiles = await Promise.all(
          files.filter(Boolean).map(async (file) => {
            const key = typeof file === 'string' ? file : file.key || file.url;
            const url = await createPresignedUrl(key).catch(() => key);
            return { ...(typeof file === 'object' ? file : { key }), url };
          })
        );
        return {
          id: d.id,
          project_description: d.project_description,
          files: signedFiles,
        };
      })
    );

    // Generate presigned URL for creator avatar
    if (project.creator_avatar) {
      project.creator_avatar = await createPresignedUrl(project.creator_avatar).catch(() => project.creator_avatar);
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    logger.info('Get my projects called by user %s of type %s with status %s', userId, userType, status);

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

    const joins = `
FROM projects p
JOIN creators c   ON p.creator_id   = c.creator_id
JOIN freelancer f ON p.freelancer_id = f.freelancer_id
JOIN services s   ON p.service_id   = s.id`;

    const whereClause = `WHERE ${whereClauses.join(' AND ')}`;

    const countQuery = `SELECT COUNT(*) AS total ${joins} ${whereClause}`;

    const dataQuery = `
SELECT
  p.*,
  c.full_name               AS client_name,
  f.freelancer_full_name    AS freelancer_name,
  s.service_name
${joins}
${whereClause}
ORDER BY p.created_at DESC
LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;

    const paginatedParams = [...filterParams, limit, offset];

    logger.info('Executing query: %s with params: %o', dataQuery, paginatedParams);

    const [{ rows: projects }, { rows: countResult }] = await Promise.all([
      db.query(dataQuery, paginatedParams),
      db.query(countQuery, filterParams),
    ]);

    const totalCount = parseInt(countResult[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      status: 'success',
      message: 'Projects fetched successfully',
      data: {
        projects,
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

    const validStatuses = ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
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
      if (status === 'CANCELLED' && project.creator_id !== userId) {
        return next(new AppError('Only client can cancel project', 403));
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
    logger.info('Admin fetching all projects with pagination');

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Optional status filter - properly handle empty strings
    const status = req.query.status?.trim() || 'CREATED';

    // Build query
    let queryText = `
      SELECT
        p.id,
        p.creator_id,
        p.freelancer_id,
        p.service_id,
        p.number_of_units,
        p.amount,
        p.end_date,
        p.status,
        p.created_at,
        p.updated_at,
        c.full_name AS creator_name,
        c.email AS creator_email,
        c.profile_image_url AS creator_profile_image,
        f.freelancer_full_name AS freelancer_name,
        f.freelancer_email AS freelancer_email,
        f.profile_image_url AS freelancer_profile_image,
        s.service_name,
        s.service_price,
        s.service_description
      FROM projects p
      LEFT JOIN creators c ON p.creator_id = c.creator_id
      LEFT JOIN freelancer f ON p.freelancer_id = f.freelancer_id
      LEFT JOIN services s ON p.service_id = s.id
    `;

    const queryParams = [];
    let paramIndex = 1;

    // Add status filter if provided and not empty
    if (status && status.length > 0) {
      queryText += ` WHERE p.status = $${paramIndex++}`;
      queryParams.push(status);
    }

    // Order by most recent first
    queryText += ` ORDER BY p.created_at DESC`;

    // Add pagination
    queryText += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(limit, offset);

    // Execute main query
    const { rows: projects } = await db.query(queryText, queryParams);

    // Generate presigned URLs for profile images
    const expirySeconds = 4 * 60 * 60; // 4 hours

    const projectsWithImages = await Promise.all(
      projects.map(async (project) => {
        // Generate presigned URL for creator profile image
        if (project.creator_profile_image) {
          try {
            const firstSlashIndex = project.creator_profile_image.indexOf("/");
            if (firstSlashIndex !== -1) {
              const bucketName = project.creator_profile_image.substring(0, firstSlashIndex);
              const objectName = project.creator_profile_image.substring(firstSlashIndex + 1);
              project.creator_profile_image = await createPresignedUrl(bucketName, objectName, expirySeconds);
            }
          } catch (error) {
            logger.error(`Error generating presigned URL for creator profile image: ${error}`);
            project.creator_profile_image = null;
          }
        }

        // Generate presigned URL for freelancer profile image
        if (project.freelancer_profile_image) {
          try {
            const firstSlashIndex = project.freelancer_profile_image.indexOf("/");
            if (firstSlashIndex !== -1) {
              const bucketName = project.freelancer_profile_image.substring(0, firstSlashIndex);
              const objectName = project.freelancer_profile_image.substring(firstSlashIndex + 1);
              project.freelancer_profile_image = await createPresignedUrl(bucketName, objectName, expirySeconds);
            }
          } catch (error) {
            logger.error(`Error generating presigned URL for freelancer profile image: ${error}`);
            project.freelancer_profile_image = null;
          }
        }

        return project;
      })
    );

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM projects p';
    const countParams = [];

    if (status && status.length > 0) {
      countQuery += ' WHERE p.status = $1';
      countParams.push(status);
    }

    const { rows: countResult } = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    logger.info(`Fetched ${projects.length} projects for admin (page ${page})`);

    return res.status(200).json({
      status: 'success',
      message: 'All projects fetched successfully',
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
    console.error('Get all projects error:', error);
    logger.error('Error fetching all projects for admin:', error);
    return next(new AppError('Failed to fetch all projects', 500));
  }
};

module.exports = {
  createProject,
  getProject,
  getMyProjects,
  updateProjectStatus,
  deleteProject,
  getAllProjects
}
