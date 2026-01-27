const AppError = require("../../../utils/appError");
const { query } = require("../../../config/dbConfig");
const { minioClient } = require("../../../config/minio");
const path = require("path");
const crypto = require("crypto");
const { logger } = require("../../../utils/logger");
const { createPresignedUrl } = require("../../../utils/helper");
const Joi = require("joi");

const BUCKET_NAME = "meet-rub-assets";
const expirySeconds = 4 * 60 * 60; // 4 hours

// ✅ GET USER PROFILE
const getUserProfile = async (req, res, next) => {
  logger.info("Fetching user profile");
  try {
    const user = req.user;
    logger.debug("Decoded User:", user);
    const role = user.role;
    const type = req.query.type;
    logger.info(`Profile fetch type: ${type}, User role: ${role}`);

    if (!type) {
      logger.warn("Missing type parameter");
      return next(new AppError("type parameter is required", 400));
    }

    // ✅ CREATOR ROLE HANDLING
    if (role === "creator") {
      if (type === "basicInfo") {
        logger.info("Fetching: Creator Basic Info");
        const { rows } = await query(
          "SELECT full_name, first_name, last_name, phone_number, email, social_platform_type, social_links, niche,created_at FROM creators WHERE user_id = $1",
          [user.user_id]
        );

        if (!rows[0]) {
          logger.warn("No creator basic info found");
          return next(new AppError("Creator profile not found", 404));
        }

        return res.status(200).json({
          status: "success",
          message: "Creator basic info fetched successfully",
          data: { first_name: rows[0].first_name, last_name: rows[0].last_name, full_name: rows[0].full_name, phone_number: rows[0].phone_number, email: rows[0].email, social_links: rows[0].social_links, niche: rows[0].niche, joined_at: rows[0].created_at },
        });
      }
      if (type === "profileImage") {
        logger.info("Fetching: creator Profile Image", user);
        const { rows } = await query(
          "SELECT profile_image_url FROM creators WHERE user_id = $1",
          [user.user_id]
        );

        logger.debug("Profile Image Query Result:", rows[0]);
        if (!rows[0]?.profile_image_url) {
          logger.warn("Profile image not uploaded");
          return next(new AppError("No profile image found", 404));
        }

        logger.info(
          "Generating presigned URL for profile image",
          rows[0].profile_image_url
        );
        const parts = rows[0].profile_image_url.split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");

        const signedUrl = await createPresignedUrl(
          bucketName,
          objectName,
          expirySeconds
        );
        logger.info("Presigned URL generated successfully", signedUrl);
        return res.status(200).json({
          status: "success",
          message: "Profile image fetched successfully",
          data: { userProfileImage: signedUrl },
        });
      }

      // Creators don't have profile images, govt ID, or bank details in the creators table
      // Return appropriate error messages for unsupported types
      if (type === "govtId" || type === "bankDetails") {
        logger.warn(`Type ${type} not supported for creator role`);
        return next(new AppError(`${type} is not available for creators`, 400));
      }

      logger.warn("Invalid type parameter for creator:", type);
      return next(new AppError("Invalid type parameter for creator", 400));
    }

    // ✅ FREELANCER ROLE HANDLING
    if (role === "freelancer") {
      if (type === "basicInfo") {
        logger.info("Fetching: Freelancer Basic Info");
        const { rows } = await query(
          "SELECT freelancer_full_name, first_name, last_name, date_of_birth, phone_number, profile_title,freelancer_thumbnail_image, freelancer_email,created_at FROM freelancer WHERE user_id = $1",
          [user.user_id]
        );

        if (!rows[0]) {
          logger.warn("No freelancer basic info found");
          return next(new AppError("Freelancer profile not found", 404));
        }

        // Generate presigned URL for thumbnail image if it exists
        if (rows[0].freelancer_thumbnail_image) {
          try {
            logger.info(
              "Generating presigned URL for thumbnail image",
              rows[0].freelancer_thumbnail_image
            );
            const parts = rows[0].freelancer_thumbnail_image.split("/");
            const bucketName = parts[0];
            const objectName = parts.slice(1).join("/");

            logger.debug(
              `Generating presigned URL for bucket: ${bucketName}, object: ${objectName}`
            );

            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );

            rows[0].freelancer_thumbnail_image = signedUrl;
          } catch (error) {
            logger.error(
              `Failed to generate presigned URL for thumbnail: ${error.message}`
            );
            // Keep the original URL or set to null
            rows[0].freelancer_thumbnail_image = null;
          }
        }

        return res.status(200).json({
          status: "success",
          message: "Freelancer basic info fetched successfully",
          data: { first_name: rows[0].first_name, last_name: rows[0].last_name, full_name: rows[0].freelancer_full_name, date_of_birth: rows[0].date_of_birth, phone_number: rows[0].phone_number, profile_title: rows[0].profile_title, freelancer_thumbnail_image: rows[0].freelancer_thumbnail_image, email: rows[0].freelancer_email, joined_at: rows[0].created_at },
        });
      }

      if (type === "profileImage") {
        logger.info("Fetching: Freelancer Profile Image", user);
        const { rows } = await query(
          "SELECT profile_image_url FROM freelancer WHERE user_id = $1",
          [user.user_id]
        );
        logger.debug("Profile Image Query Result:", rows[0]);
        if (!rows[0]?.profile_image_url) {
          logger.warn("Profile image not uploaded");
          return next(new AppError("No profile image found", 404));
        }

        logger.info(
          "Generating presigned URL for profile image",
          rows[0].profile_image_url
        );
        const parts = rows[0].profile_image_url.split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");

        const signedUrl = await createPresignedUrl(
          bucketName,
          objectName,
          expirySeconds
        );

        return res.status(200).json({
          status: "success",
          message: "Profile image fetched successfully",
          data: { userProfileImage: signedUrl },
        });
      }

      if (type === "govtId") {
        logger.info("Fetching: Freelancer Govt ID");
        const { rows } = await query(
          "SELECT gov_id_type, gov_id_url, gov_id_number FROM freelancer WHERE user_id = $1",
          [user.user_id]
        );

        if (!rows[0]?.gov_id_url) {
          logger.warn("Gov ID not uploaded");
          return next(new AppError("No govt ID found", 404));
        }

        const parts = rows[0].gov_id_url.split("/");
        const bucketName = parts[0];
        const objectName = parts.slice(1).join("/");

        const signedUrl = await createPresignedUrl(
          bucketName,
          objectName,
          expirySeconds
        );

        return res.status(200).json({
          status: "success",
          message: "Govt ID fetched successfully",
          data: {
            userGovtIdUrl: signedUrl,
            userGovtIdType: rows[0]?.gov_id_type,
            userGovtIdNumber: rows[0]?.gov_id_number,
          },
        });
      }

      if (type === "bankDetails") {
        logger.info("Fetching: Freelancer Bank Details");
        const { rows } = await query(
          "SELECT bank_account_no,bank_account_holder_name, bank_name, bank_ifsc_code, bank_branch_name FROM freelancer WHERE user_id=$1",
          [user.user_id]
        );

        if (!rows[0]) {
          logger.warn("No bank details found");
          return next(new AppError("No bank details found", 404));
        }

        return res.status(200).json({
          status: "success",
          message: "Bank details fetched successfully",
          data: { userBankDetails: rows[0] },
        });
      }

      logger.warn("Invalid type parameter for freelancer:", type);
      return next(new AppError("Invalid type parameter for freelancer", 400));
    }

    // If role is neither creator nor freelancer
    logger.warn("Unsupported user role:", role);
    return next(new AppError("Unsupported user role", 400));
  } catch (error) {
    logger.error("Error fetching profile:", error);
    return next(new AppError("Failed to get user profile", 500));
  }
};

// Validation Schemas
const freelancerGovInfoSchema = Joi.object({
  type: Joi.string().valid("govtId").required(),
  gov_id_type: Joi.string().required(),
  gov_id_number: Joi.string().required(),
});

const freelancerBankDetailsSchema = Joi.object({
  type: Joi.string().valid("bankDetails").required(),
  bank_account_no: Joi.string().required(),
  bank_name: Joi.string().required(),
  bank_ifsc_code: Joi.string().required(),
  bank_branch_name: Joi.string().required(),
  bank_account_holder_name: Joi.string().required(),
});

const freelancerBasicInfoSchema = Joi.object({
  type: Joi.string().valid("basicInfo").required(),
  first_name: Joi.string().required(),
  last_name: Joi.string().required(),
  email: Joi.string().email().required(),
  freelancerFullName: Joi.string().required(),
  dateOfBirth: Joi.string().required(),
  phoneNumber: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .required(),
  profileTitle: Joi.string().required(),
  thumbnailImageUrl: Joi.string().optional().allow(""),
});

const ProfileImageSchema = Joi.object({
  type: Joi.string().valid("profileImage").required(),
});

const creatorBasicInfoSchema = Joi.object({
  type: Joi.string().valid("basicInfo").required(),
  first_name: Joi.string().required(),
  last_name: Joi.string().required(),
  full_name: Joi.string().optional(),
  phone_number: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .required(),
  social_links: Joi.object().optional().allow(null, ""),
  niche: Joi.array().items(Joi.string()).optional()
});

