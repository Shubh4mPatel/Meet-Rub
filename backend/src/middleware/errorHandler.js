
const { logger } = require("../../utils/logger");

const globalErrorHandler = (err, req, res, next) => {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Log error in production
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Check if headers have already been sent
  if (res.headersSent) {
    return next(err); // Delegate to the default Express error handler
  }
  const message = process.env.NODE_ENV === 'production' && err.statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(err.statusCode).json({
    status: err.status,
    message: message
  });
};

module.exports = globalErrorHandler;