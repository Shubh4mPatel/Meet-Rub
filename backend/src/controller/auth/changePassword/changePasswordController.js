const bcrypt = require('bcrypt');
const query = require("../../../config/dbConfig"); // Change to this
const AppError = require("../../../utils/appError");
const { logger } = require('../../../utils/logger');
const { decryptId } = require("../../../config/encryptDecryptId");
const { addApiToRedis } = require('../../../utils/queueSender');


const changePasswordController = async (req, res, next) => {


  try {
    await addApiToRedis(req.user.user_id, "Change Password", "User Profile", req.cookies?.orangeRefreshToken);
    const { oldPassword, newPassword } = req.body;

    const userId = req.user.user_id;

    if (!userId || !oldPassword || !newPassword) {
      return next(new AppError("User ID, old password, and new password are required.", 400));
    }

    const decryptedOldPassword = decryptId(oldPassword);
    const decryptedNewPassword = decryptId(newPassword);
    const user = (await query('SELECT * FROM user_data WHERE id = $1', [userId])).rows[0];

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    const passwordMatch = await bcrypt.compare(decryptedOldPassword, user.password);
    if (!passwordMatch) {
      return next(new AppError('Incorrect old password.', 400));
    }

    if (decryptedOldPassword === decryptedNewPassword) {
      return next(new AppError('New password must be different from the old password.', 400));
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(decryptedNewPassword, salt);

    await query(
      'UPDATE user_data SET password = $1, failed_login_attempts = 0, block_time = NULL WHERE id = $2',
      [hashedNewPassword, userId]
    );

    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Error changing password:', error);
    return next(new AppError('Failed to change password', 500));
  }
};

module.exports = { changePasswordController };