// ✅ EDIT USER PROFILE
const editProfile = async (req, res, next) => {
  logger.info("Updating user profile");
  try {
    const user = req.user;
    const role = user.role;
    const { type } = req.body;

    // Handle file from upload.any() - convert req.files array to req.file
    if (req.files && req.files.length > 0) {
      req.file = req.files[0]; // Get the first file
      logger.debug(`File received: ${req.file.fieldname}`);
    }

    logger.debug("Edit request type:", type);
    logger.debug("User role:", role);
    logger.debug("Received Data:", req.body);

    if (!type) {
      logger.warn("Missing type for profile update");
      return next(new AppError("type is required", 400));
    }

    // Validate request based on role and type
    let validationError;
    if (role === "creator") {
      if (type === "basicInfo") {
        const { error } = creatorBasicInfoSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      }
      if (type === "profileImage") {
        const { error } = ProfileImageSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      }
    } else if (role === "freelancer") {
      if (type === "basicInfo") {
        const { error } = freelancerBasicInfoSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      } else if (type === "bankDetails") {
        const { error } = freelancerBankDetailsSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      } else if (type === "govtId") {
        const { error } = freelancerGovInfoSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      } else if (type === "profileImage") {
        const { error } = ProfileImageSchema.validate(req.body, {
          abortEarly: false,
        });
        validationError = error;
      }
    }

    if (validationError) {
      logger.warn("Validation failed:", validationError.details);
      return next(
        new AppError(
          validationError.details.map((d) => d.message).join(", "),
          400
        )
      );
    }

    // ✅ CREATOR ROLE HANDLING
    if (role === "creator") {
      if (type === "basicInfo") {
        logger.info("Updating Creator Basic Info");
        const {
          first_name,
          last_name,
          full_name,
          phone_number,
          social_links,
          niche,
          email,
        } = req.body;
        const nicheArray = Array.isArray(niche) ? niche : null;
        // Start transaction
        await query("BEGIN");
        try {
          const { rows } = await query(
            `UPDATE creators
             SET first_name=$1, last_name=$2, full_name=$3, phone_number=$4,
             social_links=$5, niche=$6::text[] , email=$7, updated_at=CURRENT_TIMESTAMP
             WHERE user_id=$8
             RETURNING first_name,email, last_name, full_name, phone_number, social_links, niche, created_at`,
            [
              first_name,
              last_name,
              full_name || `${first_name} ${last_name}`,
              phone_number,
              social_links || null,
              nicheArray,
              email,
              user.user_id,
            ]
          );

          if (!rows[0]) {
            await query("ROLLBACK");
            logger.warn("Creator not found for update");
            return next(new AppError("Creator profile not found", 404));
          }

          // Commit transaction
          await query("COMMIT");
          logger.info("Creator basic info updated successfully");
          return res.status(200).json({
            status: "success",
            message: "Creator profile updated successfully",
            data: { first_name: rows[0].first_name, last_name: rows[0].last_name, full_name: rows[0].full_name, phone_number: rows[0].phone_number, social_platform_type: rows[0].social_platform_type, social_links: rows[0].social_links, niche: rows[0].niche, email: rows[0].email, joined_at: rows[0].created_at },
          });
        } catch (error) {
          await query("ROLLBACK");
          throw error;
        }
      }
      if (type === "profileImage") {
        logger.info("Updating Freelancer Profile Image");

        // Validate only single file upload
        if (req.files && Array.isArray(req.files) && req.files.length > 1) {
          logger.warn("Multiple files uploaded, only single file allowed");
          return next(
            new AppError(
              "Only one profile image can be uploaded at a time",
              400
            )
          );
        }

        if (!req.file) {
          logger.warn("Profile image missing");
          return next(new AppError("Profile image required", 400));
        }

        // Validate that the file is an image
        if (!req.file.mimetype.startsWith("image/")) {
          logger.warn(
            "Invalid file type for profile image:",
            req.file.mimetype
          );
          return next(
            new AppError(
              "Profile image must be an image file (JPEG, PNG, GIF, etc.)",
              400
            )
          );
        }

        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = "creator/creator-profile-image";
        const objectName = `${folder}/${fileName}`;
        const profile_url = `${BUCKET_NAME}/${objectName}`;

        // Start transaction
        await query("BEGIN");
        try {
          await minioClient.putObject(
            BUCKET_NAME,
            objectName,
            req.file.buffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
          );

          await query(
            "UPDATE creators SET profile_image_url=$1 WHERE creator_id=$2",
            [profile_url, user.roleWiseId]
          );

          // Generate presigned URL for the uploaded image
          const signedUrl = await createPresignedUrl(
            BUCKET_NAME,
            objectName,
            expirySeconds
          );

          // Commit transaction
          await query("COMMIT");
          logger.info("Profile image updated successfully");
          return res.status(200).json({
            status: "success",
            message: "Profile image updated successfully",
            data: {
              profile_image_url: signedUrl,
            },
          });
        } catch (error) {
          await query("ROLLBACK");
          throw error;
        }
      }
      // Creators don't support other types
      logger.warn(`Type ${type} not supported for creator role`);
      return next(
        new AppError(
          `${type} is not available for creators. Only 'basicInfo' is supported.`,
          400
        )
      );
    }

    // ✅ FREELANCER ROLE HANDLING
    if (role === "freelancer") {
      if (type === "bankDetails") {
        logger.info("Updating Freelancer Bank Details");

        const {
          bank_account_no,
          bank_name,
          bank_ifsc_code,
          bank_branch_name,
          bank_account_holder_name,
        } = req.body;

        // Start transaction
        await query("BEGIN");
        try {
          const { rows } = await query(
            "UPDATE freelancer SET bank_account_no=$1, bank_name=$2, bank_ifsc_code=$3, bank_branch_name=$4, bank_account_holder_name = $5 WHERE user_id=$6 RETURNING *",
            [
              bank_account_no,
              bank_name,
              bank_ifsc_code,
              bank_branch_name,
              bank_account_holder_name,
              user.user_id,
            ]
          );

          // Commit transaction
          await query("COMMIT");
          logger.info("Bank details updated successfully");
          return res.status(200).json({
            status: "success",
            message: "Bank details updated successfully",
            data: rows[0],
          });
        } catch (error) {
          await query("ROLLBACK");
          throw error;
        }
      }
      if (type === "govtId") {
        logger.info("Updating Freelancer Govt ID");

        const { gov_id_type, gov_id_number } = req.body;

        // Validate only single file upload
        if (req.files && Array.isArray(req.files) && req.files.length > 1) {
          logger.warn("Multiple files uploaded, only single file allowed");
          return next(
            new AppError(
              "Only one government ID image can be uploaded at a time",
              400
            )
          );
        }

        if (!req.file) {
          logger.warn("Missing file for govt ID update");
          return next(new AppError("Government ID file is required", 400));
        }

        // Validate that the file is an image
        if (!req.file.mimetype.startsWith("image/")) {
          logger.warn("Invalid file type for govt ID:", req.file.mimetype);
          return next(
            new AppError(
              "Government ID must be an image file (JPEG, PNG, GIF, etc.)",
              400
            )
          );
        }

        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = `freelancer/goverment-doc/${gov_id_type}`;
        const objectName = `${folder}/${fileName}`;
        const gov_id_url = `${BUCKET_NAME}/${objectName}`;

        // Start transaction
        await query("BEGIN");
        try {
          await minioClient.putObject(
            BUCKET_NAME,
            objectName,
            req.file.buffer,
            req.file.size,
            {
              "Content-Type": req.file.mimetype,
            }
          );

          const { rows: freelancerGovInfo } = await query(
            "UPDATE freelancer SET gov_id_type=$1, gov_id_url=$2, gov_id_number=$3 WHERE user_id=$4 returning gov_id_type, gov_id_url, gov_id_number",
            [gov_id_type, gov_id_url, gov_id_number, user.user_id]
          );

          const signedUrl = await createPresignedUrl(
            BUCKET_NAME,
            objectName,
            expirySeconds
          );

          // Commit transaction
          await query("COMMIT");
          logger.info("Govt ID updated successfully");
          return res.status(200).json({
            status: "success",
            message: "Government ID updated successfully",
            data: freelancerGovInfo[0].gov_id_url
              ? { ...freelancerGovInfo[0], gov_id_url: signedUrl }
              : freelancerGovInfo[0],
          });
        } catch (error) {
          await query("ROLLBACK");
          throw error;
        }
      }
      if (type === "profileImage") {
        logger.info("Updating Freelancer Profile Image");

        // Validate only single file upload
        if (req.files && Array.isArray(req.files) && req.files.length > 1) {
          logger.warn("Multiple files uploaded, only single file allowed");
          return next(
            new AppError(
              "Only one profile image can be uploaded at a time",
              400
            )
          );
        }

        if (!req.file) {
          logger.warn("Profile image missing");
          return next(new AppError("Profile image required", 400));
        }

        // Validate that the file is an image
        if (!req.file.mimetype.startsWith("image/")) {
          logger.warn(
            "Invalid file type for profile image:",
            req.file.mimetype
          );
          return next(
            new AppError(
              "Profile image must be an image file (JPEG, PNG, GIF, etc.)",
              400
            )
          );
        }

        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = "freelancer/freelancer-profile-image";
        const objectName = `${folder}/${fileName}`;
        const profile_url = `${BUCKET_NAME}/${objectName}`;

        // Start transaction
        await query("BEGIN");
        try {
          await minioClient.putObject(
            BUCKET_NAME,
            objectName,
            req.file.buffer,
            req.file.size,
            { "Content-Type": req.file.mimetype }
          );

          await query(
            "UPDATE freelancer SET profile_image_url=$1 WHERE user_id=$2",
            [profile_url, user.user_id]
          );

          // Generate presigned URL for the uploaded image
          const signedUrl = await createPresignedUrl(
            BUCKET_NAME,
            objectName,
            expirySeconds
          );

          // Commit transaction
          await query("COMMIT");
          logger.info("Profile image updated successfully");
          return res.status(200).json({
            status: "success",
            message: "Profile image updated successfully",
            data: {
              profile_image_url: signedUrl,
            },
          });
        } catch (error) {
          await query("ROLLBACK");
          throw error;
        }
      }
      if (type === "basicInfo") {
        // ✅ FREELANCER BASIC DETAILS UPDATE
        logger.info("Updating Freelancer Basic Info");
        const {
          freelancerFullName,
          email,
          first_name,
          last_name,
          dateOfBirth,
          phoneNumber,
          profileTitle,
          thumbnailImageUrl,
        } = req.body;

        // Start transaction
        await query("BEGIN");
        try {
          // Check if thumbnail file needs to be uploaded
          let newThumbnailUrl = null;
          let signedUrl = null;

          // Fetch current thumbnail URL from database
          const { rows: currentData } = await query(
            "SELECT freelancer_thumbnail_image FROM freelancer WHERE user_id = $1",
            [user.user_id]
          );

          const currentThumbnailUrl =
            currentData[0]?.freelancer_thumbnail_image;

          // Validate only single file upload
          if (req.files && Array.isArray(req.files) && req.files.length > 1) {
            await query("ROLLBACK");
            logger.warn("Multiple files uploaded, only single file allowed");
            return next(
              new AppError(
                "Only one thumbnail image can be uploaded at a time",
                400
              )
            );
          }

          // Case 1: thumbnailImageUrl is empty/null - upload new file
          if (!thumbnailImageUrl || thumbnailImageUrl.trim() === "") {
            if (!req.file) {
              await query("ROLLBACK");
              logger.warn("No thumbnail URL provided and no file uploaded");
              return next(
                new AppError(
                  "Thumbnail file is required when thumbnail URL is empty",
                  400
                )
              );
            }

            // Validate that the file is an image
            if (!req.file.mimetype.startsWith("image/")) {
              await query("ROLLBACK");
              logger.warn(
                "Invalid file type for thumbnail:",
                req.file.mimetype
              );
              return next(
                new AppError(
                  "Thumbnail must be an image file (JPEG, PNG, GIF, etc.)",
                  400
                )
              );
            }

            logger.info(
              "No thumbnail URL provided, uploading new file to MinIO"
            );

            const fileExt = path.extname(req.file.originalname);
            const fileName = `${crypto.randomUUID()}${fileExt}`;
            const folder = "freelancer/freelancer-profile-thumbnail";
            const objectName = `${folder}/${fileName}`;
            newThumbnailUrl = `${BUCKET_NAME}/${objectName}`;

            // Upload to MinIO
            await minioClient.putObject(
              BUCKET_NAME,
              objectName,
              req.file.buffer,
              req.file.size,
              { "Content-Type": req.file.mimetype }
            );

            signedUrl = await createPresignedUrl(
              BUCKET_NAME,
              objectName,
              expirySeconds
            );
            logger.info("New thumbnail uploaded successfully to MinIO");
          }
          // Case 2: thumbnailImageUrl is provided
          else {
            // Check if thumbnail URL is different from the one in DB
            if (currentThumbnailUrl !== thumbnailImageUrl) {
              // URL has changed, check if file is uploaded
              if (!req.file) {
                await query("ROLLBACK");
                logger.warn("Thumbnail URL changed but no file uploaded");
                return next(
                  new AppError(
                    "Thumbnail file is required when URL changes",
                    400
                  )
                );
              }

              // Validate that the file is an image
              if (!req.file.mimetype.startsWith("image/")) {
                await query("ROLLBACK");
                logger.warn(
                  "Invalid file type for thumbnail:",
                  req.file.mimetype
                );
                return next(
                  new AppError(
                    "Thumbnail must be an image file (JPEG, PNG, GIF, etc.)",
                    400
                  )
                );
              }

              logger.info(
                "Thumbnail URL changed, replacing old file with new one"
              );

              // Delete old thumbnail from MinIO if it exists
              if (currentThumbnailUrl) {
                try {
                  const parts = currentThumbnailUrl.split("/");
                  if (parts.length >= 4) {
                    const oldBucketName = parts[2];
                    const oldObjectName = parts.slice(3).join("/");
                    await minioClient.removeObject(
                      oldBucketName,
                      oldObjectName
                    );
                    logger.info("Old thumbnail deleted from MinIO");
                  }
                } catch (deleteError) {
                  logger.warn("Failed to delete old thumbnail:", deleteError);
                  // Continue with upload even if delete fails
                }
              }

              // Upload new thumbnail
              const fileExt = path.extname(req.file.originalname);
              const fileName = `${crypto.randomUUID()}${fileExt}`;
              const folder = "freelancer/freelancer-profile-thumbnail";
              const objectName = `${folder}/${fileName}`;
              newThumbnailUrl = `${BUCKET_NAME}/${objectName}`;

              // Upload to MinIO
              await minioClient.putObject(
                BUCKET_NAME,
                objectName,
                req.file.buffer,
                req.file.size,
                { "Content-Type": req.file.mimetype }
              );

              signedUrl = await createPresignedUrl(
                BUCKET_NAME,
                objectName,
                expirySeconds
              );
              logger.info("New thumbnail uploaded successfully to MinIO");
            } else {
              logger.info("Thumbnail URL unchanged, skipping upload");
            }
          }

          // Update database with or without new thumbnail URL
          let updateQuery, updateParams;
          if (newThumbnailUrl) {
            updateQuery = `UPDATE freelancer SET freelancer_full_name=$1, date_of_birth=$2, phone_number=$3, profile_title=$4, freelancer_thumbnail_image=$5,first_name=$6, last_name=$7, freelancer_email=$8 WHERE user_id=$9
             RETURNING freelancer_full_name,first_name,last_name, freelancer_email, date_of_birth, phone_number, profile_title, freelancer_thumbnail_image,created_at`;
            updateParams = [
              freelancerFullName,
              dateOfBirth,
              phoneNumber,
              profileTitle,
              newThumbnailUrl,
              first_name,
              last_name,
              email,
              user.user_id,
            ];
          } else {
            updateQuery = `UPDATE freelancer SET freelancer_full_name=$1, date_of_birth=$2, phone_number=$3, profile_title=$4 , first_name =$5 , last_name =$6 , freelancer_email=$7 WHERE user_id=$8
             RETURNING freelancer_full_name, first_name, last_name, freelancer_email, date_of_birth, phone_number, profile_title, freelancer_thumbnail_image,created_at`;
            updateParams = [
              freelancerFullName,
              dateOfBirth,
              phoneNumber,
              profileTitle,
              first_name,
              last_name,
              email,
              user.user_id,
            ];
          }

          const { rows } = await query(updateQuery, updateParams);

          // Commit transaction
          await query("COMMIT");
          logger.info("Freelancer basic info updated successfully");
          return res.status(200).json({
            status: "success",
            message: "Profile updated successfully",
            data: { full_name: rows[0].freelancer_full_name, first_name: rows[0].first_name, last_name: rows[0].last_name, email: rows[0].freelancer_email, date_of_birth: rows[0].date_of_birth, phone_number: rows[0].phone_number, profile_title: rows[0].profile_title, freelancer_thumbnail_image: signedUrl || rows[0].freelancer_thumbnail_image, joined_at: rows[0].created_at }
          });
        } catch (error) {
          await query("ROLLBACK");
          throw error;
        }
      }

      logger.warn("Invalid type parameter for freelancer:", type);
      return next(new AppError("Invalid type parameter for freelancer", 400));
    }

    // If role is neither creator nor freelancer
    logger.warn("Unsupported user role:", role);
    return next(new AppError("Unsupported user role", 400));
  } catch (error) {
    logger.error("Error updating profile:", error);
    return next(new AppError("Failed to edit user profile", 500));
  }
};

