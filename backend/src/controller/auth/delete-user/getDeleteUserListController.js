const query = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { logger } = require('../../../utils/logger');


const getDeleteUserListController = async (req, res, next) => {

    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Filter parameters
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;
        const search = req.query.search;

        // Sort parameters
        const sortBy = req.query.sortBy || "created_at";
        const sortOrder = req.query.sortOrder || "DESC";

        // Build WHERE conditions
        let whereConditions = [];
        let queryParams = [];
        let paramIndex = 1;

        // Date filter (only if both dates are provided)
        if (startDate && endDate) {
            whereConditions.push(`DATE(ud.created_at) BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
            queryParams.push(startDate, endDate);
            paramIndex += 2;
        }

        // Search filter (name or email)
        if (search && search.trim()) {
            whereConditions.push(`(LOWER(ud.name) LIKE $${paramIndex} OR LOWER(ud.email) LIKE $${paramIndex})`);
            queryParams.push(`%${search.trim().toLowerCase()}%`);
            paramIndex += 1;
        }

        // Validate sort column to prevent SQL injection
        const allowedSortColumns = ['name', 'email', 'created_at'];
        const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
        const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Main query for data
        const dataQuery = `
                SELECT 
            ud.id AS user_id,
            ud.name,
            ud.email
        FROM user_data ud
        INNER JOIN deleteUserRequest d ON ud.id = d.user_id
        WHERE d.is_approved IS NOT TRUE
        ${whereConditions.length > 0 ? `AND ${whereConditions.join(' AND ')}` : ''}
        ORDER BY d.id DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}

        `;

        // Count query for total records
        const countQuery = `
            SELECT COUNT(*) as total
            FROM user_data ud
            INNER JOIN deleteUserRequest d ON ud.id = d.user_id
            WHERE d.is_approved IS NOT TRUE
            ${whereConditions.length > 0 ? `AND ${whereConditions.join(' AND ')}` : ''}
        `;

        // Prepare parameter arrays
        const dataQueryParams = [...queryParams, limit, offset];
        const countQueryParams = [...queryParams];

        // Execute both queries
        const [dataResult, countResult] = await Promise.all([
            query(dataQuery, dataQueryParams),
            query(countQuery, countQueryParams)
        ]);

        const users = dataResult.rows;
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            users: users,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalRecords: total,
                limit: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        logger.error("Error fetching users:", error);
        return next(new AppError("Failed to fetch user list", 500));
    }
};

module.exports = { getDeleteUserListController };