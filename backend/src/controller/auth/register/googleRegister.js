const { pool, query } = require('../../../../config/dbConfig');
const AppError = require('../../../../utils/appError');
const { logger } = require('../../../../utils/logger');
const { generateTokens } = require('../../../../utils/helper');
const { minioClient } = require('../../../../config/minio');
const redisClient = require('../../../../config/reddis');
const { sendWelcomeEmail, sendAdminNewUserEmail } = require('../../../../utils/welcomeEmail');
const { notifyAllAdmins } = require('../../notification/notificationServicer');
const { INDIAN_STATES } = require('../../../utils/indianStates');

const USERNAMES_SET_KEY = 'usernames:set';
const BUCKET_NAME = 'meet-rub-assets';

/**
 * Verify Google access token via Google's tokeninfo endpoint.
 * Returns { email, name } on success, throws AppError on failure.
 */
async function verifyGoogleToken(accessToken, email) {
    const tokenInfoRes = await fetch(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    const tokenInfo = await tokenInfoRes.json();

    if (tokenInfo.error_description || !tokenInfo.email) {
        throw new AppError('Invalid or expired Google access token', 401);
    }

    if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
        throw new AppError('Google token audience mismatch', 401);
    }

    if (tokenInfo.email.toLowerCase() !== email.toLowerCase().trim()) {
        throw new AppError('Google token email mismatch', 401);
    }

    return { email: tokenInfo.email.toLowerCase().trim() };
}

