const jwt = require('jsonwebtoken');
const query = require('../../config/dbConfig'); // Adjust path as needed
const { headerKey } = require('../../config/apiHeader');
// const { addApiToRedis } = require('../utils/queueSender');
const { logger } = require('../../utils/logger');
// Make sure cookie-parser is required in your main app file (not here)
// Example in your main app file (e.g., app.js or server.js):
// const cookieParser = require('cookie-parser');
// app.use(cookieParser());

// Middleware to verify access token
const verifyAccessToken = async (req, res, next) => {
    try {
        // Get token from cookie or Authorization header
        let token = req.cookies?.orangeAccessToken ||
            req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Add user info to request object
        await query(
            `UPDATE UserSessionLogs
             SET logout_time = NOW()
             WHERE id = (
                 SELECT id FROM UserSessionLogs
                 WHERE user_id = $1 AND logout_time IS NULL
                 ORDER BY login_time DESC
                 LIMIT 1
             )`,
            [req.user.user_id]
          );
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Access token expired' });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid access token' });
        }
        return res.status(500).json({ error: 'Token verification failed' });
    }
};

// Middleware to refresh access token using refresh token
const refreshAccessToken = async (req, res, next) => {
    logger.info('Attempting to refresh access token...');
    try {
        const refreshToken = req.cookies?.orangeRefreshToken;

        logger.info("refreshToken  ", refreshToken);
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token required' });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

        // // Check if refresh token exists in database and is not expired
        // // const tokenRecord = await query(
        // //     "SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()",
        // //     [refreshToken, decoded.user_id]
        // // );

        // if (tokenRecord.rows.length === 0) {
        //     return res.status(401).json({ error: 'Invalid or expired refresh token' });
        // }

        // Get user details
        const user = await query("SELECT * FROM user_data WHERE id = $1", [decoded.user_id]);
        if (user.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }

        const role = await query('SELECT name FROM user_role WHERE id = $1', [user.rows[0].role_id]);

        // Generate new access token
        const payload = {
            user_id: user.rows[0].id,
            email: user.rows[0].email,
            name: user.rows[0].name,
            role: role.rows[0].name
        };

        const newAccessToken = jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // Set new access token cookie
        const ACCESS_TOKEN_DURATION = 15 * 60 * 1000; // 15 minutes
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('orangeAccessToken', newAccessToken, {
            maxAge: ACCESS_TOKEN_DURATION,
            httpOnly: isProduction ? true : false,
            secure: isProduction, // ensure the cookie is sent over HTTPS in production
            sameSite: 'lax',     // required for cross-site cookies
            path: '/',
        });

                await query(
            `UPDATE UserSessionLogs
     SET logout_time = NOW()
     WHERE id = (
         SELECT id FROM UserSessionLogs
         WHERE user_id = $1 AND logout_time IS NULL
         ORDER BY login_time DESC
         LIMIT 1
     )`,
            [user.rows[0].id]
        );

        req.user = payload;
        req.headers[headerKey.authorization] = `Bearer ${newAccessToken}`;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token refresh failed' });
    }
};

// Combined middleware that tries access token first, then refresh token
const authenticateUser = async (req, res, next) => {
    // First try to verify access token
    let token = req.cookies?.orangeAccessToken ||
        req.headers.authorization?.replace('Bearer ', '');

    if (token && token !== 'null' && token !== 'undefined' && token.trim() !== '') {
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
            return next();
        } catch (error) {
            logger.info('Access token verification failed:', error.message);
            if (error.name === 'TokenExpiredError') {
                logger.info('Access token expired, attempting to refresh...');
                // Access token expired, try to refresh
                return refreshAccessToken(req, res, next);
            } else {
                return res.status(401).json({ error: 'Invalid access token' });
            }
        }
    } else {
        logger.info('No access token found, attempting to refresh...');
        // No access token, try to refresh
        return refreshAccessToken(req, res, next);
    }
};

// Middleware to check user roles
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

// Middleware to logout (clear cookies and remove refresh token from DB)
const logout = async (req, res, next) => {
     try {
    // await query(
    //   "DELETE FROM refresh_tokens WHERE user_id = $1",
    //   [req.user.user_id]
    // );
        const refreshToken = req.cookies?.orangeRefreshToken;
        await addApiToRedis(req.user.user_id, 'Logout', "Logout", refreshToken);
        if (refreshToken) {
            // Remove refresh token from database
            await query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);
        }

    res.clearCookie('orangeAccessToken', { path: '/' });
    res.clearCookie('orangeRefreshToken', { path: '/' });
     await query(
        `UPDATE UserSessionLogs
            SET logout_time = NOW()
            WHERE id = (
                SELECT id FROM UserSessionLogs
                WHERE user_id = $1 AND logout_time IS NULL
                ORDER BY login_time DESC
                LIMIT 1
            )`,
        [req.user.user_id]
    );
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};

module.exports = {
    verifyAccessToken,
    refreshAccessToken,
    authenticateUser,
    requireRole,
    logout
};