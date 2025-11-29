const bcrypt = require("bcrypt");
const { query,pool } = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { decryptId } = require("../../../../config/encryptDecryptId");
const { logger } = require("../../../../utils/logger");
const {
  sendEmailNotification,
} = require("../../../../producer/notificationProducer");
const path = require("path"); // CommonJS
const { minioClient } = require("../../../../config/minio");
const Joi = require("joi"); // Add Joi for validation

// Define validation schema
const verifyOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().required(),
  type: Joi.string().valid("email-verification", "password-reset").required(),
  encryptedPassword: Joi.string().required(),
  role: Joi.string().valid("freelancer", "creator").optional(),
  UserData: Joi.object({
    firstName: Joi.string().optional(),
    lastName: Joi.string().optional(),
    dateOfBirth: Joi.date().less("now").iso().optional(), // Must be a valid date in the past
    profileTitle: Joi.string().optional(),
    serviceOffred: Joi.array().items(Joi.string()).optional(),
    niche: Joi.array().items(Joi.string()).optional(), // Changed to array of strings
    govId: Joi.string().optional(),
    phoneNumber: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/) // Must be a valid E.164 phone number
      .optional(),
    govIdType: Joi.string().optional(),
  }).optional(),
});

const verifyOtpAndProcess = async (req, res, next) => {
  // Validate req.body
  console.log("hi");

  const { error } = verifyOtpSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      status: "fail",
      message: error.details.map((detail) => detail.message),
    });
  }

  let { email, otp, type, encryptedPassword, role } = req.body;
  const { UserData } = req.body;
  email = email?.trim();
  otp = otp?.trim();
  const userName = UserData.firstName + " " + UserData.lastName;
  const currentTimestamp = new Date().toUTCString();

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

      if (!role == "freelancer" || !role == "creator") {
        return next(new AppError("role does not exist"));
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

      if (role === "freelancer") {
        logger.info(userName);
        const {
          firstName,
          lastName,
          dateOfBirth,
          profileTitle,
          serviceOffred,
          niche,
          govId,
          phoneNumber,
          govIdType,
        } = UserData;
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
          await client.query("BEGIN");

          

          const { rows: newUserResMeetRub } = await client.query(
            "INSERT INTO users (user_email, user_role, user_password, user_name, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [
              email.toLowerCase(),
              role,
              hashedPassword,
              userName,
              currentTimestamp,
            ] 
          );

          await client.query("DELETE FROM otp_tokens WHERE email = $1 AND type = $2", [
            email,
            type,
          ]);

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
              newUserResMeetRub[0].id,
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
              "INSERT INTO services (freelancer_id, services_name, created_at, updated_at) VALUES ($1, $2, $3, $4)",
              [
                freelancer[0].freelancer_id,
                service,
                currentTimestamp,
                currentTimestamp,
              ]
            );
          }

          // Commit transaction
          
          logger.info("User registration successful", { email });
          
          // sendEmailNotification(
            //   email,
            //   userRegistrationSubject,
            //   userRegistrationHtml,
            //   false
            // );
            await client.query("COMMIT");
        } catch (error) {
          // Rollback transaction on error
          await client.query("ROLLBACK");

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
      } else if (role === "creator") {
        const { firstName, lastName, niche, bio, socialLinks } = UserData;

        // Validate required fields for creator
        if (!firstName || !lastName || !niche || !bio) {
          return next(new AppError("Missing required fields for creator", 400));
        }

        // Start transaction
        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const { rows: newUserResMeetRub } = await client.query(
            "INSERT INTO users (user_email, user_role, user_password, user_name, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [
              email.toLowerCase(),
              role,
              hashedPassword,
              userName,
              currentTimestamp,
            ] 
          );

          await client.query("DELETE FROM otp_tokens WHERE email = $1 AND type = $2", [
            email,
            type,
          ]);

          // Insert creator record
          const { rows: creator } = await client.query(
            `INSERT INTO creators 
            (
              user_id,
              first_name,
              last_name,
              niche,
              bio,
              social_links,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
              newUserResMeetRub[0].id,
              firstName,
              lastName,
              niche,
              bio,
              socialLinks || null,
              currentDateTime,
              currentDateTime,
            ]
          );

          // Commit transaction
          
          logger.info("Creator registration successful", { email });
          // userRegistrationSubject
          
          // sendEmailNotification(
            //   email,
            //   userRegistrationSubject,
            //   userRegistrationHtml,
            //   false
            // );

            await client.query("COMMIT");
        } catch (error) {
          // Rollback transaction on error
          await client.query("ROLLBACK");
          throw error; // Re-throw to be handled by error middleware
        } finally {
          client.release();
        }
      }

      await query("DELETE FROM otp_tokens WHERE email=$1 AND type=$2", [
        email,
        type,
      ]);
      logger.info("OTP entry deleted after success");

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
