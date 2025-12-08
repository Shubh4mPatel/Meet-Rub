const {pool:db} = require('../../../config/dbConfig');

class ProjectController {
  // Create a new project
  async createProject(req, res) {
    try {
      const clientId = req.user.id;
      const { freelancer_id, title, description, amount } = req.body;

      if (!freelancer_id || !title || !amount) {
        return res.status(400).json({ 
          error: 'Freelancer ID, title, and amount are required' 
        });
      }

      if (amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      // Verify freelancer exists
      const [freelancers] = await db.query(
        'SELECT id FROM users WHERE id = ? AND user_type = "FREELANCER" AND status = "ACTIVE"',
        [freelancer_id]
      );

      if (freelancers.length === 0) {
        return res.status(404).json({ error: 'Freelancer not found or inactive' });
      }

      // Create project
      const [result] = await db.query(
        `INSERT INTO projects (client_id, freelancer_id, title, description, amount, status) 
         VALUES (?, ?, ?, ?, ?, 'CREATED')`,
        [clientId, freelancer_id, title, description, amount]
      );

      res.status(201).json({
        message: 'Project created successfully',
        project_id: result.insertId,
        amount
      });
    } catch (error) {
      console.error('Create project error:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  }

  // Get project details
  async getProject(req, res) {
    try {
      const projectId = req.params.id;
      const userId = req.user.id;

      const [projects] = await db.query(
        `SELECT p.*, 
          c.full_name as client_name, c.email as client_email,
          f.full_name as freelancer_name, f.email as freelancer_email
         FROM projects p
         JOIN users c ON p.client_id = c.id
         JOIN users f ON p.freelancer_id = f.id
         WHERE p.id = ?`,
        [projectId]
      );

      if (projects.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const project = projects[0];

      // Check access
      if (project.client_id !== userId && 
          project.freelancer_id !== userId && 
          req.user.user_type !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(project);
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({ error: 'Failed to get project' });
    }
  }

  // Get user's projects
  async getMyProjects(req, res) {
    try {
      const userId = req.user.id;
      const userType = req.user.user_type;
      const status = req.query.status;

      let query = `
        SELECT p.*, 
          c.full_name as client_name,
          f.full_name as freelancer_name
        FROM projects p
        JOIN users c ON p.client_id = c.id
        JOIN users f ON p.freelancer_id = f.id
        WHERE 
      `;

      const params = [];

      if (userType === 'CLIENT') {
        query += 'p.client_id = ?';
        params.push(userId);
      } else if (userType === 'FREELANCER') {
        query += 'p.freelancer_id = ?';
        params.push(userId);
      } else {
        return res.status(400).json({ error: 'Invalid user type' });
      }

      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }

      query += ' ORDER BY p.created_at DESC';

      const [projects] = await db.query(query, params);

      res.json({
        count: projects.length,
        projects
      });
    } catch (error) {
      console.error('Get my projects error:', error);
      res.status(500).json({ error: 'Failed to get projects' });
    }
  }

  // Update project status
  async updateProjectStatus(req, res) {
    try {
      const projectId = req.params.id;
      const { status } = req.body;
      const userId = req.user.id;

      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const validStatuses = ['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      // Get project
      const [projects] = await db.query(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );

      if (projects.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const project = projects[0];

      // Check permissions
      if (req.user.user_type !== 'ADMIN') {
        if (status === 'COMPLETED' && project.freelancer_id !== userId) {
          return res.status(403).json({ 
            error: 'Only freelancer can mark project as completed' 
          });
        }
        if (status === 'CANCELLED' && project.client_id !== userId) {
          return res.status(403).json({ 
            error: 'Only client can cancel project' 
          });
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
      res.status(500).json({ error: 'Failed to update project status' });
    }
  }

  // Delete project (only if not paid)
  async deleteProject(req, res) {
    try {
      const projectId = req.params.id;
      const userId = req.user.id;

      // Get project
      const [projects] = await db.query(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      );

      if (projects.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const project = projects[0];

      // Check if user is client
      if (project.client_id !== userId && req.user.user_type !== 'ADMIN') {
        return res.status(403).json({ error: 'Only client can delete project' });
      }

      // Check if payment has been made
      const [transactions] = await db.query(
        'SELECT id FROM transactions WHERE project_id = ?',
        [projectId]
      );

      if (transactions.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete project with associated transactions' 
        });
      }

      // Delete project
      await db.query('DELETE FROM projects WHERE id = ?', [projectId]);

      res.json({
        message: 'Project deleted successfully',
        project_id: projectId
      });
    } catch (error) {
      console.error('Delete project error:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  }
}

module.exports = new ProjectController();
