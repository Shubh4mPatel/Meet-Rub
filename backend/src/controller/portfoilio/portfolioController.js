const { query } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { minioClient } = require("../../../config/minio");
const { logger } = require("../../../utils/logger");
const { createPresignedUrl } = require("../../../utils/helper");

const BUCKET_NAME = "meet-rub-assets";
const expirySeconds = 4 * 60 * 60;

const getPortfolioByFreelancerId = async (req, res, next) => {
  logger.info("Fetching portfolio by freelancer ID");
  try {
    const user = req.user;
    logger.debug("Decoded user:", user);

    const { rows: userPortFolios } = await query(
      `SELECT * FROM portfolio WHERE freelancer_id =$1;`,
      [user.roleWiseId]
    );

    logger.info(`Found portfolio count: ${userPortFolios.length}`);
    console.log("User :", user);
    if (userPortFolios.length === 0) {
      logger.warn("No portfolio data found");
      return res.status(204).json({
        status: "success",
        message: "no portfolio data found",
      });
    }

    const userPortFolioData = await userPortFolios.reduce(
      async (accPromise, curr) => {
        const acc = await accPromise;
        const objectName = curr.portfolio_item_url.split("/").slice(3).join("/");
        logger.debug("Generating presigned URL for:", objectName);

        const url = await createPresignedUrl(
          BUCKET_NAME,
          objectName,
          expirySeconds
        );

        curr.portfolio_item_url = url;
        const key = curr.portfolio_item_service_type;
        (acc[key] ||= []).push(curr);
        return acc;
      },
      Promise.resolve({})
    );

    logger.info("Portfolio data successfully fetched");
    return res.status(200).json({
      status: "success",
      data: userPortFolioData,
      message: "portfolio data found",
    });
  } catch (error) {
    logger.error("Error fetching portfolio data:", error);
    return next(new AppError("Failed to get portfolio", 500));
  }
};

const addFreelancerPortfolio = async (req, res, next) => {
  logger.info("Adding freelancer portfolio");
  const uploadedFiles = [];

  try {
    console.log("Request body:", req.body);
    const { type, serviceType, itemDescription } = req.body;
    const user = req.user;
    logger.debug("Request body:", req.body);

    if (!req.files?.length) {
      logger.warn("No files uploaded");
      return next(new AppError("No files uploaded", 400));
    }

    if (!["image", "video"].includes(type)) {
      logger.warn("Invalid file type:", type);
      return next(new AppError("Type must be either 'image' or 'video'", 400));
    }

    for (const file of req.files) {
      logger.info(`Uploading file: ${file.originalname}`);

      // const fileExt = path.extname(file.originalname);
      const fileName = `${file.originalname}`;
      const folder = `freelancer/portfolio/${user.user_id}`;
      const objectName = `${folder}/${fileName}`;
      const fileUrl = `/assets/${BUCKET_NAME}/${objectName}`;

      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        file.buffer,
        file.size,
        { "Content-Type": file.mimetype }
      );

      logger.info(`File uploaded successfully: ${file.originalname}`);

      uploadedFiles.push({ objectName, fileUrl });
    }

    logger.debug("Saving metadata to DB");

    const portfolioRecords = [];
    for (const fileData of uploadedFiles) {
      const { rows } = await query(
        `INSERT INTO portfolio 
(freelancer_id, portfolio_item_service_type, portfolio_item_url, portfolio_item_description, portfolio_item_created_at, portfolio_item_updated_at)
VALUES (
$1,
  $2, $3, $4, $5, $6
)
RETURNING *`,
        [
          user.roleWiseId,
          serviceType,
          fileData.fileUrl,
          itemDescription,
          new Date(),
          new Date(),
        ]
      );
      portfolioRecords.push(rows[0]);
    }

    logger.info("Portfolio saved successfully");

    res.status(201).json({
      status: "success",
      message: `Portfolio ${type}s uploaded successfully`,
      data: {
        uploadedCount: portfolioRecords.length,
        portfolios: portfolioRecords,
      },
    });
  } catch (error) {
    logger.error("Portfolio upload error:", error);
    return next(new AppError("Failed to add portfolio", 500));
  }
};

