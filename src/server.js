const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const routes = require("./routes");
const dotenv = require("dotenv");
const AppError = require("../utils/appError");
const cookieParser = require("cookie-parser");
const socketConfig = require("../socket/socketConfig");
const http = require("http");
const socketIo = require("socket.io");
const socketHandler = require("../socket/socketHandler");
// const { startCronJobs, stopCronJobs } = require("./cron/subsciptionChecker");
// require("./cron/dataRequestCron");
const { logger } = require("../utils/logger");
const { manageLogFiles } = require("../cron/logmanager");
dotenv.config();

// Parse allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",").map((origin) =>
  origin.trim()
);

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// Merged CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Use standard Error instead of AppError if AppError isn't defined
      callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    }
  },
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

// Create BullMQ queue
// const emailQueue = new Queue("emailQueue", { connection: getRedisConnection() });

// // Set up Bull Board
// const serverAdapter = new ExpressAdapter();
// serverAdapter.setBasePath('/admin/queues');

// createBullBoard({
//   queues: [new BullMQAdapter(emailQueue)],
//   serverAdapter: serverAdapter,
// });

const app = express();
const serverWithSocket = http.createServer(app);
const io = socketIo(serverWithSocket, socketConfig);

// Initialize socket handling
const socketHelpers = socketHandler(io);

// Make io and socket helpers available to routes
app.set("io", io);
app.set("socketHelpers", socketHelpers);

app.use(cors(corsOptions));
// app.use(helmet());
app.use(helmet());

// Now, specifically override the policies that are causing issues
// This ensures other helmet defaults remain in place
// app.use(helmet({
//   crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
//   crossOriginEmbedderPolicy: { policy: 'unsafe-none' }
// }));
//app.use(limiter);
app.use(express.json());
app.use(cookieParser());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Body parser middleware
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});


// API routes
app.use("/api/v1", routes);

// 404 handler - should be after all valid routes
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong!" } = err;

  // Log error in production
  if (process.env.NODE_ENV === "production") {
    logger.error("Error:", {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }

  res.status(statusCode).json({
    status: "error",
    message:
      process.env.NODE_ENV === "production" && statusCode === 500
        ? "Internal server error"
        : message,
  });
});

// Start server
const PORT = process.env.PORT;
const HOST = process.env.HOST;

let server;

if (process.env.NODE_ENV !== "development") {
  server = serverWithSocket.listen(PORT, HOST, () => {
    manageLogFiles();
    // startCronJobs(io);
    logger.info(
      `Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`
    );
  });
} else {
  server = serverWithSocket.listen(PORT, () => {
    manageLogFiles();
    // startCronJobs(io);
    logger.info(
      `Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`
    );
  });
}

// Graceful shutdown (after server is defined)
// const gracefulShutdown = (signal) => {
//   logger.info(`Received ${signal}. Shutting down gracefully...`);
//   stopCronJobs();
//   server.close(() => {
//     logger.info("Process terminated");
//     process.exit(0);
//   });
// };

// process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
// process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// // Handle unhandled promise rejections
// process.on("unhandledRejection", (err) => {
//   logger.error("Unhandled Promise Rejection:", err);
//   server.close(() => {
//     process.exit(1);
//   });
// });

// // Handle uncaught exceptions
// process.on("uncaughtException", (err) => {
//   logger.error("Uncaught Exception:", err);
//   process.exit(1);
// });