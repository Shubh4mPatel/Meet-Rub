const { query } = require('../../../config/dbConfig')
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');


const approveProfile = async (req, res, next) => {
    try {
        const { userEmail } = req.body;
        const adminUser = req.user
        await query(
            `UPDATE users
   SET approval_status = 'approved',
       approved_at = $1
   WHERE user_email = $2`,
            [new Date(), userEmail]
        );
        logger.info(`user ${userEmail} approved by admin ${adminUser.name}`)

        return res.status(200).json({
            status: 'success',
            message: ' user approval successful'
        });

    } catch (error) {
        logger.error(error)
        return next(new AppError(`failed to update user approval`, 500))
    }
}

const getAllFreelancers = async (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const freelancersRes = await query(
            `SELECT 
    f.freelancer_id,
    f.freelancer_full_name, 
    f.phone_number, 
    f.freelancer_email, 
    f.created_at,
    u.approval_status,
    COALESCE(
        json_agg(
            DISTINCT jsonb_build_object(
                'service_name', so.service_name,
                'priority', ff.priority,
                'featured_at', ff.featured_at
            )
        ) FILTER (WHERE ff.is_active = true), 
        '[]'
    ) AS featured_services,
    CASE WHEN COUNT(ff.id) FILTER (WHERE ff.is_active = true) > 0 THEN true ELSE false END AS is_featured
FROM freelancer f
INNER JOIN users u ON f.user_id = u.id
LEFT JOIN featured_freelancers ff ON f.freelancer_id = ff.freelancer_id AND ff.is_active = true
LEFT JOIN service_options so ON ff.service_option_id = so.id
WHERE u.approval_status != 'approved'
GROUP BY f.freelancer_id, f.freelancer_full_name, f.phone_number, f.freelancer_email, f.created_at, u.approval_status
ORDER BY is_featured DESC, f.created_at DESC
LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const countRes = await query(
            `SELECT COUNT(*) AS total
       FROM freelancer`
        );
        const totalFreelancers = parseInt(countRes.rows[0].total, 10);
        const totalPages = Math.ceil(totalFreelancers / limit);
        if (!freelancersRes.rows.length) {
            return res.status(200).json({
                status: 'success',
                message: 'No freelancers found',
                data: {
                    freelancers: [],
                    pagination: {
                        currentPage: 0,
                        totalPages: 0,
                        totalItems: 0,
                    }
                }
            });
        }
        return res.status(200).json({
            status: 'success',
            message: 'Freelancers fetched successfully',
            data: {
                freelancers: freelancersRes.rows,
                pagination: {
                    currentPage: parseInt(page, 10),
                    totalPages,
                    totalItems: totalFreelancers,
                }
            }
        });

    }
    catch (error) {
        logger.error(error)
        return next(new AppError(`failed to fetch freelancers`, 500))
    }
}

const getAllCreators = async (req, res, next) => {
    // Implementation for getting all creators
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const creatorsData = await query(
            `SELECT 
    c.creator_full_name, 
    c.creator_email, 
    c.created_at,
    u.approval_status
FROM creators c
INNER JOIN users u ON c.user_id = u.id
WHERE u.approval_status != 'approved'
LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        const creatorsCount = await query(
            `SELECT COUNT(*) AS total
       FROM creators`
        );
        const totalCreators = parseInt(creatorsCount.rows[0].total, 10);
        const totalPages = Math.ceil(totalCreators / limit);
        if (!creatorsData.rows.length) {
            return res.status(200).json({
                status: 'success',
                message: 'No creators found',
                data: {
                    creators: [],
                    pagination: {
                        currentPage: 0,
                        totalPages: 0,
                        totalItems: 0,
                    }
                }
            });
        }
        return res.status(200).json({
            status: 'success',
            message: 'Creators fetched successfully',
            data: {
                creators: creatorsData.rows,
                pagination: {
                    currentPage: parseInt(page, 10),
                    totalPages,
                    totalItems: totalCreators,
                }
            }
        });
    } catch (error) {
        logger.error(error)
        return next(new AppError(`failed to fetch creators`, 500))
    }
}

module.exports = { approveProfile, getAllFreelancers, getAllCreators };