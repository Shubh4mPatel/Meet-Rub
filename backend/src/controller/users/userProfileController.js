const AppError = require("../../../utils/appError");
const { query } = require("../../../config/dbConfig");
const { minioClient } = require("../../../config/minio");
const path = require("path");
const crypto = require("crypto");
const { logger } = require("../../../utils/logger");

const BUCKET_NAME = "MeetRubAssets";
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
          "SELECT first_name, last_name, full_name, phone_number, social_platform_type, social_links, niche FROM creators WHERE user_id = $1",
          [user.user_id]
        );

        if (!rows[0]) {
          logger.warn("No creator basic info found");
          return next(new AppError("Creator profile not found", 404));
        }

        return res.status(200).json({
          status: "success",
          data: { userBasicInfo: rows[0] },
        });
      }

      // Creators don't have profile images, govt ID, or bank details in the creators table
      // Return appropriate error messages for unsupported types
      if (
        type === "profileImage" ||
        type === "govtId" ||
        type === "bankDetails"
      ) {
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
          "SELECT freelancer_full_name, date_of_birth, phone_number, profile_title,freelancer_thumbnail_image, freelancer_email FROM freelancer WHERE user_id = $1",
          [user.user_id]
        );

        if (!rows[0]) {
          logger.warn("No freelancer basic info found");
          return next(new AppError("Freelancer profile not found", 404));
        }

        // Generate presigned URL for thumbnail image if it exists
        if (rows[0].freelancer_thumbnail_image) {
          const parts = rows[0].freelancer_thumbnail_image.split("/");
          const bucketName = parts[2];
          const objectName = parts.slice(3).join("/");

          const signedUrl = await minioClient.presignedGetObject(
            bucketName,
            objectName,
            expirySeconds
          );

          rows[0].freelancer_thumbnail_image = signedUrl;
        }

        return res.status(200).json({
          status: "success",
          data: { userBasicInfo: rows[0] },
        });
      }

      if (type === "profileImage") {
        logger.info("Fetching: Freelancer Profile Image");
        const { rows } = await query(
          "SELECT profile_image_url FROM freelancer WHERE user_id = $1",
          [user.user_id]
        );

        if (!rows[0]?.profile_image_url) {
          logger.warn("Profile image not uploaded");
          return next(new AppError("No profile image found", 404));
        }

        const parts = rows[0].profile_image_url.split("/");
        const bucketName = parts[2];
        const objectName = parts.slice(3).join("/");

        const signedUrl = await minioClient.presignedGetObject(
          bucketName,
          objectName,
          expirySeconds
        );

        return res.status(200).json({
          status: "success",
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
        const bucketName = parts[2];
        const objectName = parts.slice(3).join("/");

        const signedUrl = await minioClient.presignedGetObject(
          bucketName,
          objectName,
          expirySeconds
        );

        return res.status(200).json({
          status: "success",
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
          "SELECT bank_account_no, bank_name, bank_ifsc_code, bank_branch_name FROM freelancer WHERE user_id=$1",
          [user.user_id]
        );

        if (!rows[0]) {
          logger.warn("No bank details found");
          return next(new AppError("No bank details found", 404));
        }

        return res.status(200).json({
          status: "success",
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

// ✅ EDIT USER PROFILE
const editProfile = async (req, res, next) => {
  logger.info("Updating user profile");
  try {
    const user = req.user;
    const role = user.role;
    const { type, userData } = req.body;

    logger.debug("Edit request type:", type);
    logger.debug("User role:", role);
    logger.debug("Received Data:", userData);

    if (!type || !userData) {
      logger.warn("Missing type or data for profile update");
      return next(new AppError("type & userData required", 400));
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
          social_platform_type,
          social_links,
          niche,
        } = userData;

        if (
          !first_name ||
          !last_name ||
          !phone_number ||
          !social_platform_type
        ) {
          logger.warn("Missing required creator fields");
          return next(
            new AppError(
              "first_name, last_name, phone_number, and social_platform_type are required",
              400
            )
          );
        }

        // Validate social_platform_type
        if (!["youtube", "instagram"].includes(social_platform_type)) {
          logger.warn("Invalid social platform type");
          return next(
            new AppError(
              "social_platform_type must be either 'youtube' or 'instagram'",
              400
            )
          );
        }

        // Start transaction
        await query("BEGIN");
        try {
          const { rows } = await query(
            `UPDATE creators
             SET first_name=$1, last_name=$2, full_name=$3, phone_number=$4,
                 social_platform_type=$5, social_links=$6, niche=$7, updated_at=CURRENT_TIMESTAMP
             WHERE user_id=$8
             RETURNING first_name, last_name, full_name, phone_number, social_platform_type, social_links, niche`,
            [
              first_name,
              last_name,
              full_name,
              phone_number,
              social_platform_type,
              social_links,
              niche,
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
            data: rows[0],
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

        const { bank_account_no, bank_name, bank_ifsc_code, bank_branch_name } =
          userData;

        if (
          !bank_account_no ||
          !bank_name ||
          !bank_ifsc_code ||
          !bank_branch_name
        ) {
          logger.warn("Missing bank details fields");
          return next(new AppError("All bank details required", 400));
        }

        // Start transaction
        await query("BEGIN");
        try {
          const { rows } = await query(
            "UPDATE freelancer SET freelancer_full_name=$1, bank_account_no=$2, bank_name=$3, bank_ifsc_code=$4, bank_branch_name=$5 WHERE user_id=$6 RETURNING *",
            [
              freelancer_fullname,
              bank_account_no,
              bank_name,
              bank_ifsc_code,
              bank_branch_name,
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

        const { gov_id_type, gov_id_number } = userData;

        if (!gov_id_type || !req.file) {
          logger.warn("Missing fields for govt ID update");
          return next(new AppError("gov ID and file required", 400));
        }

        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = `freelancer/goverment-doc/${gov_id_type}`;
        const objectName = `${folder}/${fileName}`;
        const gov_id_url = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

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

          const signedUrl = await minioClient.presignedGetObject(
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

        if (!req.file) {
          logger.warn("Profile image missing");
          return next(new AppError("Profile image required", 400));
        }

        const fileExt = path.extname(req.file.originalname);
        const fileName = `${crypto.randomUUID()}${fileExt}`;
        const folder = "freelancer/freelancer-profile-image";
        const objectName = `${folder}/${fileName}`;
        const profile_url = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

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
          const signedUrl = await minioClient.presignedGetObject(
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
          dateOfBirth,
          phoneNumber,
          profileTitle,
          thumbnailImageUrl,
        } = userData;

        if (
          !freelancerFullName ||
          !dateOfBirth ||
          !phoneNumber ||
          !profileTitle
        ) {
          logger.warn("Missing basicInfo fields");
          return next(new AppError("All basic info fields required", 400));
        }

        // Start transaction
        await query("BEGIN");
        try {
          // Check if thumbnail file needs to be uploaded
          let newThumbnailUrl = null;
          let signedUrl = null;
          if (thumbnailImageUrl) {
            // Fetch current thumbnail URL from database
            const { rows: currentData } = await query(
              "SELECT freelancer_thumbnail_image FROM freelancer WHERE user_id = $1",
              [user.user_id]
            );

            const currentThumbnailUrl =
              currentData[0]?.freelancer_thumbnail_image;

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

              logger.info("Thumbnail URL changed, uploading new file to MinIO");

              const fileExt = path.extname(req.file.originalname);
              const fileName = `${crypto.randomUUID()}${fileExt}`;
              const folder = "freelancer/freelancer-profile-thumbnail";
              const objectName = `${folder}/${fileName}`;
              newThumbnailUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

              // Upload to MinIO
              await minioClient.putObject(
                BUCKET_NAME,
                objectName,
                req.file.buffer,
                req.file.size,
                { "Content-Type": req.file.mimetype }
              );

              signedUrl = await minioClient.presignedGetObject(
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
            updateQuery = `UPDATE freelancer SET freelancer_full_name=$1, date_of_birth=$2, phone_number=$3, profile_title=$4, profile_image_url=$5 WHERE user_id=$6
             RETURNING freelancer_full_name, freelancer_email, date_of_birth, phone_number, profile_title, freelancer_thumbnail_image`;
            updateParams = [
              freelancerFullName,
              dateOfBirth,
              phoneNumber,
              profileTitle,
              newThumbnailUrl,
              user.user_id,
            ];
          } else {
            updateQuery = `UPDATE freelancer SET freelancer_full_name=$1,  date_of_birth=$2, phone_number=$3, profile_title=$4 WHERE user_id=$5
             RETURNING freelancer_full_name, freelancer_email, date_of_birth, phone_number, profile_title, freelancer_thumbnail_image`;
            updateParams = [
              freelancerFullName,
              dateOfBirth,
              phoneNumber,
              profileTitle,
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
            data: rows[0].freelancer_thumbnail_image
              ? {
                  ...rows[0],
                  freelancer_thumbnail_image:
                    signedUrl || rows[0].freelancer_thumbnail_image,
                }
              : rows[0],
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

    // Build the query based on filters
    let queryText = `
      SELECT
        f.freelancer_id,
        f.freelancer_full_name,
        f.profile_title,
        f.profile_image_url,
        f.rating,
        s.services_name,
        s.service_price,
        s.delivery_time,
        s.created_at
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      WHERE 1=1
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
      queryText += ` AND s.services_name IN (${serviceTypeParams})`;
      queryParams.push(...serviceTypes);
      paramCount += serviceTypes.length;
    }

    // Add price range filter
    queryText += ` AND (s.service_price >= $${paramCount} AND s.service_price <= $${
      paramCount + 1
    })`;
    queryParams.push(minPrice, maxPrice);
    paramCount += 2;

    // Add delivery time filter
    if (deliveryTime) {
      queryText += ` AND s.delivery_time = $${paramCount}`;
      queryParams.push(deliveryTime);
      paramCount++;
    }

    // Add sorting based on sortBy parameter
    let orderByClause = "";
    switch (sortBy) {
      case "toprated":
        orderByClause =
          "ORDER BY f.rating DESC NULLS LAST, f.freelancer_full_name";
        break;
      case "newest":
      default:
        orderByClause =
          "ORDER BY s.created_at DESC NULLS LAST, f.freelancer_full_name";
        break;
    }

    // Add pagination
    queryText += ` ${orderByClause}
                  LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(DISTINCT f.freelancer_id)
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
      countQuery += ` AND s.services_name IN (${serviceTypeParams})`;
      countParams.push(...serviceTypes);
      countParamIndex += serviceTypes.length;
    }

    countQuery += ` AND (s.service_price >= $${countParamIndex} AND s.service_price <= $${
      countParamIndex + 1
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
          const bucketName = parts[2];
          const objectName = parts.slice(3).join("/");

          try {
            const signedUrl = await minioClient.presignedGetObject(
              bucketName,
              objectName,
              expirySeconds
            );
            freelancer.profile_image_url = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for freelancer ${freelancer.user_id}:`,
              error
            );
            freelancer.profile_image_url = null;
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

    // Generate presigned URL for profile image if it exists
    if (freelancerData[0].profile_image_url) {
      try {
        const parts = freelancerData[0].profile_image_url.split("/");
        if (parts.length >= 4) {
          const bucketName = parts[2];
          const objectName = parts.slice(3).join("/");

          const signedUrl = await minioClient.presignedGetObject(
            bucketName,
            objectName,
            expirySeconds
          );
          freelancerData[0].profile_image_url = signedUrl;
        } else {
          logger.warn(
            `Invalid profile image URL format: ${freelancerData[0].profile_image_url}`
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
        const thumbParts =
          freelancerData[0].freelancer_thumbnail_image.split("/");
        if (thumbParts.length >= 4) {
          const thumbBucketName = thumbParts[2];
          const thumbObjectName = thumbParts.slice(3).join("/");
          const thumbSignedUrl = await minioClient.presignedGetObject(
            thumbBucketName,
            thumbObjectName,
            expirySeconds
          );
          freelancerData[0].freelancer_thumbnail_image = thumbSignedUrl;
        } else {
          logger.warn(
            `Invalid thumbnail image URL format: ${freelancerData[0].freelancer_thumbnail_image}`
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
      `SELECT id, services_name, service_description, service_price, delivery_time
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
                const parts = item.portfolio_item_url.split("/");
                if (parts.length >= 4) {
                  const bucketName = parts[2];
                  const objectName = parts.slice(3).join("/");
                  const signedUrl = await minioClient.presignedGetObject(
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
                const beforeParts = item.before_service_url.split("/");
                if (beforeParts.length >= 4) {
                  const beforeBucketName = beforeParts[2];
                  const beforeObjectName = beforeParts.slice(3).join("/");
                  beforeSignedUrl = await minioClient.presignedGetObject(
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
                const afterParts = item.after_service_url.split("/");
                if (afterParts.length >= 4) {
                  const afterBucketName = afterParts[2];
                  const afterObjectName = afterParts.slice(3).join("/");
                  afterSignedUrl = await minioClient.presignedGetObject(
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

const addFreelancerToWhitelist = async (req, res, next) => {
  // Implementation goes here
  try {
    const user = req.user;
    const freelancerId = req.params.id;
    await query(
      "INSERT INTO whitelist (user_id, freelancer_id,created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [user.user_id, freelancerId, new Date()]
    );
    logger.info(
      `Freelancer ${freelancerId} added to whitelist for user ${user.user_id}`
    );
    return res.status(200).json({
      status: "success",
      message: "Freelancer added to whitelist successfully",
    });
  } catch (error) {
    return next(new AppError("Failed to add freelancer to whitelist", 500));
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
        freelancerProgressWeights.ProfileInfo += 40;
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
      "SELECT portfolio_id FROM portfolio WHERE freelancer_id=(SELECT freelancer_id FROM freelancer WHERE user_id=$1)",
      [user.user_id]
    );
    if (freelancerPortfolio.length > 0) {
      freelancerProgressWeights.Portfolio = 20;
    }
  } catch (error) {
    logger.error("Error calculating profile progress:", error);
    return next(new AppError("Failed to calculate profile progress", 500));
  }
};

module.exports = {
  getUserProfile,
  editProfile,
  getAllFreelancers,
  getFreelancerById,
  getFreelancerPortfolio,
  getFreelancerImpact,
  addFreelancerToWhitelist,
  getUserProfileProgress,
};
