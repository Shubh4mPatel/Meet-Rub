const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { format, transports } = winston;
// Set global max listeners to prevent warnings
require('events').EventEmitter.defaultMaxListeners = 15;
// Indian timezone offset
const INDIAN_TIMEZONE = 'Asia/Kolkata';

// Path normalization function
const normalizePathFrom = (absolutePath) => {
    const projectRoot = process.cwd();
    const relativePath = path.relative(projectRoot, absolutePath);
    return relativePath;
};

// Get current date in Indian timezone
const getIndianDate = () => {
    const now = new Date();
    const indianTime = new Date(now.toLocaleString("en-US", { timeZone: INDIAN_TIMEZONE }));

    const year = indianTime.getFullYear();
    const month = String(indianTime.getMonth() + 1).padStart(2, '0');
    const day = String(indianTime.getDate()).padStart(2, '0');

    return `${day}-${month}-${year}`;
};

// Get current timestamp in Indian timezone with +0530 format
const getIndianTimestamp = () => {
    const now = new Date();
    const indianTime = new Date(now.toLocaleString("en-US", { timeZone: INDIAN_TIMEZONE }));

    const year = indianTime.getFullYear();
    const month = String(indianTime.getMonth() + 1).padStart(2, '0');
    const day = String(indianTime.getDate()).padStart(2, '0');
    const hours = String(indianTime.getHours()).padStart(2, '0');
    const minutes = String(indianTime.getMinutes()).padStart(2, '0');
    const seconds = String(indianTime.getSeconds()).padStart(2, '0');

    return `[${day}-${month}-${year} ${hours}:${minutes}:${seconds} +0530]`;
};

// Create directory if it doesn't exist
const ensureDirectoryExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

// Custom format for logging with Indian timezone
const customFormat = format.printf(({ level, message, timestamp, stack, moduleName, includeModule = true }) => {
    // Extracting file path and line number from the stack trace
    const match = stack && stack.split('\n')[3]?.match(/at (.*) \((.*):(\d+):(\d+)\)/);
    const filePath = match ? match[2] : 'unknown';
    const normalizePath = normalizePathFrom(filePath);
    const fileName = match ? path.basename(match[2]) : 'unknown';
    const lineNumber = match ? match[3] : 'unknown';
    const module = moduleName || 'general';

    // Include module name only if specified
    const moduleTag = includeModule ? `[${module}] ` : '';

    return `${timestamp} - [${level.toUpperCase()}] ${moduleTag}[${normalizePath}:${lineNumber}] - ${message}`;
});

// Custom format for module-specific logs (without module name)
const moduleFormat = format.printf(({ level, message, timestamp, stack }) => {
    const match = stack && stack.split('\n')[3]?.match(/at (.*) \((.*):(\d+):(\d+)\)/);
    const filePath = match ? match[2] : 'unknown';
    const normalizePath = normalizePathFrom(filePath);
    const fileName = match ? path.basename(match[2]) : 'unknown';
    const lineNumber = match ? match[3] : 'unknown';

    return `${timestamp} - [${level.toUpperCase()}] - [${normalizePath}:${lineNumber}] - ${message}`;
});

// Custom format for console logs (with module name and colored)
const consoleFormat = format.printf(({ level, message, timestamp, stack, moduleName }) => {
    const match = stack && stack.split('\n')[3]?.match(/at (.*) \((.*):(\d+):(\d+)\)/);
    const filePath = match ? match[2] : 'unknown';
    const normalizePath = normalizePathFrom(filePath);
    const fileName = match ? path.basename(match[2]) : 'unknown';
    const lineNumber = match ? match[3] : 'unknown';
    // const module = moduleName || 'general';
    return `${timestamp} - [${level}] [${normalizePath}:${lineNumber}] -  ${message}`;
});



// Logger factory to create module-specific loggers
class ModuleLogger {
    constructor(moduleName = 'general') {
        this.moduleName = moduleName;
        this.currentDate = getIndianDate(); // Track current date
        this.logger = this.createLogger();
    }

