const redis = require("../config/reddis");
const chatModel = require("../model/chatmodel");
const { logger } = require("./logger");

/**
 * Rebuild Redis assignment counters from database on server startup.
 * This ensures counter accuracy after server restarts.
 */
async function rebuildAdminAssignmentCounters() {
  try {
    logger.info("Rebuilding admin assignment counters from database...");

    // Get all admin IDs
    const adminIds = await chatModel.getAllAdminIds();

    // Get assignment counts from database
    const dbCounts = await chatModel.getAssignmentCountsPerAdmin();

    // Initialize all admin counters in Redis
    for (const adminId of adminIds) {
      const count = dbCounts[adminId] || 0;
      await redis.set(`admin:${adminId}:assigned_count`, count);
      logger.info(`Set admin:${adminId}:assigned_count = ${count}`);
    }

    logger.info(`✅ Admin assignment counters rebuilt successfully. Total admins: ${adminIds.length}`);
  } catch (error) {
    logger.error("❌ Failed to rebuild admin assignment counters:", error);
    throw error;
  }
}

module.exports = {
  rebuildAdminAssignmentCounters,
};
