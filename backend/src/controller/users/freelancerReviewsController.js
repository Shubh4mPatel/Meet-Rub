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

    // ── 2. Rating summary ────────────────────────────────────────────────────
    const { rows: summaryRows } = await query(
      `SELECT
         COUNT(*)::INT                              AS total_reviews,
         ROUND(AVG(freelancer_rating)::NUMERIC, 1) AS average_rating,
         COUNT(*) FILTER (WHERE FLOOR(freelancer_rating) = 5)::INT AS five_star,
         COUNT(*) FILTER (WHERE FLOOR(freelancer_rating) = 4)::INT AS four_star,
         COUNT(*) FILTER (WHERE FLOOR(freelancer_rating) = 3)::INT AS three_star,
         COUNT(*) FILTER (WHERE FLOOR(freelancer_rating) = 2)::INT AS two_star,
         COUNT(*) FILTER (WHERE FLOOR(freelancer_rating) = 1)::INT AS one_star
       FROM ratings
       WHERE freelancer_id = $1
         AND freelancer_rating IS NOT NULL
         AND freelancer_review IS NOT NULL
         AND freelancer_review <> ''`,
      [freelancerId]
    );

    const summary = summaryRows[0];

    // ── 3. Sort order ────────────────────────────────────────────────────────
    const orderMap = {
      newest:  "r.created_at DESC",
      highest: "r.freelancer_rating DESC, r.created_at DESC",
      lowest:  "r.freelancer_rating ASC,  r.created_at DESC",
    };
    const orderBy = orderMap[sort] || orderMap.newest;

    // ── 4. Paginated reviews with reviewer info ──────────────────────────────
    const { rows: reviewRows } = await query(
      `SELECT
         r.id,
         r.freelancer_rating  AS rating,
         r.freelancer_review  AS review,
         r.created_at,
         c.creator_id,
         c.full_name          AS reviewer_name,
         c.niche              AS reviewer_niche,
         c.profile_image_url
       FROM ratings r
       JOIN creators c ON r.creator_id = c.creator_id
       WHERE r.freelancer_id = $1
         AND r.freelancer_rating IS NOT NULL
         AND r.freelancer_review IS NOT NULL
         AND r.freelancer_review <> ''
       ORDER BY ${orderBy}
       LIMIT $2 OFFSET $3`,
      [freelancerId, limit, offset]
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

module.exports = { getFreelancerReviews };