// POST /auth/social-register
const googleRegisterUser = async (req, res, next) => {
    try {
        const { provider, accessToken, email, name, role, username, phone_number, niches,
            pan_card_number: rawPanCardNumber, street_address, city, state, postal_code,
            socialLinks } = req.body;

        // ── Basic validation ────────────────────────────────────────────────────
        if (provider !== 'google') {
            return next(new AppError('Unsupported OAuth provider', 400));
        }
        if (!accessToken || !email) {
            return next(new AppError('accessToken and email are required', 400));
        }
        if (!role || !['freelancer', 'creator'].includes(role)) {
            return next(new AppError('role must be freelancer or creator', 400));
        }
        if (!username || !username.trim()) {
            return next(new AppError('username is required', 400));
        }
        if (!phone_number || !phone_number.trim()) {
            return next(new AppError('phone_number is required', 400));
        }
        if (role === 'freelancer' && !rawPanCardNumber) {
            return next(new AppError('pan_card_number is required for freelancer', 400));
        }
        if (role === 'freelancer' && !req.file) {
            return next(new AppError('PAN card document is required for freelancer', 400));
        }

        // ── PAN format validation ───────────────────────────────────────────────
        let pan_card_number = null;
        if (role === 'freelancer') {
            pan_card_number = rawPanCardNumber.toUpperCase().trim();
            if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan_card_number)) {
                return next(new AppError('PAN must be in format: AAAPL1234C', 400));
            }
            if (pan_card_number.charAt(3) !== 'P') {
                return next(new AppError('Invalid PAN format. The 4th character must be "P".', 400));
            }
        }

        // ── Address validation for freelancer ──────────────────────────────────
        if (role === 'freelancer') {
            if (!street_address || !city || !state || !postal_code) {
                return next(new AppError('street_address, city, state, and postal_code are required for freelancer', 400));
            }
            const validStates = INDIAN_STATES.map(s => s.name);
            if (!validStates.includes(state)) {
                return next(new AppError('Please select a valid Indian state', 400));
            }
            if (!/^\d{6}$/.test(postal_code)) {
                return next(new AppError('Postal code must be exactly 6 digits', 400));
            }
        }

        // ── Verify Google token ─────────────────────────────────────────────────
        const { email: verifiedEmail } = await verifyGoogleToken(accessToken, email);
        logger.info('after verfication data',verifiedEmail)
        // ── Check if already registered ────────────────────────────────────────
        const { rows: existing } = await query(
            'SELECT id FROM users WHERE user_email = $1',
            [verifiedEmail]
        );
        if (existing.length > 0) {
            return next(new AppError('An account with this email already exists. Please sign in instead.', 409));
        }

        // ── Check username uniqueness ──────────────────────────────────────────
        const normalizedUsername = username.trim();
        const isUsernameTaken = await redisClient.sIsMember(USERNAMES_SET_KEY, normalizedUsername);
        if (isUsernameTaken) {
            return next(new AppError('Username already taken. Please choose a different one.', 400));
        }
        // Double-check in DB
        const { rows: dbUsernameTaken } = await query(
            'SELECT id FROM users WHERE user_name = $1',
            [normalizedUsername]
        );
        if (dbUsernameTaken.length > 0) {
            return next(new AppError('Username already taken. Please choose a different one.', 400));
        }

        const parsedNiches = niches
            ? (typeof niches === 'string' ? JSON.parse(niches) : niches)
            : [];

        // ── Split name into first/last ─────────────────────────────────────────
        const nameParts = (name || normalizedUsername).trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || '';
        const fullName = (name || normalizedUsername).trim();

        const now = new Date().toISOString();
        const client = await pool.connect();
        let user, roleWiseId;
        let panCardImageUrl = null;
        let panObjectName = null;

        try {
            await client.query('BEGIN');

            // ── Create user ───────────────────────────────────────────────────────
            const { rows: newUserRows } = await client.query(
                `INSERT INTO users (user_email, user_role, user_password, user_name, auth_provider, created_at)
         VALUES ($1, $2, NULL, $3, 'google', $4)
         RETURNING *`,
                [verifiedEmail, role, normalizedUsername, now]
            );
            user = newUserRows[0];

            // ── Role-specific record ──────────────────────────────────────────────
            if (role === 'freelancer') {
                logger.info('state information while registring with google',state)
                // Upload PAN card to MinIO
                const panCardFile = req.file;
                const ext = panCardFile.originalname.split('.').pop();
                panObjectName = `kyc/pan/${user.id}_${Date.now()}.${ext}`;

                await minioClient.putObject(
                    BUCKET_NAME,
                    panObjectName,
                    panCardFile.buffer,
                    panCardFile.size,
                    { 'Content-Type': panCardFile.mimetype }
                );
                panCardImageUrl = `${BUCKET_NAME}/${panObjectName}`;

                const { rows: freelancerRows } = await client.query(
                    `INSERT INTO freelancer
            (user_id, phone_number, freelancer_full_name, freelancer_email,
             niche, verification_status, user_name, pan_card_number, pan_card_image_url,
             street_address, city, state, postal_code, first_name, last_name, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING *`,
                    [
                        user.id,
                        phone_number.trim(),
                        fullName,
                        verifiedEmail,
                        parsedNiches,
                        normalizedUsername,
                        pan_card_number,
                        panCardImageUrl,
                        street_address,
                        city,
                        state,
                        postal_code,
                        firstName,
                        lastName,
                        now,
                        now,
                    ]
                );
                roleWiseId = freelancerRows[0].freelancer_id;

            } else if (role === 'creator') {
                const parsedSocialLinks = socialLinks ? JSON.parse(socialLinks) : null;

                const { rows: creatorRows } = await client.query(
                    `INSERT INTO creators
            (user_id, full_name, first_name, last_name, niche, social_links, phone_number, email, user_name, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *`,
                    [
                        user.id,
                        fullName,
                        firstName,
                        lastName,
                        parsedNiches,
                        parsedSocialLinks ? JSON.stringify(parsedSocialLinks) : null,
                        phone_number.trim(),
                        verifiedEmail,
                        normalizedUsername,
                        now,
                        now,
                    ]
                );
                roleWiseId = creatorRows[0].creator_id;
            }

            // Add username to Redis (before commit — rollback if this fails)
            await redisClient.sAdd(USERNAMES_SET_KEY, normalizedUsername);

            await client.query('COMMIT');
            logger.info(`Google registration successful: role=${role} user_id=${user.id} username=${normalizedUsername}`);

        } catch (err) {
            await client.query('ROLLBACK');
            // Cleanup Redis username if added
            try { await redisClient.sRem(USERNAMES_SET_KEY, normalizedUsername); } catch (_) { }
            // Cleanup MinIO upload if it happened
            if (panObjectName) {
                try { await minioClient.removeObject(BUCKET_NAME, panObjectName); } catch (_) { }
            }
            throw err;
        } finally {
            client.release();
        }

        // ── Send welcome emails (non-blocking) ──────────────────────────────────
        sendWelcomeEmail(role, verifiedEmail, normalizedUsername)
            .catch((err) => logger.error('Failed to send Google registration welcome email:', err));
        sendAdminNewUserEmail(role, normalizedUsername, verifiedEmail, now, req.ip)
            .catch((err) => logger.error('Failed to send admin new-user email:', err));
        notifyAllAdmins({
            senderId: user.id,
            eventType: 'new_user_registered',
            title: `New ${role} registered`,
            body: `${normalizedUsername} (${verifiedEmail}) has just signed up as a ${role}.`,
            actionType: 'navigate',
            actionRoute: role === 'freelancer'
                ? '/admin/freelancer-panel/kyc-requests'
                : '/admin/creator-panel/all-creators',
        }).catch((err) => logger.error('Failed to send admin in-app notification:', err));

        // ── Generate tokens ─────────────────────────────────────────────────────
        const { accessToken: jwtAccessToken, refreshToken } = generateTokens(user, roleWiseId);

        res.locals.accessToken = jwtAccessToken;
        res.locals.refreshToken = refreshToken;
        res.locals.user = {
            user_id: user.id,
            email: user.user_email,
            name: user.user_name,
            role: user.user_role,
            roleWiseId,
        };

        return next();
    } catch (err) {
        logger.error('Google registration error:', err);
        if (err instanceof AppError) return next(err);
        return next(new AppError('Registration failed. Please try again.', 500));
    }
};

module.exports = { googleRegisterUser };
