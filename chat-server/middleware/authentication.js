// middlewares/socketAuth.js
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const AppError = require('../utils/appError');
const { query } = require('../config/dbConfig'); // Assuming you have a db module for querying
const {logger} = require('../utils/logger'); // Assuming you have a logger utility
const { recordAuth } = require('../utils/socketMonitor');

// Rejection error that carries a machine-readable code to the client (connect_error.data.code)
// and records the rejection in the socket monitor.
const reject = (socket, code, message, statusCode, extra = {}) => {
  recordAuth(socket, 'auth_rejected', { code, message, ...extra });
  const err = new AppError(message, statusCode);
  err.data = { code };
  return err;
};


const socketAuth = (io) => {
  io.use(async (socket, next) => {
    try {
      // Parse cookies from handshake
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = cookieHeader ? cookie.parse(cookieHeader) : {};
      const token = cookies.AccessToken;

      if (token && token !== 'null' && token !== 'undefined' && token.trim() !== '') {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          socket.user = decoded;
          return next();
        } catch (error) {
          logger.info('Access token verification failed:', error.message);

          if (error.name === 'TokenExpiredError') {
            logger.info('Access token expired, attempting to refresh...');
            try {
              // Get the underlying HTTP request
              const req = socket.request;

              // Parse cookies
              const cookieHeader = req.headers.cookie;
              const cookies = cookieHeader ? cookie.parse(cookieHeader) : {};
              const refreshToken = cookies.RefreshToken;

              if (!refreshToken) {
                return next(reject(socket, 'ACCESS_EXPIRED_NO_REFRESH', 'Refresh token required', 401));
              }

              // Verify refresh token
              const refreshDecoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

              // Get user details
              const user = await query("SELECT * FROM users WHERE id = $1", [refreshDecoded.user_id]);
              if (user.rows.length === 0) {
                return next(reject(socket, 'REFRESH_USER_NOT_FOUND', 'User not found', 401));
              }

              // Generate new access token
              const payload = {
                user_id: user.rows[0].id,
                email: user.rows[0].user_email,
                name: user.rows[0].user_name,
                role: user.rows[0].user_role
              };

              const newAccessToken = jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
              );

              // Set cookie on the upgrade response
              const ACCESS_TOKEN_DURATION = 15 * 60 * 1000;
              const isProduction = process.env.NODE_ENV === 'production';

              // Create Set-Cookie header
              const cookieValue = cookie.serialize('AccessToken', newAccessToken, {
                maxAge: ACCESS_TOKEN_DURATION / 1000, // in seconds
                httpOnly: isProduction ? true : false,
                secure: isProduction ? true : false,
                sameSite: 'strict',
                path: '/',
              });

              // Add to response headers (if connection is still in handshake phase)
              if (req.res && !req.res.headersSent) {
                req.res.setHeader('Set-Cookie', cookieValue);
              }

              socket.user = payload;
              recordAuth(socket, 'auth_refreshed', { cookieSetOnHandshake: Boolean(req.res && !req.res.headersSent) }, 'info');
              return next();
            } catch (refreshError) {
              return next(reject(socket, 'REFRESH_FAILED', 'Token refresh failed', 401, {
                errorName: refreshError.name,
                errorMessage: refreshError.message,
              }));
            }
          } else {
            return next(reject(socket, 'INVALID_TOKEN', 'Invalid token', 401, {
              errorName: error.name,
              errorMessage: error.message,
            }));
          }
        }
      } else {
        logger.info('No access token found');
        return next(reject(socket, 'NO_ACCESS_TOKEN', 'Authentication required', 401));
      }
    } catch (err) {
      console.error('Socket Auth Error:', err.message);
      next(reject(socket, 'AUTH_INTERNAL_ERROR', 'Authentication error', 500, {
        errorName: err.name,
        errorMessage: err.message,
      }));
    }
  });
};

module.exports = { socketAuth };




