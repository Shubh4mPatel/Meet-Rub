const paymentService = require('../../razor-pay-services/paymentService');
const linkedAccountService = require('../../razor-pay-services/linkedAccountService');
const { pool: db } = require('../../../config/dbConfig');
const { query } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");
const { createPresignedUrl } = require("../../../utils/helper");
const razorpay = require('../../../config/razorpay');


// Approve payout request (admin) — triggers Razorpay payout
const approvePayout = async (req, res, next) => {
  const payoutId = req.params.id;
  const adminId = req.user.roleWiseId;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Fetch payout + linked transaction in one query
    const { rows: payouts } = await client.query(
      `SELECT po.id, po.status, po.amount, po.freelancer_id,
              f.freelancer_id AS f_id, f.verification_status,
              t.id AS transaction_id, t.razorpay_transfer_id,
              t.project_id
       FROM payouts po
       JOIN users u        ON po.freelancer_id = u.id
       JOIN freelancer f   ON f.user_id = u.id
       JOIN transactions t ON t.id = po.transaction_id
       WHERE po.id = $1 FOR UPDATE OF po`,
      [payoutId]
    );

    if (payouts.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Payout not found', 404));
    }

    const payout = payouts[0];

    if (payout.status !== 'REQUESTED') {
      await client.query('ROLLBACK');
      return next(new AppError(`Payout cannot be approved. Current status: ${payout.status}`, 400));
    }

    if (payout.verification_status !== 'VERIFIED') {
      await client.query('ROLLBACK');
      return next(new AppError('Freelancer account not verified', 400));
    }

    if (!payout.razorpay_transfer_id) {
      await client.query('ROLLBACK');
      return next(new AppError('No Razorpay transfer found for this payout. Cannot release.', 400));
    }

    // Release the held Route transfer
    await razorpay.transfers.edit(payout.razorpay_transfer_id, { on_hold: 0 });

    // Mark transaction and project as completed
    await client.query(
      `UPDATE transactions SET status = 'COMPLETED', released_by = $1, released_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [adminId, payout.transaction_id]
    );

    await client.query(
      `UPDATE projects SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [payout.project_id]
    );

    // Mark payout as processed
    await client.query(
      `UPDATE payouts SET status = 'PROCESSED', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [adminId, payoutId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      status: 'success',
      message: 'Payout approved. Funds released to freelancer.',
      data: { payout_id: payoutId, amount: parseFloat(payout.amount) }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('approvePayout error:', error);
    return next(new AppError('Failed to approve payout', 500));
  } finally {
    client.release();
  }
}

// Get all payouts
const getAllPayouts = async (req, res, next) => {
  try {
    const { status, search, from_date, to_date, page = 1, limit = 10 } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedPage) || parsedPage < 1) {
      return next(new AppError('Invalid page number', 400));
    }
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return next(new AppError('Invalid limit. Must be between 1 and 100', 400));
    }

    const offset = (parsedPage - 1) * parsedLimit;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`fl.freelancer_full_name ILIKE $${idx++}`);
      params.push(`%${search}%`);
    }

    if (from_date) {
      conditions.push(`p.requested_at >= $${idx++}`);
      params.push(from_date);
    }

    if (to_date) {
      conditions.push(`p.requested_at <= ($${idx++}::date + interval '1 day')`);
      params.push(to_date);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Get total count
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total
       FROM payouts p
       JOIN users u ON p.freelancer_id = u.id
       JOIN freelancer fl ON fl.user_id = u.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].total);

    // Get paginated results
    const { rows: payouts } = await db.query(
      `SELECT
          p.id,
          p.freelancer_id,
          p.amount,
          p.status,
          p.id as payout_id,
          p.requested_at as payout_created_at,
          fl.freelancer_full_name as freelancer_name,
          fl.freelancer_email,
          fl.user_name as freelancer_username,
          fl.profile_image_url as freelancer_profile_image
       FROM payouts p
       JOIN users u ON p.freelancer_id = u.id
       JOIN freelancer fl ON fl.user_id = u.id
       ${whereClause}
       ORDER BY p.requested_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, parsedLimit, offset]
    );

    const enhancedPayouts = await Promise.all(
      payouts.map(async (payout) => {
        let profileImage = null;
        if (payout.freelancer_profile_image) {
          const parts = payout.freelancer_profile_image.split('/');
          const bucketName = parts[0];
          const objectName = parts.slice(1).join('/');
          profileImage = await createPresignedUrl(bucketName, objectName, 14400);
        }
        return {
          ...payout,
          freelancer_profile_image: profileImage
        };
      })
    );

    res.json({
      count: total,
      page: parsedPage,
      limit: parsedLimit,
      total_pages: Math.ceil(total / parsedLimit),
      payouts: enhancedPayouts
    });
  } catch (error) {
    console.error('Get all payouts error:', error);
    return next(new AppError('Failed to get payouts', 500));
  }
}

