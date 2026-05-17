const bcrypt = require("bcrypt");
const { query, pool } = require("../../../../config/dbConfig");
const AppError = require("../../../../utils/appError");
const { logger } = require("../../../../utils/logger");
const path = require("path");
const { minioClient } = require("../../../../config/minio");
const Joi = require("joi");
const crypto = require("crypto");
const { generateTokens } = require("../../../../utils/helper");
const { sendWelcomeEmail, sendAdminNewUserEmail } = require("../../../../utils/welcomeEmail");
const redisClient = require("../../../../config/reddis");
const { INDIAN_STATES } = require("../../../../utils/indianStates");

const USERNAMES_SET_KEY = "usernames:set";

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
  role: Joi.string().valid("freelancer").required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  userName: Joi.string().required(),
  dateOfBirth: Joi.string().optional(), // comes as string from FormData
  profileTitle: Joi.string().optional(),
  serviceOffered: Joi.string().required(), // JSON stringified array
  niche: Joi.string().required(), // JSON stringified array
  govId: Joi.string().required(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  govIdType: Joi.string().required(),
  panCardNumber: Joi.string()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .custom((value, helpers) => {
      // 4th character must be 'P' for individuals (Razorpay requirement)
      if (value.charAt(3) !== 'P') {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .required()
    .messages({
      'string.pattern.base': 'PAN must be in format: AAAPL1234C',
      'any.invalid': 'Invalid PAN format for individual. The 4th character must be "P".'
    }),
  // Address fields (required for Razorpay Routes onboarding)
  streetAddress: Joi.string().min(10).max(255).required().messages({
    'string.min': 'Street address must be at least 10 characters long',
    'any.required': 'Street address is required'
  }),
  city: Joi.string().min(2).max(100).required(),
  state: Joi.string().valid(...INDIAN_STATES.map(s => s.name)).required().messages({
    'any.only': 'Please select a valid Indian state'
  }),
  postalCode: Joi.string().pattern(/^\d{6}$/).required().messages({
    'string.pattern.base': 'Postal code must be exactly 6 digits',
    'any.required': 'Postal code is required'
  }),
});

// Creator-specific schema
const creatorSchema = Joi.object({
  ...baseSchema,
  role: Joi.string().valid("creator").required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  userName: Joi.string().required(),
  phoneNo: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  niche: Joi.string().required(), // JSON stringified array
  socialLinks: Joi.string().required().custom((value, helpers) => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return helpers.error('any.invalid');
      }
      // Check if at least one social link has a non-empty URL
      const hasValidLink = parsed.some(link => link && link.url && link.url.trim() !== '');
      if (!hasValidLink) {
        return helpers.error('any.invalid');
      }
      return value;
    } catch (error) {
      return helpers.error('any.invalid');
    }
  }, 'Social links validation').messages({
    'any.required': 'At least one social link is required',
    'any.invalid': 'At least one valid social link with URL is required'
  })
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

  email = email?.trim().toLowerCase();
  otp = otp?.trim();

  try {
    // Validate based on type and role
    let validationError;
    let user;
    let roleWiseId;
    if (type === "password-reset") {
      const { error } = passwordResetSchema.validate(req.body, {
        abortEarly: false,
      });
      validationError = error;
    }
    else if (type === "email-verification") {

      if (role === "freelancer") {
        const { error } = freelancerSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      } else if (role === "creator") {
        const { error } = creatorSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      } else {
        return next(
          new AppError("Role is required for email verification", 400)
        );
      }
    }
    else {
      return next(new AppError("Invalid type", 400));
    }

    if (validationError) {
      return next(
        new AppError(
          validationError.details.map((d) => d.message).join(", "),
          400
        )
      );
    }

    const decryptedPassword = encryptedPassword;
    const currentDateTime = new Date(Date.now());
    const currentTimestamp = new Date().toUTCString();

    // Verify OTP
    const debugRes = await query(
      "SELECT email, type, expires_at FROM otp_tokens WHERE email = $1",
      [email]
    );
    logger.info(`[OTP debug] looking for email="${email}" type="${type}" | rows in DB: ${JSON.stringify(debugRes.rows)}`);

    const otpRes = await query(
      "SELECT * FROM otp_tokens WHERE email = $1 AND type = $2 AND expires_at > NOW()",
      [email, type]
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
        let {
          firstName,
          lastName,
          dateOfBirth,
          profileTitle,
          serviceOffered,
          userName,
          niche,
          govId,
          phoneNumber,
          govIdType,
          panCardNumber,
          streetAddress,
          city,
          state,
          postalCode,
        } = req.body;

        // Convert PAN to uppercase for validation
        if (panCardNumber) {
          panCardNumber = panCardNumber.toUpperCase().trim();
        }

        // Parse JSON strings from FormData
        const parsedServiceOffered = JSON.parse(serviceOffered);
        const parsedNiche = JSON.parse(niche);

        const fullName = `${firstName} ${lastName}`;

        // Check username availability in Redis before starting the transaction
        const isUsernameTaken = await redisClient.sIsMember(USERNAMES_SET_KEY, userName);
        if (isUsernameTaken) {
          return next(new AppError("Username already taken", 400));
        }

        const govIdFile = req.files?.govIdImage?.[0];
        const panCardFile = req.files?.panCardImage?.[0];

        if (!govIdFile) {
          return next(new AppError("Government ID document is required", 400));
        }

        if (!panCardFile) {
          return next(new AppError("PAN card image is required", 400));
        }

        if (!panCardNumber) {
          return next(new AppError("PAN card number is required", 400));
        }

        const BUCKET_NAME = "meet-rub-assets";
        const fileExt = path.extname(govIdFile.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = `freelancer/goverment-doc/${govIdType}`;
        const objectName = `${folder}/${fileName}`;
        const govIdUrl = `${BUCKET_NAME}/${objectName}`;

        const panFileExt = path.extname(panCardFile.originalname);
        const panFileName = `${crypto.randomUUID()}${panFileExt}`;
        const panObjectName = `freelancer/pan-card/${panFileName}`;
        const panCardImageUrl = `${BUCKET_NAME}/${panObjectName}`;

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

          await client.query(
            "DELETE FROM otp_tokens WHERE email = $1 AND type = $2",
            [email, type]
          );

          try {
            await minioClient.putObject(
              BUCKET_NAME,
              objectName,
              govIdFile.buffer,
              govIdFile.size,
              { "Content-Type": govIdFile.mimetype }
            );
            await minioClient.putObject(
              BUCKET_NAME,
              panObjectName,
              panCardFile.buffer,
              panCardFile.size,
              { "Content-Type": panCardFile.mimetype }
            );
          } catch (s3Err) {
            logger.error(`MinIO upload failed — code: ${s3Err.code} message: ${s3Err.message}`);
            throw s3Err;
          }

          const { rows: freelancer } = await client.query(
            `INSERT INTO freelancer
            (user_id, profile_title, gov_id_type, gov_id_url, first_name, last_name,
             date_of_birth, phone_number, created_at, updated_at, freelancer_full_name,
             freelancer_email, gov_id_number, niche, verification_status, user_name, interested_service,
             pan_card_number, pan_card_image_url, street_address, city, state, postal_code)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'PENDING', $15, $16, $17, $18, $19, $20, $21, $22)
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
              fullName,
              email,
              govId,
              parsedNiche,
              userName,
              parsedServiceOffered,
              panCardNumber,
              panCardImageUrl,
              streetAddress,
              city,
              state,
              postalCode,
            ]
          );

          // Add username to Redis before committing — rollback PG if Redis fails
          await redisClient.sAdd(USERNAMES_SET_KEY, userName);

          await client.query("COMMIT");
          user = newUserResMeetRub[0];
          roleWiseId = freelancer[0].freelancer_id;
          logger.info("Freelancer registration successful", { email });
          sendWelcomeEmail('freelancer', email, userName).catch((err) =>
            logger.error('Failed to send freelancer welcome email:', err)
          );
          sendAdminNewUserEmail('freelancer', userName, email, currentTimestamp, req.ip).catch((err) =>
            logger.error('Failed to send admin new-user email:', err)
          );
        } catch (error) {
          await client.query("ROLLBACK");
          // Clean up Redis username if it was already added before the commit failed
          try {
            await redisClient.sRem(USERNAMES_SET_KEY, userName);
          } catch (redisError) {
            console.error("Failed to cleanup Redis username:", redisError);
          }
          try {
            await minioClient.removeObject(BUCKET_NAME, objectName);
            await minioClient.removeObject(BUCKET_NAME, panObjectName);
            console.log("Rolled back MinIO uploads due to database error");
          } catch (minioError) {
            console.error("Failed to cleanup MinIO object:", minioError);
          }
          throw error;
        } finally {
          client.release();
        }
      } else if (role === "creator") {
        const { firstName, lastName, niche, socialLinks, phoneNo, userName } = req.body;

        // Parse JSON strings from FormData
        const parsedNiche = JSON.parse(niche);
        const parsedSocialLinks = socialLinks ? JSON.parse(socialLinks) : null;

        // const userName = `${firstName} ${lastName}`;

        // Check username availability in Redis before starting the transaction
        const isUsernameTaken = await redisClient.sIsMember(USERNAMES_SET_KEY, userName);
        if (isUsernameTaken) {
          return next(new AppError("Username already taken", 400));
        }

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

          await client.query(
            "DELETE FROM otp_tokens WHERE email = $1 AND type = $2",
            [email, type]
          );

          const { rows: creator } = await client.query(
            `INSERT INTO creators
            (user_id,full_name , first_name, last_name, niche, social_links, phone_number, email, created_at, updated_at,user_name)
            VALUES ($1, $2, $3, $4, $5, $6, $7,$8, $9, $10, $11)
            RETURNING *`,
            [
              newUserResMeetRub[0].id,
              firstName + " " + lastName,
              firstName,
              lastName,
              parsedNiche,
              parsedSocialLinks ? JSON.stringify(parsedSocialLinks) : null,
              phoneNo || null,
              email.toLowerCase(),
              currentDateTime,
              currentDateTime,
              userName,
            ]
          );

          // Add username to Redis before committing — rollback PG if Redis fails
          await redisClient.sAdd(USERNAMES_SET_KEY, userName);

          await client.query("COMMIT");
          user = newUserResMeetRub[0];
          roleWiseId = creator[0].creator_id;
          logger.info("Creator registration successful", { email });
          sendWelcomeEmail('creator', email, userName).catch((err) =>
            logger.error('Failed to send creator welcome email:', err)
          );
          sendAdminNewUserEmail('creator', userName, email, currentTimestamp, req.ip).catch((err) =>
            logger.error('Failed to send admin new-user email:', err)
          );
        } catch (error) {
          await client.query("ROLLBACK");
          // Clean up Redis username if it was already added before the commit failed
          try {
            await redisClient.sRem(USERNAMES_SET_KEY, userName);
          } catch (redisError) {
            console.error("Failed to cleanup Redis username:", redisError);
          }
          throw error;
        } finally {
          client.release();
        }
      }

      const { accessToken, refreshToken } = generateTokens(user, roleWiseId);

      res.locals.accessToken = accessToken;
      res.locals.refreshToken = refreshToken;
      res.locals.user = {
        user_id: user.id,
        email: user.user_email,
        name: user.user_name,
        role: user.user_role,
        roleWiseId
      };
      return next();

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
