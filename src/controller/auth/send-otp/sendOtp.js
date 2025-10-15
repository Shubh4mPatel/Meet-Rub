const crypto = require("crypto");
const sendMail = require("../../../../config/email").sendMail;
const bcrypt = require("bcrypt");
const query = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { logger } = require('../../../../utils/logger');
const { sendEmailNotification } = require("../../../../producer/notificationProducer");

const otpSendApi = async (req, res, next) => {
  let { email, type } = req.body; // POST body
  email = email?.trim();

  try {

    const userRes = await query("SELECT * FROM users WHERE user_email = $1", [email]);

    if (type === "password-reset") {

      if (userRes.rows.length === 0) {
        return res.status(404).json({ error: "Email not found." });
      }

    } else if (type === "email-verification") {

      if (userRes.rows.length > 0) {
        return res.status(400).json({
          error: "Email is already registered.",
        });
      }

    } else {
      return res.status(400).json({ error: "Invalid OTP type." });
    }

    const otp = crypto.randomBytes(3).toString("hex");
    const expiration = new Date(Date.now() + 600 * 1000);
    console.log(otp, 'otp');

    const otpReqPresent = await query(
      "SELECT * FROM otp_tokens WHERE email = $1 AND type = $2",
      [email, type]
    );

    if (otpReqPresent.rows.length > 0) {
      const updateResult = await query(
        "UPDATE otp_tokens SET otp = $2, expires_at = $3 WHERE email = $1 AND type = $4",
        [email, await bcrypt.hash(otp, 10), expiration, type]
      );

      if (updateResult.rowCount === 0) {
        return res.status(500).json({ error: "Failed to update OTP." });
      }

    } else {
      const insertResult = await query(
        "INSERT INTO otp_tokens (email, otp, expires_at, type) VALUES ($1, $2, $3, $4)",
        [email, await bcrypt.hash(otp, 10), expiration, type]
      );


      if (insertResult.rowCount === 0) {
        return res.status(500).json({ error: "Failed to insert OTP." });
      }
    }
    sendEmailNotification(email, 'email verifcation', `your otp is ${otp}`, false);
    let subject = "";
    let message = "";

    if (type === "email-verification") {
      subject = "Your Ai4Pharma Verification Code";
      message = `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ai4Pharma Verification Code</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              line-height: 1.5;
              color: #333;
              margin: 0;
              padding: 0;
              background-color: #f8f8f8;
          }
          .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #ffffff;
          }
          .header {
              text-align: center;
              padding: 10px 0;
              border-bottom: 1px solid #eaeaea;
          }
          .logo {
              width: 120px;
              height: auto;
              margin-bottom: 10px;
          }
          .content {
              padding: 20px 0;
          }
          .otp-code {
              font-size: 24px;
              font-weight: bold;
              text-align: center;
              letter-spacing: 5px;
              background-color: #f0f0f0;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
          }
          .footer {
              text-align: center;
              padding: 10px 0;
              font-size: 14px;
              color: #666;
              border-top: 1px solid #eaeaea;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              <!-- Replace with your actual logo -->
              <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Ai4Pharma%20Image.png" alt="Ai4Pharma Logo" class="logo">
              <a href='https://www.ai4pharma.ai/'><h1>Ai4Pharma</h1></a>
          </div>
          
          <div class="content">
              <h2>Verification Code</h2>
              <p>Hello,</p>
              <p>Thank you for registering with Ai4Pharma. Please use the verification code below to complete your registration:</p>
              <div class="otp-code">${otp}</div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you did not request this code, please ignore this email.</p>
              <p>At Ai4Pharma, we are dedicated to using AI to address the unique challenges facing the pharmaceutical industry.</p>
              <p>If you have any questions or need assistance, please contact us at: <a href="mailto:help@Ai4Pharma.ai">help@Ai4Pharma.ai</a></p>
              <p>For More deails you can visit our website at <a href='https://www.ai4pharma.ai/'>Ai4Pharma</a></p>
              <p>Best regards,</p>
              <p>TEAM Ai4Pharma</p>
            </div>
                
            <div class="footer">
                <p>Copyright &copy; ${new Date().getFullYear()} Ai4Pharma Tech Limited. All Rights Reserved.</p>
            </div>
      </div>
  </body>
  </html>`;
    } else if (type === "password-reset") {
      subject = "Ai4Pharma Password Reset Code";
      message = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ai4Pharma Password Reset Code</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.5;
                    color: #333;
                    margin: 0;
                    padding: 0;
                    background-color: #f8f8f8;
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #ffffff;
                }
                .header {
                    text-align: center;
                    padding: 10px 0;
                    border-bottom: 1px solid #eaeaea;
                }
                .logo {
                    width: 120px;
                    height: auto;
                    margin-bottom: 10px;
                }
                .content {
                    padding: 20px 0;
                }
                .otp-code {
                    font-size: 24px;
                    font-weight: bold;
                    text-align: center;
                    letter-spacing: 5px;
                    background-color: #f0f0f0;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 4px;
                }
                .footer {
                    text-align: center;
                    padding: 10px 0;
                    font-size: 14px;
                    color: #666;
                    border-top: 1px solid #eaeaea;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <!-- Replace with your actual logo -->
                    <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Ai4Pharma%20Image.png" alt="Ai4Pharma Logo" class="logo">
              <a href='https://www.ai4pharma.ai/'><h1>Ai4Pharma</h1></a>
                </div>
                
                <div class="content">
                    <h2>Password Reset Code</h2>
                    <p>Hello,</p>
                    <p>We received a request to reset your password for your Ai4Pharma account. Please use the verification code below to complete the password reset process:</p>
                    <div class="otp-code">${otp}</div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you did not request a password reset, please ignore this email or contact us immediately if you have concerns about your account security.</p>                  
                    <p>At Ai4Pharma, we are dedicated to using AI to address the unique challenges facing the pharmaceutical industry.</p>
                    <p>If you have any questions or need assistance, please contact us at: <a href="mailto:help@Ai4Pharma.ai">help@Ai4Pharma.ai</a></p>
                    <p>For More deails you can visit our website at <a href='https://www.ai4pharma.ai/'>Ai4Pharma</a></p>
                    <p>Best regards,</p>
                    <p>TEAM Ai4Pharma</p>
                </div>
                
                <div class="footer">
                    <p>Copyright &copy; ${new Date().getFullYear()} Ai4Pharma Tech Limited. All Rights Reserved.</p>
                </div>
            </div>
        </body>
        </html>`;
    }

    // await sendMail(email, subject, message);

    return res.status(200).json({
      message: "Verification code sent successfully.",
    });

  } catch (error) {
    logger.error("Error sending OTP:", error);

    next(new AppError("Failed to send OTP.", 500));
  }
};

module.exports = { otpSendApi };
