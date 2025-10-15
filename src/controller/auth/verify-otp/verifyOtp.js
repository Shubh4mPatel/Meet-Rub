const sendMail = require("../../../../config/email").sendMail;
const bcrypt = require("bcrypt");
const query = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { decryptId } = require("../../../../config/encryptDecryptId");
const { format } = require('date-fns');
const {
    MailTemplatesHandler,
} = require("../../../mailTemplates/MailTemplatesHandler");
const { logger } = require('../../../../utils/logger');



const verifyOtpAndProcess = async (req, res, next) => {

  let { email, otp, encryptedPassword, type, userName, role , phoneNumber } = req.body;
  email = email?.trim();
  otp = otp?.trim();

  try {
    const decryptedPassword = decryptId(encryptedPassword)?.trim();
    const currentDateTime = new Date(Date.now());

    const otpRes = await query(
      "SELECT * FROM otp_tokens WHERE email = $1 AND type = $2 AND expires_at > $3",
      [email, type, currentDateTime]
    );

    if (otpRes.rows.length === 0) {
      return res.status(400).json({
        status: "fail",
        error: "Invalid or expired OTP",
        errorCode: 5024
      });
    }

    const isOtpValid = await bcrypt.compare(otp, otpRes.rows[0].otp);
    if (!isOtpValid) {
      return res.status(400).json({
        status: "fail",
        error: "Invalid OTP",
        errorCode: 5023
      });
    }

    const hashedPassword = await bcrypt.hash(decryptedPassword, 10);

    if (type === "email-verification") {
      const userRes = await query("SELECT * FROM users WHERE user_email = $1", [email]);
      if (userRes.rows.length > 0) {
        return res.status(400).json({
          status: "fail",
          error: "Email Alredy Register",
          errorCode: 401
        });
      }

      const currentTimestamp = new Date().toUTCString();


      const { rows: newUserResMeetRub } = await query(
        "INSERT INTO users (user_email, user_role, user_password, user_name, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [email.toLowerCase(), role, hashedPassword, userName,  currentTimestamp]  // Include gender here
      );
      await query("DELETE FROM otp_tokens WHERE email = $1 AND type = $2", [email, type]);

      // Prepare Welcome Email HTML
      const mailTemplatesHandler = new MailTemplatesHandler();
      let userRegistrationHtml = mailTemplatesHandler.generateEmailContent('welcome-mail', {
            userName: userName,
            copyrightYear: new Date().getFullYear(),
            plans: plans,
        });
      let userRegistrationSubject = `Welcome to MeetRuby, ${userName}!`;
      await sendMail(email, userRegistrationSubject, userRegistrationHtml);

      const now = format(new Date(), 'dd MMMM yyyy HH:mm:ss');
      let managementNotificationHtml = ` <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New User Registration Notification</title>
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
                .user-info {
                    background-color: #f5f5f5;
                    padding: 15px;
                    border-radius: 4px;
                    margin: 15px 0;
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
                    <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Ai4Pharma%20Image.png" alt="Ai4Pharma Logo" class="logo">
                    <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Chat%20Orange.png" alt="Chat Orange Logo" class="logo">
                    <h1>Ai4Pharma</h1>
                </div>
                
                <div class="content">
                    <h2>New User Registration</h2>
                    
                    <p>Hello Team,</p>
                    
                    <p>A new user ${userName} have been successfully registered for ChatOrange Here are the details:</p>
                    
                    <div class="user-info">
                        <p><strong>Name:</strong> ${userName}</p>
                        <p><strong>Email:</strong> ${email}</p>
                        <p><strong>Registration Date:</strong> ${now}</p>
                    </div>
                    
                    <p>Best regards,</p>
                    <p>TEAM Ai4Pharma</p>
                  </div>  
                  <div class="footer">
                      <p>Copyright &copy; ${new Date().getFullYear()} Ai4Pharma Tech Limited. All Rights Reserved.</p>
                  </div>
            </div>
        </body>
        </html>`;

      const { rows: managementEmails } = await query(
        "SELECT email FROM public.email_alert WHERE new_registration_alert = $1;",
        [true]
      );
      const emailList = managementEmails.map(obj => obj.email).join(',');
      // if (!preventMailSend(email)) {
      await sendMail(emailList, `New User Registration: ${name}`, managementNotificationHtml);
      // }

      return res.status(200).json({
        status: "success",
        message: "Signup successful"
      });

    } else if (type === "password-reset") {
      const userRes = await query("SELECT * FROM users WHERE email = $1", [email]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({
          status: "fail",
          error: "Email not found",
          errorCode: 401
        });
      }

      await query("UPDATE users SET user_password = $1 WHERE user_email = $2", [hashedPassword, email.toLowerCase()]);
      await query("DELETE FROM otp_tokens WHERE email = $1 AND type = $2", [email, type]);

      return res.status(200).json({
        status: "success",
        message: "Password reset succefully"
      });

    } else {
      return res.status(400).json({
        status: "fail",
        error: "Invalid OTP",
        errorCode: 401
      });
    }

  } catch (error) {
    logger.error("Error during Verification Code verification:", error);
    next(new AppError("OTP verification failed", 500));
  }
};

module.exports = { verifyOtpAndProcess };
