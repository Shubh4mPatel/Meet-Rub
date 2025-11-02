const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { query } = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { logger } = require('../../../../utils/logger');
const { sendEmailNotification } = require("../../../../producer/notificationProducer");

const otpSendApi = async (req, res, next) => {
  let { email, type } = req.body;
  email = email?.trim();

  logger.info("OTP send request received", { email, type });

  try {
    const userRes = await query("SELECT * FROM users WHERE user_email = $1", [email]);
    logger.debug("User lookup result", { exists: userRes.rows.length > 0 });

    if (type === "password-reset") {
      if (userRes.rows.length === 0) {
        logger.warn("Password reset failed: Email not found", { email });
        return res.status(404).json({ error: "Email not found." });
      }
    } else if (type === "email-verification") {
      if (userRes.rows.length > 0) {
        logger.warn("Email verification failed: Email already registered", { email });
        return res.status(400).json({ error: "Email is already registered." });
      }
    } else {
      logger.warn("Invalid OTP type received", { type });
      return res.status(400).json({ error: "Invalid OTP type." });
    }

    const otp = crypto.randomBytes(3).toString("hex");
    const otpHash = await bcrypt.hash(otp, 10);
    const expiration = new Date(Date.now() + 10 * 60 * 1000);

    logger.info("OTP generated (not logged for security)");

    const existingOtp = await query(
      "SELECT * FROM otp_tokens WHERE email = $1 AND type = $2",
      [email, type]
    );

    if (existingOtp.rows.length > 0) {
      logger.info("Updating existing OTP");
      await query(
        "UPDATE otp_tokens SET otp = $2, expires_at = $3 WHERE email = $1 AND type = $4",
        [email, otpHash, expiration, type]
      );
    } else {
      logger.info("Inserting new OTP");
      await query(
        "INSERT INTO otp_tokens (email, otp, expires_at, type) VALUES ($1, $2, $3, $4)",
        [email, otpHash, expiration, type]
      );
    }

    let subject = "";
    let message = "";

    if (type === "email-verification") {
      subject = "Your Meetrub Verification Code";
      message = `Your OTP is: ${otp}`;
    } else {
      subject = "Meetrub Password Reset Code";
      message = `Your OTP is: ${otp}`;
    }

    logger.info("Sending OTP email");

    sendEmailNotification(email, subject, message, false);

    logger.info("OTP sent successfully");

    return res.status(200).json({
      status: "success",
      message: "Verification code sent successfully."
    });

  } catch (error) {
    logger.error("Error sending OTP", { error: error.message });

    return next(new AppError("Failed to send OTP.", 500));
  }
};

module.exports = { otpSendApi };
