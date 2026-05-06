const { pool: db } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');
const razorpay = require('../../../config/razorpay');
const paymentService = require('../../razor-pay-services/paymentService');
const { createPresignedUrl } = require('../../../utils/helper');
const { sendNotification } = require('../notification/notificationServicer');
const { sendAdminDisputeEmail } = require('../../../utils/welcomeEmail');

const EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours

async function signAvatarUrl(url) {
  if (!url) return null;
  const idx = url.indexOf('/');
  if (idx === -1) return null;
  try {
    return await createPresignedUrl(url.substring(0, idx), url.substring(idx + 1), EXPIRY_SECONDS);
  } catch {
    return null;
  }
}

const raiseDispute = async (req, res, next) => {
  try {
    const { role, roleWiseId } = req.user;
    const { other_party_id, reason_of_dispute, description, project_id } = req.body;

    if (!other_party_id || !reason_of_dispute) {
      return next(new AppError('other_party_id and reason_of_dispute are required', 400));
    }

    let creator_id, freelancer_id;

    if (role === 'freelancer') {
      freelancer_id = roleWiseId;
      const { rows: creactorCheck } = await db.query(
        `SELECT creator_id, full_name, email FROM creators WHERE user_id = $1`,
        [other_party_id]
      );
      if (creactorCheck.length === 0) {
        return next(new AppError('Creator not found', 404));
      }
      creator_id = creactorCheck[0].creator_id;
    } else if (role === 'creator') {
      creator_id = roleWiseId;
      const { rows: freelancerCheck } = await db.query(
        `SELECT freelancer_id, freelancer_full_name, freelancer_email FROM freelancer WHERE user_id = $1`,
        [other_party_id]
      );
      if (freelancerCheck.length === 0) {
        return next(new AppError('Freelancer not found', 404));
      }
      freelancer_id = freelancerCheck[0].freelancer_id;
    } else {
      return next(new AppError('Only creators and freelancers can raise a dispute', 403));
    }

    let serviceName = null;
    let projectAmount = null;
    if (project_id) {
      const projectCheck = await db.query(
        `SELECT p.id, p.amount, p.status, s.service_name,
                t.status as transaction_status
         FROM projects p
         LEFT JOIN services s ON p.service_id = s.id
         LEFT JOIN transactions t ON t.project_id = p.id AND t.status IN ('HELD', 'COMPLETED')
         WHERE p.id = $1`,
        [project_id]
      );
      if (projectCheck.rows.length === 0) {
        return next(new AppError('Project not found', 404));
      }

      const projectData = projectCheck.rows[0];
      serviceName = projectData.service_name;
      projectAmount = projectData.amount;

      // Validate project state before allowing dispute
      // 1. Check if payment was made (transaction must be HELD or COMPLETED)
      if (!projectData.transaction_status || projectData.transaction_status === 'INITIATED') {
        return next(new AppError('Cannot raise dispute for unpaid project. Payment must be completed first.', 400));
      }

      // 2. Only allow disputes during IN_PROGRESS or SUBMITTED status
      const validStatuses = ['IN_PROGRESS', 'SUBMITTED'];
      if (!validStatuses.includes(projectData.status)) {
        if (projectData.status === 'COMPLETED') {
          return next(new AppError('Cannot raise dispute for completed project.', 400));
        } else if (projectData.status === 'CANCELLED') {
          return next(new AppError('Cannot raise dispute for cancelled project.', 400));
        } else if (projectData.status === 'CREATED') {
          return next(new AppError('Cannot raise dispute. Project has not started yet.', 400));
        } else {
          return next(new AppError(`Cannot raise dispute for project in ${projectData.status} status.`, 400));
        }
      }

      // 3. Check if dispute already exists
      const { rows: existingDisputes } = await db.query(
        `SELECT id FROM disputes
         WHERE project_id = $1 AND status != 'resolved'`,
        [project_id]
      );

      if (existingDisputes.length > 0) {
        return next(new AppError('A dispute already exists for this project. Please wait for admin resolution.', 409));
      }
    }

    const disputeResult = await db.query(
      `INSERT INTO disputes (creator_id, freelancer_id, reason_of_dispute, description, raised_by, project_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [creator_id, freelancer_id, reason_of_dispute, description || null, role, project_id || null]
    );

    if (project_id) {
      await db.query(
        `UPDATE projects SET status = 'DISPUTE' WHERE id = $1`,
        [project_id]
      );
    }

    logger.info(`Dispute raised by ${role} (id: ${roleWiseId})`);

    // Fetch both parties' info for the admin email
    const partiesRes = await db.query(
      `SELECT c.full_name AS creator_name, c.email AS creator_email,
              f.freelancer_full_name AS freelancer_name, f.freelancer_email AS freelancer_email
       FROM creators c, freelancer f
       WHERE c.creator_id = $1 AND f.freelancer_id = $2`,
      [creator_id, freelancer_id]
    );

    if (partiesRes.rows.length > 0) {
      const { creator_name, creator_email, freelancer_name, freelancer_email } = partiesRes.rows[0];
      sendAdminDisputeEmail({
        disputeId: disputeResult.rows[0].id,
        projectId: project_id || null,
        creatorName: creator_name,
        creatorEmail: creator_email,
        freelancerName: freelancer_name,
        freelancerEmail: freelancer_email,
        serviceTitle: serviceName,
        amount: projectAmount,
        disputeReason: reason_of_dispute === 'other' ? description : reason_of_dispute,
      }).catch((err) => logger.error('Failed to send admin dispute email:', err));
    }

    const raiserId = req.user.user_id;
    const disputeRoute = disputeResult.rows[0].id;
    const disputeReason = reason_of_dispute === 'other' ? description : reason_of_dispute;
    const disputeBody = serviceName
      ? `${req.user.name} has raised a dispute against you about ${disputeReason} on ${serviceName}.`
      : `${req.user.name} has raised a dispute against you about ${disputeReason}.`;

    await Promise.all([
      // Notify the other party
      sendNotification({
        recipientId: other_party_id,
        senderId: raiserId,
        eventType: 'dispute_raised_against_you',
        title: 'A dispute has been raised against you',
        body: disputeBody,
        actionType: 'link',
        actionRoute: disputeRoute,
      }),
      // Confirm to the raiser
      sendNotification({
        recipientId: raiserId,
        senderId: raiserId,
        eventType: 'dispute_raised_by_you',
        title: 'Dispute raised successfully',
        body: `Your dispute has been successfully raised ${req.user.name}.Our team will review the details and keep you informed for of the next steps.`,
        actionType: 'link',
        actionRoute: disputeRoute,
      }),
    ]);

    return res.status(201).json({
      status: 'success',
      message: 'Dispute raised successfully',
      data: {
        dispute_id: disputeResult.rows[0].id,
        creator_id,
        freelancer_id,
        project_id: project_id || null,
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

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    if (type !== 'against_me' && type !== 'by_me' || status.trim() && !['pending', 'resolved'].includes(status.trim())) {
      return next(new AppError('Invalid type parameter. Must be either "against_me" or "by_me".', 400));
    }

    if (role !== 'creator' && role !== 'freelancer') {
      return next(new AppError('Only creators and freelancers can view disputes', 403));
    }

    const raisedByFilter = type === 'against_me'
      ? (role === 'freelancer' ? 'creator' : 'freelancer')
      : role;

    const myCol = role === 'freelancer' ? 'd.freelancer_id' : 'd.creator_id';
    const searchNameCol = role === 'creator' ? 'f.freelancer_full_name' : 'c.full_name';

    const params = [roleWiseId, raisedByFilter];
    let nextParam = 3;

    const statusFilter = status.trim() ? `AND d.status = $${nextParam++}` : '';
    if (status.trim()) params.push(status.trim());

    const searchFilter = search.trim() ? `AND ${searchNameCol} ILIKE $${nextParam++}` : '';
    if (search.trim()) params.push(`%${search.trim()}%`);

    const dataQuery = `
      SELECT
        d.id                       AS dispute_id,
        d.project_id,
        d.freelancer_id,
        d.reason_of_dispute,
        d.description              AS dispute_description,
        d.admin_note ,
        d.created_at               AS dispute_created_at,
        d.status                   AS dispute_status,
        d.raised_by,
        c.full_name                AS creator_name,
        c.profile_image_url        AS creator_avatar,
        f.freelancer_full_name     AS freelancer_name,
        f.profile_image_url        AS freelancer_avatar,
        p.status                   AS project_status,
        p.amount                   AS project_amount,
        p.end_date                 AS project_end_date,
        s.id                       AS service_id,
        s.service_name,
        s.service_price,
        s.plan_type,
        s.min_delivery_days::text || '-' || s.max_delivery_days::text AS delivery_time
      FROM disputes d
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      LEFT JOIN projects p  ON d.project_id = p.id
      LEFT JOIN services s  ON p.service_id = s.id
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

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    logger.info(`getDisputes [${type}] for ${role} id=${roleWiseId}, total=${total}`);

    const disputes = await Promise.all(
      dataResult.rows.map(async (d) => ({
        ...d,
        creator_id: d.creator_id,
        creator_avatar: await signAvatarUrl(d.creator_avatar),
        freelancer_avatar: await signAvatarUrl(d.freelancer_avatar),
      }))
    );

    return res.status(200).json({
      status: 'success',
      data: {
        disputes,
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
    const { status = '', search = '', page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const params = [];
    let nextParam = 1;
    const conditions = [];

    if (status.trim()) {
      conditions.push(`d.status = $${nextParam++}`);
      params.push(status.trim());
    }
    if (search.trim()) {
      conditions.push(`(c.full_name ILIKE $${nextParam} OR f.freelancer_full_name ILIKE $${nextParam})`);
      params.push(`%${search.trim()}%`);
      nextParam++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
        f.profile_image_url        AS freelancer_avatar,
        cr.room_id                 AS chat_room_id
      FROM disputes d
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      LEFT JOIN chat_rooms cr ON (
        (cr.user1_id = c.user_id AND cr.user2_id = f.user_id) OR
        (cr.user1_id = f.user_id AND cr.user2_id = c.user_id)
      )
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${nextParam++} OFFSET $${nextParam++}
    `;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM disputes d
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      ${whereClause}
    `;

    const paginatedParams = [...params, limitNum, offset];

    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, paginatedParams),
      db.query(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    logger.info(`getAllDisputes: total=${total} status=${status || 'all'} page=${pageNum}`);

    const disputes = await Promise.all(
      dataResult.rows.map(async (d) => ({
        ...d,
        creator_avatar: await signAvatarUrl(d.creator_avatar),
        freelancer_avatar: await signAvatarUrl(d.freelancer_avatar),
      }))
    );

    return res.status(200).json({
      status: 'success',
      data: {
        disputes,
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
  const adminId = req.user.roleWiseId;
  const { id } = req.params;
  const { resolution_action, admin_note } = req.body;

  if (!resolution_action || !['resolve', 'release', 'refund'].includes(resolution_action)) {
    return next(new AppError('resolution_action is required and must be "resolve", "release" or "refund"', 400));
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Get dispute + linked transaction (LEFT JOIN so disputes without transactions are still found)
    const { rows: disputes } = await client.query(
      `SELECT d.*, t.id AS transaction_id, t.status AS transaction_status,
              t.razorpay_payment_id, t.total_amount, t.freelancer_amount,
              t.freelancer_id AS t_freelancer_id, t.razorpay_transfer_id
       FROM disputes d
       LEFT JOIN LATERAL (
         SELECT * FROM transactions
         WHERE d.project_id IS NOT NULL AND project_id = d.project_id
         ORDER BY created_at DESC
         LIMIT 1
       ) t ON true
       WHERE d.id = $1
       FOR UPDATE OF d`,
      [id]
    );

    if (disputes.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Dispute not found', 404));
    }

    const dispute = disputes[0];

    if (dispute.status === 'resolved') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Dispute is already resolved',
      });
    }

    // Disputes without project_id can only be resolved (no payment actions)
    if (!dispute.project_id && resolution_action !== 'resolve') {
      await client.query('ROLLBACK');
      return next(new AppError('This dispute has no linked project. Only "resolve" action is allowed (no payment operations).', 400));
    }

    if (resolution_action !== 'resolve') {
      // Require a linked transaction for release/refund actions
      if (!dispute.transaction_id) {
        await client.query('ROLLBACK');
        return next(new AppError('No linked transaction found for this dispute. Use "resolve" to close it without a payment action.', 400));
      }

      // Check if transaction already COMPLETED (funds already released)
      if (dispute.transaction_status === 'COMPLETED') {
        await client.query('ROLLBACK');
        return next(new AppError('Transaction already completed. Funds already released to freelancer.', 400));
      }

      // Check if transaction is not HELD (can't release/refund)
      if (dispute.transaction_status !== 'HELD') {
        await client.query('ROLLBACK');
        return next(new AppError(`Cannot process payment action: transaction status is ${dispute.transaction_status}`, 400));
      }
    }

    if (resolution_action === 'resolve') {
      // Just mark as resolved — no money movement

    } else if (resolution_action === 'release') {
      // Release funds to freelancer
      if (dispute.razorpay_transfer_id) {
        // Routes flow: release the on-hold transfer
        await razorpay.transfers.edit(dispute.razorpay_transfer_id, { on_hold: 0 });
        logger.info(`Dispute ${id}: Released transfer ${dispute.razorpay_transfer_id} via Routes`);
      } else {
        // Legacy flow: credit freelancer balances manually
        await client.query(
          `UPDATE freelancer SET earnings_balance = earnings_balance + $1, available_balance = available_balance + $1 WHERE freelancer_id = $2`,
          [dispute.freelancer_amount, dispute.t_freelancer_id]
        );
      }

      await client.query(
        `UPDATE transactions SET status = 'COMPLETED', released_by = $1, released_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [adminId, dispute.transaction_id]
      );

      await client.query(
        `UPDATE projects SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
        [dispute.project_id]
      );

    } else {
      // Refund full amount (including GST) to creator
      if (!dispute.razorpay_payment_id) {
        await client.query('ROLLBACK');
        return next(new AppError('No Razorpay payment ID found for this transaction', 400));
      }

      const refundAmountPaise = Math.round(parseFloat(dispute.total_amount) * 100);

      // Routes flow: refund with reverse_all to atomically reverse transfer + refund
      const refund = await razorpay.payments.refund(dispute.razorpay_payment_id, {
        amount: refundAmountPaise,
        reverse_all: dispute.razorpay_transfer_id ? 1 : undefined,
        notes: {
          dispute_id: id,
          reason: 'Dispute resolved in creator favour',
        },
      });
      if (dispute.razorpay_transfer_id) {
        logger.info(`Dispute ${id}: Refund with reverse_all for transfer ${dispute.razorpay_transfer_id}`);
      }

      await client.query(
        `UPDATE transactions SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1`,
        [dispute.transaction_id]
      );

      await client.query(
        `UPDATE projects SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
        [dispute.project_id]
      );

      logger.info(`Razorpay refund triggered: refund_id=${refund.id} payment_id=${dispute.razorpay_payment_id} amount=${dispute.total_amount}`);
    }

    // Mark dispute resolved
    const { rows: resolved } = await client.query(
      `UPDATE disputes
       SET status = 'resolved', admin_note = $1::jsonb, admin_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, status, admin_note, admin_id, updated_at`,
      [JSON.stringify({ note: admin_note || '', action: resolution_action }), adminId, id]
    );

    await client.query('COMMIT');

    logger.info(`Dispute ${id} resolved by admin ${adminId} with action: ${resolution_action}`);

    return res.status(200).json({
      status: 'success',
      message: resolution_action === 'release'
        ? 'Dispute resolved. Funds released to freelancer.'
        : resolution_action === 'refund'
          ? 'Dispute resolved. Full refund initiated to creator.'
          : 'Dispute marked as resolved.',
      data: resolved[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('resolveDispute error:', error);
    return next(new AppError('Failed to resolve dispute', 500));
  } finally {
    client.release();
  }
};

module.exports = { raiseDispute, getDisputes, getAllDisputes, resolveDispute };
