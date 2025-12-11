// middlewares/socketAuth.js
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const AppError = require('../utils/appError');
const { query } = require('../config/dbConfig'); // Assuming you have a db module for querying
const {logger} = require('../utils/logger'); // Assuming you have a logger utility


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
                return next(new AppError('Refresh token required', 401));
              }

              // Verify refresh token
              const refreshDecoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

              // Get user details
              const user = await query("SELECT * FROM users WHERE id = $1", [refreshDecoded.user_id]);
              if (user.rows.length === 0) {
                return next(new AppError('User not found', 401));
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
                secure: isProduction,
                sameSite: 'lax',
                path: '/',
              });

              // Add to response headers (if connection is still in handshake phase)
              if (req.res && !req.res.headersSent) {
                req.res.setHeader('Set-Cookie', cookieValue);
              }

              socket.user = payload;
              return next();
            } catch (refreshError) {
              return next(new AppError('Token refresh failed', 401));
            }
          } else {
            return next(new AppError('Invalid token', 401));
          }
        }
      } else {
        logger.info('No access token found');
        return next(new AppError('Authentication required', 401));
      }
    } catch (err) {
      console.error('Socket Auth Error:', err.message);
      next(new AppError('Authentication error', 500));
    }
  });
};

module.exports = { socketAuth };




