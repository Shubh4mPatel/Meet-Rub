const AppError = require("../../../utils/appError");
const { decodedToken } = require("../../../utils/helper");

const uploadBeforeAfter = async (req, res, next) => {
    try {
        const { matric, serviceType } = req.body;
        const user = decodedToken(req.cookies?.AccessToken);




    } catch (error) {
        return next(new AppError('failed to add Impact'))
    }
}
module.exports={uploadBeforeAfter}