    createLogger() {
        const today = getIndianDate();
        // NEW STRUCTURE: Date first, then module
        const moduleLogPath = path.join(
            process.cwd(),        // Always resolves to project root
            'logs',               // logs directory
            today,                // date folder
            this.moduleName       // module folder
        );

        // Ensure both directories exist
        ensureDirectoryExists(moduleLogPath);

        return winston.createLogger({
            level: 'debug',
            format: format.combine(
                format.timestamp({
                    format: () => getIndianTimestamp()
                }),
                format.errors({ stack: true }),
                customFormat
            ),
            defaultMeta: { moduleName: this.moduleName },
            transports: [
                // Console transport - FIXED
                new transports.Console({
                    format: format.combine(
                        format.colorize(),
                        format.timestamp({
                            format: () => getIndianTimestamp()
                        }),
                        format.errors({ stack: true }),
                        consoleFormat // Use dedicated console format
                    )
                }),

                // ===== MODULE-SPECIFIC LOG FILES (WITHOUT MODULE NAME) =====
                // Error logs file for this module
                new transports.File({
                    filename: path.join(moduleLogPath, 'error_logs.log'),
                    level: 'error',
                    format: format.combine(
                        format.timestamp({
                            format: () => getIndianTimestamp()
                        }),
                        format.errors({ stack: true }),
                        moduleFormat
                    )
                }),

                // Warning logs file for this module
                new transports.File({
                    filename: path.join(moduleLogPath, 'warning_logs.log'),
                    level: 'warn',
                    format: format.combine(
                        format.timestamp({
                            format: () => getIndianTimestamp()
                        }),
                        format.errors({ stack: true }),
                        moduleFormat
                    )
                }),

                // Info logs file for this module
                new transports.File({
                    filename: path.join(moduleLogPath, 'info_logs.log'),
                    level: 'info',
                    format: format.combine(
                        format.timestamp({
                            format: () => getIndianTimestamp()
                        }),
                        format.errors({ stack: true }),
                        moduleFormat
                    )
                }),

                // Debug logs file for this module
                new transports.File({
                    filename: path.join(moduleLogPath, 'debug_logs.log'),
                    level: 'debug',
                    format: format.combine(
                        format.timestamp({
                            format: () => getIndianTimestamp()
                        }),
                        format.errors({ stack: true }),
                        moduleFormat
                    )
                })
            ]
        })
    }

    // Check if we need to create a new logger for today
    checkAndRefreshLogger() {
        const today = getIndianDate();
        if (this.currentDate !== today) {
            this.currentDate = today;
            this.logger.close();
            this.logger = this.createLogger();
        }
    }

    // Custom log method to include stack trace and handle multiple parameters
    custom(level, ...args) {
        // Check if we need to refresh logger for new day
        this.checkAndRefreshLogger();

        // Convert all arguments to strings and join them
        const message = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                // Handle objects and errors specially
                if (arg instanceof Error) {
                    return `${arg.name}: ${arg.message}${arg.stack ? '\n' + arg.stack : ''}`;
                }
                return JSON.stringify(arg, null, 2);
            }
            return String(arg);
        }).join(' ');

        const stack = new Error().stack;
        this.logger.log({
            level,
            message,
            stack,
            moduleName: this.moduleName
        });
    }

    // Convenience methods that accept multiple parameters
    info(...args) {
        this.custom('info', ...args);
    }

    debug(...args) {
        this.custom('debug', ...args);
    }

    warn(...args) {
        this.custom('warn', ...args);
    }

    error(...args) {
        this.custom('error', ...args);
    }

    // Method to recreate logger for new day
    refreshLogger() {
        this.currentDate = getIndianDate();
        this.logger.close();
        this.logger = this.createLogger();
    }
}

// Logger manager to handle multiple modules
class LoggerManager {
    constructor() {
        this.loggers = new Map();
    }
    

    // Get or create a logger for a specific module
    getLogger(moduleName = 'general') {
        if (!this.loggers.has(moduleName)) {
            this.loggers.set(moduleName, new ModuleLogger(moduleName));
        }
        return this.loggers.get(moduleName);
    }

    // Refresh all loggers (useful for daily rotation)
    refreshAllLoggers() {
        for (const logger of this.loggers.values()) {
            logger.refreshLogger();
        }
    }

    // Get all active modules
    getActiveModules() {
        return Array.from(this.loggers.keys());
    }

    createZipOfLogs() {
        
    }
}


// Create singleton instance
const loggerManager = new LoggerManager();

const   logger = loggerManager.getLogger('server-logs');
logger.info('Logger initialized');
// Export the manager and a convenience function
module.exports = {
    getIndianDate: getIndianDate,
    LoggerManager: loggerManager,
    getLogger: (moduleName) => loggerManager.getLogger(moduleName),
    refreshAllLoggers: () => loggerManager.refreshAllLoggers(),
    getActiveModules: () => loggerManager.getActiveModules(),
    logger
};