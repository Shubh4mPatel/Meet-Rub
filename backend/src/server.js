// const dotenv = require('dotenv');

const dotenv = require("dotenv");
const dotenvResult = dotenv.config();

// ── ENV DIAGNOSTICS (temporary) ───────────────────────────────────────────────
// Shows exactly which .env file dotenv reads and whether GOOGLE_CLIENT_ID arrived.
{
  const envDefaultPath = require("path").resolve(process.cwd(), ".env");
  const mask = (v) => (v ? `SET -> "${String(v).slice(0, 16)}…(${String(v).length} chars)"` : "❌ UNDEFINED");
  console.log("======================= ENV DEBUG =======================");
  console.log("[ENV] process.cwd()        :", process.cwd());
  console.log("[ENV] server.js __dirname  :", __dirname);
  console.log("[ENV] dotenv reads file at :", envDefaultPath);
  console.log("[ENV] dotenv load result   :", dotenvResult.error ? `ERROR: ${dotenvResult.error.message}` : "loaded OK");
  console.log("[ENV] keys in that .env    :", dotenvResult.parsed ? Object.keys(dotenvResult.parsed).join(", ") : "(none parsed)");
  console.log("[ENV] GOOGLE_CLIENT_ID     :", mask(process.env.GOOGLE_CLIENT_ID));
  console.log("[ENV] GOOGLE_CLIENT_SECRET :", mask(process.env.GOOGLE_CLIENT_SECRET));
  console.log("=========================================================");
}
// ──────────────────────────────────────────────────────────────────────────────
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const routes = require("./routes");
const AppError = require("../utils/appError");
const cookieParser = require("cookie-parser");
// const socketConfig = require("../socket/socketConfig");
const http = require("http");
// const socketIo = require("socket.io");
// const socketHandler = require("../socket/socketHandler");
const { logger } = require("../utils/logger");
const { manageLogFiles } = require("../cron/logmanager");
const globalErrorHandler = require("./middleware/errorHandler");
const redisClient = require("../config/reddis");
const { loadUsernamesIntoRedis, USERNAMES_SET_KEY } = require("../utils/helper");

// Load .env file only if not running in Docker (Docker Compose injects env vars directly)
// if (!process.env.DOCKER_ENV) {
// }

// Parse allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",").map((origin) =>
  origin.trim()
);

logger.info("Allowed Origins for CORS:", allowedOrigins, process.env.NODE_ENV);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman, server-to-server
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 200,
};

const app = express();
const serverWithSocket = http.createServer(app);
app.use(cors(corsOptions));
// const io = socketIo(serverWithSocket, socketConfig);

// Initialize socket handling
// const socketHelpers = socketHandler(io);

// Make io and socket helpers available to routes
// app.set("io", io);
// app.set("socketHelpers", socketHelpers);

// Mount webhook routes BEFORE express.json() to preserve raw body for HMAC verification
const webhookRoutes = require('./routes/webhookRoutes');
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
  // app.use(morgan("dev"));
  app.use(morgan("combined"));

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
app.use(globalErrorHandler)

// Start server
const PORT = process.env.PORT;
const HOST = process.env.HOST;

let server;