// Get payout details
const getPayoutDetails = async (req, res, next) => {
  try {
    const payoutId = req.params.id;
    const {
      page = 1,
      limit = 10,
      status,
      service_id,
      from_date,
      to_date,
      search
    } = req.query;

    // Get freelancer_id, name, and image from payout
    const { rows: payoutInfo } = await db.query(
      `SELECT f.freelancer_id, f.freelancer_full_name, f.profile_image_url AS freelancer_image
       FROM payouts po
       JOIN users u ON po.freelancer_id = u.id
       JOIN freelancer f ON f.user_id = u.id
       WHERE po.id = $1`,
      [payoutId]
    );

    if (payoutInfo.length === 0) {
      return next(new AppError('Payout not found', 404));
    }

    const freelancerId = payoutInfo[0].freelancer_id;
    const freelancerName = payoutInfo[0].freelancer_full_name;
    let freelancerImage = payoutInfo[0].freelancer_image;
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const parsedLimit = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (parsedPage - 1) * parsedLimit;

    // Build dynamic WHERE clause
    const conditions = ['p.freelancer_id = $1'];
    const params = [freelancerId];
    let paramIndex = 2;

    if (status) {
      conditions.push(`p.status = $${paramIndex++}`);
      params.push(status);
    }

    if (service_id) {
      conditions.push(`p.service_id = $${paramIndex++}`);
      params.push(service_id);
    }

    if (from_date) {
      conditions.push(`p.created_at >= $${paramIndex++}`);
      params.push(from_date);
    }

    if (to_date) {
      conditions.push(`p.created_at <= ($${paramIndex++}::date + interval '1 day')`);
      params.push(to_date);
    }

    if (search) {
      conditions.push(`c.full_name ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(' AND ');

    // Get projects for this freelancer with pagination and filters
    const { rows: projects } = await db.query(
      `SELECT
        p.id,
        c.full_name AS creator,
        c.profile_image_url AS creator_image,
        s.service_name AS services,
        p.number_of_units AS units,
        p.end_date AS deadline,
        p.amount AS charges,
        p.status
       FROM projects p
       JOIN creators c ON p.creator_id = c.creator_id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, parsedLimit, offset]
    );

    // Get total count with same filters
    const { rows: countResult } = await db.query(
      `SELECT COUNT(*) AS total
       FROM projects p
       JOIN creators c ON p.creator_id = c.creator_id
       WHERE ${whereClause}`,
      params
    );

    const total = parseInt(countResult[0].total);

    // Generate presigned URLs for freelancer and creator images
    const expirySeconds = 24 * 60 * 60; // 24 hours

    if (freelancerImage) {
      try {
        const parts = freelancerImage.split('/');
        const bucket = parts[0];
        const objectName = parts.slice(1).join('/');
        freelancerImage = await createPresignedUrl(bucket, objectName, expirySeconds);
      } catch (err) {
        console.error('Error generating presigned URL for freelancer image:', err);
        freelancerImage = null;
      }
    }

    for (const project of projects) {
      if (project.creator_image) {
        try {
          const parts = project.creator_image.split('/');
          const bucket = parts[0];
          const objectName = parts.slice(1).join('/');
          project.creator_image = await createPresignedUrl(bucket, objectName, expirySeconds);
        } catch (err) {
          console.error('Error generating presigned URL:', err);
          project.creator_image = null;
        }
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        freelancer: {
          name: freelancerName,
          image: freelancerImage
        },
        projects: projects,
        pagination: {
          total,
          totalPages: Math.ceil(total / parsedLimit),
          currentPage: parsedPage,
          limit: parsedLimit
        }
      }
    });
  } catch (error) {
    console.error('Get payout details error:', error);
    return next(new AppError('Failed to get payout details', 500));
  }
}

