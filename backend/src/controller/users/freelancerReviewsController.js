const { query } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { logger } = require("../../../utils/logger");
const { createPresignedUrl } = require("../../../utils/helper");

const EXPIRY_SECONDS = 4 * 60 * 60;

/**
 * GET /creator/freelancers/:id/reviews
 *
 * Query params:
 *   sort  — "newest" (default) | "highest" | "lowest"
 *   page  — default 1
 *   limit — default 10
 *
 * Returns:
 *   - rating summary (average, total, star breakdown)
 *   - paginated list of reviews with reviewer info
 */
const getFreelancerReviews = async (req, res, next) => {
  logger.info("Fetching freelancer reviews");

  try {
    const { id: freelancerId } = req.params;
    const sort  = req.query.sort  || "newest";
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const serviceType = (req.query.serviceType || "").trim();
    const hasServiceFilter = serviceType.length > 0;

    if (!freelancerId) {
      return next(new AppError("Freelancer ID is required", 400));
    }

    // ── 1. Verify freelancer exists ──────────────────────────────────────────
    const { rows: freelancerRows } = await query(
      `SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1`,
      [freelancerId]
    );

    if (!freelancerRows[0]) {
      logger.warn(`Freelancer not found: ${freelancerId}`);
      return next(new AppError("Freelancer not found", 404));
    }

    // ── 2. Service-type filter fragments ─────────────────────────────────────
    // ratings → projects → services links a rating to the service it was for.
    // Joining on services.id resolves service_name regardless of plan tier
    // (basic/standard/premium), so the rating is scoped to the service type.
    const serviceJoin = hasServiceFilter
      ? `JOIN projects p ON p.id = r.project_id
         JOIN services s ON s.id = p.service_id`
      : "";
    const serviceCond = hasServiceFilter ? `AND s.service_name = $2` : "";

    // ── 3. Rating summary (scoped to service type when filtered) ─────────────
    const { rows: summaryRows } = await query(
      `SELECT
         COUNT(*)::INT                                AS total_reviews,
         ROUND(AVG(r.freelancer_rating)::NUMERIC, 1)  AS average_rating,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 5)::INT AS five_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 4)::INT AS four_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 3)::INT AS three_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 2)::INT AS two_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 1)::INT AS one_star
       FROM ratings r
       ${serviceJoin}
       WHERE r.freelancer_id = $1
         AND r.freelancer_rating IS NOT NULL
         AND r.freelancer_review IS NOT NULL
         AND r.freelancer_review <> ''
         ${serviceCond}`,
      hasServiceFilter ? [freelancerId, serviceType] : [freelancerId]
    );

    const summary = summaryRows[0];

    // ── 3b. Service types this freelancer has reviews for (for the dropdown) ─
    const { rows: serviceTypeRows } = await query(
      `SELECT DISTINCT s.service_name
       FROM ratings r
       JOIN projects p ON p.id = r.project_id
       JOIN services s ON s.id = p.service_id
       WHERE r.freelancer_id = $1
         AND r.freelancer_rating IS NOT NULL
         AND r.freelancer_review IS NOT NULL
         AND r.freelancer_review <> ''
         AND s.service_name IS NOT NULL
       ORDER BY s.service_name`,
      [freelancerId]
    );
    const availableServiceTypes = serviceTypeRows.map((row) => row.service_name);

    // ── 4. Sort order ────────────────────────────────────────────────────────
    const orderMap = {
      newest:  "r.created_at DESC",
      highest: "r.freelancer_rating DESC, r.created_at DESC",
      lowest:  "r.freelancer_rating ASC,  r.created_at DESC",
    };
    const orderBy = orderMap[sort] || orderMap.newest;

    // ── 5. Paginated reviews with reviewer info + service type ───────────────
    // LEFT JOINs expose the per-review service type (null when a project has
    // no linked service); when filtering, the WHERE match excludes nulls.
    const reviewParams = [freelancerId];
    let nextIdx = 2;
    let listServiceCond = "";
    if (hasServiceFilter) {
      listServiceCond = `AND s.service_name = $${nextIdx}`;
      reviewParams.push(serviceType);
      nextIdx++;
    }
    const limitIdx = nextIdx;
    const offsetIdx = nextIdx + 1;
    reviewParams.push(limit, offset);

    const { rows: reviewRows } = await query(
      `SELECT
         r.id,
         r.freelancer_rating  AS rating,
         r.freelancer_review  AS review,
         r.created_at,
         c.creator_id,
         c.full_name          AS reviewer_name,
         c.niche              AS reviewer_niche,
         c.profile_image_url,
         s.service_name       AS service_type
       FROM ratings r
       JOIN creators c ON r.creator_id = c.creator_id
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN services s ON s.id = p.service_id
       WHERE r.freelancer_id = $1
         AND r.freelancer_rating IS NOT NULL
         AND r.freelancer_review IS NOT NULL
         AND r.freelancer_review <> ''
         ${listServiceCond}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      reviewParams
    );

    // ── 5. Resolve presigned URLs for reviewer profile images ────────────────
    const reviews = await Promise.all(
      reviewRows.map(async (row) => {
        let profileImageUrl = null;

        if (row.profile_image_url) {
          try {
            const path = row.profile_image_url;
            const slashIdx = path.indexOf("/");
            if (slashIdx !== -1) {
              profileImageUrl = await createPresignedUrl(
                path.substring(0, slashIdx),
                path.substring(slashIdx + 1),
                EXPIRY_SECONDS
              );
            }
          } catch (err) {
            logger.warn(`Failed presigned URL for creator ${row.creator_id}:`, err);
          }
        }

        return {
          id:             row.id,
          rating:         parseFloat(row.rating),
          review:         row.review,
          created_at:     row.created_at,
          service_type:   row.service_type || null,
          reviewer: {
            creator_id:        row.creator_id,
            name:              row.reviewer_name,
            niche:             row.reviewer_niche,
            profile_image_url: profileImageUrl,
          },
        };
      })
    );

    return res.status(200).json({
      status:  "success",
      message: "Freelancer reviews fetched successfully",
      data: {
        filters: {
          service_type: hasServiceFilter ? serviceType : null,
        },
        available_service_types: availableServiceTypes,
        summary: {
          average_rating: summary.average_rating ? parseFloat(summary.average_rating) : null,
          total_reviews:  summary.total_reviews,
          breakdown: {
            five_star:  summary.five_star,
            four_star:  summary.four_star,
            three_star: summary.three_star,
            two_star:   summary.two_star,
            one_star:   summary.one_star,
          },
        },
        reviews,
        pagination: {
          current_page: page,
          total_pages:  Math.ceil(summary.total_reviews / limit),
          total_reviews: summary.total_reviews,
          limit,
          has_next:     page < Math.ceil(summary.total_reviews / limit),
          has_previous: page > 1,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancer reviews:", error);
    return next(new AppError("Failed to fetch freelancer reviews", 500));
  }
};

/**
 * GET /freelancer/my-reviews
 *
 * Freelancer views their own received reviews.
 * freelancer_id is taken from the JWT token (req.user.roleWiseId).
 *
 * Query params:
 *   sort  — "newest" (default) | "highest" | "lowest"
 *   page  — default 1
 *   limit — default 10
 */
const getMyReviews = async (req, res, next) => {
  logger.info("Fetching own freelancer reviews");

  try {
    const freelancerId = req.user.roleWiseId;
    const sort  = req.query.sort  || "newest";
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const serviceType = (req.query.serviceType || "").trim();
    const hasServiceFilter = serviceType.length > 0;

    if (!freelancerId) {
      return next(new AppError("Freelancer ID not found in token", 400));
    }

    // ── 1. Verify freelancer exists ──────────────────────────────────────────
    const { rows: freelancerRows } = await query(
      `SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1`,
      [freelancerId]
    );

    if (!freelancerRows[0]) {
      return next(new AppError("Freelancer not found", 404));
    }

    // ── 2. Service-type filter fragments ─────────────────────────────────────
    // ratings → projects → services links a rating to the service it was for.
    // Joining on services.id resolves service_name regardless of plan tier
    // (basic/standard/premium), so the rating is scoped to the service type.
    const serviceJoin = hasServiceFilter
      ? `JOIN projects p ON p.id = r.project_id
         JOIN services s ON s.id = p.service_id`
      : "";
    const serviceCond = hasServiceFilter ? `AND s.service_name = $2` : "";

    // ── 3. Rating summary (scoped to service type when filtered) ─────────────
    const { rows: summaryRows } = await query(
      `SELECT
         COUNT(*)::INT                                AS total_reviews,
         ROUND(AVG(r.freelancer_rating)::NUMERIC, 1)  AS average_rating,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 5)::INT AS five_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 4)::INT AS four_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 3)::INT AS three_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 2)::INT AS two_star,
         COUNT(*) FILTER (WHERE FLOOR(r.freelancer_rating) = 1)::INT AS one_star
       FROM ratings r
       ${serviceJoin}
       WHERE r.freelancer_id = $1
         AND r.freelancer_rating IS NOT NULL
         AND r.freelancer_review IS NOT NULL
         AND r.freelancer_review <> ''
         ${serviceCond}`,
      hasServiceFilter ? [freelancerId, serviceType] : [freelancerId]
    );

    const summary = summaryRows[0];

    // ── 3b. Service types this freelancer has reviews for (for the dropdown) ─
    const { rows: serviceTypeRows } = await query(
      `SELECT DISTINCT s.service_name
       FROM ratings r
       JOIN projects p ON p.id = r.project_id
       JOIN services s ON s.id = p.service_id
       WHERE r.freelancer_id = $1
         AND r.freelancer_rating IS NOT NULL
         AND r.freelancer_review IS NOT NULL
         AND r.freelancer_review <> ''
         AND s.service_name IS NOT NULL
       ORDER BY s.service_name`,
      [freelancerId]
    );
    const availableServiceTypes = serviceTypeRows.map((row) => row.service_name);

    // ── 4. Sort order ────────────────────────────────────────────────────────
    const orderMap = {
      newest:  "r.created_at DESC",
      highest: "r.freelancer_rating DESC, r.created_at DESC",
      lowest:  "r.freelancer_rating ASC,  r.created_at DESC",
    };
    const orderBy = orderMap[sort] || orderMap.newest;

    // ── 5. Paginated reviews with reviewer info + service type ───────────────
    // LEFT JOINs expose the per-review service type (null when a project has
    // no linked service); when filtering, the WHERE match excludes nulls.
    const reviewParams = [freelancerId];
    let nextIdx = 2;
    let listServiceCond = "";
    if (hasServiceFilter) {
      listServiceCond = `AND s.service_name = $${nextIdx}`;
      reviewParams.push(serviceType);
      nextIdx++;
    }
    const limitIdx = nextIdx;
    const offsetIdx = nextIdx + 1;
    reviewParams.push(limit, offset);

    const { rows: reviewRows } = await query(
      `SELECT
         r.id,
         r.freelancer_rating  AS rating,
         r.freelancer_review  AS review,
         r.created_at,
         c.creator_id,
         c.full_name          AS reviewer_name,
         c.niche              AS reviewer_niche,
         c.profile_image_url,
         s.service_name       AS service_type
       FROM ratings r
       JOIN creators c ON r.creator_id = c.creator_id
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN services s ON s.id = p.service_id
       WHERE r.freelancer_id = $1
         AND r.freelancer_rating IS NOT NULL
         AND r.freelancer_review IS NOT NULL
         AND r.freelancer_review <> ''
         ${listServiceCond}
       ORDER BY ${orderBy}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      reviewParams
    );

    // ── 5. Resolve presigned URLs for reviewer profile images ────────────────
    const reviews = await Promise.all(
      reviewRows.map(async (row) => {
        let profileImageUrl = null;

        if (row.profile_image_url) {
          try {
            const path = row.profile_image_url;
            const slashIdx = path.indexOf("/");
            if (slashIdx !== -1) {
              profileImageUrl = await createPresignedUrl(
                path.substring(0, slashIdx),
                path.substring(slashIdx + 1),
                EXPIRY_SECONDS
              );
            }
          } catch (err) {
            logger.warn(`Failed presigned URL for creator ${row.creator_id}:`, err);
          }
        }

        return {
          id:         row.id,
          rating:     parseFloat(row.rating),
          review:     row.review,
          created_at: row.created_at,
          service_type: row.service_type || null,
          reviewer: {
            creator_id:        row.creator_id,
            name:              row.reviewer_name,
            niche:             row.reviewer_niche,
            profile_image_url: profileImageUrl,
          },
        };
      })
    );

    return res.status(200).json({
      status:  "success",
      message: "Your reviews fetched successfully",
      data: {
        filters: {
          service_type: hasServiceFilter ? serviceType : null,
        },
        available_service_types: availableServiceTypes,
        summary: {
          average_rating: summary.average_rating ? parseFloat(summary.average_rating) : null,
          total_reviews:  summary.total_reviews,
          breakdown: {
            five_star:  summary.five_star,
            four_star:  summary.four_star,
            three_star: summary.three_star,
            two_star:   summary.two_star,
            one_star:   summary.one_star,
          },
        },
        reviews,
        pagination: {
          current_page:  page,
          total_pages:   Math.ceil(summary.total_reviews / limit),
          total_reviews: summary.total_reviews,
          limit,
          has_next:      page < Math.ceil(summary.total_reviews / limit),
          has_previous:  page > 1,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching own freelancer reviews:", error);
    return next(new AppError("Failed to fetch your reviews", 500));
  }
};

module.exports = { getFreelancerReviews, getMyReviews };
