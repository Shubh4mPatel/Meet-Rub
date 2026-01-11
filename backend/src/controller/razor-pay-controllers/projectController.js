const {pool:db} = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");
const {logger} = require('../../../utils/logger');

// Create a new project
const createProject = async (req, res, next) => {
  try {
    const clientId = req.user.id;
    const { freelancer_id, service_id , number_of_units , amount , project_end_date } = req.body;

    if (!freelancer_id || !amount || !service_id || !number_of_units || !project_end_date) {
      return next(new AppError('Freelancer ID, title, and amount are required', 400));
    }

    if (amount <= 0) {
      return next(new AppError('Invalid amount', 400));
    }

    // Verify freelancer exists
    const [freelancers] = await db.query(
      'SELECT id FROM users WHERE id = ? AND user_role = "freelancer" AND approval_status = "approved"',
      [freelancer_id]
    );

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found or inactive', 404));
    }

    // Create project
    const [result] = await db.query(
      `INSERT INTO projects (creator_id, freelancer_id, service_id, number_of_units, amount, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'CREATED')`,
      [clientId, freelancer_id, service_id, number_of_units, amount, project_end_date]
    );

    res.status(201).json({
      message: 'Project created successfully',
      project_id: result.insertId,
      amount
    });

  } catch (error) {
    console.error('Create project error:', error);
    return next(new AppError('Failed to create project', 500));
  }
}

// Get project details
const getProject = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const [projects] = await db.query(
      `SELECT p.*,
        c.full_name as creator_name, c.email as creator_email,
        f.full_name as freelancer_name, f.email as freelancer_email
       FROM projects p
       JOIN creators c ON p.creator_id = c.creator_id
       JOIN freelancer f ON p.freelancer_id = f.freelancer_id
       WHERE p.id = ?`,
      [projectId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    const project = projects[0];

    // Check access
    if (project.creator_id !== userId &&
        project.freelancer_id !== userId &&
        req.user.user_type !== 'ADMIN') {
      return next(new AppError('Access denied', 403));
    }

    res.json(project);
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
    logger.info('Get my projects called by user %s of type %s with status %s', userId, userType, status);
    
    let query = `
      SELECT p.*,
        c.full_name as client_name,
        f.full_name as freelancer_name
      FROM projects p
      JOIN creators c ON p.creator_id = c.creator_id
      JOIN freelancer f ON p.freelancer_id = f.freelancer_id
      WHERE
    `;

    const params = [];
    let paramIndex = 1;

    if (userType === 'creator') {
      query += `p.creator_id = $${paramIndex++}`;
      params.push(userId);
    } else if (userType === 'freelancer') {
      query += `p.freelancer_id = $${paramIndex++}`;
      params.push(userId);
    } else {
      return next(new AppError('Invalid user type', 400));
    }

    if (status) {
      query += ` AND p.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC';
    logger.info('Executing query: %s with params: %o', query, params);
    const { rows: projects } = await db.query(query, params);

    res.json({
      count: projects.length,
      projects
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
    const userId = req.user.id;

    if (!status) {
      return next(new AppError('Status is required', 400));
    }

    const validStatuses = ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid status', 400));
    }

    // Get project
    const [projects] = await db.query(
      'SELECT * FROM projects WHERE id = ?',
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
      if (status === 'CANCELLED' && project.client_id !== userId) {
        return next(new AppError('Only client can cancel project', 403));
      }
    }

    // Update status
    const updateData = { status };
    if (status === 'COMPLETED') {
      updateData.completed_at = new Date();
    }

    await db.query(
      'UPDATE projects SET status = ?, completed_at = ?, updated_at = NOW() WHERE id = ?',
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
    const userId = req.user.id;

    // Get project
    const [projects] = await db.query(
      'SELECT * FROM projects WHERE id = ?',
      [projectId]
    );

    if (projects.length === 0) {
      return next(new AppError('Project not found', 404));
    }

    const project = projects[0];

    // Check if user is client
    if (project.client_id !== userId && req.user.user_type !== 'ADMIN') {
      return next(new AppError('Only client can delete project', 403));
    }

    // Check if payment has been made
    const [transactions] = await db.query(
      'SELECT id FROM transactions WHERE project_id = ?',
      [projectId]
    );

    if (transactions.length > 0) {
      return next(new AppError('Cannot delete project with associated transactions', 400));
    }

    // Delete project
    await db.query('DELETE FROM projects WHERE id = ?', [projectId]);

    res.json({
      message: 'Project deleted successfully',
      project_id: projectId
    });
  } catch (error) {
    console.error('Delete project error:', error);
    return next(new AppError('Failed to delete project', 500));
  }
}

module.exports = {
  createProject,
  getProject,
  getMyProjects,
  updateProjectStatus,
  deleteProject
}
