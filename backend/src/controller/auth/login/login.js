const bcrypt = require("bcrypt");
const { query } = require('../../../../config/dbConfig');
const AppError = require("../../../../utils/appError");
const jwt = require("jsonwebtoken");
const { logger } = require('../../../../utils/logger');

function generateTokens(user,roleWiseId) {
    logger.info(`Generating tokens for user ID: ${user.id}`);

    const payload = {
        user_id: user.id,
        email: user.user_email,
        name: user.user_name,
        role: user.user_role,
        roleWiseId: roleWiseId
    };
    console.log("Token payload:", payload);
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
    const refreshToken = jwt.sign({ user_id: user.id }, process.env.JWT_SECRET, { expiresIn: "4h" });

    return { accessToken, refreshToken };
}

const loginUser = async (req, res, next) => {
    logger.info("Login request received");

    try {
        let { email, password } = req.body;
        email = email?.trim();

        if (!email || !password) {
            logger.warn("Missing email or password");
            return next(new AppError("Email and password are required", 400));
        }

        const user = (await query(
            "SELECT * FROM users WHERE user_email = $1",
            [email.toLowerCase()]
        )).rows[0];

        if (!user) {
            logger.warn("Login failed: Invalid email or password");
            return next(new AppError("Invalid email or password", 401));
        }

        const passwordValid = await bcrypt.compare(password.trim(), user.user_password);
        if (!passwordValid) {
            logger.warn("Login failed: Invalid email or password");
            return next(new AppError("Invalid email or password", 401));
        }

        let roleWiseId = null;
        if (user.user_role === 'freelancer') {
            const result = await query(
                "SELECT freelancer_id FROM freelancer WHERE user_id = $1",
                [user.id]
            );
            roleWiseId = result.rows[0]?.freelancer_id || null;
        }

        logger.info(`User authenticated successfully: user_id=${user.id}`);

        const { accessToken, refreshToken } = generateTokens(user,roleWiseId);

        res.locals.accessToken = accessToken;
        res.locals.refreshToken = refreshToken;
        res.locals.user = {
            user_id: user.id,
            email: user.user_email,
            name: user.user_name,
            role: user.user_role,
            roleWiseId
        };

        return next();

    } catch (error) {
        logger.error("Error during login", { error: error.message });
        return next(new AppError("Failed to login, please try again later.", 500));
    }
};

module.exports = { loginUser };
