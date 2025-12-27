const query = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { sendMail } = require("../../../config/email");
const {
    MailTemplatesHandler,
} = require("../../../mailTemplates/MailTemplatesHandler");
const { logger } = require('../../../utils/logger');

const deleteUserExecutionController = async (req, res, next) => {
    try {
        const { user_Id } = req.body;

        const { rows: user } = await query(
            "SELECT email,name FROM user_data WHERE id = $1",
            [user_Id]
        );

        if (user.length === 0) {
            return next(new AppError("User not found", 404));
        }

        await query(
            "UPDATE user_data SET is_deleted=true, email=CONCAT('deleted_', email) WHERE id=$1",
            [user_Id]
        );

        await query(
            "UPDATE deleteUserRequest SET is_approved=true WHERE user_id=$1 AND is_approved IS false",
            [user_Id]
        );

        const mailTemplatesHandler = new MailTemplatesHandler();

        const subject = "User Account Deletion Confirmation";
        const html = mailTemplatesHandler.generateEmailContent('delete-execution', {
            userName: user[0].name,
            copyrightYear: new Date().getFullYear(),
        });

        await sendMail(user[0].email, subject, html);

        return res.status(200).json({
            success: true,
            message: 'User Delete request executed successfully'
        });

    } catch (error) {
        logger.error("Error processing delete user request:", error);
        return next(new AppError("Failed to process delete user request", 500));
    }
};

module.exports = { deleteUserExecutionController };