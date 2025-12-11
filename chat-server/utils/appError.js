
class AppError extends Error {
  constructor(message, statusCode) {
    super(message); // Call the parent class constructor (Error)
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'failed' : 'error';
    this.isOperational = true; // Marks the error as expected (not a programming error)

    Error.captureStackTrace(this, this.constructor); // Capture stack trace for debugging
  }
}

module.exports = AppError;
