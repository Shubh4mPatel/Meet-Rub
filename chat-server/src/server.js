const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const socketConfig = require('../config/socketConfig');
const { logger } = require('../utils/logger');
const { manageLogFiles } = require('../cron/logmanager');
const { socketAuth } = require('../middleware/authentication');
const { startMasterWorker } = require('../consumers/worker');
const { chatController } = require('../controller/chat');
const AppError = require('../utils/appError');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, socketConfig);

const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",").map((origin) =>
  origin.trim()
);

const corsOptions = {
  origin:process.env.NODE_ENV=='production'?function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Use standard Error instead of AppError if AppError isn't defined
      callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    }
  }:'*',
  credentials: true, // Required for cookies/auth
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    // 'X-Access-Token',        // CUSTOM - remove
    // 'X-Report',              // CUSTOM - remove
    // 'X-PDF',                 // CUSTOM - remove
    // 'custom-real-ip',        // CUSTOM - remove
    // 'X-header-user',         // CUSTOM - remove
    // 'x-razorpay-signature',  // CUSTOM - remove (payment gateway specific)
    // 'X-User-Has-Subscription', // CUSTOM - remove
    // 'orangemobileaccesstoken', // CUSTOM - remove
    // 'X-User-Visited-Profile',  // CUSTOM - remove
    // 'deviceMobile'         // CUSTOM - remove
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 200, // For legacy browser support
};

app.use(cors(corsOptions));

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

if (process.env.NODE_ENV !== 'development') {
  serverWithSocket = server.listen(PORT, () => {
    manageLogFiles();
    // startMasterWorker();
    logger.info(`Server running in ${process.env.NODE_ENV} mode on :${PORT}`);
  });
} else {
  serverWithSocket = server.listen(PORT, () => {
    // startMasterWorker();
    manageLogFiles();
    logger.info(`Server running in ${process.env.NODE_ENV} mode on :${PORT}`);
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