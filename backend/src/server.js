const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const routes = require("./routes");
const dotenv = require("dotenv");
const AppError = require("../utils/appError");
const cookieParser = require("cookie-parser");
// const socketConfig = require("../socket/socketConfig");
const http = require("http");
// const socketIo = require("socket.io");
// const socketHandler = require("../socket/socketHandler");
const { logger } = require("../utils/logger");
const { manageLogFiles } = require("../cron/logmanager");
const globalErrorHandler = require("./middleware/errorHandler");

// Load .env file only if not running in Docker (Docker Compose injects env vars directly)
// if (!process.env.DOCKER_ENV) {
dotenv.config();
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
app.use(globalErrorHandler)

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

