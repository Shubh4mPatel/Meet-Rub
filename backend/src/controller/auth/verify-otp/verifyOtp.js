const bcrypt = require("bcrypt");
const { query, pool } = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { decryptId } = require("../../../../config/encryptDecryptId");
const { logger } = require("../../../../utils/logger");
const {
  sendEmailNotification,
} = require("../../../../producer/notificationProducer");
const path = require("path");
const { minioClient } = require("../../../../config/minio");
const Joi = require("joi");
const crypto = require("crypto");
const { validateFile } = require("../../../../utils/helper");

// Base schema for common fields
const baseSchema = {
  email: Joi.string().email().required(),
  otp: Joi.string().required(),
  type: Joi.string().valid("email-verification", "password-reset").required(),
  encryptedPassword: Joi.string().required(),
  role: Joi.string().valid("freelancer", "creator").optional(),
};

// Freelancer-specific schema
const freelancerSchema = Joi.object({
  ...baseSchema,
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  dateOfBirth: Joi.string().optional(), // comes as string from FormData
  profileTitle: Joi.string().optional(),
  serviceOffered: Joi.string().required(), // JSON stringified array
  niche: Joi.string().required(), // JSON stringified array
  govId: Joi.string().required(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  govIdType: Joi.string().required(),
});

// Creator-specific schema
const creatorSchema = Joi.object({
  ...baseSchema,
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  niche: Joi.string().required(), // JSON stringified array
  socialLinks: Joi.string().optional(), // JSON stringified array
});

// Password reset schema
const passwordResetSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().required(),
  type: Joi.string().valid("password-reset").required(),
  encryptedPassword: Joi.string().required(),
});

