const { pool: db } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');
const razorpay = require('../../../config/razorpay');
const razorpayRoutes = require('../../../config/razorpayRoutes');
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
      // REFUND FLOW — atomic two-step process:
      //   Step 0: Balance check — ensure platform fees (commission + GST) are in our primary balance.
      //   Step 1: POST /v1/transfers/:transfer_id/reversals — pull freelancer amount back to primary.
      //   Step 2: POST /v1/payments/:payment_id/refund    — return full amount to creator.
      //
      // state machine in dispute_refunds (side-channel table — survives a DB ROLLBACK):
      //   initiated → reversal_completed → completed | refund_pending
      //                                 ↳ reversal_done_refund_failed  (manual intervention needed)
      //   initiated → reversal_skipped  → completed | refund_pending   (no transfer_id path)
      //   initiated → reversal_failed                                   (step 1 blew up)
      //   initiated → refund_failed                                     (no reversal, step 2 blew up)

      if (!dispute.razorpay_payment_id) {
        await client.query('ROLLBACK');
        return next(new AppError('No Razorpay payment ID found for this transaction', 400));
      }

      // Block retries — one attempt per dispute.
      logger.info(`resolveDispute: Checking for existing refund attempts for dispute=${id}`);
      const { rows: existingAttempts } = await db.query(
        `SELECT id, state FROM dispute_refunds WHERE dispute_id = $1 LIMIT 1`,
        [id]
      );
      if (existingAttempts.length > 0) {
        logger.warn(`resolveDispute: Existing refund attempt dispute=${id} row=${existingAttempts[0].id} state=${existingAttempts[0].state} — blocking retry`);
        await client.query('ROLLBACK');
        return next(new AppError(
          `A refund attempt already exists for this dispute (state: ${existingAttempts[0].state}). Manual intervention required via Razorpay dashboard.`,
          409
        ));
      }

      const refundAmountPaise    = Math.round(parseFloat(dispute.total_amount) * 100);
      const freelancerAmountPaise = Math.round(parseFloat(dispute.freelancer_amount) * 100);
      // Platform fees = total − freelancer; this is the portion that stays in our balance
      // and must be present before we start (the freelancer slice comes back via reversal).
      const platformFeesPaise = refundAmountPaise - freelancerAmountPaise;

      logger.info(`Dispute ${id}: Starting refund total=${dispute.total_amount} freelancer=${dispute.freelancer_amount} platformFees=${platformFeesPaise / 100} payment_id=${dispute.razorpay_payment_id} transfer_id=${dispute.razorpay_transfer_id || 'none'}`);

      // ── Step 0: Balance check ────────────────────────────────────────────────
      logger.info(`Dispute ${id}: Step 0 — checking Razorpay balance (required ≥ ₹${(platformFeesPaise / 100).toFixed(2)} for platform fees)`);
      let currentBalance;
      try {
        const { data: balanceData } = await razorpayRoutes.get('/v1/balance', { timeout: 15000 });
        currentBalance = balanceData.balance; // in paise
        logger.info(`Dispute ${id}: Balance check — available=${currentBalance} paise required=${platformFeesPaise} paise`);
      } catch (balErr) {
        await client.query('ROLLBACK');
        const errMsg = balErr?.response?.data?.error?.description || balErr?.message;
        logger.error(`Dispute ${id}: Balance check API failed: ${errMsg}`, balErr?.response?.data);
        return next(new AppError(`Failed to fetch Razorpay balance: ${errMsg}`, 502));
      }

      if (currentBalance < platformFeesPaise) {
        await client.query('ROLLBACK');
        logger.warn(`Dispute ${id}: Insufficient balance — available=${currentBalance} paise required=${platformFeesPaise} paise`);
        return next(new AppError(
          `Insufficient Razorpay balance to process refund. ` +
          `Available: ₹${(currentBalance / 100).toFixed(2)}, ` +
          `Required for platform fees: ₹${(platformFeesPaise / 100).toFixed(2)}. ` +
          `Please top up the Razorpay account before retrying.`,
          402
        ));
      }

      // Insert audit row before any Razorpay call so the record always exists.
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
          dispute.freelancer_amount,       // expected reversal amount
          parseFloat(dispute.total_amount),
          adminId,
        ]
      );
      const refundRowId = refundRow.id;
      logger.info(`Dispute ${id}: Refund tracking row created refund_row_id=${refundRowId}`);

      // ── Step 1: Transfer reversal ────────────────────────────────────────────
      let reversalId = null;
      if (dispute.razorpay_transfer_id) {
        try {
          logger.info(`Dispute ${id}: Step 1 — reversing transfer=${dispute.razorpay_transfer_id}`);
          const { data: reversal } = await razorpayRoutes.post(
            `/v1/transfers/${dispute.razorpay_transfer_id}/reversals`,
            {},
            { timeout: 30000 }
          );
          reversalId = reversal.id;
          logger.info(`Dispute ${id}: Transfer reversal success reversal_id=${reversalId} transfer=${dispute.razorpay_transfer_id}`);

          // Persist reversal_id in error_payload (general metadata) alongside the state advance.
          await db.query(
            `UPDATE dispute_refunds
               SET state = 'reversal_completed',
                   error_payload = $1::jsonb,
                   updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify({ razorpay_reversal_id: reversalId }), refundRowId]
          );
        } catch (reversalErr) {
          const errData = reversalErr?.response?.data?.error || { message: reversalErr?.message };
          const errCode = errData?.code || reversalErr?.response?.status?.toString() || null;
          const errDesc = errData?.description || reversalErr?.message || null;
          await db.query(
            `UPDATE dispute_refunds
               SET state = 'reversal_failed', error_step = 'transfer_reversal',
                   error_code = $1, error_description = $2, error_payload = $3::jsonb,
                   updated_at = NOW()
             WHERE id = $4`,
            [errCode, errDesc, JSON.stringify(errData), refundRowId]
          );
          logger.error(`Dispute ${id}: Transfer reversal failed transfer=${dispute.razorpay_transfer_id} error=${errDesc}`, reversalErr?.response?.data);
          await client.query('ROLLBACK');
          return next(new AppError(
            `Transfer reversal failed: ${errDesc || 'Razorpay API error'}. No funds moved — safe to retry after fixing the issue.`,
            502
          ));
        }
      } else {
        // No linked transfer (e.g. transfer webhook never arrived) — skip reversal.
        logger.info(`Dispute ${id}: Step 1 — no transfer_id, skipping reversal (direct refund only)`);
        await db.query(
          `UPDATE dispute_refunds SET state = 'reversal_skipped', updated_at = NOW() WHERE id = $1`,
          [refundRowId]
        );
      }

      // ── Step 2: Payment refund ───────────────────────────────────────────────
      try {
        logger.info(`Dispute ${id}: Step 2 — refunding payment=${dispute.razorpay_payment_id} amount=${refundAmountPaise} paise`);
        const { data: refund } = await razorpayRoutes.post(
          `/v1/payments/${dispute.razorpay_payment_id}/refund`,
          {
            amount: refundAmountPaise,
            notes: { dispute_id: String(id), reason: 'Dispute resolved in creator favour' },
          },
          { timeout: 30000 }
        );

        // Razorpay refund status: 'processed' = instant, 'pending' = bank processing
        const refundState = refund.status === 'processed' ? 'completed' : 'refund_pending';
        logger.info(`Dispute ${id}: Refund response refund_id=${refund.id} status=${refund.status} → db_state=${refundState}`);
        await db.query(
          `UPDATE dispute_refunds
             SET state = $1, razorpay_refund_id = $2,
                 refunded_at = NOW(), updated_at = NOW()
           WHERE id = $3`,
          [refundState, refund.id, refundRowId]
        );
      } catch (refundErr) {
        const errData = refundErr?.response?.data?.error || { message: refundErr?.message };
        const errCode = errData?.code || refundErr?.response?.status?.toString() || null;
        const errDesc = errData?.description || refundErr?.message || null;

        // Partial-failure: reversal succeeded but refund failed.
        // We MUST roll back DB state but keep the audit row so admin can act.
        const failedState = reversalId ? 'reversal_done_refund_failed' : 'refund_failed';
        const errorPayload = reversalId
          ? { razorpay_reversal_id: reversalId, error: errData }
          : { error: errData };
        await db.query(
          `UPDATE dispute_refunds
             SET state = $1, error_step = 'payment_refund',
                 error_code = $2, error_description = $3, error_payload = $4::jsonb,
                 updated_at = NOW()
           WHERE id = $5`,
          [failedState, errCode, errDesc, JSON.stringify(errorPayload), refundRowId]
        );
        logger.error(`Dispute ${id}: Step 2 refund failed reversal_done=${!!reversalId} payment_id=${dispute.razorpay_payment_id} error=${errDesc}`, refundErr?.response?.data);
        await client.query('ROLLBACK');

        if (reversalId) {
          return next(new AppError(
            `CRITICAL: Transfer reversal succeeded (reversal_id=${reversalId}) but payment refund failed. ` +
            `Freelancer's funds have been returned to primary balance. ` +
            `Manual refund required via Razorpay dashboard. Contact support immediately.`,
            502
          ));
        }
        return next(new AppError(`Payment refund failed: ${errDesc || 'Razorpay API error'}`, 502));
      }

      await client.query(
        `UPDATE transactions SET status = 'REFUNDED', updated_at = NOW() WHERE id = $1`,
        [dispute.transaction_id]
      );
      logger.info(`Dispute ${id}: Transaction ${dispute.transaction_id} marked REFUNDED`);

      await client.query(
        `UPDATE projects SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
        [dispute.project_id]
      );
      logger.info(`Dispute ${id}: Project ${dispute.project_id} marked CANCELLED`);
    }

    logger.info(`resolveDispute: Marking dispute=${id} as resolved in DB`);
    // Mark dispute resolved. Refund/reversal IDs live in dispute_refunds.
    const { rows: resolved } = await client.query(
      `UPDATE disputes
       SET status = 'resolved', admin_note = $1::jsonb, admin_id = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, status, admin_note, admin_id, updated_at`,
      [JSON.stringify({ note: admin_note ?? null, action: resolution_action }), adminId, id]
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
      const CURRENCY = process.env.CURRENCY || 'INR';

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
