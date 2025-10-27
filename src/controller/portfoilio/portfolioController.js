const { query } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { decodedToken } = require("../../../utils/helper");
const { minioClient } = require("../../../config/minio");
const path = require("path");
const logger = require("../../../utils/logger");

const BUCKET_NAME = "freelancer-portfolios";
const expirySeconds = 4 * 60 * 60;

const getPortfolioByFreelancerId = async (req, res, next) => {
  try {
    const user = decodedToken(req.cookies?.AccessToken);
    const { rows: userPortFolios } = await query(
      `SELECT *
       FROM portfolio
       WHERE freelancer_id IN (
         SELECT id FROM freelancer WHERE user_id = $1
       );`,
      [user.id]
    );

    if (userPortFolios.length === 0) {
      return res.status(204).json({
        status: "success",
        message: "no portfolio data found",
      });
    }

    const userPortFolioData = await userPortFolios.reduce(
      async (accPromise, curr) => {
        const acc = await accPromise;
        const objectName = curr.portfolio_item_url.slice(3).join("/");
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

    return res.status(200).json({
      status: "success",
      data: userPortFolioData,
      message: "portfolio data found",
    });
  } catch (error) {
    return next(new AppError("Failed to get portfolio", 500));
  }
};

const addFreelancerPortfolio = async (req, res, next) => {
  const uploadedFiles = [];

  try {
    const { type, serviceType, itemDescription } = req.body;
    const user = decodedToken(req.cookies?.AccessToken);

    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return next(new AppError("No files uploaded", 400));
    }

    // Validate type parameter
    if (!["image", "video"].includes(type)) {
      return next(new AppError("Type must be either 'image' or 'video'", 400));
    }

    // Validate file types
    const allowedMimeTypes = {
      image: [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/svg+xml",
      ],
      video: [
        "video/mp4",
        "video/mpeg",
        "video/quicktime",
        "video/x-msvideo",
        "video/webm",
        "video/x-matroska",
      ],
    };

    // Process each file
    for (const file of req.files) {
      // Validate file type matches the specified type
      const isValidType = allowedMimeTypes[type].includes(file.mimetype);

      if (!isValidType) {
        throw new AppError(
          `Invalid file type. Expected ${type} file but received ${file.mimetype}`,
          400
        );
      }

      const fileExt = path.extname(file.originalname);
      const fileName = `${fileExt}`;
      const folder = `${type}/${user.user_id}`;
      const objectName = `${folder}/${fileName}`;
      const fileUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;

      // Upload to MinIO
      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        file.buffer,
        file.size,
        { "Content-Type": file.mimetype }
      );

      uploadedFiles.push({
        objectName,
        fileUrl,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
    }

    // Start database transaction
    try {
      await client.query("BEGIN");

      // Insert portfolio records
      const portfolioRecords = [];
      for (const fileData of uploadedFiles) {
        const { rows } = await client.query(
          `INSERT INTO portfolio 
          (freelancer_id,portfolio_item_service_type , portfolio_item_url, portfolio_item_description , portfolio_item_created_at, portfolio_item_updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            user.id, // Assuming user has freelancer_id
            serviceType,
            fileData.fileUrl,
            itemDescription,
            new Date(),
            new Date(),
          ]
        );
        portfolioRecords.push(rows[0]);
      }

      await client.query("COMMIT");

      res.status(201).json({
        status: "success",
        message: `Portfolio ${type}s uploaded successfully`,
        data: {
          uploadedCount: portfolioRecords.length,
          portfolios: portfolioRecords,
        },
      });
    } catch (dbError) {
      await client.query("ROLLBACK");

      // Cleanup: Remove uploaded files from MinIO
      for (const fileData of uploadedFiles) {
        try {
          await minioClient.removeObject(BUCKET_NAME, fileData.objectName);
        } catch (minioError) {
          console.error("Failed to cleanup MinIO object:", minioError);
        }
      }

      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error("Portfolio upload error:", error);

    // If error occurred before transaction, cleanup MinIO files
    if (uploadedFiles.length > 0 && !error.message.includes("ROLLBACK")) {
      for (const fileData of uploadedFiles) {
        try {
          await minioClient.removeObject(BUCKET_NAME, fileData.objectName);
        } catch (minioError) {
          console.error("Failed to cleanup MinIO object:", minioError);
        }
      }
    }

    return next(new AppError("Failed to add portfolio", 500));
  }
};

const updateFreelancerPortfolio = async (req, res, next) => {
  const client = await pool.connect(); // get a dedicated connection
  try {
    const { url, type } = req.body;
    const user = decodedToken(req.cookies?.AccessToken);

    if (!req.file || !url) {
      return next(new AppError("Please provide all the details", 400));
    }

    if (!["image", "video"].includes(type)) {
      return next(new AppError("Type must be either 'image' or 'video'", 400));
    }

    await client.query('BEGIN'); // start transaction

    const objectToRemove = getObjectNameFromUrl(url, BUCKET_NAME);

    // remove old file (optional — you can skip if you overwrite)
    await minioClient.removeObject(BUCKET_NAME, objectToRemove);

    const fileExt = path.extname(req.file.originalname);
    const fileName = `${Date.now()}${fileExt}`;
    const folder = `${type}/${user.user_id}`;
    const objectName = `${folder}/${fileName}`;
    const fileUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;
    const oldUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectToRemove}`;

    // upload new file to MinIO
    await minioClient.putObject(BUCKET_NAME, objectName, req.file.buffer, {
      "Content-Type": req.file.mimetype,
    });

    // generate presigned URL
    const newUrl = await minioClient.presignedGetObject(
      BUCKET_NAME,
      objectName,
      expirySeconds
    );

    // update DB record atomically
    await client.query(
      `UPDATE portfolio 
       SET portfolio_item_url = $1, portfolio_item_updated_at = $2
       WHERE portfolio_item_url = $3`,
      [fileUrl,new Date.now(), oldUrl]
    );

    await client.query('COMMIT'); // all good — commit

    return res.status(200).json({
      status: "success",
      message: "Portfolio item updated successfully",
      data: { newUrl },
    });
  } catch (error) {
    await client.query('ROLLBACK'); // undo any DB change
    console.error("Update portfolio error:", error);
    return next(new AppError("Failed to update the item", 500));
  } finally {
    client.release(); // always release connection
  }
};

const deleteFreelancerPortfolio = async (req, res, next) => {
  const client = await pool.connect();
  const deletedFiles = [];
  
  try {
    const { urls } = req.body; // Array of presigned URLs to delete
    const user = decodedToken(req.cookies?.AccessToken);

    // Validate input
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return next(new AppError("Please provide portfolio URLs to delete", 400));
    }

    await client.query('BEGIN');

    // Extract object names from presigned URLs and get base URLs
    const urlsData = urls.map(presignedUrl => {
      const objectName = getObjectNameFromPresignedUrl(presignedUrl, BUCKET_NAME);
      const baseUrl = `${process.env.MINIO_ENDPOINT}/assets/${BUCKET_NAME}/${objectName}`;
      return { presignedUrl, objectName, baseUrl };
    });

    const baseUrls = urlsData.map(data => data.baseUrl);

    // Get portfolio items belonging to the user using base URLs
    const { rows: portfolioItems } = await query(
      `SELECT p.id, p.portfolio_item_url 
       FROM portfolio p
       INNER JOIN freelancer f ON p.freelancer_id = f.id
       WHERE p.portfolio_item_url = ANY($1) AND f.user_id = $2`,
      [baseUrls, user.id]
    );

    if (portfolioItems.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: "fail",
        message: "No portfolio items found or you don't have permission to delete them",
      });
    }

    // Create a map of base URL to portfolio item for easier lookup
    const portfolioMap = new Map(
      portfolioItems.map(item => [item.portfolio_item_url, item])
    );

    // Delete files from MinIO
    for (const urlData of urlsData) {
      const portfolioItem = portfolioMap.get(urlData.baseUrl);
      
      if (!portfolioItem) {
        deletedFiles.push({
          url: urlData.presignedUrl,
          objectName: urlData.objectName,
          status: 'not_found',
          message: 'Portfolio item not found or unauthorized'
        });
        continue;
      }

      try {
        await minioClient.removeObject(BUCKET_NAME, urlData.objectName);
        deletedFiles.push({
          id: portfolioItem.id,
          url: urlData.presignedUrl,
          objectName: urlData.objectName,
          status: 'deleted'
        });
      } catch (minioError) {
        logger.error(`Failed to delete MinIO object ${urlData.objectName}:`, minioError);
        deletedFiles.push({
          id: portfolioItem.id,
          url: urlData.presignedUrl,
          objectName: urlData.objectName,
          status: 'failed',
          error: minioError.message
        });
      }
    }

    // Delete from database (only items that were found)
    const portfolioIdsToDelete = portfolioItems.map(item => item.id);
    
    if (portfolioIdsToDelete.length > 0) {
      const { rowCount } = await client.query(
        `DELETE FROM portfolio 
         WHERE id = ANY($1)`,
        [portfolioIdsToDelete]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        status: "success",
        message: `Successfully deleted ${rowCount} portfolio item(s)`,
        data: {
          deletedCount: rowCount,
          requestedCount: urls.length,
          deletedFiles
        }
      });
    } else {
      await client.query('ROLLBACK');
      return res.status(404).json({
        status: "fail",
        message: "No valid portfolio items to delete",
        data: { deletedFiles }
      });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error("Delete portfolio error:", error);

    return next(new AppError("Failed to delete portfolio items", 500));
  } finally {
    client.release();
  }
};

module.exports = {
  getPortfolioByFreelancerId,
  addFreelancerPortfolio,
  updateFreelancerPortfolio,
  deleteFreelancerPortfolio,
};
