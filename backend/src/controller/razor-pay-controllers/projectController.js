const { query } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");

// Create a new project
const createProject = async (req, res, next) => {
  try {
    const clientId = req.user.id;
    const { freelancer_id, service_id, number_of_units, amount, project_end_date } = req.body;

    if (!freelancer_id || !amount || !service_id || !number_of_units || !project_end_date) {
      return next(new AppError('Freelancer ID, title, and amount are required', 400));
    }

    if (amount <= 0) {
      return next(new AppError('Invalid amount', 400));
    }

    // Verify freelancer exists
    const { rows: freelancers } = await query(
      'SELECT id FROM users WHERE id = $1 AND user_type = $2 AND status = $3',
      [freelancer_id, 'freelancer', 'ACTIVE']
    );

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found or inactive', 404));
    }

    // Create project
    const { rows: result } = await query(
      `INSERT INTO projects (creator_id, freelancer_id, service_id, number_of_units, amount, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'CREATED')
       RETURNING id`,
      [clientId, freelancer_id, service_id, number_of_units, amount, project_end_date]
    );

    res.status(201).json({
      message: 'Project created successfully',
      project_id: result[0].id,
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

    const { rows: projects } = await query(
      `SELECT p.*,
        c.full_name as creator_name, c.email as creator_email,
        f.full_name as freelancer_name, f.email as freelancer_email
       FROM projects p
       JOIN creators c ON p.creator_id = c.creator_id
       JOIN freelancer f ON p.freelancer_id = f.freelancer_id
       WHERE p.id = $1`,
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
    const userId = req.user.id;
    const userType = req.user.role;
    const status = req.query.status;

    let queryText = `
      SELECT p.*,
        c.full_name as client_name,
        f.freelancer_full_name as freelancer_name
      FROM projects p
      JOIN creators c ON p.creator_id = c.creator_id
      JOIN freelancer f ON p.freelancer_id = f.freelancer_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (userType === 'creator') {
      queryText += ` AND p.creator_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    } else if (userType === 'freelancer') {
      queryText += ` AND p.freelancer_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    } else {
      return next(new AppError('Invalid user type', 400));
    }

    if (status) {
      queryText += ` AND p.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    queryText += ' ORDER BY p.created_at DESC';

    const { rows: projects } = await query(queryText, params);

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
    const { rows: projects } = await query(
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
      if (status === 'CANCELLED' && project.client_id !== userId) {
        return next(new AppError('Only client can cancel project', 403));
      }
    }

    // Update status
    const completedAt = status === 'COMPLETED' ? new Date() : null;

    await query(
      'UPDATE projects SET status = $1, completed_at = $2, updated_at = NOW() WHERE id = $3',
      [status, completedAt, projectId]
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
    const { rows: projects } = await query(
      'SELECT * FROM projects WHERE id = $1',
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
    const { rows: transactions } = await query(
      'SELECT id FROM transactions WHERE project_id = $1',
      [projectId]
    );

    if (transactions.length > 0) {
      return next(new AppError('Cannot delete project with associated transactions', 400));
    }

    // Delete project
    await query('DELETE FROM projects WHERE id = $1', [projectId]);

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
