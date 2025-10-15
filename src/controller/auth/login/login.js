const bcrypt = require("bcrypt");
const query = require('../../../../config/dbConfig');
const AppError = require("../../../../utils/appError");
const jwt = require("jsonwebtoken");
const { decryptId } = require("../../../../config/encryptDecryptId");
// const { addApiToRedis } = require('../../../utils/queueSender');
const { logger } = require('../../../../utils/logger');




// Login controller
const loginUser = async (req, res, next) => {

    let { email, password } = req.body;
    email = email?.trim();
    if (!email || !password) {
        logger.error(`Email and password are required ${email}`);
        return next(new AppError("Email and password are required", 400));

    }

    // const decryptedPassword = decryptId(password)?.trim();
    const decryptedPassword = password?.trim();


    try {
        const user = (await query("SELECT * FROM user_data WHERE email = $1", [email.toLowerCase()])).rows[0];
        if (!user){ 
            logger.error(`Invalid email or password, Email:${email}`);
            return next(new AppError("Invalid email or password", 401));
        }

       
        const passwordValid = await bcrypt.compare(decryptedPassword, user.password);
        if (!passwordValid) {
            
                logger.error(`Invalid email or password`);
                return next(new AppError("Invalid email or password", 401));
        }
        
        const role = (await query('SELECT name FROM user_role WHERE id = $1', [user.role_id])).rows[0];
        
        // // Generate tokens
        // const { accessToken, refreshToken } = generateTokens(user, role);
        // // Log login attempt
        // res.locals.accessToken = accessToken;
        res.locals.user = {
            user_id: user.id,
            name: user.name,
            role: role.name,
        };

        return next();

    } catch (error) {
        logger.error("Error during login:", error);
        return res.status(500).json({ error: "Failed to login, please try again later." });
    }
};

module.exports = { loginUser };