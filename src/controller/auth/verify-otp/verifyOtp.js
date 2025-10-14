const sendMail = require("../../../../config/email").sendMail;
const bcrypt = require("bcrypt");
const query = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { decryptId } = require("../../../../config/encryptDecryptId");
// const { preventMailSend } = require("../../../config/preventMailSend");
const { format } = require('date-fns');
// const determineCurrency = require('../../../utils/determineCurrency');
const {
    MailTemplatesHandler,
} = require("../../../mailTemplates/MailTemplatesHandler");
const { logger } = require('../../../../utils/logger');

// async function getGeoLocationDetails(ipAddress) {
//   let response = await fetch(`https://api.ip2location.io/?ip=${ipAddress}&key=${process.env.NEXT_IP_2_LOCATION_API_KEY}`);
//   response = await response.json();
//   return response;
// }

const verifyOtpAndProcess = async (req, res, next) => {

  let { email, otp, encryptedPassword, type, name, gender } = req.body;
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
      const userRes = await query("SELECT * FROM users WHERE email = $1", [email]);
      if (userRes.rows.length > 0) {
        return res.status(400).json({
          status: "fail",
          error: "Email Alredy Register",
          errorCode: 401
        });
      }

      const clientRealIp = req.headers['custom-real-ip'] ||
        req.headers['x-forwarded-for']?.split(',')[0] ||
        '127.0.0.1';

      const { country_name, city_name, country_code } = await getGeoLocationDetails(clientRealIp);
      const currency = determineCurrency(country_code);
      const user_location = `${city_name},${country_name}`;
      const currentTimestamp = new Date().toUTCString();


      const { rows: newUserResChatGMP } = await query(
        "INSERT INTO user_data (email, role, password, name, gender, isdeleted, credit_id,user_location,created_at) VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9) RETURNING id, email, name, gender, credit_id",
        [email.toLowerCase(), 5, hashedPassword, name, gender, false, 1, user_location, currentTimestamp]  // Include gender here
      );

      const { rows: plans } = await query(
        `SELECT name,amount,
          CASE 
              WHEN interval = 'monthly' AND interval_count = 1 THEN 'Monthly'
              WHEN interval = 'monthly' AND interval_count = 3 THEN 'Quarterly'
              WHEN interval = 'monthly' AND interval_count = 6 THEN 'Half-Yearly'
              WHEN interval = 'yearly' THEN 'Yearly'
          END AS billing_cycle,
          currency,
          CASE
              WHEN plan_type = 1 THEN 'Basic Plan'
              WHEN plan_type = 2 THEN 'Advance Plan'
          END AS plan_type,
          chatbot_message_count,chatbot_pdf_download_count,report_pdf_count
        FROM razorpay_plans 
        WHERE is_active = true AND currency = $1`, [currency]
      )

      const { rows: defaultUsageLimits } = await query(
        "SELECT chat_per_user, chatbot_pdf_per_user, report_pdf_count FROM admin_master WHERE id=1"
      );

      await query(
        'INSERT INTO user_usage(user_id, credit_id,  chatbot_message_count, chatbot_pdf_download_count, report_pdf_count) VALUES($1,$2,$3,$4,$5)',
        [
          newUserResChatGMP[0].id,
          newUserResChatGMP[0].credit_id,
          defaultUsageLimits[0].chat_per_user,
          defaultUsageLimits[0].chatbot_pdf_per_user,
          defaultUsageLimits[0].report_pdf_count
        ]
      );

      await query("DELETE FROM otp_tokens WHERE email = $1 AND type = $2", [email, type]);

      // Prepare Welcome Email HTML
      const mailTemplatesHandler = new MailTemplatesHandler();
      let userRegistrationHtml = mailTemplatesHandler.generateEmailContent('welcome-mail', {
            userName: name,
            copyrightYear: new Date().getFullYear(),
            plans: plans,
        });
      let userRegistrationSubject = `Welcome to Ai4Pharma`
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
                    
                    <p>A new user ${name} have been successfully registered for ChatOrange Here are the details:</p>
                    
                    <div class="user-info">
                        <p><strong>Name:</strong> ${name}</p>
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
      const userRes = await query("SELECT * FROM user_data WHERE email = $1", [email]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({
          status: "fail",
          error: "Email not found",
          errorCode: 401
        });
      }

      await query("UPDATE user_data SET password = $1 WHERE email = $2", [hashedPassword, email.toLowerCase()]);
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
    await query("insert into registration_failed_logs(email, message) values($1, $2)", [email, 'Failed to verify verification code']);
    const { rows: managementEmails } = await query(
      "SELECT email FROM public.email_alert WHERE verification_failure_alert = $1;",
      [true]
    );
    const emailList = managementEmails.map(obj => obj.email).join(',');
    await sendMail(emailList, 'Error registering user', `Failed to verify verification code for email: ${email}`);

    next(new AppError("OTP verification failed", 500));
  }
};

module.exports = { verifyOtpAndProcess };
