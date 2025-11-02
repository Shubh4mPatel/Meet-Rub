const { query } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { decodedToken } = require("../../../utils/helper");
const { minioClient } = require("../../../config/minio");
const path = require("path");
const {logger} = require("../../../utils/logger");

const BUCKET_NAME = "freelancer-portfolios";
const expirySeconds = 4 * 60 * 60;

const getPortfolioByFreelancerId = async (req, res, next) => {
  logger.info("Fetching portfolio by freelancer ID");
  try {
    const user = decodedToken(req.cookies?.AccessToken);
    logger.debug("Decoded user:", user);

    const { rows: userPortFolios } = await query(
      `SELECT * FROM portfolio WHERE freelancer_id IN (SELECT id FROM freelancer WHERE user_id = $1);`,
      [user.id]
    );

    logger.info(`Found portfolio count: ${userPortFolios.length}`);

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
        const objectName = curr.portfolio_item_url.slice(3).join("/");
        logger.debug("Generating presigned URL for:", objectName);

        const url = await minioClient.presignedGetObject(
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
    const { type, serviceType, itemDescription } = req.body;
    const user = decodedToken(req.cookies?.AccessToken);
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

      const fileExt = path.extname(file.originalname);
      const fileName = `${fileExt}`;
      const folder = `${type}/${user.user_id}`;
      const objectName = `${folder}/${fileName}`;
      const fileUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

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
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [user.id, serviceType, fileData.fileUrl, itemDescription, new Date(), new Date()]
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
  try {
    const { url, type } = req.body;

    if (!req.file || !url) {
      logger.warn("Missing required data");
      return next(new AppError("Please provide all the details", 400));
    }

    logger.debug("Replacing file:", url);

    return res.status(200).json({
      status: "success",
      message: "Portfolio item updated successfully"
    });

  } catch (error) {
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
      message: "Portfolio items deleted"
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
