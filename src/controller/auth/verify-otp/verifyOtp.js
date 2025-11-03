const bcrypt = require("bcrypt");
const { query, pool } = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { logger } = require("../../../../utils/logger");
const { sendEmailNotification } = require("../../../../producer/notificationProducer");
const path = require("path");
const { minioClient } = require("../../../../config/minio");
const crypto = require("crypto");

const verifyOtpAndProcess = async (req, res, next) => {
  logger.info("OTP verification request received");

  try {
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

    logger.debug("Verification parameters received", {
      email,
      type,
      role
    });

    const decryptedPassword = encryptedPassword;
    const now = new Date();

    const otpResult = await query(
      `SELECT * FROM otp_tokens 
       WHERE email = $1 AND type = $2 AND expires_at > $3`,
      [email, type, now]
    );

    if (!otpResult.rows.length) {
      logger.warn("Invalid or expired OTP", { email });
      return res.status(400).json({
        status: "fail",
        message: "Invalid or expired OTP"
      });
    }

    const isOtpValid = await bcrypt.compare(otp, otpResult.rows[0].otp);
    if (!isOtpValid) {
      logger.warn("OTP mismatch");
      return res.status(400).json({
        status: "fail",
        message: "Invalid OTP"
      });
    }

    logger.info("OTP validated successfully");

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
          message: "Email already registered"
        });
      }

      const created_at = new Date();
      const { rows: userRows } = await query(
        `INSERT INTO users
        (user_email, user_role, user_password, user_name, created_at)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [email.toLowerCase(), role, hashedPassword, userName, created_at]
      );

      logger.info("User created in users table", { user_id: userRows[0].id });

      if (role === "freelancer") {
        if (!req.file) {
          logger.warn("Government ID missing during freelancer signup");
          return next(new AppError("Government ID required", 400));
        }

        const governmentBucket = "freelancer-documents";
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const objectName = `goverment-doc/${govIdType}/${fileName}`;
        const govIdUrl = `${process.env.MINIO_ENDPOINT}/assets/${governmentBucket}/${objectName}`;

        const clientConn = await pool.connect();

        try {
          await clientConn.query("BEGIN");

          logger.info("Uploading Gov ID to minio");
          await minioClient.putObject(
            governmentBucket,
            objectName,
            req.file.buffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
          );

          const { rows: freelancer } = await clientConn.query(
            `INSERT INTO freelancer (
              user_id, profile_title, gov_id_type, gov_id_url, first_name, last_name,
              date_of_birth, phone_number, created_at, updated_at, freelancer_full_name,
              freelancer_email, gov_id_number, niche
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            RETURNING freelancer_id`,
            [
              userRows[0].id,
              profileTitle,
              govIdType,
              govIdUrl,
              firstName,
              lastName,
              dateOfBirth,
              phoneNumber,
              created_at,
              created_at,
              `${firstName} ${lastName}`,
              email,
              govId,
              niche
            ]
          );

          const freelancerId = freelancer[0].freelancer_id;

          for (const service of serviceOffred) {
            await clientConn.query(
              `INSERT INTO services 
               (freelancer_id, service_name, created_at, updated_at)
               VALUES ($1,$2,$3,$4)`,
              [freelancerId, service, created_at, created_at]
            );
          }

          await clientConn.query("COMMIT");
          logger.info("Freelancer created successfully", { freelancerId });

        } catch (err) {
          await clientConn.query("ROLLBACK");
          await minioClient.removeObject(governmentBucket, objectName);
          logger.error("Freelancer register rollback", { err });
          throw err;
        } finally {
          clientConn.release();
        }
      }
      

      await query("DELETE FROM otp_tokens WHERE email=$1 AND type=$2", [email, type]);
      logger.info("OTP entry deleted after success");

      sendEmailNotification(
        email,
        `Welcome to Meetrub, ${userName}!`,
        `<p>Hello ${userName}, welcome!</p>`,
        false
      );

      return res.status(200).json({
        status: "success",
        message: "Signup successful"
      });
    }

    if (type === "password-reset") {
      logger.info("Processing password reset");
      if (!email || !encryptedPassword) {
        return next(new AppError('email or password is required', 400))
      }

      const { rowCount } = await query(
        `UPDATE users SET user_password=$1 WHERE user_email=$2`,
        [hashedPassword, email.toLowerCase()]
      );

      if (!rowCount) {
        logger.warn("Password reset failed — user not found");
        return res.status(404).json({
          status: "fail",
          message: "Email not found"
        });
      }

      await query("DELETE FROM otp_tokens WHERE email=$1 AND type=$2", [email, type]);

      return res.status(200).json({
        status: "success",
        message: "Password reset successful"
      });
    }

    logger.warn("Invalid type during OTP validation");
    return next(new AppError("Invalid OTP flow type", 400));

  } catch (error) {
    logger.error("OTP verification failed", { error });
    return next(new AppError("OTP verification failed", 500));
  }
};

module.exports = { verifyOtpAndProcess };
