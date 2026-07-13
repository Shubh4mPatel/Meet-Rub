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
            `INSERT INTO users (user_name, user_email, user_password, user_role, created_at)
             VALUES ($1, $2, $3, 'admin', NOW())
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
            `UPDATE freelancer
   SET verification_status = 'VERIFIED'
   WHERE freelancer_email = $1`,
            [userEmail]
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
    f.verification_status,
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
WHERE f.verification_status != 'VERIFIED'
GROUP BY f.freelancer_id, f.freelancer_full_name, f.phone_number, f.freelancer_email, f.created_at, f.verification_status
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
    c.full_name AS creator_full_name, 
    c.email AS creator_email, 
    c.created_at
FROM creators c
INNER JOIN users u ON c.user_id = u.id
WHERE u.is_active = true
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

const getMyAdminInfo = async (req, res, next) => {
    try {
        const adminId = req.user?.roleWiseId;
        if (!adminId) {
            return next(new AppError('Admin id missing from token', 401));
        }

        const result = await query(
            `SELECT a.id, a.user_id, a.first_name, a.last_name, a.full_name, a.email,
                    a.permissions, a.is_active, a.created_at, a.updated_at
             FROM admin a
             WHERE a.id = $1`,
            [adminId]
        );

        if (result.rows.length === 0) {
            return next(new AppError('Admin not found', 404));
        }

        return res.status(200).json({
            status: 'success',
            data: result.rows[0],
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError('Failed to fetch admin info', 500));
    }
};

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

const adminUpdateCreatorEmail = async (req, res, next) => {
    try {
        const { creator_id } = req.params;
        const { newEmail } = req.body;

        if (!newEmail || !newEmail.trim()) {
            return next(new AppError('newEmail is required', 400));
        }

        const email = newEmail.trim().toLowerCase();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return next(new AppError('Invalid email format', 400));
        }

        // Check new email not already taken
        const { rows: taken } = await query(
            'SELECT id FROM users WHERE user_email = $1',
            [email]
        );
        if (taken.length) {
            return next(new AppError('This email is already in use by another account', 409));
        }

        // Resolve user_id and current auth_provider
        const { rows: creatorRows } = await query(
            `SELECT c.creator_id, c.user_id, u.auth_provider
             FROM creators c
             JOIN users u ON u.id = c.user_id
             WHERE c.creator_id = $1`,
            [creator_id]
        );

        if (!creatorRows.length) {
            return next(new AppError('Creator not found', 404));
        }

        const { user_id, auth_provider } = creatorRows[0];
        const isGoogleUser = auth_provider === 'google';

        // Update users table — clear auth_provider if Google user
        await query(
            `UPDATE users
             SET user_email = $1${isGoogleUser ? ', auth_provider = NULL' : ''}
             WHERE id = $2`,
            [email, user_id]
        );

        // Update creators table
        await query(
            'UPDATE creators SET email = $1, updated_at = NOW() WHERE creator_id = $2',
            [email, creator_id]
        );

        logger.info(
            `Creator ${creator_id} email updated to ${email} by admin ${req.user?.email}${isGoogleUser ? ' (converted from Google login)' : ''}`
        );

        return res.status(200).json({
            status: 'success',
            message: isGoogleUser
                ? 'Email updated and Google login removed. User must set a password via forgot password.'
                : 'Email updated successfully',
            data: { creator_id: Number(creator_id), email, wasGoogleUser: isGoogleUser },
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError('Failed to update creator email', 500));
    }
};

const adminUpdateUserCredentials = async (req, res, next) => {
    try {
        const { role, roleId, newEmail, password, confirmPassword } = req.body;

        if (!role || !roleId) {
            return next(new AppError('role and roleId are required', 400));
        }

        if (!newEmail && !password) {
            return next(new AppError('Provide at least newEmail or password to update', 400));
        }

        const validRoles = ['creator', 'freelancer', 'admin'];
        if (!validRoles.includes(role)) {
            return next(new AppError(`Invalid role. Allowed: ${validRoles.join(', ')}`, 400));
        }

        if (password !== undefined) {
            if (!confirmPassword) {
                return next(new AppError('confirmPassword is required when password is provided', 400));
            }
            if (password !== confirmPassword) {
                return next(new AppError('Passwords do not match', 400));
            }
            if (password.length < 8) {
                return next(new AppError('Password must be at least 8 characters', 400));
            }
        }

        // Resolve user_id from role table
        let userId;
        if (role === 'creator') {
            const { rows } = await query('SELECT user_id FROM creators WHERE creator_id = $1', [roleId]);
            if (!rows.length) return next(new AppError('Creator not found', 404));
            userId = rows[0].user_id;
        } else if (role === 'freelancer') {
            const { rows } = await query('SELECT user_id FROM freelancer WHERE freelancer_id = $1', [roleId]);
            if (!rows.length) return next(new AppError('Freelancer not found', 404));
            userId = rows[0].user_id;
        } else if (role === 'admin') {
            const { rows } = await query('SELECT user_id FROM admin WHERE id = $1', [roleId]);
            if (!rows.length) return next(new AppError('Admin not found', 404));
            userId = rows[0].user_id;
        }

        // Fetch current user state
        const { rows: userRows } = await query(
            'SELECT user_email, auth_provider FROM users WHERE id = $1',
            [userId]
        );
        if (!userRows.length) return next(new AppError('User not found', 404));

        const currentEmail = userRows[0].user_email;
        const isGoogleUser = userRows[0].auth_provider === 'google';

        // Determine if email actually changed
        const emailChanged = newEmail && newEmail.trim().toLowerCase() !== currentEmail.toLowerCase();

        if (emailChanged) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(newEmail.trim())) {
                return next(new AppError('Invalid email format', 400));
            }
            const { rows: taken } = await query(
                'SELECT id FROM users WHERE user_email = $1',
                [newEmail.trim().toLowerCase()]
            );
            if (taken.length) {
                return next(new AppError('This email is already in use by another account', 409));
            }
        }

        const clearGoogle = isGoogleUser && (emailChanged || !!password);

        // Build users UPDATE
        const userSetParts = [];
        const userParams = [];
        let paramIdx = 1;

        if (emailChanged) {
            userSetParts.push(`user_email = $${paramIdx++}`);
            userParams.push(newEmail.trim().toLowerCase());
        }
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            userSetParts.push(`user_password = $${paramIdx++}`);
            userParams.push(hashedPassword);
        }
        if (clearGoogle) {
            userSetParts.push('auth_provider = NULL');
        }
        userParams.push(userId);

        await query(
            `UPDATE users SET ${userSetParts.join(', ')} WHERE id = $${paramIdx}`,
            userParams
        );

        // Update role-specific email field
        if (emailChanged) {
            const finalEmail = newEmail.trim().toLowerCase();
            if (role === 'creator') {
                await query(
                    'UPDATE creators SET email = $1, updated_at = NOW() WHERE creator_id = $2',
                    [finalEmail, roleId]
                );
            } else if (role === 'freelancer') {
                await query(
                    'UPDATE freelancer SET freelancer_email = $1, updated_at = NOW() WHERE freelancer_id = $2',
                    [finalEmail, roleId]
                );
            }
        }

        const actions = [];
        if (emailChanged) actions.push('email');
        if (password) actions.push('password');

        logger.info(
            `Credentials updated [${actions.join(' + ')}] for ${role} roleId=${roleId} by admin ${req.user?.email}${clearGoogle ? ' (converted from Google login)' : ''}`
        );

        return res.status(200).json({
            status: 'success',
            message: clearGoogle
                ? `${actions.join(' and ')} updated. Google login removed — user can now log in with email and password.`
                : `${actions.join(' and ')} updated successfully`,
            data: {
                emailChanged,
                passwordChanged: !!password,
                googleLoginRemoved: clearGoogle,
            },
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError('Failed to update credentials', 500));
    }
};

// Backfill the Google Sheet with ALL current freelancers (overwrites the sheet).
// Admin can trigger this once to import existing freelancers; new signups are
// appended automatically by the registration flows.
const { syncAllFreelancers, syncAllCreators, isConfigured } = require('../../services/googleSheetsService');

const syncFreelancersToSheet = async (req, res, next) => {
    try {
        if (!isConfigured()) {
            return next(new AppError('Google Sheets is not configured on the server.', 400));
        }

        const { rows } = await query(
            `SELECT f.freelancer_id, f.freelancer_full_name, f.user_name, f.freelancer_email,
                    f.phone_number, f.niche, f.pan_card_number, f.verification_status, f.created_at,
                    u.auth_provider
             FROM freelancer f
             LEFT JOIN users u ON u.id = f.user_id
             ORDER BY f.created_at ASC NULLS LAST`
        );

        const freelancers = rows.map((f) => ({
            freelancer_id: f.freelancer_id,
            full_name: f.freelancer_full_name,
            user_name: f.user_name,
            email: f.freelancer_email,
            phone_number: f.phone_number,
            niche: f.niche,
            pan_card_number: f.pan_card_number,
            verification_status: f.verification_status,
            registered_via: f.auth_provider === 'google' ? 'Google' : 'OTP',
            created_at: f.created_at,
        }));

        const count = await syncAllFreelancers(freelancers);
        return res.status(200).json({
            status: 'success',
            message: `Synced ${count} freelancers to the Google Sheet`,
            data: { count },
        });
    } catch (error) {
        logger.error('Failed to sync freelancers to Google Sheet:', error);
        return next(new AppError(error.message || 'Failed to sync freelancers to Google Sheet', 500));
    }
};

// Backfill the Google Sheet with ALL current creators (overwrites the Creators tab).
const syncCreatorsToSheet = async (req, res, next) => {
    try {
        if (!isConfigured()) {
            return next(new AppError('Google Sheets is not configured on the server.', 400));
        }

        const { rows } = await query(
            `SELECT c.creator_id, c.full_name, c.user_name, c.email,
                    c.phone_number, c.niche, c.social_links, c.created_at,
                    u.auth_provider
             FROM creators c
             LEFT JOIN users u ON u.id = c.user_id
             ORDER BY c.created_at ASC NULLS LAST`
        );

        const creators = rows.map((c) => ({
            creator_id: c.creator_id,
            full_name: c.full_name,
            user_name: c.user_name,
            email: c.email,
            phone_number: c.phone_number,
            niche: c.niche,
            social_links: c.social_links,
            registered_via: c.auth_provider === 'google' ? 'Google' : 'OTP',
            created_at: c.created_at,
        }));

        const count = await syncAllCreators(creators);
        return res.status(200).json({
            status: 'success',
            message: `Synced ${count} creators to the Google Sheet`,
            data: { count },
        });
    } catch (error) {
        logger.error('Failed to sync creators to Google Sheet:', error);
        return next(new AppError(error.message || 'Failed to sync creators to Google Sheet', 500));
    }
};

module.exports = { approveProfile, getAllFreelancers, getAllCreators, createAdmin, getAdminList, getMyAdminInfo, updateAdminPermissions, deleteAdmin, adminUpdateUserCredentials, adminUpdateCreatorEmail, syncFreelancersToSheet, syncCreatorsToSheet };