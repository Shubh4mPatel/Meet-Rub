const redisClient = require("../../../../config/reddis");
const AppError = require("../../../../utils/appError");

const USERNAMES_SET_KEY = "usernames:set";

const checkUsername = async (req, res, next) => {
  try {
    const { username } = req.query;

    if (!username || !username.trim()) {
      return next(new AppError("username query parameter is required", 400));
    }

    const normalizedUsername = username.trim();

    const isTaken = await redisClient.sIsMember(
      USERNAMES_SET_KEY,
      normalizedUsername
    );

    return res.status(200).json({
      status: "success",
      available: !isTaken,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { checkUsername };
