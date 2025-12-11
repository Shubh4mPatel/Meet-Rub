const bcrypt = require('bcrypt');
const query = require("../../../config/dbConfig"); // Change to this
const { logger } = require('../../../utils/logger');
const { decryptId } = require("../../../config/encryptDecryptId");
const { addApiToRedis } = require('../../../utils/queueSender');


const changePasswordController = async (req, res, next) => {


  try {
    await addApiToRedis(req.user.user_id, "Change Password", "User Profile", req.cookies?.orangeRefreshToken);
    const { oldPassword, newPassword } = req.body;

    const userId = req.user.user_id;

    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({
        error: "User ID, old password, and new password are required.",
        errorCode: 400,
      });
    }

    const decryptedOldPassword = decryptId(oldPassword);
    const decryptedNewPassword = decryptId(newPassword);
    const user = (await query('SELECT * FROM user_data WHERE id = $1', [userId])).rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordMatch = await bcrypt.compare(decryptedOldPassword, user.password);
    if (!passwordMatch) {
      return res.status(405).json({ error: 'Incorrect old password.' });
    }

    if (decryptedOldPassword === decryptedNewPassword) {
      return res.status(406).json({ error: 'New password must be different from the old password.' });
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
    return res.status(500).json({ error: 'Failed to change password' });
  }
};

module.exports = { changePasswordController };