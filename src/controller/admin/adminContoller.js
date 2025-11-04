const { query } = require('../../../config/dbConfig')
const AppError = require('../../../utils/appError');
const logger = require('../../../utils/logger');


const approveProfile = async (req, res, next) => {
    try {
        const { userEmail } = req.body;
        const adminUser = decodedToken(req.cookies?.AccessToken);
        await query(
            `UPDATE users
   SET approval_status = 'approved',
       approved_at = $1
   WHERE user_email = $2`,
            [new Date(), userEmail]
        );
        logger.info(`user ${userEmail} approved by admin ${adminUser.name}`)

        return res.status(200).json({
            status: 'success',
            message: ' user approval successful'
        });

    } catch (error) {
        logger.error(error)
        return next(new AppError(`failed to update user approval`, 500))
    }
}