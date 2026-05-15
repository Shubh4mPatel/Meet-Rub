const bcrypt = require('bcrypt');
const { query } = require('../../../config/dbConfig')
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');
const { PERMISSIONS } = require('../../../config/permissions');

const createAdmin = async (req, res, next) => {
    try {
        const { full_name, email, password, permissions = {} } = req.body;

        if (!full_name || !email || !password) {
            return next(new AppError('full_name, email and password are required', 400));
        }

        // Validate permissions object against master schema
        for (const [module, actions] of Object.entries(permissions)) {
            if (!PERMISSIONS[module]) {
                return next(new AppError(`Invalid permission module: '${module}'. Allowed modules: ${Object.keys(PERMISSIONS).join(', ')}`, 400));
            }
            if (!Array.isArray(actions)) {
                return next(new AppError(`Permissions for module '${module}' must be an array`, 400));
            }
            const invalidActions = actions.filter(a => !PERMISSIONS[module].includes(a));
            if (invalidActions.length) {
                return next(new AppError(`Invalid actions for module '${module}': ${invalidActions.join(', ')}. Allowed: ${PERMISSIONS[module].join(', ')}`, 400));
            }
        }

        // Check duplicate email
        const existing = await query('SELECT id FROM users WHERE user_email = $1', [email.toLowerCase()]);
        if (existing.rows.length) {
            return next(new AppError('An account with this email already exists', 409));
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        // Split full_name into first/last
        const nameParts = full_name.trim().split(' ');
        const first_name = nameParts[0];
        const last_name = nameParts.slice(1).join(' ') || nameParts[0];

        // Insert into users table
        const userResult = await query(
            `INSERT INTO users (user_name, user_email, user_password, user_role, approval_status, created_at, updated_at)
             VALUES ($1, $2, $3, 'admin', 'approved', NOW(), NOW())
             RETURNING id`,
            [full_name.trim(), email.toLowerCase(), hashedPassword]
        );
        const userId = userResult.rows[0].id;

        // Insert into admin table
        const adminResult = await query(
            `INSERT INTO admin (user_id, full_name, first_name, last_name, email, permissions, is_active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
             RETURNING id, full_name, email, permissions, is_active, created_at`,
            [userId, full_name.trim(), first_name, last_name, email.toLowerCase(), JSON.stringify(permissions)]
        );

        logger.info(`New admin created: ${email} by admin ${req.user?.email}`);

        return res.status(201).json({
            status: 'success',
            message: 'Admin created successfully',
            data: adminResult.rows[0],
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError('Failed to create admin', 500));
    }
};


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

const getAdminList = async (req, res, next) => {
    try {
        const { search, module } = req.query;

        const result = await query(
            `SELECT a.id, a.full_name, a.email, a.permissions, a.is_active, a.created_at
             FROM admin a
             WHERE
               ($1::text IS NULL OR a.full_name ILIKE '%' || $1 || '%' OR a.email ILIKE '%' || $1 || '%')
               AND ($2::text IS NULL OR jsonb_exists(a.permissions, $2))
             ORDER BY a.created_at DESC`,
            [search || null, module || null]
        );

        return res.status(200).json({
            status: 'success',
            data: result.rows,
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError('Failed to fetch admin list', 500));
    }
};

const updateAdminPermissions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
            return next(new AppError('permissions must be a non-null object', 400));
        }

        // Validate against master schema
        for (const [mod, actions] of Object.entries(permissions)) {
            if (!PERMISSIONS[mod]) {
                return next(new AppError(`Invalid permission module: '${mod}'. Allowed: ${Object.keys(PERMISSIONS).join(', ')}`, 400));
            }
            if (!Array.isArray(actions)) {
                return next(new AppError(`Permissions for module '${mod}' must be an array`, 400));
            }
            const invalidActions = actions.filter(a => !PERMISSIONS[mod].includes(a));
            if (invalidActions.length) {
                return next(new AppError(`Invalid actions for module '${mod}': ${invalidActions.join(', ')}. Allowed: ${PERMISSIONS[mod].join(', ')}`, 400));
            }
        }

        // Prevent editing own permissions
        if (req.user?.roleWiseId === Number(id)) {
            return next(new AppError('You cannot edit your own permissions', 403));
        }

        const result = await query(
            `UPDATE admin SET permissions = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING id, full_name, email, permissions`,
            [JSON.stringify(permissions), id]
        );

        if (!result.rows.length) {
            return next(new AppError('Admin not found', 404));
        }

        logger.info(`Admin ${result.rows[0].email} permissions updated by ${req.user?.email}`);

        return res.status(200).json({
            status: 'success',
            message: 'Permissions updated successfully',
            data: result.rows[0],
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError('Failed to update permissions', 500));
    }
};

const deleteAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Prevent self-deletion
        if (req.user?.roleWiseId === Number(id)) {
            return next(new AppError('You cannot delete your own account', 403));
        }

        const adminRes = await query('SELECT user_id, email FROM admin WHERE id = $1', [id]);
        if (!adminRes.rows.length) {
            return next(new AppError('Admin not found', 404));
        }

        const { user_id, email } = adminRes.rows[0];

        await query('DELETE FROM admin WHERE id = $1', [id]);
        await query('DELETE FROM users WHERE id = $1', [user_id]);

        logger.info(`Admin ${email} deleted by ${req.user?.email}`);

        return res.status(200).json({
            status: 'success',
            message: 'Admin deleted successfully',
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError('Failed to delete admin', 500));
    }
};

module.exports = { approveProfile, getAllFreelancers, getAllCreators, createAdmin, getAdminList, updateAdminPermissions, deleteAdmin };