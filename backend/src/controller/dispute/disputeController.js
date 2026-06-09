const { pool: db } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');
const razorpay = require('../../../config/razorpay');
const paymentService = require('../../razor-pay-services/paymentService');
const { createPresignedUrl } = require('../../../utils/helper');
const { sendNotification } = require('../notification/notificationServicer');
const { sendAdminDisputeEmail } = require('../../../utils/welcomeEmail');
const { sendCreatorDisputeEmail, sendFreelancerDisputeEmail, sendDisputeResolvedCreatorEmail, sendDisputeResolvedFreelancerEmail } = require('../../../utils/deliveryEmails');

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
      const disputeReasonDisplay = reason_of_dispute === 'other' ? description : reason_of_dispute;

      Promise.allSettled([
        // Email to admin
        sendAdminDisputeEmail({
          disputeId: disputeResult.rows[0].id,
          projectId: project_id || null,
          creatorName: creator_name,
          creatorEmail: creator_email,
          freelancerName: freelancer_name,
          freelancerEmail: freelancer_email,
          serviceTitle: serviceName,
          amount: projectAmount,
          disputeReason: disputeReasonDisplay,
        }),
        // Email to creator (either raising it or being disputed)
        role === 'creator'
          ? sendCreatorDisputeEmail({
            creatorEmail: creator_email,
            creatorName: creator_name,
            freelancerName: freelancer_name,
            disputeId: disputeResult.rows[0].id,
            projectId: project_id,
            serviceTitle: serviceName,
            disputeReason: disputeReasonDisplay,
          })
          : sendCreatorDisputeEmail({
            creatorEmail: creator_email,
            creatorName: creator_name,
            freelancerName: freelancer_name,
            disputeId: disputeResult.rows[0].id,
            projectId: project_id,
            serviceTitle: serviceName,
            disputeReason: disputeReasonDisplay,
          }),
        // Email to freelancer (either raising it or being disputed)
        sendFreelancerDisputeEmail({
          freelancerEmail: freelancer_email,
          freelancerName: freelancer_name,
          creatorName: creator_name,
          disputeId: disputeResult.rows[0].id,
          projectId: project_id,
          serviceTitle: serviceName,
          disputeReason: disputeReasonDisplay,
        }),
      ]).then((results) => {
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            const labels = ['admin email', 'creator email', 'freelancer email'];
            logger.error(`raiseDispute: ${labels[i]} failed: ${result.reason?.message}`, result.reason?.stack);
          }
        });
      });
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
        title: 'Dispute Raised',
        body: `A dispute has been raised for Order #${project_id || 'N/A'}. Our team will review and resolve within 7 business days.`,
        actionType: 'link',
        actionRoute: String(disputeRoute),
      }),
      // Confirm to the raiser
      sendNotification({
        recipientId: raiserId,
        senderId: raiserId,
        eventType: 'dispute_raised_by_you',
        title: 'Dispute Submitted',
        body: `Your dispute for Order #${project_id || 'N/A'} has been submitted. Our team will review and resolve within 7 business days.`,
        actionType: 'link',
        actionRoute: String(disputeRoute),
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
        d.creator_id,
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
        d.project_id,
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
        p.status                   AS project_status,
        p.amount                   AS project_amount,
        s.service_name,
        cr.room_id                 AS chat_room_id
      FROM disputes d
      JOIN creators c   ON d.creator_id   = c.creator_id
      JOIN freelancer f ON d.freelancer_id = f.freelancer_id
      LEFT JOIN projects p  ON d.project_id = p.id
      LEFT JOIN services s  ON p.service_id = s.id
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

  logger.info(`resolveDispute: admin=${adminId} dispute=${id} action=${resolution_action}`);

  if (!resolution_action || !['resolve', 'release', 'refund'].includes(resolution_action)) {
    return next(new AppError('resolution_action is required and must be "resolve", "release" or "refund"', 400));
  }

  const client = await db.connect();
  logger.info(`resolveDispute: DB client acquired for dispute=${id}`);
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL lock_timeout = \'20s\'');
    logger.info(`resolveDispute: Transaction BEGIN for dispute=${id}`);

    // Get dispute + linked transaction (LEFT JOIN so disputes without transactions are still found)
    logger.info(`resolveDispute: Fetching dispute + linked transaction for dispute=${id}`);
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
      logger.warn(`resolveDispute: Dispute not found dispute=${id}`);
      await client.query('ROLLBACK');
      return next(new AppError('Dispute not found', 404));
    }

    const dispute = disputes[0];
    logger.info(`resolveDispute: Dispute fetched dispute=${id} status=${dispute.status} project_id=${dispute.project_id} transaction_id=${dispute.transaction_id} transaction_status=${dispute.transaction_status} payment_id=${dispute.razorpay_payment_id} transfer_id=${dispute.razorpay_transfer_id}`);

    if (dispute.status === 'resolved') {
      logger.warn(`resolveDispute: Dispute already resolved dispute=${id}`);
      await client.query('ROLLBACK');
      return res.status(400).json({
        status: 'error',
        message: 'Dispute is already resolved',
      });
    }

    // Disputes without project_id can only be resolved (no payment actions)
    if (!dispute.project_id && resolution_action !== 'resolve') {
      logger.warn(`resolveDispute: No project linked to dispute=${id}, action=${resolution_action} rejected`);
      await client.query('ROLLBACK');
      return next(new AppError('This dispute has no linked project. Only "resolve" action is allowed (no payment operations).', 400));
    }

    if (resolution_action !== 'resolve') {
      // Require a linked transaction for release/refund actions
      if (!dispute.transaction_id) {
        logger.warn(`resolveDispute: No linked transaction for dispute=${id}, action=${resolution_action} requires one`);
        await client.query('ROLLBACK');
        return next(new AppError('No linked transaction found for this dispute. Use "resolve" to close it without a payment action.', 400));
      }

      // Check if transaction already COMPLETED (funds already released)
      if (dispute.transaction_status === 'COMPLETED') {
        logger.warn(`resolveDispute: Transaction already COMPLETED for dispute=${id} transaction=${dispute.transaction_id}`);
        await client.query('ROLLBACK');
        return next(new AppError('Transaction already completed. Funds already released to freelancer.', 400));
      }

      // Check if transaction is not HELD (can't release/refund)
      if (dispute.transaction_status !== 'HELD') {
        logger.warn(`resolveDispute: Transaction status=${dispute.transaction_status} is not HELD, cannot process payment action for dispute=${id}`);
        await client.query('ROLLBACK');
        return next(new AppError(`Cannot process payment action: transaction status is ${dispute.transaction_status}`, 400));
      }
    }

    if (resolution_action === 'resolve') {
      // Just mark as resolved — no money movement
      logger.info(`resolveDispute: action=resolve for dispute=${id} — no money movement, marking as resolved`);

    } else if (resolution_action === 'release') {
      logger.info(`resolveDispute: action=release for dispute=${id} — marking project COMPLETED and creating payout request`);
      // Mark project as COMPLETED and auto-create payout request
      // Admin must approve the payout to release funds (same flow as normal delivery approval)
      await client.query(
        `UPDATE projects SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [dispute.project_id]
      );
      logger.info(`resolveDispute: Project ${dispute.project_id} marked COMPLETED for dispute=${id}`);

      // Auto-create payout request with REQUESTED status
      // Admin will approve it later, which will:
      //   1. Release the transfer (set on_hold = 0)
      //   2. Mark transaction COMPLETED
      //   3. Wait for transfer.settled webhook to credit earnings_balance
      await client.query(
        `INSERT INTO payouts (freelancer_id, amount, currency, status, transaction_id)
         SELECT f.user_id, $2, $3, 'REQUESTED', $4
         FROM freelancer f
         WHERE f.freelancer_id = $1
           AND NOT EXISTS (SELECT 1 FROM payouts WHERE transaction_id = $4)`,
        [dispute.t_freelancer_id, dispute.freelancer_amount, process.env.CURRENCY || 'INR', dispute.transaction_id]
      );
      logger.info(`Dispute ${id}: Auto-created payout request (status: REQUESTED) for transaction ${dispute.transaction_id}. Admin must approve to release funds.`);

    } else {
      // Two-step refund: reverse transfer first, then refund customer.
      // Each state transition is written to dispute_refunds on a side channel
      // (db.query uses a separate pool connection) so the audit trail persists
      // even if the main transaction rolls back after a Razorpay side effect.
      if (!dispute.razorpay_payment_id) {
        await client.query('ROLLBACK');
        return next(new AppError('No Razorpay payment ID found for this transaction', 400));
      }

      // Block retries: one attempt per dispute. If a row already exists,
      // resolution requires manual intervention (Razorpay dashboard + DB).
      logger.info(`resolveDispute: Checking for existing refund attempts for dispute=${id}`);
      const { rows: existingAttempts } = await db.query(
        `SELECT id, state FROM dispute_refunds WHERE dispute_id = $1 LIMIT 1`,
        [id]
      );
      if (existingAttempts.length > 0) {
        logger.warn(`resolveDispute: Existing refund attempt found dispute=${id} refund_row_id=${existingAttempts[0].id} state=${existingAttempts[0].state} — blocking retry`);
        await client.query('ROLLBACK');
        return next(new AppError(
          `A refund attempt already exists for this dispute (state: ${existingAttempts[0].state}). Manual intervention required via Razorpay dashboard.`,
          409
        ));
      }
      logger.info(`resolveDispute: No existing refund attempt found for dispute=${id} — proceeding`);

      logger.info(`Dispute ${id}: Initiating refund payment_id=${dispute.razorpay_payment_id} total=${dispute.total_amount} transfer_id=${dispute.razorpay_transfer_id || 'none'}`);

      const refundAmountPaise = Math.round(parseFloat(dispute.total_amount) * 100);
      const freelancerAmountPaise = Math.round(parseFloat(dispute.freelancer_amount || 0) * 100);

      // Insert tracking row up-front so we have a record even if Razorpay calls
      // throw before we can update state below.
      const { rows: [refundRow] } = await db.query(
        `INSERT INTO dispute_refunds
           (dispute_id, transaction_id, project_id, razorpay_payment_id,
            razorpay_transfer_id, reversal_amount, refund_amount, state, initiated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'initiated', $8)
         RETURNING id`,
        [
          id,
          dispute.transaction_id,
          dispute.project_id,
          dispute.razorpay_payment_id,
          dispute.razorpay_transfer_id || null,
          dispute.razorpay_transfer_id ? parseFloat(dispute.freelancer_amount || 0) : null,
          parseFloat(dispute.total_amount),
          adminId,
        ]
      );
      const refundRowId = refundRow.id;
      logger.info(`Dispute ${id}: Refund tracking row created refund_row_id=${refundRowId}`);

      // Step 1: Reverse transfer (linked account → platform). Skipped if no
      // transfer exists (payment captured but never routed).
      if (dispute.razorpay_transfer_id) {
        try {
          const reversal = await razorpay.transfers.reverse(dispute.razorpay_transfer_id, {
            amount: freelancerAmountPaise,
            notes: { dispute_id: id, reason: 'Dispute reversal — refund pending' },
          });
          await db.query(
            `UPDATE dispute_refunds
               SET state = 'reversal_succeeded', razorpay_reversal_id = $1,
                   reversed_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [reversal.id, refundRowId]
          );
          logger.info(`Dispute ${id}: Reversal succeeded reversal_id=${reversal.id} transfer_id=${dispute.razorpay_transfer_id} amount=${dispute.freelancer_amount}`);
        } catch (reversalErr) {

          await db.query(
            `UPDATE dispute_refunds
               SET state = 'reversal_failed', error_step = 'reversal',
                   error_code = $1, error_description = $2, error_payload = $3::jsonb,
                   updated_at = NOW()
             WHERE id = $4`,
            [
              reversalErr?.error?.code || reversalErr?.statusCode?.toString() || null,
              reversalErr?.error?.description || reversalErr?.message || null,
              JSON.stringify(reversalErr?.error || { message: reversalErr?.message }),
              refundRowId,
            ]
          );
          logger.error(`Dispute ${id}: Reversal failed transfer_id=${dispute.razorpay_transfer_id}`, reversalErr);
          throw reversalErr;
        }
      } else {
        logger.info(`Dispute ${id}: No transfer found — skipping reversal step, proceeding directly to customer refund`);
      }

      // Step 2: Refund customer (platform → creator). If this throws after
      // Step 1 succeeded, Razorpay reversal is non-reversible — money sits on
      // platform balance. dispute_refunds row will be 'refund_failed' so admin
      // can find it and refund manually via Razorpay dashboard.
      try {
        const refund = await razorpay.payments.refund(dispute.razorpay_payment_id, {
          amount: refundAmountPaise,
          notes: { dispute_id: id, reason: 'Dispute resolved in creator favour' },
        });
        await db.query(
          `UPDATE dispute_refunds
             SET state = 'completed', razorpay_refund_id = $1,
                 refunded_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [refund.id, refundRowId]
        );
        logger.info(`Dispute ${id}: Refund completed refund_id=${refund.id} payment_id=${dispute.razorpay_payment_id} amount=${dispute.total_amount}`);
      } catch (refundErr) {
        await db.query(
          `UPDATE dispute_refunds
             SET state = 'refund_failed', error_step = 'refund',
                 error_code = $1, error_description = $2, error_payload = $3::jsonb,
                 updated_at = NOW()
           WHERE id = $4`,
          [
            refundErr?.error?.code || refundErr?.statusCode?.toString() || null,
            refundErr?.error?.description || refundErr?.message || null,
            JSON.stringify(refundErr?.error || { message: refundErr?.message }),
            refundRowId,
          ]
        );
        if (dispute.razorpay_transfer_id) {
          logger.error(`Dispute ${id}: CRITICAL — reversal succeeded but customer refund failed. Funds are on platform balance; refund creator manually via Razorpay dashboard. payment_id=${dispute.razorpay_payment_id} amount=${dispute.total_amount}`, refundErr);
        } else {
          logger.error(`Dispute ${id}: Refund failed payment_id=${dispute.razorpay_payment_id}`, refundErr);
        }
        throw refundErr;
      }

      await client.query(
        `UPDATE transactions SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1`,
        [dispute.transaction_id]
      );
      logger.info(`Dispute ${id}: Transaction ${dispute.transaction_id} marked as REFUNDED`);

      await client.query(
        `UPDATE projects SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
        [dispute.project_id]
      );
      logger.info(`Dispute ${id}: Project ${dispute.project_id} marked as CANCELLED`);
    }

    logger.info(`resolveDispute: Marking dispute=${id} as resolved in DB`);
    // Mark dispute resolved. Refund/reversal IDs live in dispute_refunds.
    const { rows: resolved } = await client.query(
      `UPDATE disputes
       SET status = 'resolved', admin_note = $1::jsonb, admin_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, status, admin_note, admin_id, updated_at`,
      [JSON.stringify({ note: admin_note || '', action: resolution_action }), adminId, id]
    );

    logger.info(`resolveDispute: Fetching user details for notifications/emails dispute=${id}`);
    // Fetch user details for notifications and emails
    const { rows: userDetails } = await client.query(
      `SELECT 
        c.user_id AS creator_user_id, c.full_name AS creator_name, c.email AS creator_email,
        f.user_id AS freelancer_user_id, f.freelancer_full_name AS freelancer_name, f.freelancer_email AS freelancer_email,
        d.raised_by, d.project_id, s.service_name
       FROM disputes d
       JOIN creators c ON d.creator_id = c.creator_id
       JOIN freelancer f ON d.freelancer_id = f.freelancer_id
       LEFT JOIN projects p ON d.project_id = p.id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE d.id = $1`,
      [id]
    );

    await client.query('COMMIT');
    logger.info(`resolveDispute: Transaction COMMIT successful dispute=${id}`);

    logger.info(`Dispute ${id} resolved by admin ${adminId} with action: ${resolution_action}`);

    // Send notifications and emails based on resolution_action
    if (userDetails.length > 0) {
      logger.info(`resolveDispute: Sending notifications and emails for dispute=${id} action=${resolution_action}`);
      const details = userDetails[0];
      const CURRENCY = process.env.CURRENCY || '₹';

      if (resolution_action === 'resolve') {
        // No money involved - notify only the party who raised the dispute
        const raisedByUserId = details.raised_by === 'creator' ? details.creator_user_id : details.freelancer_user_id;
        const raisedByName = details.raised_by === 'creator' ? details.creator_name : details.freelancer_name;

        logger.info(`resolveDispute: Sending resolve notification to raised_by=${details.raised_by} userId=${raisedByUserId} dispute=${id}`);
        Promise.allSettled([
          sendNotification({
            recipientId: raisedByUserId,
            senderId: adminId,
            eventType: 'dispute_resolved',
            title: 'Dispute Resolved',
            body: `Your dispute has been resolved by admin. ${admin_note ? 'Note: ' + admin_note : ''}`,
            actionType: 'link',
            actionRoute: String(details.project_id || id),
          })
        ]).then(results => {
          if (results[0].status === 'rejected') {
            logger.error(`resolveDispute: notification failed for userId=${raisedByUserId} dispute=${id}:`, results[0].reason?.message);
          } else {
            logger.info(`resolveDispute: Notification sent successfully to userId=${raisedByUserId} dispute=${id}`);
          }
        });

      } else {
        // Money involved (release or refund) - notify and email both parties
        const isRefund = resolution_action === 'refund';
        const winnerText = isRefund ? 'creator' : 'freelancer';
        const loserText = isRefund ? 'freelancer' : 'creator';

        logger.info(`resolveDispute: Sending notifications+emails to creator=${details.creator_user_id} and freelancer=${details.freelancer_user_id} for dispute=${id} isRefund=${isRefund}`);
        Promise.allSettled([
          // Notification to creator
          sendNotification({
            recipientId: details.creator_user_id,
            senderId: adminId,
            eventType: isRefund ? 'dispute_refund_approved' : 'dispute_freelancer_won',
            title: isRefund ? 'Dispute Resolved - Refund Initiated' : 'Dispute Resolved',
            body: isRefund
              ? `Dispute resolved in your favor. Full refund of ${CURRENCY}${dispute.total_amount} has been initiated to your account.`
              : `Dispute resolved in favor of ${details.freelancer_name}. Freelancer will receive payment.`,
            actionType: 'link',
            actionRoute: String(details.project_id),
          }),
          // Notification to freelancer
          sendNotification({
            recipientId: details.freelancer_user_id,
            senderId: adminId,
            eventType: isRefund ? 'dispute_creator_won' : 'dispute_payment_approved',
            title: isRefund ? 'Dispute Resolved' : 'Dispute Resolved - Payment Approved',
            body: isRefund
              ? `Dispute resolved in favor of ${details.creator_name}. Payment has been refunded to creator.`
              : `Dispute resolved in your favor! Payout request created for ${CURRENCY}${dispute.freelancer_amount}. Admin will release payment soon.`,
            actionType: 'link',
            actionRoute: String(details.project_id),
          }),
          // Email to creator
          sendDisputeResolvedCreatorEmail({
            creatorEmail: details.creator_email,
            creatorName: details.creator_name,
            freelancerName: details.freelancer_name,
            projectId: details.project_id,
            disputeId: id,
            serviceTitle: details.service_name,
            resolution: isRefund ? 'Refund approved - Full refund initiated' : 'Resolved in favor of freelancer',
            adminNote: admin_note,
            amount: isRefund ? dispute.total_amount : null,
          }),
          // Email to freelancer
          sendDisputeResolvedFreelancerEmail({
            freelancerEmail: details.freelancer_email,
            freelancerName: details.freelancer_name,
            creatorName: details.creator_name,
            projectId: details.project_id,
            disputeId: id,
            serviceTitle: details.service_name,
            resolution: isRefund ? 'Resolved in favor of creator - Payment refunded' : 'Payment approved - Payout request created',
            adminNote: admin_note,
            amount: isRefund ? null : dispute.freelancer_amount,
          }),
        ]).then(results => {
          const labels = [
            'creator notification',
            'freelancer notification',
            'creator dispute email',
            'freelancer dispute email'
          ];
          results.forEach((result, i) => {
            if (result.status === 'rejected') {
              logger.error(`resolveDispute: ${labels[i]} failed for dispute=${id}:`, result.reason?.message);
            } else {
              logger.info(`resolveDispute: ${labels[i]} sent successfully for dispute=${id}`);
            }
          });
        });
      }
    } else {
      logger.warn(`resolveDispute: No user details found for dispute=${id}, skipping notifications/emails`);
    }

    logger.info(`resolveDispute: Sending success response for dispute=${id} action=${resolution_action}`);
    return res.status(200).json({
      status: 'success',
      message: resolution_action === 'release'
        ? 'Dispute resolved in favor of freelancer. Payout request created. Admin must approve to release funds.'
        : resolution_action === 'refund'
          ? 'Dispute resolved. Full refund initiated to creator.'
          : 'Dispute marked as resolved.',
      data: resolved[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`resolveDispute: ROLLBACK executed for dispute=${id} admin=${adminId} action=${resolution_action} — error: ${error?.message}`, error);
    return next(new AppError('Failed to resolve dispute', 500));
  } finally {
    client.release();
    logger.info(`resolveDispute: DB client released for dispute=${id}`);
  }
};

const getDisputeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await db.query(
      `SELECT
        d.id                       AS dispute_id,
        d.project_id,
        d.creator_id,
        d.freelancer_id,
        d.reason_of_dispute,
        d.description              AS dispute_description,
        d.admin_note,
        d.status                   AS dispute_status,
        d.raised_by,
        d.created_at               AS dispute_created_at,
        d.updated_at               AS dispute_updated_at,
        c.full_name                AS creator_name,
        c.email                    AS creator_email,
        c.profile_image_url        AS creator_avatar,
        f.freelancer_full_name     AS freelancer_name,
        f.freelancer_email         AS freelancer_email,
        f.profile_image_url        AS freelancer_avatar,
        p.status                   AS project_status,
        p.amount                   AS project_amount,
        s.service_name
       FROM disputes d
       JOIN creators c   ON d.creator_id   = c.creator_id
       JOIN freelancer f ON d.freelancer_id = f.freelancer_id
       LEFT JOIN projects p  ON d.project_id = p.id
       LEFT JOIN services s  ON p.service_id = s.id
       WHERE d.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return next(new AppError('Dispute not found', 404));
    }

    const dispute = rows[0];

    // Sign avatars
    dispute.creator_avatar = await signAvatarUrl(dispute.creator_avatar);
    dispute.freelancer_avatar = await signAvatarUrl(dispute.freelancer_avatar);

    // Fetch deliverables if there's a linked project
    let deliverables = [];
    if (dispute.project_id) {
      const { rows: delivRows } = await db.query(
        `SELECT id, deliverable_url, project_description FROM deliverables WHERE project_id = $1`,
        [dispute.project_id]
      );

      deliverables = await Promise.all(
        delivRows.map(async (d) => {
          const files = Array.isArray(d.deliverable_url) ? d.deliverable_url : [d.deliverable_url];
          const resolvedFiles = await Promise.all(
            files.filter(Boolean).map(async (file) => {
              if (file.type === 'google_drive') {
                return { type: 'google_drive', urls: file.urls };
              }
              const bucket = process.env.MINIO_BUCKET_NAME;
              const signedUrl = await createPresignedUrl(bucket, file.key, EXPIRY_SECONDS).catch(() => null);
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
    }

    return res.status(200).json({
      status: 'success',
      data: {
        ...dispute,
        deliverables,
      },
    });
  } catch (error) {
    logger.error('getDisputeById error:', error);
    return next(new AppError('Failed to fetch dispute details', 500));
  }
};

module.exports = { raiseDispute, getDisputes, getAllDisputes, resolveDispute, getDisputeById };
