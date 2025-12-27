const dbQuery = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const sendMail = require("../../../config/email").sendMail;
const { logger } = require('../../../utils/logger');

const blockUserController = async (req, res, next) => {
  try {
    // Authenticate the token (assume middleware or call here)

    const actionTakerId = req.user.user_id;

    const  user_id  = req.body.user_id;
    logger.info("Block user request received for userId:", user_id);
    logger.info("Action taken by userId:", actionTakerId);

    const { rows: user } = await dbQuery("SELECT email, name FROM user_data WHERE id = $1", [user_id]);
    if (!user || user.length === 0) {
      return next(new AppError('User not found', 404));
    }

    await dbQuery("UPDATE user_data SET is_blocked = true WHERE id = $1", [user_id]);
        logger.info("User blocked successfully3:", user_id);

    await dbQuery(
      "INSERT INTO user_block_logs(user_id, action_by, action_type) values($1, $2, $3)",
      [user_id, actionTakerId, 'block']
    );
    logger.info("User blocked successfully:", user_id);

    const subject = "Account Blocked";
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
              .header { text-align: center; padding: 15px 0; border-bottom: 2px solid #e67e22; }
              .logo { width: 120px; height: auto; margin-bottom: 10px; }
              .content { padding: 20px 0; }
              .alert-box { background-color: #fff5e6; padding: 20px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #e67e22; }
              .footer { text-align: center; padding: 15px 0; font-size: 14px; color: #666; border-top: 1px solid #eaeaea; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Ai4Pharma%20Image.png" alt="Ai4Pharma Logo" class="logo">
                  <h1>Account Access Notification</h1>
              </div>
              <div class="content">
                  <p>Dear ${user[0].name},</p>
                  <div class="alert-box">
                      <p>We have detected some unusual activity on your account, which appears to be suspicious or unauthorized. As a result, access to your account has been temporarily restricted.</p>
                      <p>Please contact us at <a href="mailto:help@ai4pharma.ai">help@ai4pharma.ai</a> so we can verify and help resolve this issue promptly.</p>
                  </div>
                  <p>Thank you for your understanding.</p>
                  <p>Best regards,<br>The ChatOrange Team</p>
              </div>
              <div class="footer">
                  <p>Copyright &copy; ${new Date().getFullYear()} Ai4Pharma Tech Limited. All Rights Reserved.</p>
              </div>
          </div>
      </body>
      </html>
    `;
    logger.info("User blocked successfully2:", user_id);

    await sendMail(user[0].email, subject, html);
    logger.info("User blocked successfully1:", user_id);

    return res.status(200).json({ message: 'User blocked successfully', success: true });
  } catch (error) {
    logger.error("Error processing Block user request:", error);
    return next(new AppError('Error processing Block user request', 500));
  }
};

module.exports = { blockUserController };