// Get platform statistics
const getPlatformStats = async (req, res, next) => {
  try {
    const { rows: totalTransactions } = await db.query(
      'SELECT COUNT(*) as count FROM transactions'
    );

    const { rows: totalRevenue } = await db.query(
      `SELECT SUM(platform_commission) as revenue FROM transactions WHERE status IN ('HELD', 'RELEASED', 'COMPLETED')`
    );

    const { rows: pendingReleases } = await db.query(
      `SELECT COUNT(*) as count, SUM(total_amount) as amount FROM transactions WHERE status = 'HELD'`
    );

    const { rows: completedPayouts } = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status = 'PROCESSED'`
    );

    const { rows: pendingPayouts } = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as amount FROM payouts WHERE status IN ('QUEUED', 'PENDING', 'PROCESSING')`
    );

    res.json({
      total_transactions: totalTransactions[0].count,
      total_commission_earned: parseFloat(totalRevenue[0].revenue || 0),
      escrow: {
        count: pendingReleases[0].count,
        total_amount: parseFloat(pendingReleases[0].amount || 0)
      },
      payouts: {
        completed: {
          count: completedPayouts[0].count,
          total_amount: parseFloat(completedPayouts[0].amount || 0)
        },
        pending: {
          count: pendingPayouts[0].count,
          total_amount: parseFloat(pendingPayouts[0].amount || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get platform stats error:', error);
    return next(new AppError('Failed to get platform statistics', 500));
  }
}

// Update platform commission percentage
const updateCommission = async (req, res, next) => {
  try {
    const { percentage } = req.body;

    if (!percentage || percentage < 0 || percentage > 100) {
      return next(new AppError('Invalid commission percentage', 400));
    }

    await db.query(
      `UPDATE platform_settings SET setting_value = $1 WHERE setting_key = 'commission_percentage'`,
      [percentage]
    );

    res.json({
      message: 'Commission percentage updated successfully',
      new_percentage: percentage
    });
  } catch (error) {
    console.error('Update commission error:', error);
    return next(new AppError('Failed to update commission', 500));
  }
}

const approveKYCByAdmin = async (req, res, next) => {
  try {
    const { freelancer_id } = req.params;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    // Check if freelancer exists
    const queryResult = await query(
      'SELECT freelancer_id, user_id, verification_status, razorpay_account_status FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );

    const freelancers = queryResult.rows || [];

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (freelancer.verification_status === 'VERIFIED') {
      return next(new AppError('Freelancer KYC is already verified', 400));
    }

    // Razorpay linked account must be activated before platform KYC approval
    if (freelancer.razorpay_account_status !== 'activated') {
      return next(new AppError('Razorpay linked account must be activated first. Create and verify the linked account on Razorpay before approving platform KYC.', 400));
    }

    // Update verification_status in freelancer table
    await query(
      'UPDATE freelancer SET verification_status = $1, reason_for_rejection = $2 WHERE freelancer_id = $3',
      ['VERIFIED', '', freelancer_id]
    );

    res.json({
      message: 'KYC approved successfully',
      freelancer_id: freelancer_id,
      verification_status: 'VERIFIED'
    });
  }
  catch (error) {
    console.error('Approve KYC error:', error);
    return next(new AppError('Failed to approve KYC', 500));
  }
}

const rejectKYCByAdmin = async (req, res, next) => {
  try {
    const { reason_for_rejection, freelancer_id } = req.body;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    if (!reason_for_rejection) {
      return next(new AppError('Reason for rejection is required', 400));
    }

    // Check if freelancer exists
    const queryResult = await query(
      'SELECT freelancer_id, user_id, verification_status FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );

    const freelancers = queryResult.rows || [];

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (freelancer.verification_status === 'REJECTED') {
      return next(new AppError('Freelancer KYC is already rejected', 400));
    }

    // Update verification_status and reason_for_rejection in freelancer table
    await query(
      'UPDATE freelancer SET verification_status = $1, reason_for_rejection = $2 WHERE freelancer_id = $3',
      ['REJECTED', reason_for_rejection, freelancer_id]
    );

    res.json({
      message: 'KYC rejected successfully',
      freelancer_id: freelancer_id,
      verification_status: 'REJECTED',
      reason_for_rejection: reason_for_rejection
    });
  }
  catch (error) {
    console.error('Reject KYC error:', error);
    return next(new AppError('Failed to reject KYC', 500));
  }
}


const suspendFreelancerByAdmin = async (req, res, next) => {
  try {
    const { reason_for_suspension, freelancer_id } = req.body;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    if (!reason_for_suspension) {
      return next(new AppError('Reason for rejection is required', 400));
    }

    // Check if freelancer exists
    const queryResult = await query(
      'SELECT freelancer_id, user_id, verification_status FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );

    const freelancers = queryResult.rows || [];

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (freelancer.verification_status === 'SUSPENDED') {
      return next(new AppError('Freelancer is already suspended', 400));
    }

    // Update verification_status and reason_for_suspension in freelancer table
    await query(
      'UPDATE freelancer SET verification_status = $1, reason_for_suspension = $2 WHERE freelancer_id = $3',
      ['SUSPENDED', reason_for_suspension, freelancer_id]
    );

    res.json({
      message: 'Freelancer suspended successfully',
      freelancer_id: freelancer_id,
      verification_status: 'SUSPENDED',
      reason_for_suspension: reason_for_suspension
    });
  }
  catch (error) {
    console.error('Suspend Freelancer error:', error);
    return next(new AppError('Failed to suspend freelancer', 500));
  }
}


const addFeaturedFreelancer = async (req, res, next) => {
  const { service_name, freelancer_id } = req.body;
  const admin_id = req.user.roleWiseId;

  if (!service_name || !freelancer_id) {
    return next(new AppError('service_name and freelancer_id are required', 400));
  }

  try {
    // Verify freelancer exists
    const { rows: freelancerRows } = await query(
      'SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );
    if (freelancerRows.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    // Resolve service_name to service_option_id (case-insensitive)
    const { rows: serviceRows } = await query(
      'SELECT id FROM service_options WHERE LOWER(service_name) = LOWER($1)',
      [service_name]
    );
    if (serviceRows.length === 0) {
      return next(new AppError('Service option not found', 404));
    }
    const service_option_id = serviceRows[0].id;

    // Check if already featured (active) for this service
    const { rows: alreadyFeatured } = await query(
      'SELECT id FROM featured_freelancers WHERE freelancer_id = $1 AND service_option_id = $2 AND is_active = true',
      [freelancer_id, service_option_id]
    );
    if (alreadyFeatured.length > 0) {
      return next(new AppError('Already featured for this service', 409));
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Count current active featured freelancers for this service
      const { rows: countRows } = await client.query(
        'SELECT COUNT(*) AS count FROM featured_freelancers WHERE service_option_id = $1 AND is_active = true',
        [service_option_id]
      );
      const currentCount = parseInt(countRows[0].count, 10);

      // If at max (5), deactivate the one at priority 5
      if (currentCount >= 5) {
        await client.query(
          `UPDATE featured_freelancers
           SET is_active = false, priority = NULL, unfeatured_at = NOW(), unfeatured_by = $2
           WHERE service_option_id = $1 AND is_active = true AND priority = 5`,
          [service_option_id, admin_id]
        );
      }

      // Shift all remaining active priorities up by 1
      await client.query(
        'UPDATE featured_freelancers SET priority = priority + 1 WHERE service_option_id = $1 AND is_active = true',
        [service_option_id]
      );

      // Insert new freelancer at priority 1
      const { rows: inserted } = await client.query(
        `INSERT INTO featured_freelancers (freelancer_id, service_option_id, priority, is_active, featured_by)
         VALUES ($1, $2, 1, true, $3)
         RETURNING id, freelancer_id, service_option_id, priority, featured_at`,
        [freelancer_id, service_option_id, admin_id]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        status: 'success',
        message: 'Freelancer added to featured list',
        data: inserted[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Add featured freelancer error:', error);
    return next(new AppError('Failed to add freelancer to featured list', 500));
  }
};

const removeFeaturedFreelancer = async (req, res, next) => {
  const { service_name, freelancer_id } = req.body;
  const admin_id = req.user.roleWiseId;

  if (!service_name || !freelancer_id) {
    return next(new AppError('service_name and freelancer_id are required', 400));
  }

  try {
    // Resolve service_name to service_option_id (case-insensitive)
    const { rows: serviceRows } = await query(
      'SELECT id FROM service_options WHERE LOWER(service_name) = LOWER($1)',
      [service_name]
    );
    if (serviceRows.length === 0) {
      return next(new AppError('Service option not found', 404));
    }
    const service_option_id = serviceRows[0].id;

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Deactivate the featured freelancer and return the old priority
      const { rows: removed } = await client.query(
        `UPDATE featured_freelancers
         SET is_active = false, priority = NULL, unfeatured_at = NOW(), unfeatured_by = $3
         WHERE freelancer_id = $2 AND service_option_id = $1 AND is_active = true
         RETURNING priority AS old_priority`,
        [service_option_id, freelancer_id, admin_id]
      );

      if (removed.length === 0) {
        await client.query('ROLLBACK');
        return next(new AppError('Freelancer not featured for this service', 404));
      }

      const old_priority = removed[0].old_priority;

      // Shift down all active freelancers with priority greater than the removed one
      await client.query(
        `UPDATE featured_freelancers
         SET priority = priority - 1
         WHERE service_option_id = $1 AND is_active = true AND priority > $2`,
        [service_option_id, old_priority]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        status: 'success',
        message: 'Freelancer removed from featured list',
        data: {
          freelancer_id: parseInt(freelancer_id, 10),
          service_name,
          service_option_id,
          unfeatured_at: new Date()
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Remove featured freelancer error:', error);
    return next(new AppError('Failed to remove freelancer from featured list', 500));
  }
};

// Get all payout requests (status = REQUESTED) for admin review
const getPayoutRequests = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const { rows: payouts } = await db.query(
      `SELECT
        po.id              AS payout_id,
        po.amount,
        po.currency,
        po.status,
        po.requested_at,
        po.created_at,
        f.freelancer_id,
        f.freelancer_full_name,
        f.freelancer_email,
        f.earnings_balance,
        f.verification_status  AS account_status
       FROM payouts po
       JOIN users u ON po.freelancer_id = u.id
       JOIN freelancer f ON f.user_id = u.id
       WHERE po.status = 'REQUESTED'
       ORDER BY po.requested_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const { rows: countResult } = await db.query(
      `SELECT COUNT(*) AS total FROM payouts WHERE status = 'REQUESTED'`
    );

    const total = parseInt(countResult[0].total);

    return res.status(200).json({
      status: 'success',
      data: {
        payouts,
        pagination: {
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit
        }
      }
    });
  } catch (error) {
    console.error('getPayoutRequests error:', error);
    return next(new AppError('Failed to get payout requests', 500));
  }
};

// Reject payout request (admin)
const rejectPayout = async (req, res, next) => {
  const payoutId = req.params.id;
  const adminId = req.user.roleWiseId;
  const { rejection_reason } = req.body;

  if (!rejection_reason || !rejection_reason.trim()) {
    return next(new AppError('rejection_reason is required', 400));
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: payouts } = await client.query(
      `SELECT po.*, f.user_id AS freelancer_user_id
       FROM payouts po
       JOIN users u ON po.freelancer_id = u.id
       JOIN freelancer f ON f.user_id = u.id
       WHERE po.id = $1 FOR UPDATE`,
      [payoutId]
    );

    if (payouts.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Payout not found', 404));
    }

    const payout = payouts[0];

    if (payout.status !== 'REQUESTED') {
      await client.query('ROLLBACK');
      return next(new AppError(`Payout cannot be rejected. Current status: ${payout.status}`, 400));
    }

    // Mark payout as REJECTED
    await client.query(
      `UPDATE payouts
       SET status = 'REJECTED', rejection_reason = $1, rejected_by = $2, rejected_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [rejection_reason.trim(), adminId, payoutId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      status: 'success',
      message: 'Payout rejected successfully.',
      data: { payout_id: payoutId, rejection_reason: rejection_reason.trim() }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('rejectPayout error:', error);
    return next(new AppError(error.message, 500));
  } finally {
    client.release();
  }
};

const suspendCreatorByAdmin = async (req, res, next) => {
  try {
    const { reason_for_suspension, creator_id } = req.body;
    const adminId = req.user.roleWiseId;

    if (!creator_id) {
      return next(new AppError('Creator ID is required', 400));
    }

    if (!reason_for_suspension) {
      return next(new AppError('Reason for suspension is required', 400));
    }

    const { rows } = await query(
      'SELECT creator_id, account_status FROM creators WHERE creator_id = $1',
      [creator_id]
    );

    if (rows.length === 0) {
      return next(new AppError('Creator not found', 404));
    }

    if (rows[0].account_status === 'SUSPENDED') {
      return next(new AppError('Creator is already suspended', 400));
    }

    await query(
      'UPDATE creators SET account_status = $1, reason_for_suspension = $2, suspended_by = $3, suspended_at = NOW() WHERE creator_id = $4',
      ['SUSPENDED', reason_for_suspension, adminId, creator_id]
    );

    res.json({
      message: 'Creator suspended successfully',
      creator_id,
      account_status: 'SUSPENDED',
      reason_for_suspension,
      suspended_by: adminId,
      suspended_at: new Date()
    });
  } catch (error) {
    console.error('Suspend Creator error:', error);
    return next(new AppError('Failed to suspend creator', 500));
  }
}

const revokeCreatorSuspension = async (req, res, next) => {
  try {
    const { creator_id } = req.body;

    if (!creator_id) {
      return next(new AppError('Creator ID is required', 400));
    }

    const { rows } = await query(
      'SELECT creator_id, account_status FROM creators WHERE creator_id = $1',
      [creator_id]
    );

    if (rows.length === 0) {
      return next(new AppError('Creator not found', 404));
    }

    if (rows[0].account_status !== 'SUSPENDED') {
      return next(new AppError('Creator is not suspended', 400));
    }

    await query(
      'UPDATE creators SET account_status = $1, reason_for_suspension = NULL, suspended_by = NULL, suspended_at = NULL WHERE creator_id = $2',
      ['ACTIVE', creator_id]
    );

    res.json({
      message: 'Creator suspension revoked successfully',
      creator_id,
      account_status: 'ACTIVE'
    });
  } catch (error) {
    console.error('Revoke Creator suspension error:', error);
    return next(new AppError('Failed to revoke suspension', 500));
  }
}

const revokeFreelancerSuspension = async (req, res, next) => {
  try {
    const { freelancer_id } = req.body;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    const { rows } = await query(
      'SELECT freelancer_id, verification_status FROM freelancer WHERE freelancer_id = $1',
      [freelancer_id]
    );

    if (rows.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    if (rows[0].verification_status !== 'SUSPENDED') {
      return next(new AppError('Freelancer is not suspended', 400));
    }

    await query(
      'UPDATE freelancer SET verification_status = $1, reason_for_suspension = NULL WHERE freelancer_id = $2',
      ['VERIFIED', freelancer_id]
    );

    res.json({
      message: 'Freelancer suspension revoked successfully',
      freelancer_id,
      verification_status: 'VERIFIED'
    });
  } catch (error) {
    console.error('Revoke Freelancer suspension error:', error);
    return next(new AppError('Failed to revoke suspension', 500));
  }
}

// Get all escrow transactions (admin)
const getEscrowTransactions = async (req, res, next) => {
  try {
    const { status = 'HELD' } = req.query;

    const validStatuses = ['INITIATED', 'HELD', 'COMPLETED', 'REFUNDED', 'FAILED'];
    if (!validStatuses.includes(status)) {
      return next(new AppError(`Invalid status. Valid values: ${validStatuses.join(', ')}`, 400));
    }

    const transactions = await paymentService.getEscrowTransactions(status);

    return res.status(200).json({
      status: 'success',
      data: {
        transactions,
        count: transactions.length,
      },
    });
  } catch (error) {
    console.error('getEscrowTransactions error:', error);
    return next(new AppError('Failed to get escrow transactions', 500));
  }
};

// Release transfer — release on-hold funds to freelancer via Razorpay Routes
const releaseTransfer = async (req, res, next) => {
  const transactionId = req.params.id;
  const adminId = req.user.roleWiseId;

  try {
    const result = await paymentService.releaseTransfer(transactionId, adminId);

    return res.status(200).json({
      status: 'success',
      message: 'Transfer released. Funds will settle to freelancer bank in T+2 days.',
      data: result,
    });
  } catch (error) {
    console.error('releaseTransfer error:', error);
    const msg = error?.error?.description || error?.message || 'Failed to release transfer';
    if (msg.includes('not found') || msg.includes('No transfer') || msg.includes('No db records')) {
      return next(new AppError(msg, 404));
    }
    if (msg.includes('not in HELD') || msg.includes('already')) {
      return next(new AppError(msg, 400));
    }
    return next(new AppError(msg, 500));
  }
};

// Create Razorpay linked account for a freelancer (admin button 2)
const createFreelancerLinkedAccount = async (req, res, next) => {
  try {
    const { freelancer_id } = req.params;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    // Check freelancer exists and has bank details (Razorpay verification happens BEFORE platform KYC)
    const queryResult = await query(
      `SELECT freelancer_id, verification_status, bank_account_no, bank_ifsc_code, razorpay_linked_account_id, razorpay_account_status
       FROM freelancer WHERE freelancer_id = $1`,
      [freelancer_id]
    );

    const freelancers = queryResult.rows || [];
    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (!freelancer.bank_account_no || !freelancer.bank_ifsc_code) {
      return next(new AppError('Freelancer must have bank details before creating linked account', 400));
    }

    if (freelancer.razorpay_account_status === 'activated') {
      return next(new AppError('Linked account already activated', 400));
    }

    const result = await linkedAccountService.onboardFreelancer(parseInt(freelancer_id));

    return res.status(200).json({
      status: 'success',
      message: result.status === 'activated'
        ? 'Linked account created and activated successfully.'
        : `Linked account created. Status: ${result.status}. Razorpay may require additional review.`,
      data: result,
    });
  } catch (error) {
    console.error('createFreelancerLinkedAccount error:', error);
    return next(new AppError(error.message || 'Failed to create linked account', 500));
  }
};

// Get linked account status for a freelancer (admin)
const getFreelancerLinkedAccountStatus = async (req, res, next) => {
  try {
    const { freelancer_id } = req.params;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    const result = await linkedAccountService.syncAccountStatus(parseInt(freelancer_id));

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    console.error('getFreelancerLinkedAccountStatus error:', error);
    if (error.message.includes('not found') || error.message.includes('no linked account')) {
      return next(new AppError(error.message, 404));
    }
    return next(new AppError('Failed to get linked account status', 500));
  }
};

// Reset Razorpay linked account (allows freelancer to update bank/address details)
const resetFreelancerLinkedAccount = async (req, res, next) => {
  try {
    const { freelancer_id } = req.params;
    const adminId = req.user.roleWiseId;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    const { rows: freelancers } = await db.query(
      `SELECT razorpay_linked_account_id, razorpay_account_status, verification_status 
       FROM freelancer WHERE freelancer_id = $1`,
      [freelancer_id]
    );

    if (freelancers.length === 0) {
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancers[0];

    if (!freelancer.razorpay_linked_account_id) {
      return next(new AppError('No Razorpay linked account to reset', 400));
    }

    // Don't allow reset if account is activated and KYC is verified
    if (freelancer.razorpay_account_status === 'activated' && freelancer.verification_status === 'VERIFIED') {
      return next(new AppError(
        'Cannot reset activated Razorpay account for verified freelancer. Reject KYC first if changes are needed.',
        403
      ));
    }

    // Reset Razorpay-related fields
    await db.query(
      `UPDATE freelancer 
       SET razorpay_linked_account_id = NULL,
           razorpay_stakeholder_id = NULL,
           razorpay_product_id = NULL,
           razorpay_account_status = NULL,
           updated_at = NOW()
       WHERE freelancer_id = $1`,
      [freelancer_id]
    );

    return res.status(200).json({
      status: 'success',
      message: 'Razorpay linked account reset successfully. Freelancer can now update bank details and address.',
      data: {
        freelancer_id: parseInt(freelancer_id),
        reset_by: adminId,
        reset_at: new Date()
      }
    });
  } catch (error) {
    console.error('resetFreelancerLinkedAccount error:', error);
    return next(new AppError('Failed to reset linked account', 500));
  }
};

module.exports = {
  approvePayout,
  rejectPayout,
  getAllPayouts,
  getPayoutRequests,
  getPayoutDetails,
  getPlatformStats,
  updateCommission,
  approveKYCByAdmin,
  rejectKYCByAdmin,
  suspendFreelancerByAdmin,
  revokeFreelancerSuspension,
  addFeaturedFreelancer,
  removeFeaturedFreelancer,
  suspendCreatorByAdmin,
  revokeCreatorSuspension,
  getEscrowTransactions,
  releaseTransfer,
  createFreelancerLinkedAccount,
  getFreelancerLinkedAccountStatus,
  resetFreelancerLinkedAccount,
}