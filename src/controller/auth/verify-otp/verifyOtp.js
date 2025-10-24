const bcrypt = require("bcrypt");
const query = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { decryptId } = require("../../../../config/encryptDecryptId");
const { logger } = require("../../../../utils/logger");
const {
  sendEmailNotification,
} = require("../../../../producer/notificationProducer");
// const { forEach } = require("jszip");
const path = require("path"); // CommonJS
const { minioClient } = require("../../../../config/minio");

const verifyOtpAndProcess = async (req, res, next) => {
  let {
    email,
    encryptedPassword,
    role,
    userName,
    firstName,
    lastName,
    dateOfBirth,
    profileTitle,
    serviceOffred,
    niche,
    govId,
    phoneNumber,
    govIdType,
    otp,
    type,
  } = req.body;
  email = email?.trim();
  otp = otp?.trim();

  try {
    // const decryptedPassword = decryptId(encryptedPassword)?.trim();
    const decryptedPassword = encryptedPassword;
    const currentDateTime = new Date(Date.now());

    const otpRes = await query(
      "SELECT * FROM otp_tokens WHERE email = $1 AND type = $2 AND expires_at > $3",
      [email, type, currentDateTime]
    );

    if (otpRes.rows.length === 0) {
      return res.status(400).json({
        status: "fail",
        error: "Invalid or expired OTP",
        errorCode: 5024,
      });
    }

    const isOtpValid = await bcrypt.compare(otp, otpRes.rows[0].otp);
    if (!isOtpValid) {
      return res.status(400).json({
        status: "fail",
        error: "Invalid OTP",
        errorCode: 5023,
      });
    }

    const hashedPassword = await bcrypt.hash(decryptedPassword, 10);

    if (type === "email-verification") {
      const userRes = await query("SELECT * FROM users WHERE user_email = $1", [
        email,
      ]);
      if (userRes.rows.length > 0) {
        return res.status(400).json({
          status: "fail",
          error: "Email Alredy Register",
          errorCode: 401,
        });
      }

      const currentTimestamp = new Date().toUTCString();

      const { rows: newUserResMeetRub } = await query(
        "INSERT INTO users (user_email, user_role, user_password, user_name, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [email.toLowerCase(), role, hashedPassword, userName, currentTimestamp] // Include gender here
      );

      await query("DELETE FROM otp_tokens WHERE email = $1 AND type = $2", [
        email,
        type,
      ]);
      if (role == "freelancer") {
        if (!req.file) {
          return next(new AppError("document is required", 400));
        }
      
        const BUCKET_NAME = "freelancer-documents";
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = `goverment-doc/${govIdType}`;
        const objectName = `${folder}/${fileName}`;
        const govIdUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;
      
        // Start transaction
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');
      
          // Upload file to MinIO first
          console.log("bucket", objectName);
          console.log("adding image to s3");
          await minioClient.putObject(
            BUCKET_NAME,
            objectName,
            req.file.buffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
          );
      
          // Insert freelancer record
          const { rows: freelancer } = await client.query(
            `INSERT INTO freelancer 
            (
              user_id,
              profile_title,
              gov_id_type,
              gov_id_url,
              first_name,
              last_name,
              date_of_birth,
              phone_number,
              created_at,
              updated_at,
              freelancer_full_name,
              freelancer_email,
              gov_id_number,
              niche
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
              newUserResMeetRub[0].user_id,
              profileTitle,
              govIdType,
              govIdUrl,
              firstName,
              lastName,
              dateOfBirth,
              phoneNumber,
              currentDateTime,
              currentDateTime,
              `${firstName} ${lastName}`,
              email,
              govId,
              niche,
            ]
          );
      
          // Insert all services
          for (const service of serviceOffred) {
            await client.query(
              "INSERT INTO services (freelancer_id, sercvice_category, created_at, updated_at) VALUES ($1, $2, $3, $4)",
              [
                freelancer[0].freelancer_id,
                service,
                currentTimestamp,
                currentTimestamp,
              ]
            );
          }
      
          // Commit transaction
          await client.query('COMMIT');
          
        } catch (error) {
          // Rollback transaction on error
          await client.query('ROLLBACK');
          
          // Cleanup: Delete uploaded file from MinIO if database operations failed
          try {
            await minioClient.removeObject(BUCKET_NAME, objectName);
            console.log("Rolled back MinIO upload due to database error");
          } catch (minioError) {
            console.error("Failed to cleanup MinIO object:", minioError);
          }
          
          throw error; // Re-throw to be handled by error middleware
        } finally {
          client.release();
        }
      }

      // Prepare Welcome Email HTML
      // const mailTemplatesHandler = new MailTemplatesHandler();
      // let userRegistrationHtml = mailTemplatesHandler.generateEmailContent('welcome-mail', {
      //       userName: userName,
      //       copyrightYear: new Date().getFullYear(),
      //       plans: plans,
      //   });
      let userRegistrationSubject = `Welcome to MeetRub, ${userName}!`;
      // await sendMail(email, userRegistrationSubject, userRegistrationHtml);
      sendEmailNotification(
        email,
        userRegistrationSubject,
        userRegistrationHtml,
        false
      );

      // const now = format(new Date(), 'dd MMMM yyyy HH:mm:ss');
      //   let managementNotificationHtml = ` <!DOCTYPE html>
      //     <html lang="en">
      //     <head>
      //         <meta charset="UTF-8">
      //         <meta name="viewport" content="width=device-width, initial-scale=1.0">
      //         <title>New User Registration Notification</title>
      //         <style>
      //             body {
      //                 font-family: Arial, sans-serif;
      //                 line-height: 1.5;
      //                 color: #333;
      //                 margin: 0;
      //                 padding: 0;
      //                 background-color: #f8f8f8;
      //             }
      //             .container {
      //                 max-width: 600px;
      //                 margin: 0 auto;
      //                 padding: 20px;
      //                 background-color: #ffffff;
      //             }
      //             .header {
      //                 text-align: center;
      //                 padding: 10px 0;
      //                 border-bottom: 1px solid #eaeaea;
      //             }
      //             .logo {
      //                 width: 120px;
      //                 height: auto;
      //                 margin-bottom: 10px;
      //             }
      //             .content {
      //                 padding: 20px 0;
      //             }
      //             .user-info {
      //                 background-color: #f5f5f5;
      //                 padding: 15px;
      //                 border-radius: 4px;
      //                 margin: 15px 0;
      //             }
      //             .footer {
      //                 text-align: center;
      //                 padding: 10px 0;
      //                 font-size: 14px;
      //                 color: #666;
      //                 border-top: 1px solid #eaeaea;
      //             }
      //         </style>
      //     </head>
      //     <body>
      //         <div class="container">
      //             <div class="header">
      //                 <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Ai4Pharma%20Image.png" alt="Ai4Pharma Logo" class="logo">
      //                 <img src="https://chatgmpreports.blob.core.windows.net/filestorage/Chat%20Orange.png" alt="Chat Orange Logo" class="logo">
      //                 <h1>Ai4Pharma</h1>
      //             </div>

      //             <div class="content">
      //                 <h2>New User Registration</h2>

      //                 <p>Hello Team,</p>

      //                 <p>A new user ${userName} have been successfully registered for ChatOrange Here are the details:</p>

      //                 <div class="user-info">
      //                     <p><strong>Name:</strong> ${userName}</p>
      //                     <p><strong>Email:</strong> ${email}</p>
      //                     <p><strong>Registration Date:</strong> ${now}</p>
      //                 </div>

      //                 <p>Best regards,</p>
      //                 <p>TEAM Ai4Pharma</p>
      //               </div>
      //               <div class="footer">
      //                   <p>Copyright &copy; ${new Date().getFullYear()} Ai4Pharma Tech Limited. All Rights Reserved.</p>
      //               </div>
      //         </div>
      //     </body>
      //     </html>`;

      //   const { rows: managementEmails } = await query(
      //     "SELECT email FROM public.email_alert WHERE new_registration_alert = $1;",
      //     [true]
      //   );
      //   const emailList = managementEmails.map(obj => obj.email).join(',');
      //   // if (!preventMailSend(email)) {
      //   // }
      // sendEmailNotification(email, subject, message, false);

      return res.status(200).json({
        status: "success",
        message: "Signup successful",
      });
    } else if (type === "password-reset") {
      const userRes = await query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({
          status: "fail",
          error: "Email not found",
          errorCode: 401,
        });
      }

      await query("UPDATE users SET user_password = $1 WHERE user_email = $2", [
        hashedPassword,
        email.toLowerCase(),
      ]);
      await query("DELETE FROM otp_tokens WHERE email = $1 AND type = $2", [
        email,
        type,
      ]);

      return res.status(200).json({
        status: "success",
        message: "Password reset succefully",
      });
    } else {
      return res.status(400).json({
        status: "fail",
        error: "Invalid OTP",
        errorCode: 401,
      });
    }
  } catch (error) {
    logger.error("Error during Verification Code verification:", error);
    next(new AppError("OTP verification failed", 500));
  }
};

module.exports = { verifyOtpAndProcess };
