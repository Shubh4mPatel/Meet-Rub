const { pool: db } = require('../../../config/dbConfig');
const AppError = require("../../../utils/appError");

/**
 * Get all featured freelancers, optionally filtered by service
 * Query params:
 *   - service_name (optional): Filter by service name (case-insensitive)
 *   - limit (optional): Max number of results, default 5
 */
const getFeaturedFreelancers = async (req, res, next) => {
  try {
    const { service_name, limit = 5 } = req.query;
    
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      return next(new AppError('Invalid limit. Must be between 1 and 50', 400));
    }

    let query;
    let params;

    if (service_name) {
      // Get featured freelancers for specific service
      query = `
        SELECT 
          ff.id,
          ff.freelancer_id,
          ff.priority,
          ff.featured_at,
          so.service_name,
          so.id as service_option_id,
          u.user_name as freelancer_name,
          u.user_email as freelancer_email,
          f.profile_headline,
          f.profile_picture,
          f.average_rating,
          f.total_completed_orders,
          f.hourly_rate
        FROM featured_freelancers ff
        INNER JOIN service_options so ON ff.service_option_id = so.id
        INNER JOIN freelancer f ON ff.freelancer_id = f.freelancer_id
        INNER JOIN users u ON f.user_id = u.id
        WHERE ff.is_active = true
          AND LOWER(so.service_name) = LOWER($1)
        ORDER BY ff.priority ASC
        LIMIT $2
      `;
      params = [service_name, parsedLimit];
    } else {
      // Get all featured freelancers across all services
      query = `
        SELECT 
          ff.id,
          ff.freelancer_id,
          ff.priority,
          ff.featured_at,
          so.service_name,
          so.id as service_option_id,
          u.user_name as freelancer_name,
          u.user_email as freelancer_email,
          f.profile_headline,
          f.profile_picture,
          f.average_rating,
          f.total_completed_orders,
          f.hourly_rate
        FROM featured_freelancers ff
        INNER JOIN service_options so ON ff.service_option_id = so.id
        INNER JOIN freelancer f ON ff.freelancer_id = f.freelancer_id
        INNER JOIN users u ON f.user_id = u.id
        WHERE ff.is_active = true
        ORDER BY so.service_name ASC, ff.priority ASC
        LIMIT $1
      `;
      params = [parsedLimit];
    }

    const { rows } = await db.query(query, params);

    // Group by service if no service filter was applied
    let result;
    if (service_name) {
      result = {
        service_name: service_name,
        freelancers: rows
      };
    } else {
      // Group freelancers by service
      const groupedByService = rows.reduce((acc, row) => {
        if (!acc[row.service_name]) {
          acc[row.service_name] = {
            service_name: row.service_name,
            service_option_id: row.service_option_id,
            freelancers: []
          };
        }
        acc[row.service_name].freelancers.push({
          id: row.id,
          freelancer_id: row.freelancer_id,
          priority: row.priority,
          featured_at: row.featured_at,
          freelancer_name: row.freelancer_name,
          freelancer_email: row.freelancer_email,
          profile_headline: row.profile_headline,
          profile_picture: row.profile_picture,
          average_rating: row.average_rating,
          total_completed_orders: row.total_completed_orders,
          hourly_rate: row.hourly_rate
        });
        return acc;
      }, {});

      result = Object.values(groupedByService);
    }

    return res.json({
      status: 'success',
      count: rows.length,
      data: result
    });
  } catch (error) {
    console.error('Get featured freelancers error:', error);
    return next(new AppError('Failed to fetch featured freelancers', 500));
  }
};

module.exports = {
  getFeaturedFreelancers
};