const verifyOtpAndProcess = async (req, res, next) => {
  let { email, otp, type, encryptedPassword, role } = req.body;

  email = email?.trim();
  otp = otp?.trim();

  try {
    // Validate based on type and role
    let validationError;

    if (type === "password-reset") {
      const { error } = passwordResetSchema.validate(req.body, { abortEarly: false });
      validationError = error;
    } else if (type === "email-verification") {
      if (role === "freelancer") {
        const { error } = freelancerSchema.validate(req.body, { abortEarly: false });
        validationError = error;
      } else if (role === "creator") {
        const { error } = creatorSchema.validate(req.body, { abortEarly: false });
        validationError = error;
      } else {
        return next(new AppError("Role is required for email verification", 400));
      }
    } else {
      return next(new AppError("Invalid type", 400));
    }

    if (validationError) {
      return next(new AppError(validationError.details.map((d) => d.message).join(", "), 400));
    }

    const decryptedPassword = encryptedPassword;
    const currentDateTime = new Date(Date.now());
    const currentTimestamp = new Date().toUTCString();

    // Verify OTP
    const otpRes = await query(
      "SELECT * FROM otp_tokens WHERE email = $1 AND type = $2 AND expires_at > $3",
      [email, type, currentDateTime]
    );

    if (otpRes.rows.length === 0) {
      return next(new AppError("Invalid or expired OTP", 400));
    }

    const isOtpValid = await bcrypt.compare(otp, otpRes.rows[0].otp);
    if (!isOtpValid) {
      return next(new AppError("Invalid OTP", 400));
    }

    const hashedPassword = await bcrypt.hash(decryptedPassword, 10);

    if (type === "email-verification") {
      logger.info("Performing user registration");

      const existingUser = await query(
        "SELECT id FROM users WHERE user_email=$1",
        [email]
      );

      if (existingUser.rows.length > 0) {
        logger.warn("Email already registered", { email });
        return next(new AppError("Email already registered", 400));
      }

      if (role === "freelancer") {
        const {
          firstName,
          lastName,
          dateOfBirth,
          profileTitle,
          serviceOffered,
          niche,
          govId,
          phoneNumber,
          govIdType,
        } = req.body;

        // Parse JSON strings from FormData
        const parsedServiceOffered = JSON.parse(serviceOffered);
        const parsedNiche = JSON.parse(niche);

        const userName = `${firstName} ${lastName}`;

        if (!req.file) {
          return next(new AppError("Document is required", 400));
        }

        const BUCKET_NAME = "meet-rub-assets";
        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = `freelancer/goverment-doc/${govIdType}`;
        const objectName = `${folder}/${fileName}`;
        const govIdUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const { rows: newUserResMeetRub } = await client.query(
            "INSERT INTO users (user_email, user_role, user_password, user_name, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [email.toLowerCase(), role, hashedPassword, userName, currentTimestamp]
          );

          await client.query(
            "DELETE FROM otp_tokens WHERE email = $1 AND type = $2",
            [email, type]
          );

          await minioClient.putObject(
            BUCKET_NAME,
            objectName,
            req.file.buffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
          );

          const { rows: freelancer } = await client.query(
            `INSERT INTO freelancer 
            (user_id, profile_title, gov_id_type, gov_id_url, first_name, last_name, 
             date_of_birth, phone_number, created_at, updated_at, freelancer_full_name, 
             freelancer_email, gov_id_number, niche)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
              newUserResMeetRub[0].id,
              profileTitle,
              govIdType,
              govIdUrl,
              firstName,
              lastName,
              dateOfBirth || null,
              phoneNumber || null,
              currentDateTime,
              currentDateTime,
              userName,
              email,
              govId,
              parsedNiche,
            ]
          );

          for (const service of parsedServiceOffered) {
            await client.query(
              "INSERT INTO services (freelancer_id, services_name, created_at, updated_at) VALUES ($1, $2, $3, $4)",
              [freelancer[0].freelancer_id, service, currentTimestamp, currentTimestamp]
            );
          }

          await client.query("COMMIT");
          logger.info("Freelancer registration successful", { email });
        } catch (error) {
          await client.query("ROLLBACK");
          try {
            await minioClient.removeObject(BUCKET_NAME, objectName);
            console.log("Rolled back MinIO upload due to database error");
          } catch (minioError) {
            console.error("Failed to cleanup MinIO object:", minioError);
          }
          throw error;
        } finally {
          client.release();
        }
      } else if (role === "creator") {
        const { firstName, lastName, niche, socialLinks } = req.body;

        // Parse JSON strings from FormData
        const parsedNiche = JSON.parse(niche);
        const parsedSocialLinks = socialLinks ? JSON.parse(socialLinks) : null;

        const userName = `${firstName} ${lastName}`;

        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          const { rows: newUserResMeetRub } = await client.query(
            "INSERT INTO users (user_email, user_role, user_password, user_name, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [email.toLowerCase(), role, hashedPassword, userName, currentTimestamp]
          );

          await client.query(
            "DELETE FROM otp_tokens WHERE email = $1 AND type = $2",
            [email, type]
          );

          await client.query(
            `INSERT INTO creators 
            (user_id, first_name, last_name, niche, social_links, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
              newUserResMeetRub[0].id,
              firstName,
              lastName,
              parsedNiche,
              parsedSocialLinks ? JSON.stringify(parsedSocialLinks) : null,
              currentDateTime,
              currentDateTime,
            ]
          );

          await client.query("COMMIT");
          logger.info("Creator registration successful", { email });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }

      return res.status(200).json({
        status: "success",
        message: "Signup successful",
      });
    } else if (type === "password-reset") {
      const userRes = await query("SELECT * FROM users WHERE user_email = $1", [
        email,
      ]);
      if (userRes.rows.length === 0) {
        return next(new AppError("Email not found", 404));
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
        message: "Password reset successfully",
      });
    }
  } catch (error) {
    logger.error("Error during Verification Code verification:", error);
    next(new AppError("OTP verification failed", 500));
  }
};

module.exports = { verifyOtpAndProcess };