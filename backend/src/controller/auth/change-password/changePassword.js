const bcrypt = require("bcrypt");
const { query } = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { logger } = require("../../../../utils/logger");

const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(new AppError("currentPassword and newPassword are required", 400));
    }

    if (newPassword.length < 8) {
      return next(new AppError("New password must be at least 8 characters", 400));
    }

    if (currentPassword === newPassword) {
      return next(new AppError("New password must be different from current password", 400));
    }

    const { rows } = await query(
      `SELECT user_password FROM users WHERE id = $1`,
      [userId]
    );

    if (!rows.length) {
      return next(new AppError("User not found", 404));
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].user_password);
    if (!isMatch) {
      return next(new AppError("Current password is incorrect", 401));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await query(
      `UPDATE users SET user_password = $1 WHERE id = $2`,
      [hashedPassword, userId]
    );

    logger.info(`Password changed for user id=${userId}`);

    return res.status(200).json({
      status: "success",
      message: "Password changed successfully",
    });

  } catch (error) {
    logger.error("Change password error:", error);
    return next(new AppError("Failed to change password", 500));
  }
};

module.exports = { changePassword };
