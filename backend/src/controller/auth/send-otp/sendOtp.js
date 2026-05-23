const crypto = require("crypto");
const bcrypt = require("bcrypt");
const fs = require('fs');
const path = require('path');
const { query } = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { logger } = require('../../../../utils/logger');
const { sendEmailNotification } = require("../../../../producer/notificationProducer");
const { sendMail } = require("../../../../config/email");

const TEMPLATES_DIR = path.join(__dirname, '../../../../../Email-Templates');

const APP_URL = process.env.APP_URL || 'https://meetrub.com';
const LOGO_SVG_PATH = path.join(__dirname, '../../../../../Email-Templates/assets/logo-large.svg');
const LOGO_URL = process.env.LOGO_URL ||
  `data:image/svg+xml;base64,${fs.readFileSync(LOGO_SVG_PATH).toString('base64')}`;
const HELP_URL = process.env.HELP_URL || `${APP_URL}/help`;
const PRIVACY_URL = process.env.PRIVACY_URL || `${APP_URL}/privacy`;

function fillTemplate(html, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ''),
    html
  );
}

const otpSendApi = async (req, res, next) => {
  let { email, type } = req.body;
  email = email?.trim().toLowerCase();

  logger.info("OTP send request received", { email, type });

  try {
    const userRes = await query("SELECT * FROM users WHERE user_email = $1", [email]);
    logger.debug("User lookup result", { exists: userRes.rows.length > 0 });

    if (type === "password-reset") {
      if (userRes.rows.length === 0) {
        logger.warn("Password reset failed: Email not found", { email });
        return next(new AppError("Email not found.", 404));
      }
    } else if (type === "email-verification") {
      if (userRes.rows.length > 0) {
        logger.warn("Email verification failed: Email already registered", { email });
        return next(new AppError("Email is already registered.", 400));
      }
    } else {
      logger.warn("Invalid OTP type received", { type });
      return next(new AppError("Invalid OTP type.", 400));
    }

    const otp = crypto.randomBytes(3).toString("hex");
    const otpHash = await bcrypt.hash(otp, 10);
    const expiration = new Date(Date.now() + 10 * 60 * 1000);

    logger.info("OTP generated (not logged for security)",otp);

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
    let htmlContent = "";

    if (type === "email-verification") {
      subject = "Your Meetrub Verification Code";
      const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'auth/emailVerificationOtp.html'),
        'utf8'
      );
      htmlContent = fillTemplate(html, {
        otp_code: otp,
        logo_url: LOGO_URL,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
      });
    } else {
      subject = "Meetrub Password Reset Code";
      const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'auth/passwordResetOtp.html'),
        'utf8'
      );
      htmlContent = fillTemplate(html, {
        otp_code: otp,
        logo_url: LOGO_URL,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
      });
    }

    logger.info("Sending OTP email");

    // sendEmailNotification(email, subject, message, false);
    sendMail(email, subject, htmlContent);

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
