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
  //role,password,otp,type,email
  let {
    email,
    otp,
    type,
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
      logger.info("Performing user registration");

      if (!role == 'freelancer' || !role == 'creator') {
        return next(new AppError('role does not exist'))
      }
      const existingUser = await query(
        "SELECT id FROM users WHERE user_email=$1",
        [email]
      );

      if (existingUser.rows.length > 0) {
        logger.warn("Email already registered", { email });
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
      

      await query("DELETE FROM otp_tokens WHERE email=$1 AND type=$2", [email, type]);
      logger.info("OTP entry deleted after success");

      sendEmailNotification(
        email,
        userRegistrationSubject,
        userRegistrationHtml,
        false
      );

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