const updateFreelancerPortfolio = async (req, res, next) => {
  logger.info("Updating freelancer portfolio");
  const uploadedObjectName = null;
  let client = null;

  try {
    const { itemId, type, serviceType, itemDescription } = req.body;
    const user = req.user;

    if (!req.file) {
      logger.warn("Missing file");
      return next(new AppError("Please provide a file to upload", 400));
    }

    // Start database transaction
    client = await query("BEGIN");
    logger.info("Transaction started");

    let oldObjectName = null;

    // If itemId exists, fetch the old URL for deletion
    if (itemId) {
      logger.info(`Fetching existing portfolio item: ${itemId}`);
      const { rows } = await query(
        `SELECT portfolio_item_url FROM portfolio WHERE portfolio_item_id = $1`,
        [itemId]
      );

      if (rows.length === 0) {
        await query("ROLLBACK");
        logger.warn("Portfolio item not found");
        return next(new AppError("Portfolio item not found", 404));
      }

      oldObjectName = rows[0].portfolio_item_url.split("/").slice(3).join("/");
      logger.debug(`Old object to delete: ${oldObjectName}`);
    }

    // Upload new file to MinIO
    const fileName = `${req.file.originalname}`;
    const folder = `freelancer/portfolio/${user.user_id}`;
    const objectName = `${folder}/${fileName}`;
    const fileUrl = `/assets/${BUCKET_NAME}/${objectName}`;

    await minioClient.putObject(
      BUCKET_NAME,
      objectName,
      req.file.buffer,
      req.file.size,
      { "Content-Type": req.file.mimetype }
    );

    logger.info(`File uploaded successfully: ${fileName}`);

    // If no itemId provided, insert new record
    if (!itemId) {
      logger.info("No itemId provided, adding new portfolio item");

      if (!["image", "video"].includes(type)) {
        await query("ROLLBACK");
        // Delete uploaded file on validation failure
        await minioClient.removeObject(BUCKET_NAME, objectName);
        logger.warn("Invalid file type:", type);
        return next(new AppError("Type must be either 'image' or 'video'", 400));
      }

      // Check if user has existing portfolio items
      const { rows: existingItems } = await query(
        `SELECT DISTINCT portfolio_item_service_type FROM portfolio WHERE freelancer_id = $1`,
        [user.roleWiseId]
      );

      // If user has existing items, validate serviceType matches
      if (existingItems.length > 0) {
        const existingServiceType = existingItems[0].portfolio_item_service_type;

        if (serviceType !== existingServiceType) {
          await query("ROLLBACK");
          // Delete uploaded file on validation failure
          await minioClient.removeObject(BUCKET_NAME, objectName);
          logger.warn(`ServiceType mismatch. Expected: ${existingServiceType}, Got: ${serviceType}`);
          return next(
            new AppError(
              `Service type must be '${existingServiceType}' to match your existing portfolio items`,
              400
            )
          );
        }
      }

      await query(
        `INSERT INTO portfolio
        (freelancer_id, portfolio_item_service_type, portfolio_item_url, portfolio_item_description, portfolio_item_created_at, portfolio_item_updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          user.roleWiseId,
          serviceType,
          fileUrl,
          itemDescription,
          new Date(),
          new Date(),
        ]
      );
      logger.info("New portfolio item added");
    } else {
      // If itemId exists, update existing record
      logger.info(`Updating existing portfolio item: ${itemId}`);

      await query(
        `UPDATE portfolio
         SET portfolio_item_url = $1, portfolio_item_updated_at = $2
         WHERE portfolio_item_id = $3`,
        [fileUrl, new Date(), itemId]
      );

      logger.info("Portfolio item updated in database");

      // Delete old file from MinIO
      if (oldObjectName) {
        try {
          await minioClient.removeObject(BUCKET_NAME, oldObjectName);
          logger.info(`Old file deleted from MinIO: ${oldObjectName}`);
        } catch (minioError) {
          logger.warn(`Failed to delete old file: ${oldObjectName}`, minioError);
          // Continue - we don't want to fail the transaction if old file deletion fails
        }
      }
    }

    // Commit transaction
    await query("COMMIT");
    logger.info("Transaction committed");

    // Fetch all portfolio data for this user
    const { rows: allPortfolios } = await query(
      `SELECT * FROM portfolio WHERE freelancer_id = $1 and portfolio_item_service_type = $2;`,
      [user.roleWiseId, serviceType]
    );

    const portfolioData = await allPortfolios.reduce(
      async (accPromise, curr) => {
        const acc = await accPromise;
        const objectName = curr.portfolio_item_url.split("/").slice(3).join("/");

        const url = await createPresignedUrl(
          BUCKET_NAME,
          objectName,
          expirySeconds
        );

        curr.portfolio_item_url = url;
        const key = curr.portfolio_item_service_type;
        (acc[key] ||= []).push(curr);
        return acc;
      },
      Promise.resolve({})
    );

    logger.info("Portfolio data successfully prepared");

    return res.status(200).json({
      status: "success",
      message: itemId ? "Portfolio item updated successfully" : "Portfolio item added successfully",
      data: portfolioData,
    });
  } catch (error) {
    // Rollback transaction on any error
    if (client) {
      await query("ROLLBACK");
      logger.info("Transaction rolled back");
    }

    // Clean up uploaded file if transaction failed
    if (uploadedObjectName) {
      try {
        await minioClient.removeObject(BUCKET_NAME, uploadedObjectName);
        logger.info("Cleaned up uploaded file after error");
      } catch (cleanupError) {
        logger.error("Failed to cleanup uploaded file:", cleanupError);
      }
    }

    logger.error("Update portfolio error:", error);
    return next(new AppError("Failed to update portfolio", 500));
  }
};

const deleteFreelancerPortfolio = async (req, res, next) => {
  logger.info("Deleting freelancer portfolio");
  try {
    const { urls } = req.body;

    if (!urls?.length) {
      logger.warn("No URLs provided for deletion");
      return next(new AppError("Please provide portfolio URLs to delete", 400));
    }

    logger.debug(`Deleting ${urls.length} portfolio items...`);

    return res.status(200).json({
      status: "success",
      message: "Portfolio items deleted",
    });
  } catch (error) {
    logger.error("Delete portfolio error:", error);
    return next(new AppError("Failed to delete portfolio items", 500));
  }
};

module.exports = {
  getPortfolioByFreelancerId,
  addFreelancerPortfolio,
  updateFreelancerPortfolio,
  deleteFreelancerPortfolio,
};
