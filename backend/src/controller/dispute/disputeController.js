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
      `INSERT INTO disputes (creator_id, freelancer_id, project_id, reason_of_dispute, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [creator_id, freelancer_id, project_id, reason_of_dispute, description || null]
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

module.exports = { raiseDispute };
