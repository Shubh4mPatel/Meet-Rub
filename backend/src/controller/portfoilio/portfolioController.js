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
    const { serviceType, itemDescription } = req.body;
    const user = req.user;
    logger.debug("Request body:", req.body);

    if (!req.files?.length) {
      logger.warn("No files uploaded");
      return next(new AppError("No files uploaded", 400));
    }

    for (const file of req.files) {
      logger.info(`Uploading file: ${file.originalname}`);
      const fileName = `${file.originalname}`;
      const folder = `freelancer/portfolio/${user.user_id}`;
      const objectName = `${folder}/${fileName}`;
      const fileUrl = `${BUCKET_NAME}/${objectName}`;

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

    // Generate presigned URLs for the response
    const portfoliosWithPresignedUrls = await Promise.all(
      portfolioRecords.map(async (record) => {
        const objectName = record.portfolio_item_url.split("/").slice(1).join("/");
        const presignedUrl = await createPresignedUrl(
          BUCKET_NAME,
          objectName,
          expirySeconds
        );
        // Return record with presigned URL, excluding the db URL
        const { portfolio_item_url, ...rest } = record;
        return { ...rest, portfolio_item_url: presignedUrl };
      })
    );

    logger.info("Portfolio saved successfully");

    res.status(201).json({
      status: "success",
      message: `Portfolio uploaded successfully`,
      data: {
        uploadedCount: portfoliosWithPresignedUrls.length,
        portfolios: portfoliosWithPresignedUrls,
      },
    });
  } catch (error) {
    logger.error("Portfolio upload error:", error);
    return next(new AppError("Failed to add portfolio", 500));
  }
};

