const bcrypt = require("bcrypt");
const {query} = require('../../../../config/dbConfig');
const AppError = require("../../../../utils/appError");
const jwt = require("jsonwebtoken");
const { decryptId } = require("../../../../config/encryptDecryptId");
// const { addApiToRedis } = require('../../../utils/queueSender');
const { logger } = require('../../../../utils/logger');

function generateTokens(user) {
    logger.info("Generating tokens for user:", user.id,);

    const payload = {
        user_id: user.id,
        email: user.user_email,
        name: user.user_name,
        role: user.user_role,
    };
    const accessTokenOptions = { expiresIn: "15m" }; // 15 min for web

    const refreshTokenOptions ={ expiresIn: "4h" }; // 4 hours for web

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, accessTokenOptions);
    const refreshToken = jwt.sign({ user_id: user.id }, process.env.JWT_SECRET, refreshTokenOptions);

    return { accessToken, refreshToken };
}



// Login controller
const loginUser = async (req, res, next) => {
    let roleWiseId='' 
    let { email, password } = req.body;
    email = email?.trim();
    if (!email || !password) {
        logger.error(`Email and password are required ${email}`);
        return next(new AppError("Email and password are required", 400));

    }

    // const decryptedPassword = decryptId(password)?.trim();
    const decryptedPassword = password?.trim();


    try {
        const user = (await query("SELECT * FROM users WHERE user_email = $1", [email.toLowerCase()])).rows[0];
        if (!user){ 
            logger.error(`Invalid email or password, Email:${email}`);
            return next(new AppError("Invalid email or password", 401));
        }

       
        const passwordValid = await bcrypt.compare(decryptedPassword, user.user_password);
        if (!passwordValid) {
            
                logger.error(`Invalid email or password`);
                return next(new AppError("Invalid email or password", 401));
        }
       
        if(user.user_role=='freelancer'){
           roleWiseId  = (await query ('select freelancer_id from freelancer where user_id=$1',[user.id])).rows[0];
        }
        
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);
        // Log login attempt
        res.locals.accessToken = accessToken;
        res.locals.refreshToken =refreshToken;
        res.locals.user = {
            user_id: user.id,
            name: user.name,
            role: user.user_role,
            roleWiseId : roleWiseId
        };

        return next();

    } catch (error) {
        logger.error("Error during login:", error);
        return res.status(500).json({ error: "Failed to login, please try again later." });
    }
};

module.exports = { loginUser };