// ✅ GET ALL FREELANCERS WITH PAGINATION, SEARCH AND FILTERS
const getAllFreelancers = async (req, res, next) => {
  logger.info("Fetching all freelancers with filters");
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Search and filter parameters
    const search = req.query.search || ""; // Search by freelancer name
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Number.MAX_SAFE_INTEGER;
    // Handle serviceType as an array
    const serviceTypes = req.query.serviceType
      ? Array.isArray(req.query.serviceType)
        ? req.query.serviceType
        : [req.query.serviceType]
      : [];

    // Sort and delivery time filters
    const sortBy = req.query.sortBy || "newest"; // toprated, newest
    const deliveryTime = req.query.deliveryTime || ""; // e.g., "2-3 days"
    // const type = req.query.type || "all"; // e.g., "all", "featured", etc.

    // Build the query based on filters
    let queryText = `
      SELECT
        f.freelancer_id,
        f.freelancer_full_name,
        f.profile_title,
        f.profile_image_url,
        f.freelancer_thumbnail_image,
        f.rating,
        ARRAY_AGG(DISTINCT s.service_name) FILTER (WHERE s.service_name IS NOT NULL) as service_names,
        MIN(s.service_price) as lowest_price
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1 and f.verification_status = 'VERIFIED' and f.is_active = true
    `;

    const queryParams = [];
    let paramCount = 1;

    // Add search condition
    if (search) {
      queryText += ` AND f.freelancer_full_name ILIKE $${paramCount}`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add service type filter (using IN clause for array)
    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${paramCount + index}`)
        .join(",");
      queryText += ` AND s.service_name IN (${serviceTypeParams})`;
      queryParams.push(...serviceTypes);
      paramCount += serviceTypes.length;
    }

    // Add price range filter
    queryText += ` AND (s.service_price >= $${paramCount} AND s.service_price <= $${paramCount + 1
      })`;
    queryParams.push(minPrice, maxPrice);
    paramCount += 2;

    // Add delivery time filter
    if (deliveryTime) {
      queryText += ` AND s.delivery_time = $${paramCount}`;
      queryParams.push(deliveryTime);
      paramCount++;
    }

    // Add GROUP BY clause
    queryText += ` GROUP BY f.freelancer_id, f.freelancer_full_name, f.profile_title, f.profile_image_url, f.freelancer_thumbnail_image, f.rating`;

    // Add sorting based on sortBy parameter
    let orderByClause = "";
    switch (sortBy) {
      case "toprated":
        orderByClause =
          " ORDER BY f.rating DESC NULLS LAST, f.freelancer_full_name";
        break;
      case "newest":
      default:
        orderByClause =
          " ORDER BY MAX(s.created_at) DESC NULLS LAST, f.freelancer_full_name";
        break;
    }

    // Add pagination
    queryText += `${orderByClause} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    // Get total count for pagination (count distinct freelancers)
    let countQuery = `
      SELECT COUNT(DISTINCT f.freelancer_id) as count
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1
    `;

    const countParams = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND f.freelancer_full_name ILIKE $${countParamIndex}`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${countParamIndex + index}`)
        .join(",");
      countQuery += ` AND s.service_name IN (${serviceTypeParams})`;
      countParams.push(...serviceTypes);
      countParamIndex += serviceTypes.length;
    }

    countQuery += ` AND (s.service_price >= $${countParamIndex} AND s.service_price <= $${countParamIndex + 1
      })`;
    countParams.push(minPrice, maxPrice);
    countParamIndex += 2;

    if (deliveryTime) {
      countQuery += ` AND s.delivery_time = $${countParamIndex}`;
      countParams.push(deliveryTime);
    }
    console.log("Final Query:", queryText);
    console.log("With Parameters:", queryParams);
    const [results, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countQuery, countParams),
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Generate presigned URLs for profile images
    const freelancersWithSignedUrls = await Promise.all(
      results.rows.map(async (freelancer) => {
        if (freelancer.profile_image_url) {
          const parts = freelancer.profile_image_url.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.profile_image_url = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.profile_image_url = null;
          }
        }

        // Generate presigned URL for thumbnail image if it exists
        if (freelancer.freelancer_thumbnail_image) {
          const parts = freelancer.freelancer_thumbnail_image.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.freelancer_thumbnail_image = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer thumbnail ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.freelancer_thumbnail_image = null;
          }
        }

        return freelancer;
      })
    );

    logger.info(`Found ${totalCount} freelancers matching criteria`);
    return res.status(200).json({
      status: "success",
      data: {
        freelancers: freelancersWithSignedUrls,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancers:", error);
    return next(new AppError("Failed to fetch freelancers", 500));
  }
};

// ✅ GET FREELANCER BY ID
const getFreelancerById = async (req, res, next) => {
  logger.info("Fetching freelancer by ID");

  try {
    const freelancerId = req.params?.id;

    // Validate freelancer ID parameter
    if (!freelancerId) {
      logger.warn("Freelancer ID parameter is missing");
      return next(new AppError("Freelancer ID is required", 400));
    }

    const { rows: freelancerData } = await query(
      "SELECT freelancer_full_name, profile_title, freelancer_thumbnail_image, profile_image_url, rating FROM freelancer WHERE freelancer_id = $1",
      [freelancerId]
    );

    // Check if freelancer exists
    if (!freelancerData[0]) {
      logger.warn(`Freelancer not found with ID: ${freelancerId}`);
      return next(new AppError("Freelancer not found", 404));
    }

    logger.debug("Freelancer data fetched:", freelancerData[0]);

    // Generate presigned URL for profile image if it exists
    if (freelancerData[0].profile_image_url) {
      try {
        const profileImagePath = freelancerData[0].profile_image_url;

        // Extract bucket name and object key
        // Assuming format: "bucket-name/path/to/object"
        const firstSlashIndex = profileImagePath.indexOf("/");

        if (firstSlashIndex !== -1) {
          const bucketName = profileImagePath.substring(0, firstSlashIndex);
          const objectName = profileImagePath.substring(firstSlashIndex + 1);

          const signedUrl = await createPresignedUrl(
            bucketName,
            objectName,
            expirySeconds
          );
          freelancerData[0].profile_image_url = signedUrl;
        } else {
          logger.warn(
            `Invalid profile image URL format: ${profileImagePath}`
          );
          freelancerData[0].profile_image_url = null;
        }
      } catch (error) {
        logger.error(`Error generating signed URL for profile image: ${error}`);
        freelancerData[0].profile_image_url = null;
      }
    }

    // Generate presigned URL for thumbnail image if it exists
    if (freelancerData[0].freelancer_thumbnail_image) {
      try {
        const thumbnailPath = freelancerData[0].freelancer_thumbnail_image;

        const firstSlashIndex = thumbnailPath.indexOf("/");

        if (firstSlashIndex !== -1) {
          const bucketName = thumbnailPath.substring(0, firstSlashIndex);
          const objectName = thumbnailPath.substring(firstSlashIndex + 1);

          const thumbSignedUrl = await createPresignedUrl(
            bucketName,
            objectName,
            expirySeconds
          );
          freelancerData[0].freelancer_thumbnail_image = thumbSignedUrl;
        } else {
          logger.warn(
            `Invalid thumbnail image URL format: ${thumbnailPath}`
          );
          freelancerData[0].freelancer_thumbnail_image = null;
        }
      } catch (error) {
        logger.error(
          `Error generating signed URL for thumbnail image: ${error}`
        );
        freelancerData[0].freelancer_thumbnail_image = null;
      }
    }

    const { rows: freelancerServices } = await query(
      `SELECT id, service_name, service_description, service_price, delivery_time
     FROM services WHERE freelancer_id = $1`,
      [freelancerId]
    );

    logger.info(`Successfully fetched freelancer data for ID: ${freelancerId}`);

    // Send response with freelancer basic info and services only
    return res.status(200).json({
      status: "success",
      data: {
        freelancer: freelancerData[0],
        services: freelancerServices.length > 0 ? freelancerServices : [],
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancer by ID:", error);
    return next(new AppError("Failed to fetch freelancer by ID", 500));
  }
};

// ✅ GET FREELANCER PORTFOLIO BY ID
const getFreelancerPortfolio = async (req, res, next) => {
  logger.info("Fetching freelancer portfolio by ID");

  try {
    const freelancerId = req.params?.id;

    // Validate freelancer ID parameter
    if (!freelancerId) {
      logger.warn("Freelancer ID parameter is missing");
      return next(new AppError("Freelancer ID is required", 400));
    }

    // Check if freelancer exists
    const { rows: freelancerExists } = await query(
      "SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1",
      [freelancerId]
    );

    if (!freelancerExists[0]) {
      logger.warn(`Freelancer not found with ID: ${freelancerId}`);
      return next(new AppError("Freelancer not found", 404));
    }

    const { rows: portfolioData } = await query(
      `SELECT
    portfolio_item_service_type,
    json_agg(
        json_build_object(
            'portfolio_id', portfolio_item_id,
            'portfolio_item_url', portfolio_item_url,
            'portfolio_item_description', portfolio_item_description
        )
    ) as portfolio_items
FROM (
    SELECT
        portfolio_item_service_type,
        portfolio_item_id,
        portfolio_item_url,
        portfolio_item_description,
        ROW_NUMBER() OVER (PARTITION BY portfolio_item_service_type ORDER BY portfolio_item_id) as rn
    FROM portfolio
    WHERE freelancer_id = $1
) subquery
WHERE rn <= 3
GROUP BY portfolio_item_service_type
ORDER BY portfolio_item_service_type`,
      [freelancerId]
    );

    // Process portfolio items with proper async/await
    for (const portfolio of portfolioData) {
      if (
        portfolio.portfolio_items &&
        Array.isArray(portfolio.portfolio_items)
      ) {
        portfolio.portfolio_items = await Promise.all(
          portfolio.portfolio_items.map(async (item) => {
            try {
              if (item.portfolio_item_url) {
                const portfolioItemPath = item.portfolio_item_url;
                const firstSlashIndex = portfolioItemPath.indexOf("/");

                if (firstSlashIndex !== -1) {
                  const bucketName = portfolioItemPath.substring(0, firstSlashIndex);
                  const objectName = portfolioItemPath.substring(firstSlashIndex + 1);
                  const signedUrl = await createPresignedUrl(
                    bucketName,
                    objectName,
                    expirySeconds
                  );
                  item.portfolio_item_url = signedUrl;
                } else {
                  logger.warn(
                    `Invalid portfolio URL format: ${item.portfolio_item_url}`
                  );
                  item.portfolio_item_url = null;
                }
              }
              return item;
            } catch (error) {
              logger.error(
                `Error generating signed URL for portfolio item: ${error}`
              );
              item.portfolio_item_url = null;
              return item;
            }
          })
        );
      }
    }

    logger.info(
      `Successfully fetched portfolio data for freelancer ID: ${freelancerId}`
    );

    return res.status(200).json({
      status: "success",
      data: {
        portfolio: portfolioData,
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancer portfolio:", error);
    return next(new AppError("Failed to fetch freelancer portfolio", 500));
  }
};

// ✅ GET FREELANCER IMPACT (BEFORE/AFTER) BY ID
const getFreelancerImpact = async (req, res, next) => {
  logger.info("Fetching freelancer impact data by ID");

  try {
    const freelancerId = req.params?.id;

    // Validate freelancer ID parameter
    if (!freelancerId) {
      logger.warn("Freelancer ID parameter is missing");
      return next(new AppError("Freelancer ID is required", 400));
    }

    // Check if freelancer exists
    const { rows: freelancerExists } = await query(
      "SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1",
      [freelancerId]
    );

    if (!freelancerExists[0]) {
      logger.warn(`Freelancer not found with ID: ${freelancerId}`);
      return next(new AppError("Freelancer not found", 404));
    }

    const { rows: afterBeforeData } = await query(
      `
  SELECT
    service_type,
    json_agg(
        json_build_object(
            'impact_id', impact_id,
            'before_service_url', before_service_url,
            'after_service_url', after_service_url,
            'impact_metric', impact_metric
        )
    ) as impact_items
FROM (
    SELECT
        service_type,
        impact_id,
        before_service_url,
        after_service_url,
        impact_metric,
        ROW_NUMBER() OVER (PARTITION BY service_type ORDER BY impact_id) as rn
    FROM impact
    WHERE freelancer_id = $1
) subquery
WHERE rn <= 3
GROUP BY service_type
ORDER BY service_type`,
      [freelancerId]
    );

    // Process impact items with proper async/await
    for (const impact of afterBeforeData) {
      if (impact.impact_items && Array.isArray(impact.impact_items)) {
        impact.impact_items = await Promise.all(
          impact.impact_items.map(async (item) => {
            try {
              let beforeSignedUrl = null;
              let afterSignedUrl = null;

              // Process before_service_url
              if (item.before_service_url) {
                const beforePath = item.before_service_url;
                const beforeSlashIndex = beforePath.indexOf("/");

                if (beforeSlashIndex !== -1) {
                  const beforeBucketName = beforePath.substring(0, beforeSlashIndex);
                  const beforeObjectName = beforePath.substring(beforeSlashIndex + 1);
                  beforeSignedUrl = await createPresignedUrl(
                    beforeBucketName,
                    beforeObjectName,
                    expirySeconds
                  );
                } else {
                  logger.warn(
                    `Invalid before URL format: ${item.before_service_url}`
                  );
                }
              }

              // Process after_service_url
              if (item.after_service_url) {
                const afterPath = item.after_service_url;
                const afterSlashIndex = afterPath.indexOf("/");

                if (afterSlashIndex !== -1) {
                  const afterBucketName = afterPath.substring(0, afterSlashIndex);
                  const afterObjectName = afterPath.substring(afterSlashIndex + 1);
                  afterSignedUrl = await createPresignedUrl(
                    afterBucketName,
                    afterObjectName,
                    expirySeconds
                  );
                } else {
                  logger.warn(
                    `Invalid after URL format: ${item.after_service_url}`
                  );
                }
              }

              item.before_service_url = beforeSignedUrl;
              item.after_service_url = afterSignedUrl;
              return item;
            } catch (error) {
              logger.error(
                `Error generating signed URLs for impact item: ${error}`
              );
              item.before_service_url = null;
              item.after_service_url = null;
              return item;
            }
          })
        );
      }
    }

    logger.info(
      `Successfully fetched impact data for freelancer ID: ${freelancerId}`
    );

    return res.status(200).json({
      status: "success",
      data: {
        impact: afterBeforeData,
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancer impact data:", error);
    return next(new AppError("Failed to fetch freelancer impact data", 500));
  }
};

const addFreelancerToWishlist = async (req, res, next) => {
  try {
    const user = req.user;
    const { freelancerId } = req.body;

    // Validate freelancer ID
    if (!freelancerId) {
      return next(new AppError("Freelancer ID is required", 400));
    }

    // Log the attempt
    logger.info(
      `Attempting to add freelancer ${freelancerId} to wishlist for user ${user.roleWiseId}`
    );


    // Check if freelancer exists first (optional but recommended)
    const freelancerCheck = await query(
      "SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1",
      [freelancerId]
    );

    if (freelancerCheck.rows.length === 0) {
      return next(new AppError("Freelancer not found", 404));
    }

    // Insert into wishlist
    const result = await query(
      `INSERT INTO wishlist (creator_id, freelancer_id, created_at) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (creator_id, freelancer_id) DO NOTHING
       RETURNING *`,
      [user.roleWiseId, freelancerId, new Date()]
    );

    // Check if insert was successful or already existed
    if (result.rows.length === 0) {
      logger.info(
        `Freelancer ${freelancerId} already in wishlist for user ${user.roleWiseId}`
      );
      return res.status(200).json({
        status: "success",
        message: "Freelancer already in wishlist",
      });
    }

    logger.info(
      `Freelancer ${freelancerId} added to wishlist for user ${user.roleWiseId}`
    );

    return res.status(200).json({
      status: "success",
      message: "Freelancer added to wishlist successfully",
      data: result.rows[0]
    });

  } catch (error) {
    // Log the ACTUAL error for debugging
    logger.error("wishlist add error:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
      user_id: req.user?.roleWiseId,
      freelancer_id: req.body?.freelancerId
    });

    // Pass the actual error with context
    return next(new AppError(
      `Failed to add freelancer to wishlist: ${error.message}`,
      500
    ));
  }
};

const removeFreelancerFromWishlist = async (req, res, next) => {
  try {
    const user = req.user;
    const { freelancerId } = req.body;

    // Validate freelancer ID
    if (!freelancerId) {
      return next(new AppError("Freelancer ID is required", 400));
    }

    // Log the attempt
    logger.info(
      `Attempting to remove freelancer ${freelancerId} from wishlist for user ${user.roleWiseId}`
    );

    // Check if freelancer exists first (optional but recommended)
    const freelancerCheck = await query(
      "SELECT freelancer_id FROM freelancer WHERE freelancer_id = $1",
      [freelancerId]
    );

    if (freelancerCheck.rows.length === 0) {
      return next(new AppError("Freelancer not found", 404));
    }

    // Delete from wishlist
    const result = await query(
      `DELETE FROM wishlist 
       WHERE creator_id = $1 AND freelancer_id = $2
       RETURNING *`,
      [user.roleWiseId, freelancerId]
    );

    // Check if delete was successful or item didn't exist
    if (result.rows.length === 0) {
      logger.info(
        `Freelancer ${freelancerId} was not in wishlist for user ${user.roleWiseId}`
      );
      return res.status(200).json({
        status: "success",
        message: "Freelancer was not in wishlist",
      });
    }

    logger.info(
      `Freelancer ${freelancerId} removed from wishlist for user ${user.roleWiseId}`
    );

    return res.status(200).json({
      status: "success",
      message: "Freelancer removed from wishlist successfully",
      data: result.rows[0]
    });

  } catch (error) {
    // Log the ACTUAL error for debugging
    logger.error("wishlist remove error:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: error.stack,
      user_id: req.user?.roleWiseId,
      freelancer_id: req.body?.freelancerId
    });

    // Pass the actual error with context
    return next(new AppError(
      `Failed to remove freelancer from wishlist: ${error.message}`,
      500
    ));
  }
};

const getWishlistFreelancers = async (req, res, next) => {
  logger.info("Fetching wishlist freelancers with filters");
  try {
    const user = req.user;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Search and filter parameters
    const search = req.query.search || ""; // Search by freelancer name
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Number.MAX_SAFE_INTEGER;
    // Handle serviceType as an array
    const serviceTypes = req.query.serviceType
      ? Array.isArray(req.query.serviceType)
        ? req.query.serviceType
        : [req.query.serviceType]
      : [];

    // Sort and delivery time filters
    const sortBy = req.query.sortBy || "newest"; // toprated, newest
    const deliveryTime = req.query.deliveryTime || ""; // e.g., "2-3 days"

    // Build the query based on filters
    let queryText = `
      SELECT
        f.freelancer_id,
        f.freelancer_full_name,
        f.profile_title,
        f.profile_image_url,
        f.freelancer_thumbnail_image,
        f.rating,
        ARRAY_AGG(DISTINCT s.service_name) FILTER (WHERE s.service_name IS NOT NULL) as service_names,
        MIN(s.service_price) as lowest_price,
        w.created_at as wishlist_added_at
      FROM freelancer f
      INNER JOIN wishlist w ON f.freelancer_id = w.freelancer_id AND w.creator_id = $1
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1 AND f.verification_status = 'VERIFIED' AND f.is_active = true
    `;

    const queryParams = [user.roleWiseId];
    let paramCount = 2;

    // Add search condition
    if (search) {
      queryText += ` AND f.freelancer_full_name ILIKE $${paramCount}`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add service type filter (using IN clause for array)
    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${paramCount + index}`)
        .join(",");
      queryText += ` AND s.service_name IN (${serviceTypeParams})`;
      queryParams.push(...serviceTypes);
      paramCount += serviceTypes.length;
    }

    // Add price range filter
    queryText += ` AND (s.service_price >= $${paramCount} AND s.service_price <= $${paramCount + 1})`;
    queryParams.push(minPrice, maxPrice);
    paramCount += 2;

    // Add delivery time filter
    if (deliveryTime) {
      queryText += ` AND s.delivery_time = $${paramCount}`;
      queryParams.push(deliveryTime);
      paramCount++;
    }

    // Add GROUP BY clause
    queryText += ` GROUP BY f.freelancer_id, f.freelancer_full_name, f.profile_title, f.profile_image_url, f.freelancer_thumbnail_image, f.rating, w.created_at`;

    // Add sorting based on sortBy parameter
    let orderByClause = "";
    switch (sortBy) {
      case "toprated":
        orderByClause =
          " ORDER BY f.rating DESC NULLS LAST, f.freelancer_full_name";
        break;
      case "newest":
      default:
        orderByClause =
          " ORDER BY w.created_at DESC NULLS LAST, f.freelancer_full_name";
        break;
    }

    // Add pagination
    queryText += `${orderByClause} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    // Get total count for pagination (count distinct freelancers in wishlist)
    let countQuery = `
      SELECT COUNT(DISTINCT f.freelancer_id) as count
      FROM freelancer f
      INNER JOIN wishlist w ON f.freelancer_id = w.freelancer_id AND w.creator_id = $1
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1 AND f.verification_status = 'VERIFIED' AND f.is_active = true
    `;

    const countParams = [user.roleWiseId];
    let countParamIndex = 2;

    if (search) {
      countQuery += ` AND f.freelancer_full_name ILIKE $${countParamIndex}`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${countParamIndex + index}`)
        .join(",");
      countQuery += ` AND s.service_name IN (${serviceTypeParams})`;
      countParams.push(...serviceTypes);
      countParamIndex += serviceTypes.length;
    }

    countQuery += ` AND (s.service_price >= $${countParamIndex} AND s.service_price <= $${countParamIndex + 1})`;
    countParams.push(minPrice, maxPrice);
    countParamIndex += 2;

    if (deliveryTime) {
      countQuery += ` AND s.delivery_time = $${countParamIndex}`;
      countParams.push(deliveryTime);
    }

    logger.debug("Wishlist Query:", queryText);
    logger.debug("With Parameters:", queryParams);

    const [results, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countQuery, countParams),
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Generate presigned URLs for profile images
    const freelancersWithSignedUrls = await Promise.all(
      results.rows.map(async (freelancer) => {
        if (freelancer.profile_image_url) {
          const parts = freelancer.profile_image_url.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.profile_image_url = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.profile_image_url = null;
          }
        }

        // Generate presigned URL for thumbnail image if it exists
        if (freelancer.freelancer_thumbnail_image) {
          const parts = freelancer.freelancer_thumbnail_image.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.freelancer_thumbnail_image = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer thumbnail ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.freelancer_thumbnail_image = null;
          }
        }

        return freelancer;
      })
    );

    logger.info(`Found ${totalCount} wishlist freelancers matching criteria for user ${user.roleWiseId}`);
    return res.status(200).json({
      status: "success",
      data: {
        freelancers: freelancersWithSignedUrls,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching wishlist freelancers:", error);
    return next(new AppError("Failed to fetch wishlist freelancers", 500));
  }
};

const getUserProfileProgress = async (req, res, next) => {
  logger.info("Calculating user profile completion progress");
  try {
    const user = req.user;
    const freelancerProgressWeights = {
      ProfileInfo: 0,
      Services: 0,
      BankDetails: 0,
      GovtID: 0,
      Portfolio: 0,
    };
    const { rows: freelancerRows } = await query(
      "SELECT freelancer_thumbnail_image, date_of_birth, phone_number, profile_title, profile_image_url, gov_id_url, bank_account_no, bank_name, bank_ifsc_code, bank_branch_name FROM freelancer WHERE user_id=$1",
      [user.user_id]
    );
    if (freelancerRows.length > 0) {
      const freelancer = freelancerRows[0];
      if (
        freelancer.date_of_birth &&
        freelancer.phone_number &&
        freelancer.profile_title &&
        freelancer.profile_image_url &&
        freelancer.freelancer_thumbnail_image
      ) {
        freelancerProgressWeights.ProfileInfo += 20;
      }
      if (freelancer.gov_id_url) {
        freelancerProgressWeights.GovtID += 20;
      }
      if (
        freelancer.bank_account_no &&
        freelancer.bank_name &&
        freelancer.bank_ifsc_code &&
        freelancer.bank_branch_name
      ) {
        freelancerProgressWeights.BankDetails += 20;
      }
    }
    const { rows: freelancerServices } = await query(
      "SELECT id FROM services WHERE freelancer_id=(SELECT freelancer_id FROM freelancer WHERE user_id=$1)",
      [user.user_id]
    );
    if (freelancerServices.length > 0) {
      freelancerProgressWeights.Services = 20;
    }
    const { rows: freelancerPortfolio } = await query(
      "SELECT portfolio_item_id FROM portfolio WHERE freelancer_id=(SELECT freelancer_id FROM freelancer WHERE user_id=$1)",
      [user.user_id]
    );
    if (freelancerPortfolio.length > 0) {
      freelancerProgressWeights.Portfolio = 20;
    }
    const totalProgress = Object.values(freelancerProgressWeights).reduce(
      (acc, curr) => acc + curr,
      0
    );
    logger.info(
      `User profile completion progress calculated: ${totalProgress}%`
    );
    return res.status(200).json({
      status: "success",
      data: {
        profileCompletionPercentage: totalProgress,
        freelancerProgressWeights: freelancerProgressWeights,
      },
    });
  } catch (error) {
    logger.error("Error calculating profile progress:", error);
    return next(new AppError("Failed to calculate profile progress", 500));
  }
};

const getAllCreatorProfiles = async (req, res, next) => {
  logger.info("Fetching all creator profiles with filters");
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Search parameter
    const search = req.query.search || ""; // Search by name

    // Date filter parameters
    const startDate = req.query.startDate || null; // Filter by joining date (created_at)
    const endDate = req.query.endDate || null;

    // Build the query based on filters
    let queryText = `
      SELECT
        creator_id,
        first_name,
        last_name,
        full_name,
        phone_number,
        email,
        created_at,
        profile_image_url
      FROM creators
      WHERE 1=1
    `;

    const queryParams = [];
    let paramCount = 1;

    // Add search condition (search by first_name, last_name, or full_name)
    if (search) {
      queryText += ` AND (
        first_name ILIKE $${paramCount} OR
        last_name ILIKE $${paramCount} OR
        full_name ILIKE $${paramCount}
      )`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add date range filter
    if (startDate) {
      queryText += ` AND created_at >= $${paramCount}`;
      queryParams.push(startDate);
      paramCount++;
    }

    if (endDate) {
      queryText += ` AND created_at <= $${paramCount}`;
      queryParams.push(endDate);
      paramCount++;
    }

    // Add sorting by created_at (newest first)
    queryText += ` ORDER BY created_at DESC`;

    // Add pagination
    queryText += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as count
      FROM creators
      WHERE 1=1
    `;

    const countParams = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND (
        first_name ILIKE $${countParamIndex} OR
        last_name ILIKE $${countParamIndex} OR
        full_name ILIKE $${countParamIndex}
      )`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (startDate) {
      countQuery += ` AND created_at >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }

    if (endDate) {
      countQuery += ` AND created_at <= $${countParamIndex}`;
      countParams.push(endDate);
      countParamIndex++;
    }

    logger.debug("Query:", queryText);
    logger.debug("Query Parameters:", queryParams);

    // Execute both queries in parallel
    const [results, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countQuery, countParams),
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Generate presigned URLs for profile images
    const creatorsWithSignedUrls = await Promise.all(
      results.rows.map(async (creator) => {
        // Generate presigned URL for profile image if it exists
        if (creator.profile_image_url) {
          const parts = creator.profile_image_url.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            creator.profile_image_url = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for creator ${creator.creator_id}:`,
              error
            );
            creator.profile_image_url = null;
          }
        }

        return {
          creator_id: creator.creator_id,
          name: creator.full_name || `${creator.first_name || ""} ${creator.last_name || ""}`.trim(),
          phone_number: creator.phone_number,
          email: creator.email,
          date_of_joining: creator.created_at,
          profile_image_url: creator.profile_image_url,
        };
      })
    );

    logger.info(`Found ${totalCount} creators matching criteria`);
    return res.status(200).json({
      status: "success",
      message: "Creator profiles fetched successfully",
      data: {
        creators: creatorsWithSignedUrls,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching creator profiles:", error);
    return next(new AppError("Failed to fetch creator profiles", 500));
  }
}

const getCreatorById = async (req, res, next) => {
  logger.info("Fetching creator by ID");

  try {
    const creatorId = req.params?.creator_id;

    // Validate creator ID parameter
    if (!creatorId) {
      logger.warn("Creator ID parameter is missing");
      return next(new AppError("Creator ID is required", 400));
    }

    const { rows: creatorData } = await query(
      `SELECT
        creator_id,
        first_name,
        last_name,
        full_name,
        phone_number,
        email,
        profile_image_url,
        social_platform_type,
        social_links,
        niche,
        created_at
      FROM creators
      WHERE creator_id = $1`,
      [creatorId]
    );

    // Check if creator exists
    if (!creatorData[0]) {
      logger.warn(`Creator not found with ID: ${creatorId}`);
      return next(new AppError("Creator not found", 404));
    }

    logger.debug("Creator data fetched:", creatorData[0]);

    const creator = creatorData[0];

    // Generate presigned URL for profile image if it exists
    if (creator.profile_image_url) {
      try {
        const profileImagePath = creator.profile_image_url;

        // Extract bucket name and object key
        // Assuming format: "bucket-name/path/to/object"
        const firstSlashIndex = profileImagePath.indexOf("/");

        if (firstSlashIndex !== -1) {
          const bucketName = profileImagePath.substring(0, firstSlashIndex);
          const objectName = profileImagePath.substring(firstSlashIndex + 1);

          const signedUrl = await createPresignedUrl(
            bucketName,
            objectName,
            expirySeconds
          );
          creator.profile_image_url = signedUrl;
        } else {
          logger.warn(`Invalid profile image URL format: ${profileImagePath}`);
          creator.profile_image_url = null;
        }
      } catch (error) {
        logger.error(`Error generating signed URL for profile image: ${error}`);
        creator.profile_image_url = null;
      }
    }

    // Format response
    const response = {
      creator_id: creator.creator_id,
      name: creator.full_name || `${creator.first_name || ""} ${creator.last_name || ""}`.trim(),
      first_name: creator.first_name,
      last_name: creator.last_name,
      phone_number: creator.phone_number,
      email: creator.email,
      profile_image_url: creator.profile_image_url,
      social_platform_type: creator.social_platform_type,
      social_links: creator.social_links,
      niches: creator.niche || [],
      date_of_joining: creator.created_at,
    };

    logger.info(`Creator profile fetched successfully for ID: ${creatorId}`);
    return res.status(200).json({
      status: "success",
      message: "Creator profile fetched successfully",
      data: response,
    });
  } catch (error) {
    logger.error("Error fetching creator profile:", error);
    return next(new AppError("Failed to fetch creator profile", 500));
  }
}

const editCreatorByAdmin = async (req, res, next) => {
  // Implementation for editing creator profile by admin goes here
}

const getFreelancerForAdmin = async (req, res, next) => {
  try {
    logger.info("Admin fetching all freelancers with pagination");

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Search parameter
    const search = req.query.search || "";

    // Date filter parameters
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;

    // Build WHERE clause dynamically
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`freelancer_full_name ILIKE $${paramIndex}`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query to get freelancers with only required fields
    const queryText = `
      SELECT
        freelancer_id,
        freelancer_full_name,
        created_at as joining_date,
        gov_id_number,
        verification_status
      FROM freelancer
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const { rows: freelancers } = await query(queryText, [...queryParams, limit, offset]);

    // Get total count for pagination
    const countQueryText = `SELECT COUNT(*) as total FROM freelancer ${whereClause}`;
    const { rows: countResult } = await query(countQueryText, queryParams);
    const totalCount = parseInt(countResult[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    logger.info(`Fetched ${freelancers.length} freelancers for admin`);

    return res.status(200).json({
      status: "success",
      message: "Freelancers fetched successfully",
      data: {
        freelancers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancers for admin:", error);
    return next(new AppError("Failed to fetch freelancers", 500));
  }
}

const editFreelancerByAdmin = async (req, res, next) => {
  // Implementation for editing freelancer profile by admin goes here
}

const getFreeLancerByIdForAdmin = async (req, res, next) => {
  try {
    logger.info("Admin fetching freelancer KYC details by ID");

    const { freelancer_id } = req.query;

    if (!freelancer_id) {
      return next(new AppError('Freelancer ID is required', 400));
    }

    // Fetch freelancer details
    const { rows: freelancerData } = await query(
      `SELECT
        freelancer_id,
        freelancer_full_name,
        phone_number,
        freelancer_email,
        date_of_birth,
        created_at as date_of_joining,
        gov_id_type,
        gov_id_number,
        gov_id_url,
        profile_image_url,
        niche,
        verification_status
      FROM freelancer
      WHERE freelancer_id = $1`,
      [freelancer_id]
    );

    if (!freelancerData[0]) {
      logger.warn(`Freelancer not found with ID: ${freelancer_id}`);
      return next(new AppError('Freelancer not found', 404));
    }

    const freelancer = freelancerData[0];

    // Generate presigned URL for profile image if it exists
    if (freelancer.profile_image_url) {
      try {
        const profileImagePath = freelancer.profile_image_url;
        const firstSlashIndex = profileImagePath.indexOf("/");

        if (firstSlashIndex !== -1) {
          const bucketName = profileImagePath.substring(0, firstSlashIndex);
          const objectName = profileImagePath.substring(firstSlashIndex + 1);

          const signedUrl = await createPresignedUrl(
            bucketName,
            objectName,
            expirySeconds
          );
          freelancer.profile_image_url = signedUrl;
        } else {
          logger.warn(`Invalid profile image URL format: ${profileImagePath}`);
          freelancer.profile_image_url = null;
        }
      } catch (error) {
        logger.error(`Error generating signed URL for profile image: ${error}`);
        freelancer.profile_image_url = null;
      }
    }

    // Generate presigned URL for government ID proof if it exists
    if (freelancer.gov_id_url) {
      try {
        const govIdPath = freelancer.gov_id_url;
        const firstSlashIndex = govIdPath.indexOf("/");

        if (firstSlashIndex !== -1) {
          const bucketName = govIdPath.substring(0, firstSlashIndex);
          const objectName = govIdPath.substring(firstSlashIndex + 1);

          const signedUrl = await createPresignedUrl(
            bucketName,
            objectName,
            expirySeconds
          );
          freelancer.gov_id_url = signedUrl;
        } else {
          logger.warn(`Invalid govt ID URL format: ${govIdPath}`);
          freelancer.gov_id_url = null;
        }
      } catch (error) {
        logger.error(`Error generating signed URL for govt ID: ${error}`);
        freelancer.gov_id_url = null;
      }
    }

    // Fetch freelancer services
    const { rows: services } = await query(
      `SELECT service_name
       FROM services
       WHERE freelancer_id = $1`,
      [freelancer_id]
    );

    logger.info(`Successfully fetched KYC details for freelancer ID: ${freelancer_id}`);

    return res.status(200).json({
      status: "success",
      message: "Freelancer KYC details fetched successfully",
      data: {
        freelancer_id: freelancer.freelancer_id,
        full_name: freelancer.freelancer_full_name,
        phone_number: freelancer.phone_number,
        email: freelancer.freelancer_email,
        date_of_birth: freelancer.date_of_birth,
        date_of_joining: freelancer.date_of_joining,
        gov_id_type: freelancer.gov_id_type,
        gov_id_number: freelancer.gov_id_number,
        gov_id_url: freelancer.gov_id_url,
        profile_image_url: freelancer.profile_image_url,
        niches: freelancer.niche || [],
        verification_status: freelancer.verification_status,
        services_offered: services.map(s => s.service_name),
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancer KYC details for admin:", error);
    return next(new AppError("Failed to fetch freelancer KYC details", 500));
  }
}

const getFreelancerForSuggestion = async (req, res, next) => {
  logger.info("Fetching all freelancers with filters");
  try {
    // Pagination parameters
    const request_id = req.query.request_id || null;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Search and filter parameters
    const search = req.query.search || ""; // Search by freelancer name
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Number.MAX_SAFE_INTEGER;
    // Handle serviceType as an array
    const serviceTypes = req.query.serviceType
      ? Array.isArray(req.query.serviceType)
        ? req.query.serviceType
        : [req.query.serviceType]
      : [];

    // Sort and delivery time filters
    const sortBy = req.query.sortBy || "newest"; // toprated, newest
    const deliveryTime = req.query.deliveryTime || ""; // e.g., "2-3 days"
    // const type = req.query.type || "all"; // e.g., "all", "featured", etc.

    // Fetch suggested freelancers for this request_id
    let suggestedFreelancerIds = [];
    if (request_id) {
      try {
        const { rows: suggestionRows } = await query(
          "SELECT freelancer_id FROM service_request_suggestions WHERE request_id = $1",
          [request_id]
        );
        if (suggestionRows.length > 0 && suggestionRows[0].freelancer_id) {
          suggestedFreelancerIds = suggestionRows[0].freelancer_id;
          logger.info(`Found ${suggestedFreelancerIds.length} suggested freelancers for request_id: ${request_id}`);
        }
      } catch (error) {
        logger.error("Error fetching suggested freelancers:", error);
        // Continue without suggestions if there's an error
      }
    }

    // Build the query based on filters
    let queryText = `
      SELECT
        f.freelancer_id,
        f.freelancer_full_name,
        f.profile_title,
        f.profile_image_url,
        f.freelancer_thumbnail_image,
        f.rating,
        ARRAY_AGG(DISTINCT s.service_name) FILTER (WHERE s.service_name IS NOT NULL) as service_names,
        MIN(s.service_price) as lowest_price
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1 and f.verification_status = 'VERIFIED' and f.is_active = true
    `;

    const queryParams = [];
    let paramCount = 1;

    // Add search condition
    if (search) {
      queryText += ` AND f.freelancer_full_name ILIKE $${paramCount}`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add service type filter (using IN clause for array)
    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${paramCount + index}`)
        .join(",");
      queryText += ` AND s.service_name IN (${serviceTypeParams})`;
      queryParams.push(...serviceTypes);
      paramCount += serviceTypes.length;
    }

    // Add price range filter
    queryText += ` AND (s.service_price >= $${paramCount} AND s.service_price <= $${paramCount + 1
      })`;
    queryParams.push(minPrice, maxPrice);
    paramCount += 2;

    // Add delivery time filter
    if (deliveryTime) {
      queryText += ` AND s.delivery_time = $${paramCount}`;
      queryParams.push(deliveryTime);
      paramCount++;
    }

    // Add GROUP BY clause
    queryText += ` GROUP BY f.freelancer_id, f.freelancer_full_name, f.profile_title, f.profile_image_url, f.freelancer_thumbnail_image, f.rating`;

    // Add sorting based on sortBy parameter
    let orderByClause = "";
    switch (sortBy) {
      case "toprated":
        orderByClause =
          " ORDER BY f.rating DESC NULLS LAST, f.freelancer_full_name";
        break;
      case "newest":
      default:
        orderByClause =
          " ORDER BY MAX(s.created_at) DESC NULLS LAST, f.freelancer_full_name";
        break;
    }

    // Add pagination
    queryText += `${orderByClause} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    // Get total count for pagination (count distinct freelancers)
    let countQuery = `
      SELECT COUNT(DISTINCT f.freelancer_id) as count
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1
    `;

    const countParams = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND f.freelancer_full_name ILIKE $${countParamIndex}`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${countParamIndex + index}`)
        .join(",");
      countQuery += ` AND s.service_name IN (${serviceTypeParams})`;
      countParams.push(...serviceTypes);
      countParamIndex += serviceTypes.length;
    }

    countQuery += ` AND (s.service_price >= $${countParamIndex} AND s.service_price <= $${countParamIndex + 1
      })`;
    countParams.push(minPrice, maxPrice);
    countParamIndex += 2;

    if (deliveryTime) {
      countQuery += ` AND s.delivery_time = $${countParamIndex}`;
      countParams.push(deliveryTime);
    }
    console.log("Final Query:", queryText);
    console.log("With Parameters:", queryParams);
    const [results, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countQuery, countParams),
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Generate presigned URLs for profile images and add is_suggested_freelancer flag
    const freelancersWithSignedUrls = await Promise.all(
      results.rows.map(async (freelancer) => {
        // Check if freelancer is in suggested list
        const isSuggested = suggestedFreelancerIds.includes(freelancer.freelancer_id);
        freelancer.is_suggested_freelancer = isSuggested;

        if (freelancer.profile_image_url) {
          const parts = freelancer.profile_image_url.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.profile_image_url = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.profile_image_url = null;
          }
        }

        // Generate presigned URL for thumbnail image if it exists
        if (freelancer.freelancer_thumbnail_image) {
          const parts = freelancer.freelancer_thumbnail_image.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.freelancer_thumbnail_image = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer thumbnail ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.freelancer_thumbnail_image = null;
          }
        }

        return freelancer;
      })
    );

    // Sort freelancers - suggested ones first, then the rest
    const sortedFreelancers = freelancersWithSignedUrls.sort((a, b) => {
      if (a.is_suggested_freelancer && !b.is_suggested_freelancer) return -1;
      if (!a.is_suggested_freelancer && b.is_suggested_freelancer) return 1;
      return 0;
    });

    logger.info(`Found ${totalCount} freelancers matching criteria (${suggestedFreelancerIds.length} suggested)`);
    return res.status(200).json({
      status: "success",
      data: {
        freelancers: sortedFreelancers,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancers:", error);
    return next(new AppError("Failed to fetch freelancers", 500));
  }
};

const getFreelancerByIdForCreator = async (req, res, next) => {

  logger.info("Fetching freelancer by ID");
  try {
    const user = req.user;
    const creator_id = user?.roleWiseId;
    const freelancerId = req.params?.id;

    // Validate freelancer ID parameter
    if (!freelancerId) {
      logger.warn("Freelancer ID parameter is missing");
      return next(new AppError("Freelancer ID is required", 400));
    }

    const { rows: freelancerData } = await query(
      `SELECT 
        f.freelancer_full_name, 
        f.profile_title, 
        f.freelancer_thumbnail_image, 
        f.profile_image_url, 
        f.rating,
        CASE WHEN w.freelancer_id IS NOT NULL THEN true ELSE false END as in_wishlist
      FROM freelancer f
      LEFT JOIN wishlist w ON f.freelancer_id = w.freelancer_id AND w.creator_id = $2
      WHERE f.freelancer_id = $1`,
      [freelancerId, creator_id]
    );

    // Check if freelancer exists
    if (!freelancerData[0]) {
      logger.warn(`Freelancer not found with ID: ${freelancerId}`);
      return next(new AppError("Freelancer not found", 404));
    }

    logger.debug("Freelancer data fetched:", freelancerData[0]);

    // Generate presigned URL for profile image if it exists
    if (freelancerData[0].profile_image_url) {
      try {
        const profileImagePath = freelancerData[0].profile_image_url;

        // Extract bucket name and object key
        // Assuming format: "bucket-name/path/to/object"
        const firstSlashIndex = profileImagePath.indexOf("/");

        if (firstSlashIndex !== -1) {
          const bucketName = profileImagePath.substring(0, firstSlashIndex);
          const objectName = profileImagePath.substring(firstSlashIndex + 1);

          const signedUrl = await createPresignedUrl(
            bucketName,
            objectName,
            expirySeconds
          );
          freelancerData[0].profile_image_url = signedUrl;
        } else {
          logger.warn(
            `Invalid profile image URL format: ${profileImagePath}`
          );
          freelancerData[0].profile_image_url = null;
        }
      } catch (error) {
        logger.error(`Error generating signed URL for profile image: ${error}`);
        freelancerData[0].profile_image_url = null;
      }
    }

    // Generate presigned URL for thumbnail image if it exists
    if (freelancerData[0].freelancer_thumbnail_image) {
      try {
        const thumbnailPath = freelancerData[0].freelancer_thumbnail_image;

        const firstSlashIndex = thumbnailPath.indexOf("/");

        if (firstSlashIndex !== -1) {
          const bucketName = thumbnailPath.substring(0, firstSlashIndex);
          const objectName = thumbnailPath.substring(firstSlashIndex + 1);

          const thumbSignedUrl = await createPresignedUrl(
            bucketName,
            objectName,
            expirySeconds
          );
          freelancerData[0].freelancer_thumbnail_image = thumbSignedUrl;
        } else {
          logger.warn(
            `Invalid thumbnail image URL format: ${thumbnailPath}`
          );
          freelancerData[0].freelancer_thumbnail_image = null;
        }
      } catch (error) {
        logger.error(
          `Error generating signed URL for thumbnail image: ${error}`
        );
        freelancerData[0].freelancer_thumbnail_image = null;
      }
    }

    const { rows: freelancerServices } = await query(
      `SELECT id, service_name, service_description, service_price, delivery_time
     FROM services WHERE freelancer_id = $1`,
      [freelancerId]
    );

    logger.info(`Successfully fetched freelancer data for ID: ${freelancerId}`);

    // Send response with freelancer basic info and services only
    return res.status(200).json({
      status: "success",
      data: {
        freelancer: freelancerData[0],
        services: freelancerServices.length > 0 ? freelancerServices : [],
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancer by ID:", error);
    return next(new AppError("Failed to fetch freelancer by ID", 500));
  }
};


const getAllfreelancersForcreator = async (req, res, next) => {
  logger.info("Fetching all freelancers with filters");
  try {
    const user = req.user;
    const creator_id = user?.roleWiseId;

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Search and filter parameters
    const search = req.query.search || ""; // Search by freelancer name
    const minPrice = parseFloat(req.query.minPrice) || 0;
    const maxPrice = parseFloat(req.query.maxPrice) || Number.MAX_SAFE_INTEGER;
    // Handle serviceType as an array
    const serviceTypes = req.query.serviceType
      ? Array.isArray(req.query.serviceType)
        ? req.query.serviceType
        : [req.query.serviceType]
      : [];

    // Sort and delivery time filters
    const sortBy = req.query.sortBy || "newest"; // toprated, newest
    const deliveryTime = req.query.deliveryTime || ""; // e.g., "2-3 days"
    // const type = req.query.type || "all"; // e.g., "all", "featured", etc.

    // Build the query based on filters
    let queryText = `
      SELECT
        f.freelancer_id,
        f.freelancer_full_name,
        f.profile_title,
        f.profile_image_url,
        f.freelancer_thumbnail_image,
        f.rating,
        ARRAY_AGG(DISTINCT s.service_name) FILTER (WHERE s.service_name IS NOT NULL) as service_names,
        MIN(s.service_price) as lowest_price,
        CASE WHEN w.freelancer_id IS NOT NULL THEN true ELSE false END as in_wishlist
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      LEFT JOIN wishlist w ON f.freelancer_id = w.freelancer_id AND w.creator_id = $1
      WHERE 1=1 and f.verification_status = 'VERIFIED' and f.is_active = true
    `;

    const queryParams = [creator_id];
    let paramCount = 2;

    // Add search condition
    if (search) {
      queryText += ` AND f.freelancer_full_name ILIKE $${paramCount}`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Add service type filter (using IN clause for array)
    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${paramCount + index}`)
        .join(",");
      queryText += ` AND s.service_name IN (${serviceTypeParams})`;
      queryParams.push(...serviceTypes);
      paramCount += serviceTypes.length;
    }

    // Add price range filter
    queryText += ` AND (s.service_price >= $${paramCount} AND s.service_price <= $${paramCount + 1
      })`;
    queryParams.push(minPrice, maxPrice);
    paramCount += 2;

    // Add delivery time filter
    if (deliveryTime) {
      queryText += ` AND s.delivery_time = $${paramCount}`;
      queryParams.push(deliveryTime);
      paramCount++;
    }

    // Add GROUP BY clause
    queryText += ` GROUP BY f.freelancer_id, f.freelancer_full_name, f.profile_title, f.profile_image_url, f.freelancer_thumbnail_image, f.rating, w.freelancer_id`;

    // Add sorting based on sortBy parameter
    let orderByClause = "";
    switch (sortBy) {
      case "toprated":
        orderByClause =
          " ORDER BY f.rating DESC NULLS LAST, f.freelancer_full_name";
        break;
      case "newest":
      default:
        orderByClause =
          " ORDER BY MAX(s.created_at) DESC NULLS LAST, f.freelancer_full_name";
        break;
    }

    // Add pagination
    queryText += `${orderByClause} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    // Get total count for pagination (count distinct freelancers)
    let countQuery = `
      SELECT COUNT(DISTINCT f.freelancer_id) as count
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1 AND f.verification_status = 'VERIFIED' AND f.is_active = true
    `;

    const countParams = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND f.freelancer_full_name ILIKE $${countParamIndex}`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (serviceTypes.length > 0) {
      const serviceTypeParams = serviceTypes
        .map((_, index) => `$${countParamIndex + index}`)
        .join(",");
      countQuery += ` AND s.service_name IN (${serviceTypeParams})`;
      countParams.push(...serviceTypes);
      countParamIndex += serviceTypes.length;
    }

    countQuery += ` AND (s.service_price >= $${countParamIndex} AND s.service_price <= $${countParamIndex + 1
      })`;
    countParams.push(minPrice, maxPrice);
    countParamIndex += 2;

    if (deliveryTime) {
      countQuery += ` AND s.delivery_time = $${countParamIndex}`;
      countParams.push(deliveryTime);
    }
    console.log("Final Query:", queryText);
    console.log("With Parameters:", queryParams);
    const [results, countResult] = await Promise.all([
      query(queryText, queryParams),
      query(countQuery, countParams),
    ]);

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // Generate presigned URLs for profile images
    const freelancersWithSignedUrls = await Promise.all(
      results.rows.map(async (freelancer) => {
        if (freelancer.profile_image_url) {
          const parts = freelancer.profile_image_url.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.profile_image_url = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.profile_image_url = null;
          }
        }

        // Generate presigned URL for thumbnail image if it exists
        if (freelancer.freelancer_thumbnail_image) {
          const parts = freelancer.freelancer_thumbnail_image.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");

          try {
            const signedUrl = await createPresignedUrl(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.freelancer_thumbnail_image = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer thumbnail ${freelancer.freelancer_id}:`,
              error
            );
            freelancer.freelancer_thumbnail_image = null;
          }
        }

        return freelancer;
      })
    );

    // Sort freelancers - wishlisted ones first, then the rest
    const sortedFreelancers = freelancersWithSignedUrls.sort((a, b) => {
      if (a.in_wishlist && !b.in_wishlist) return -1;
      if (!a.in_wishlist && b.in_wishlist) return 1;
      return 0;
    });

    logger.info(`Found ${totalCount} freelancers matching criteria`);
    return res.status(200).json({
      status: "success",
      data: {
        freelancers: sortedFreelancers,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    logger.error("Error fetching freelancers:", error);
    return next(new AppError("Failed to fetch freelancers", 500));
  }
};

module.exports = {
  getAllfreelancersForcreator,
  getFreelancerForSuggestion,
  removeFreelancerFromWishlist,
  getWishlistFreelancers,
  getUserProfile,
  editProfile,
  getAllFreelancers,
  getFreelancerById,
  getFreelancerPortfolio,
  getFreelancerImpact,
  addFreelancerToWishlist,
  getUserProfileProgress,
  getAllCreatorProfiles,
  getCreatorById,
  getFreelancerForAdmin,
  getFreeLancerByIdForAdmin,
  getFreelancerForSuggestion,
};