function logEnvVars() {
  const mask = (v) =>
    v ? `${String(v).slice(0, 6)}${'*'.repeat(Math.max(0, String(v).length - 6))}` : '(not set)';

  const envVars = {
    // Environment
    NODE_ENV:                            process.env.NODE_ENV,
    // Server
    PORT:                                process.env.PORT,
    BACKEND_PORT:                        process.env.BACKEND_PORT,
    CHAT_PORT:                           process.env.CHAT_PORT,
    HOST:                                process.env.HOST,
    // JWT
    JWT_SECRET:                          mask(process.env.JWT_SECRET),
    // Crypto
    CRYPTOJS_SECRET:                     mask(process.env.CRYPTOJS_SECRET),
    // Database
    STAGING_DATABASE_URL:                mask(process.env.STAGING_DATABASE_URL),
    // CORS
    ALLOWED_ORIGINS:                     process.env.ALLOWED_ORIGINS,
    // RabbitMQ
    RABBITMQ_USER:                       process.env.RABBITMQ_USER,
    RABBITMQ_PASSWORD:                   mask(process.env.RABBITMQ_PASSWORD),
    RABBITMQ_URL:                        mask(process.env.RABBITMQ_URL),
    // Redis
    REDIS_HOST:                          process.env.REDIS_HOST,
    REDIS_PORT:                          process.env.REDIS_PORT,
    REDIS_PASSWORD:                      mask(process.env.REDIS_PASSWORD),
    // MinIO
    MINIO_ENDPOINT:                      process.env.MINIO_ENDPOINT,
    MINIO_PORT:                          process.env.MINIO_PORT,
    MINIO_USE_SSL:                       process.env.MINIO_USE_SSL,
    MINIO_ACCESS_KEY:                    process.env.MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY:                    mask(process.env.MINIO_SECRET_KEY),
    // Razorpay
    RAZORPAY_KEY_ID:                     mask(process.env.RAZORPAY_KEY_ID),
    RAZORPAY_KEY_SECRET:                 mask(process.env.RAZORPAY_KEY_SECRET),
    RAZORPAY_WEBHOOK_SECRET:             mask(process.env.RAZORPAY_WEBHOOK_SECRET),
    RAZORPAY_X_WEBHOOK_SECRET:           mask(process.env.RAZORPAY_X_WEBHOOK_SECRET),
    RAZORPAY_ACCOUNT_NUMBER:             process.env.RAZORPAY_ACCOUNT_NUMBER,
    PAYOUT_RECONCILIATION_INTERVAL_MINUTES: process.env.PAYOUT_RECONCILIATION_INTERVAL_MINUTES,
    PAYOUT_RECONCILIATION_MIN_AGE_MINUTES:  process.env.PAYOUT_RECONCILIATION_MIN_AGE_MINUTES,
    // Google OAuth
    GOOGLE_CLIENT_ID:                    mask(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET:                mask(process.env.GOOGLE_CLIENT_SECRET),
    // Email
    EMAIL_SERVER_HOST:                   process.env.EMAIL_SERVER_HOST,
    EMAIL_SERVER_PORT:                   process.env.EMAIL_SERVER_PORT,
    EMAIL_SERVER_USER:                   process.env.EMAIL_SERVER_USER,
    SERVER_PASSWORD:                     mask(process.env.SERVER_PASSWORD),
    // Billing / Invoice
    BIZKRO_COMPANY_NAME:                 process.env.BIZKRO_COMPANY_NAME,
    BIZKRO_ADDRESS:                      process.env.BIZKRO_ADDRESS,
    BIZKRO_GSTIN:                        process.env.BIZKRO_GSTIN,
    BIZKRO_STATE:                        process.env.BIZKRO_STATE,
    MEETRUB_SAC_CODE:                    process.env.MEETRUB_SAC_CODE,
    MEETRUB_BILLING_EMAIL:               process.env.MEETRUB_BILLING_EMAIL,
    MEETRUB_WEBSITE:                     process.env.MEETRUB_WEBSITE,
    MEETRUB_LOGO_PATH:                   process.env.MEETRUB_LOGO_PATH,
    INVOICE_MINIO_BUCKET:                process.env.INVOICE_MINIO_BUCKET,
  };

  logger.info('============================================================');
  logger.info(`  Server started on PORT: ${process.env.PORT}  HOST: ${process.env.HOST}`);
  logger.info('  Environment variables at startup:');
  for (const [key, value] of Object.entries(envVars)) {
    logger.info(`    ${key.padEnd(42)} = ${value ?? '(not set)'}`);
  }
  logger.info('============================================================');
}

if (process.env.NODE_ENV !== "development") {
  server = serverWithSocket.listen(PORT, async () => {
    manageLogFiles();
    await loadUsernamesIntoRedis();
    // startCronJobs(io);
    logger.info(
      `Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`
    );
    logEnvVars();
  });
} else {
  server = serverWithSocket.listen(PORT, async () => {
    manageLogFiles();
    await loadUsernamesIntoRedis();
    // startCronJobs(io);
    logger.info(
      `Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`
    );
    logEnvVars();
  });
}

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, flushing usernames from Redis and shutting down...`);
  try {
    await redisClient.del(USERNAMES_SET_KEY);
    logger.info("Usernames set deleted from Redis");
  } catch (err) {
    logger.error("Failed to delete usernames set from Redis during shutdown:", err);
  }
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

