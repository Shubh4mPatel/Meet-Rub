const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const query = require("../../../config/dbConfig");
const { logger } = require('../../../utils/logger');
const { addApiToRedis } = require("../../../utils/queueSender");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
function generateTokens(user, role, isMobile = false) {
  logger.info("Generating tokens for user:", user.email, "Is Mobile:", isMobile);

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
const googleLoginUser = async (req, res, next) => {
  const clientRealIp = req.headers["custom-real-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    "127.0.0.1";

  const isMobile =
    (req.headers["orangemobileaccesstoken"] || "")
      .toString()
      .toLowerCase() === "true";

  try {
    const { credential } = req.body; // Google ID token
    if (!credential) {
      return res.status(400).json({ error: "Google credential missing" });
    }

    // ✅ Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const email = payload.email.toLowerCase();
    const name = payload.name;
    const picture = payload.picture;

    // ✅ Check if user already exists
    let user = (await query("SELECT * FROM user_data WHERE email = $1", [email]))
      .rows[0];

    // ✅ If not, create a new user
    if (!user) {
      const clientRealIp = req.headers['custom-real-ip'] ||
        req.headers['x-forwarded-for']?.split(',')[0] ||
        '127.0.0.1';

      const { country_name, city_name, country_code } = await getGeoLocationDetails(clientRealIp);
      // const currency = determineCurrency(country_code);
      const user_location = `${city_name},${country_name}`;
      const currentTimestamp = new Date().toUTCString();
      user = (
        await query(
          "INSERT INTO user_data (email, role_id, password, name, gender, isdeleted, credit_id,user_location,created_at,profile_pic_url) VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9,$10) RETURNING id, email, name, gender, credit_id , role_id, user_location, created_at, profile_pic_url",
          [email.toLowerCase(), 5, "", name, "", false, 1, user_location, currentTimestamp, picture]
        )
      ).rows[0];


      const { rows: defaultUsageLimits } = await query(
        "SELECT chat_per_user, chatbot_pdf_per_user, report_pdf_count FROM admin_master WHERE id=1"
      );

      await query(
        'INSERT INTO user_usage(user_id, credit_id,  chatbot_message_count, chatbot_pdf_download_count, report_pdf_count) VALUES($1,$2,$3,$4,$5)',
        [
          user.id,
          user.credit_id,
          defaultUsageLimits[0].chat_per_user,
          defaultUsageLimits[0].chatbot_pdf_per_user,
          defaultUsageLimits[0].report_pdf_count
        ]
      );
      // Assign default role if needed
      // await query(
      //   "INSERT INTO user_role_map (user_id, role_id) VALUES ($1, $2)",
      //   [user.id, process.env.DEFAULT_ROLE_ID || 2] // Example: role 2 = normal user
      // );
    }

    logger.info("Google user found or created:", user.role_id);

    // ✅ Fetch role
    const role = (
      await query("SELECT name FROM user_role WHERE id = $1", [user.role_id])
    ).rows[0];

    // ✅ Generate tokens
    const { accessToken, refreshToken } = generateTokens(user, role, isMobile);
    await addApiToRedis(user.id, "Successful: Google user logged in", "Login", refreshToken);

    // ✅ Log login + session
    await logLoginAttempt(user.id, clientRealIp);
    await query("INSERT INTO UserSessionLogs (user_id, login_time) VALUES ($1, NOW())", [user.id]);

    // ✅ Send tokens + user info
    res.locals.accessToken = accessToken;
    res.locals.refreshToken = refreshToken;
    res.locals.isMobile = isMobile;
    res.locals.user = {
      user_id: user.id,
      name: user.name,
      designation: role.name,
    };

    return next();
  } catch (err) {
    logger.error("Google login error:", err);
    return res.status(401).json({ error: "Invalid Google token", err: err.message });
  }
};
async function getGeoLocationDetails(ipAddress) {
  let response = await fetch(`https://api.ip2location.io/?ip=${ipAddress}&key=${process.env.NEXT_IP_2_LOCATION_API_KEY}`);
  response = await response.json();
  return response;
}

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
module.exports = { googleLoginUser };