const updateFreelancerPortfolio = async (req, res, next) => {
  logger.info("Updating freelancer portfolio");
  let uploadedObjectName = null;
  let client = null;

  try {
    const { itemId, serviceType, itemDescription, url } = req.body;
    const user = req.user;

    // Validate that itemId is provided
    if (!itemId) {
      logger.warn("Missing itemId");
      return next(new AppError("itemId is required for updating portfolio", 400));
    }

    // Start database transaction
    client = await query("BEGIN");
    logger.info("Transaction started");

    let oldObjectName = null;
    let existingUrl = null;
    let shouldUpdateImage = !url; // Update image only if URL is not provided

    // Fetch the existing data
    logger.info(`Fetching existing portfolio item: ${itemId}`);
    const { rows } = await query(
      `SELECT portfolio_item_url, portfolio_item_description FROM portfolio WHERE portfolio_item_id = $1`,
      [itemId]
    );

    if (rows.length === 0) {
      await query("ROLLBACK");
      logger.warn("Portfolio item not found");
      return next(new AppError("Portfolio item not found", 404));
    }

    existingUrl = rows[0].portfolio_item_url;
    oldObjectName = existingUrl.split("/").slice(3).join("/");

    if (shouldUpdateImage) {
      logger.info("URL not provided, will update image");
    } else {
      logger.info("URL provided, skipping image update");
    }

    let fileUrl = existingUrl; // Default to existing URL

    // Only process file upload if image should be updated
    if (shouldUpdateImage) {
      if (!req.file) {
        await query("ROLLBACK");
        logger.warn("Missing file");
        return next(new AppError("Please provide a file to upload", 400));
      }

      // Upload new file to MinIO
      const fileName = `${req.file.originalname}`;
      const folder = `freelancer/portfolio/${user.user_id}`;
      const objectName = `${folder}/${fileName}`;
      fileUrl = `${BUCKET_NAME}/${objectName}`;
      uploadedObjectName = objectName;

      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        req.file.buffer,
        req.file.size,
        { "Content-Type": req.file.mimetype }
      );

      logger.info(`File uploaded successfully: ${fileName}`);
    }

    // Update existing record
    logger.info(`Updating existing portfolio item: ${itemId}`);

    // Build update query based on what needs to be updated
    if (shouldUpdateImage) {
      await query(
        `UPDATE portfolio
         SET portfolio_item_url = $1, portfolio_item_description = $2, portfolio_item_updated_at = $3
         WHERE portfolio_item_id = $4`,
        [fileUrl, itemDescription, new Date(), itemId]
      );
      logger.info("Portfolio item URL and description updated in database");
    } else {
      // Only update description and timestamp if URL is the same
      await query(
        `UPDATE portfolio
         SET portfolio_item_description = $1, portfolio_item_updated_at = $2
         WHERE portfolio_item_id = $3`,
        [itemDescription, new Date(), itemId]
      );
      logger.info("Portfolio item description updated in database (image unchanged)");
    }

    // Delete old file from MinIO only if we uploaded a new one
    if (shouldUpdateImage && oldObjectName) {
      try {
        await minioClient.removeObject(BUCKET_NAME, oldObjectName);
        logger.info(`Old file deleted from MinIO: ${oldObjectName}`);
      } catch (minioError) {
        logger.warn(`Failed to delete old file: ${oldObjectName}`, minioError);
        // Continue - we don't want to fail the transaction if old file deletion fails
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
    const portfolio_item_service_type = req.query?.serviceType;
    if (!portfolio_item_service_type) {
      logger.warn("Missing portfolio_item_service_type in query parameters");
      return next(new AppError("portfolio_item_service_type is required in query parameters", 400));
    }
    const user = req.user;
    const FreelancerId = user.roleWiseId;
    logger.debug(`Freelancer ID: ${FreelancerId}, Service Type: ${portfolio_item_service_type}`);

    const { rows: portfolioItems } = await query(
      `SELECT portfolio_item_url FROM portfolio WHERE freelancer_id = $1 AND portfolio_item_service_type = $2`,
      [FreelancerId, portfolio_item_service_type]
    );

    if (portfolioItems.length === 0) {
      logger.warn("No portfolio items found to delete");
      return res.status(201).json({ status: "fail", message: "No portfolio items found to delete" });
    }

    const urls = portfolioItems.map(item => item.portfolio_item_url);
    const objectNames = urls.map(url => url.split("/").slice(3).join("/"));

    logger.debug(`Deleting ${objectNames.length} portfolio items from MinIO...`);

    for (const objectName of objectNames) {
      try {
        await minioClient.removeObject(BUCKET_NAME, objectName);
        logger.info(`Deleted object from MinIO: ${objectName}`);
      } catch (minioError) {
        logger.warn(`Failed to delete object from MinIO: ${objectName}`, minioError);
      }
    }

    await query(
      `DELETE FROM portfolio WHERE freelancer_id = $1 AND portfolio_item_service_type = $2`,
      [FreelancerId, portfolio_item_service_type]
    );

    logger.info("Portfolio items deleted from database");

    return res.status(200).json({
      status: "success",
      message: "Portfolio items deleted",
    });
  } catch (error) {
    logger.error("Delete portfolio error:", error);
    return next(new AppError("Failed to delete portfolio items", 500));
  }
};

const deleteFreelancerProtfolioItem = async (req, res, next) => {
  logger.info("Deleting a freelancer portfolio item");
  let client = null;

  try {
    const { itemId } = req.query;
    const user = req.user;

    // Validate that itemId is provided
    if (!itemId) {
      logger.warn("Missing itemId in query parameters");
      return next(new AppError("itemId is required in query parameters", 400));
    }

    logger.debug(`Deleting portfolio item ID: ${itemId} for user ID: ${user.roleWiseId}`);

    // Start database transaction
    client = await query("BEGIN");
    logger.info("Transaction started");

    // Fetch the portfolio item to get the URL
    const { rows } = await query(
      `SELECT portfolio_item_url FROM portfolio WHERE portfolio_item_id = $1 AND freelancer_id = $2`,
      [itemId, user.roleWiseId]
    );

    if (rows.length === 0) {
      await query("ROLLBACK");
      logger.warn("Portfolio item not found");
      return next(new AppError("Portfolio item not found", 404));
    }

    const objectName = rows[0].portfolio_item_url.split("/").slice(3).join("/");
    logger.debug(`Object to delete from MinIO: ${objectName}`);

    // Delete the object from MinIO
    try {
      await minioClient.removeObject(BUCKET_NAME, objectName);
      logger.info(`Deleted object from MinIO: ${objectName}`);
    } catch (minioError) {
      await query("ROLLBACK");
      logger.error(`Failed to delete object from MinIO: ${objectName}`, minioError);
      return next(new AppError("Failed to delete portfolio item from storage", 500));
    }

    // Delete the portfolio item from the database
    await query(
      `DELETE FROM portfolio WHERE portfolio_item_id = $1 AND freelancer_id = $2`,
      [itemId, user.roleWiseId]
    );
    logger.info("Portfolio item deleted from database");

    // Commit transaction
    await query("COMMIT");
    logger.info("Transaction committed");

    return res.status(200).json({
      status: "success",
      message: "Portfolio item deleted successfully",
    });
  } catch (error) {
    // Rollback transaction on any error
    if (client) {
      await query("ROLLBACK");
      logger.info("Transaction rolled back");
    }

    logger.error("Error deleting portfolio item:", error);
    return next(new AppError("Failed to delete portfolio item", 500));
  }
};

module.exports = {
  getPortfolioByFreelancerId,
  addFreelancerPortfolio,
  updateFreelancerPortfolio,
  deleteFreelancerPortfolio,
  deleteFreelancerProtfolioItem,
};
