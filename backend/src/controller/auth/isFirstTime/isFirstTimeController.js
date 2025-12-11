const query = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');

exports.isFirstTime = async (req, res, next) => {
    try {
        const userId = req.user.user_id;

        // Query to fetch conversations for the given user_id
        const isVisitedQuery = `SELECT u.is_visited FROM user_data u WHERE u.id = $1 `;

        // Query the database
        const isVisited = await query(isVisitedQuery, [userId]);
        const isFirstTime = isVisited.rows[0].is_visited;

        res.status(200).json({
            status: 'success',
            data: {
                isFirstTime
            }
        });
    } catch (error) {
        logger.info("Failed to check first time status: ",error);
        next(new AppError('Failed to check first time status', 500));
    }
}