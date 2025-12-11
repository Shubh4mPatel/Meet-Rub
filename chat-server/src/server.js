const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
dotenv.config();
const socketConfig = require('../config/socketConfig');
const { logger } = require('../utils/logger');
const { manageLogFiles } = require('../cron/logmanager');
const { socketAuth } = require('../middleware/authentication');
const { startMasterWorker } = require('../consumers/worker');
const { chatController } = require('../controller/chat');
const AppError = require('../utils/appError');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, socketConfig);

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io available to routes
app.set('io', io);
socketAuth(io);
chatController(io);



// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle undefined routes
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handling middleware
app.use((err, req, res) => {
  // Log the error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    statusCode: err.statusCode || 500,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Set default error values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Send error response
  if (process.env.NODE_ENV === 'development') {
    // Detailed error in development
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    // Generic error in production
    if (err.isOperational) {
      // Operational, trusted error: send message to client
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {
      // Programming or unknown error: don't leak error details
      logger.error('NON-OPERATIONAL ERROR:', err);
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong'
      });
    }
  }
});

let serverWithSocket;
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || ''

if (process.env.NODE_ENV !== 'development') {
  serverWithSocket = server.listen(PORT, HOST, () => {
    manageLogFiles();
    // startMasterWorker();
    logger.info(`Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`);
  });
} else {
  serverWithSocket = server.listen(PORT, () => {
    // startMasterWorker();
    manageLogFiles();
    logger.info(`Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`);
  });
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  // Close socket.io connections
  io.close(() => {
    logger.info('Socket.IO connections closed');
  });

  serverWithSocket.close(() => {
    logger.info('HTTP server closed');
    logger.info('Process terminated');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', {
    message: err.message,
    stack: err.stack
  });
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', {
    message: err.message,
    stack: err.stack
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});