const query = require("../../../config/dbConfig"); // Change to this
const AppError = require("../../../utils/appError");
const sendMail = require("../../../config/email").sendMail;
const {
  MailTemplatesHandler,
} = require("../../../mailTemplates/MailTemplatesHandler");
const { logger } = require('../../../utils/logger');

const deleteUserRequestController = async (req, res, next) => {


  try {

    const userId = req.user.user_id;

    const { rows: users } = await query(
      'SELECT email, name FROM user_data WHERE id = $1', [userId]
    );
    if (users.length === 0) {
      return next(new AppError("User not found", 404));
    }

    const { rows: existing } = await query(
      'SELECT * FROM deleteUserRequest WHERE user_id = $1 AND is_approved != true LIMIT 1',
      [userId]
    );
    if (existing.length > 0) {
      return res.status(200).json({
        success: true,
        message: "You have already requested to delete your account. Please wait for the admin to process your request."
      });
    }

    await query(
      'INSERT INTO deleteUserRequest(user_id, is_approved) VALUES($1, $2)',
      [userId, false]
    );

    const subject = "Delete Account Request Received";
    const mailTemplatesHandler = new MailTemplatesHandler();


    const html = mailTemplatesHandler.generateEmailContent(
      'delete-request',
      {
        userName: users[0].name,
        copyrightYear: new Date().getFullYear(),
      },
    );

    await sendMail(users[0].email, subject, html);

    return res.status(200).json({
      success: true,
      message: "Your request to delete your account has been received. Please wait for the admin to process your request."
    });
  } catch (err) {
    logger.error('Error processing delete user request:', err);
    return next(new AppError("Failed to process delete user request", 500));
  }
};

module.exports = { deleteUserRequestController };
