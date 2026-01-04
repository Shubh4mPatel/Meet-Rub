const jwt = require("jsonwebtoken");
const { query } = require("../../config/dbConfig"); // Adjust path as needed

const { getLogger } = require("../../utils/logger");

const logger = getLogger("middleware-logger");

// Middleware to refresh access token using refresh token
const refreshAccessToken = async (req, res, next) => {
  logger.info("Attempting to refresh access token...");
  try {
    const refreshToken = req.cookies?.RefreshToken;

    logger.info("refreshToken: ", refreshToken);
    if (!refreshToken) {
      return res
        .status(401)
        .json({ status: "failed", message: "Refresh token required" });
    }
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    logger.info("Decoded refresh token:", decoded);
    // Get user details
    const user = await query(
      `SELECT 
  u.*,
  COALESCE(f.freelancer_id, c.creator_id) AS roleWiseId
FROM users u
LEFT JOIN freelancer f ON u.id = f.user_id AND u.user_role = 'freelancer'
LEFT JOIN creators c ON u.id = c.user_id AND u.user_role = 'creator'
WHERE u.id = $1`,
      [decoded.user_id]
    );
    logger.info("User fetched for token refresh:", user.rows[0]);
    if (user.rows.length === 0) {
      return res
        .status(401)
        .json({ status: "failed", message: "User not found" });
    }

    // Generate new access token
    const payload = {
      user_id: user.rows[0].id,
      email: user.rows[0].user_email,
      name: user.rows[0].user_name,
      role: user.rows[0].user_role,
      roleWiseId: user.rows[0].rolewiseid, // Database returns lowercase column names
    };

    logger.info("Token refresh payload:", payload);

    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    // Set new access token cookie
    const ACCESS_TOKEN_DURATION = 15 * 60 * 1000; // 15 minutes
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("AccessToken", newAccessToken, {
      maxAge: ACCESS_TOKEN_DURATION,
      httpOnly:  false,
      secure: false, // ensure the cookie is sent over HTTPS in production
      sameSite: isProduction ?  "lax":"None", // required for cross-site cookies
      path: "/",
    });
    logger.info("New access token issued",payload);
    req.user = payload;
    next();
  } catch (error) {
    return res
      .status(401)
      .json({ status: "failed", message: "Token refresh failed" });
  }
};

// Combined middleware that tries access token first, then refresh token
const authenticateUser = async (req, res, next) => {
  // First try to verify access token
  let token = req.cookies?.AccessToken;

  logger.info(`Auth middleware called for ${req.method} ${req.path}`);

  if (
    token &&
    token !== "null" &&
    token !== "undefined" &&
    token.trim() !== ""
  ) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.info("Access token verified successfully:", {
        user_id: decoded.user_id,
        role: decoded.role,
        roleWiseId: decoded.roleWiseId
      });
      req.user = decoded;

      return next();
    } catch (error) {
      logger.warn("Access token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        logger.info("Access token expired, attempting to refresh...");
        // Access token expired, try to refresh
        return refreshAccessToken(req, res, next);
      } else {
        return res
          .status(401)
          .json({ status: "failed", message: "Invalid access token" });
      }
    }
  } else {
    logger.info("No access token found, attempting to refresh...");
    // No access token, try to refresh
    return refreshAccessToken(req, res, next);
  }
};

// Middleware to check user roles
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    const user = req.user;

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        status: "failed",
        message: "Insufficient permissions for this role",
      });
    }

    next();
  };
};

// Middleware to logout (clear cookies and remove refresh token from DB)
const logout = async (req, res, next) => {
  try {
    // await query(
    //   "DELETE FROM refresh_tokens WHERE user_id = $1",
    //   [req.user.user_id]
    // );
    const refreshToken = req.cookies?.RefreshToken;
    // if (refreshToken) {
    //     // Remove refresh token from database
    //     await query("DELETE FROM refresh_tokens WHERE token = $1", [refreshToken]);
    // }

    res.clearCookie("AccessToken", { path: "/" });
    res.clearCookie("RefreshToken", { path: "/" });
    // await query(
    //     `UPDATE UserSessionLogs
    //     SET logout_time = NOW()
    //     WHERE id = (
    //         SELECT id FROM UserSessionLogs
    //         WHERE user_id = $1 AND logout_time IS NULL
    //         ORDER BY login_time DESC
    //         LIMIT 1
    //     )`,
    //     [req.user.user_id]
    // );
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ status: "failed", message: "Logout failed" });
  }
};

module.exports = {
  refreshAccessToken,
  authenticateUser,
  requireRole,
  logout,
};
