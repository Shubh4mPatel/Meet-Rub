const dbQuery = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const sendMail = require("../../../config/email").sendMail;
const { logger } = require('../../../utils/logger');

const unblockUserController = async (req, res, next) => {
  try {
    // Authenticate the token (assume middleware or call here)
    const actionTakerId = req.user.user_id;
    const user_id = req.body.user_id;
    logger.info("Unblock user request received for userId:", user_id);
    logger.info("Action taken by userId:", actionTakerId);

    const { rows: user } = await dbQuery("SELECT email, name FROM user_data WHERE id = $1", [user_id]);
    if (!user || user.length === 0) {
      return next(new AppError('User not found', 404));
    }

    await dbQuery("UPDATE user_data SET is_blocked = false WHERE id = $1", [user_id]);
    await dbQuery(
      "INSERT INTO user_block_logs(user_id, action_by, action_type) values($1, $2, $3)",
      [user_id, actionTakerId, 'unblock']
    );

    const subject = "Account Unblocked";
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Account Status Notification</title>
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.5; color: #333; margin: 0; padding: 0; background-color: #f8f8f8; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
              .header { text-align: center; padding: 15px 0; border-bottom: 2px solid #27ae60; }
              .logo { width: 120px; height: auto; margin-bottom: 10px; }
              .content { padding: 20px 0; }
              .alert-box { background-color: #e6fff2; padding: 20px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #27ae60; }
              .footer { text-align: center; padding: 15px 0; font-size: 14px; color: #666; border-top: 1px solid #eaeaea; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Ai4Pharma%20Image.png" alt="Ai4Pharma Logo" class="logo">
                  <h1>Account Access Restored</h1>
              </div>
              <div class="content">
                  <p>Dear ${user[0].name},</p>
                  <div class="alert-box">
                      <p>Your account access has been restored. You can now log in and use our services as usual.</p>
                      <p>If you have any questions, please contact us at <a href="mailto:help@ai4pharma.ai">help@ai4pharma.ai</a>.</p>
                  </div>
                  <p>Thank you for your patience.</p>
                  <p>Best regards,<br>The ChatOrange Team</p>
              </div>
              <div class="footer">
                  <p>Copyright &copy; ${new Date().getFullYear()} Ai4Pharma Tech Limited. All Rights Reserved.</p>
              </div>
          </div>
      </body>
      </html>
    `;

    await sendMail(user[0].email, subject, html);

    return res.status(200).json({ message: 'User unblocked successfully', success: true });
  } catch (error) {
    logger.error("Error processing Unblock user request:", error);
    return next(new AppError('Error processing Unblock user request', 500));
  }
};

module.exports = { unblockUserController };