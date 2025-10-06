const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const query = require('../../../config/dbConfig');
const { decryptId } = require("../../../config/encryptDecryptId");
const { addApiToRedis } = require('../../../utils/queueSender');
const { logger } = require('../../../utils/logger');

// Fetch geolocation details
async function getGeoLocationDetails(ipAddress) {
    try {
        const response = await fetch(`https://api.ip2location.io/?ip=${ipAddress}&key=${process.env.NEXT_IP_2_LOCATION_API_KEY}`);
        return await response.json();
    } catch (err) {
        logger.error("IP2Location API failed:", err);
        return {};
    }
}

// Log login attempt
async function logLoginAttempt(userId, ipAddress) {
    try {
        const { country_code, country_name, region_name, city_name, latitude, longitude, zip_code, time_zone, asn, as } = await getGeoLocationDetails(ipAddress);

        await query(
            `INSERT INTO user_login_log 
             (user_id, ip_address, country_code, country_name, region_name, city_name, latitude, longitude, zip_code, time_zone, asn, as_name) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [userId, ipAddress, country_code, country_name, region_name, city_name, latitude, longitude, zip_code, time_zone, asn, as]
        );
    } catch (error) {
        logger.error("Error logging login attempt:", error);
    }
}

// Generate tokens
function generateTokens(user, role, isMobile = false) {
    logger.info("Generating tokens for user:", user.id, "Is Mobile:", isMobile);

    const payload = {
        user_id: user.id,
        email: user.email,
        name: user.name,
        role: role.name,
        show_test_plan: user.show_test_plan
    };

    const accessTokenOptions = isMobile
        ? { expiresIn: "10y" } // 10 years for mobile
        : { expiresIn: "15m" }; // 15 min for web

    const refreshTokenOptions = isMobile
        ? { expiresIn: "10y" } // 10 years for mobile
        : { expiresIn: "4h" }; // 4 hours for web

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, accessTokenOptions);
    const refreshToken = jwt.sign({ user_id: user.id }, process.env.JWT_SECRET, refreshTokenOptions);

    return { accessToken, refreshToken };
}

// Login controller
const loginUser = async (req, res, next) => {
    const clientRealIp = req.headers['custom-real-ip'] ||
        req.headers['x-forwarded-for']?.split(',')[0] ||
        '127.0.0.1';

    // ✅ Fix: headers are always strings
    const isMobile = (req.headers['orangemobileaccesstoken'] || '').toString().toLowerCase() === 'true';

    logger.info("Client IP:", clientRealIp, "Is Mobile:", isMobile);

    let { email, password } = req.body;
    email = email?.trim();
    if (!email || !password) {
        logger.error(`Email and password are required ${email}`);
        return res.status(400).json({ error: "Email and password are required" });
    }

    const decryptedPassword = decryptId(password)?.trim();

    try {
        const user = (await query("SELECT * FROM user_data WHERE email = $1", [email.toLowerCase()])).rows[0];
        if (!user){ 
            logger.error(`Invalid email or password, Email:${email}`);
            return res.status(401).json({ error: "Invalid email or password" });
        }

        if (user.is_blocked) {
            logger.error(`Your account has been temporarily disabled. Contact help@ai4pharma.ai ${email}`);
            return res.status(403).json({
                error: "Your account has been temporarily disabled. Contact help@ai4pharma.ai"
            });
        }

        const currentTime = new Date();
        if (user.block_time && new Date(user.block_time) > currentTime) {
            const minutesLeft = Math.ceil((new Date(user.block_time) - currentTime) / (1000 * 60));
            logger.error(`Account is temporarily blocked. Try again in ${minutesLeft} minutes. ${email}`);
            return res.status(401).json({
                error: `Account is temporarily blocked. Try again in ${minutesLeft} minutes.`
            });
        }

        const passwordValid = await bcrypt.compare(decryptedPassword, user.password);
        if (!passwordValid) {
            const newAttempts = (user.failed_login_attempts || 0) + 1;

            if (newAttempts >= 5) {
                const blockUntil = new Date(currentTime.getTime() + 5 * 60 * 1000);
                await query("UPDATE user_data SET failed_login_attempts = $1, block_time = $2 WHERE email = $3", [newAttempts, blockUntil, email.toLowerCase()]);
                logger.error(`Too many failed attempts. Account blocked for 5 minutes. Email: ${email}`);
                return res.status(401).json({ error: "Too many failed attempts. Account blocked for 5 minutes." });
            } else {
                await query("UPDATE user_data SET failed_login_attempts = $1 WHERE email = $2", [newAttempts, email.toLowerCase()]);
                logger.error(`Invalid email or password. Attempt ${newAttempts}/5 Email: ${email}`);
                return res.status(401).json({ error: "Invalid email or password" });
            }
        }
        
        const role = (await query('SELECT name FROM user_role WHERE id = $1', [user.role_id])).rows[0];
        
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user, role, isMobile);
        await addApiToRedis(user.id, 'Successful: User logged in', "Login",refreshToken);

        // // Define token durations in milliseconds
        // const REFRESH_TOKEN_DURATION = 4 * 60 * 60 * 1000; // 4 hours
        // const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DURATION);

        // // Store the actual refresh token in database
        // await query(
        //     "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
        //     [user.id, refreshToken, refreshExpiresAt]
        // );

        // Reset failed attempts
        await query("UPDATE user_data SET failed_login_attempts = 0 WHERE email = $1", [email.toLowerCase()]);

        // Log login + session
        await logLoginAttempt(user.id, clientRealIp);
        await query("INSERT INTO UserSessionLogs (user_id, login_time) VALUES ($1, NOW())", [user.id]);

        // Pass to cookie setter
        res.locals.accessToken = accessToken;
        res.locals.refreshToken = refreshToken;
        res.locals.isMobile = isMobile;
        res.locals.user = {
            user_id: user.id,
            name: user.name,
            designation: role.name
        };

        return next();

    } catch (error) {
        logger.error("Error during login:", error);
        return res.status(500).json({ error: "Failed to login, please try again later." });
    }
};

module.exports = { loginUser };