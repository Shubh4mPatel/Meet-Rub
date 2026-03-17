const { query } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { logger } = require("../../../utils/logger");
const { createPresignedUrl } = require("../../../utils/helper");

const BUCKET_NAME = "meet-rub-assets";
const EXPIRY_SECONDS = 4 * 60 * 60;

/**
 * GET /freelancers/:id/overview
 *
 * Returns a summary card for a freelancer profile:
 *  - about_me info (name, title, profile image, about_me, rating, worked_with)
 *  - 2 most-recent portfolio items
 *  - 2 most-recent before/after (impact) items
 *  - reviews breakdown by star rating (requires a `reviews` table with
 *    columns: freelancer_id INT, rating SMALLINT CHECK(rating BETWEEN 1 AND 5))
 */
const getFreelancerOverview = async (req, res, next) => {
  logger.info("Fetching freelancer overview");

  try {
    const { id: freelancerId } = req.params;

    if (!freelancerId) {
      return next(new AppError("Freelancer ID is required", 400));
    }

    // ── 1. Freelancer basic info ─────────────────────────────────────────────
    const { rows: freelancerRows } = await query(
      `SELECT
         freelancer_id,
         freelancer_full_name,
         profile_title,
         profile_image_url,
         about_me,
         rating,
         worked_with
       FROM freelancer
       WHERE freelancer_id = $1`,
      [freelancerId]
    );

    if (!freelancerRows[0]) {
      logger.warn(`Freelancer not found: ${freelancerId}`);
      return next(new AppError("Freelancer not found", 404));
    }

    const freelancer = { ...freelancerRows[0] };

    // Resolve profile image presigned URL
    if (freelancer.profile_image_url) {
      try {
        const path = freelancer.profile_image_url;
        const slashIdx = path.indexOf("/");
        if (slashIdx !== -1) {
          freelancer.profile_image_url = await createPresignedUrl(
            path.substring(0, slashIdx),
            path.substring(slashIdx + 1),
            EXPIRY_SECONDS
          );
        }
      } catch (err) {
        logger.warn("Failed to generate presigned URL for profile image:", err);
        freelancer.profile_image_url = null;
      }
    }

    // ── 2. Portfolio — 2 most-recent items ───────────────────────────────────
    const { rows: portfolioRows } = await query(
      `SELECT
         portfolio_item_id,
         portfolio_item_service_type,
         portfolio_item_url,
         portfolio_item_description
       FROM portfolio
       WHERE freelancer_id = $1
       ORDER BY portfolio_item_created_at DESC
       LIMIT 2`,
      [freelancerId]
    );

    const portfolio = await Promise.all(
      portfolioRows.map(async (item) => {
        try {
          const objectName = item.portfolio_item_url.split("/").slice(1).join("/");
          item.portfolio_item_url = await createPresignedUrl(
            BUCKET_NAME,
            objectName,
            EXPIRY_SECONDS
          );
        } catch (err) {
          logger.warn(`Failed presigned URL for portfolio item ${item.portfolio_item_id}:`, err);
          item.portfolio_item_url = null;
        }
        return item;
      })
    );

    // ── 3. Before/After — 2 most-recent items ────────────────────────────────
    const { rows: impactRows } = await query(
      `SELECT
         impact_id,
         service_type,
         before_service_url,
         after_service_url,
         impact_metric,
         created_at
       FROM impact
       WHERE freelancer_id = $1
       ORDER BY created_at DESC
       LIMIT 2`,
      [freelancerId]
    );

    const beforeAfter = await Promise.all(
      impactRows.map(async (item) => {
        try {
          const beforeObj = item.before_service_url.split("/").slice(1).join("/");
          item.before_service_url = await createPresignedUrl(
            BUCKET_NAME,
            beforeObj,
            EXPIRY_SECONDS
          );
        } catch (err) {
          logger.warn(`Failed presigned URL for before image (impact ${item.impact_id}):`, err);
          item.before_service_url = null;
        }

        try {
          const afterObj = item.after_service_url.split("/").slice(1).join("/");
          item.after_service_url = await createPresignedUrl(
            BUCKET_NAME,
            afterObj,
            EXPIRY_SECONDS
          );
        } catch (err) {
          logger.warn(`Failed presigned URL for after image (impact ${item.impact_id}):`, err);
          item.after_service_url = null;
        }

        return item;
      })
    );

    // ── 4. Reviews — count per star rating from ratings table ────────────────
    // freelancer_rating is numeric(2,1), e.g. 4.5 — floor it to get star bucket
    const { rows: reviewRows } = await query(
      `SELECT
         FLOOR(freelancer_rating)::INT AS star,
         COUNT(*)::INT                 AS count
       FROM ratings
       WHERE freelancer_id = $1
         AND freelancer_rating IS NOT NULL
       GROUP BY FLOOR(freelancer_rating)`,
      [freelancerId]
    );

    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const row of reviewRows) {
      const star = Math.min(5, Math.max(1, row.star));
      breakdown[star] = (breakdown[star] || 0) + row.count;
    }

    const totalReviews = Object.values(breakdown).reduce((sum, n) => sum + n, 0);

    // Use the stored aggregate rating from the freelancer table
    const averageRating = freelancer.rating ?? null;

    return res.status(200).json({
      status: "success",
      message: "Freelancer overview fetched successfully",
      data: {
        about_me: {
          freelancer_id: freelancer.freelancer_id,
          full_name: freelancer.freelancer_full_name,
          profile_title: freelancer.profile_title,
          profile_image_url: freelancer.profile_image_url,
          about_me: freelancer.about_me,
          rating: averageRating,
          worked_with: freelancer.worked_with,
        },
        portfolio,
        before_after: beforeAfter,
        reviews: {
          average_rating: averageRating,
          total_reviews: totalReviews,
          breakdown: {
            five_star: breakdown[5],
            four_star: breakdown[4],
            three_star: breakdown[3],
            two_star: breakdown[2],
            one_star: breakdown[1],
          },
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancer overview:", error);
    return next(new AppError("Failed to fetch freelancer overview", 500));
  }
};

module.exports = { getFreelancerOverview };
