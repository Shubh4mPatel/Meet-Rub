const { query } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { decodedToken } = require("../../../utils/helper");
const { minioClient } = require("../../../config/minio");
const path = require("path");
const crypto = require("crypto");

const BUCKET_NAME = "freelancer-portfolios";

const getPortfolioByFreelancerId = async (req, res, next) => {
  try {
    const user = decodedToken(req.cookies?.AccessToken);
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
  } catch (error) {
    return next(new AppError("Failed to get portfolio", 500));
  }
};

const addFreelancerPortfolio = async (req, res, next) => {
  const uploadedFiles = [];
  
  try {
    const { type ,serviceType , itemDescription,} = req.body;
    const user = decodedToken(req.cookies?.AccessToken);

    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return next(new AppError("No files uploaded", 400));
    }

    // Validate type parameter
    if (!['image', 'video'].includes(type)) {
      return next(new AppError("Type must be either 'image' or 'video'", 400));
    }

    // Validate file types
    const allowedMimeTypes = {
      image: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      video: ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska']
    };


    // Process each file
    for (const file of req.files) {
      // Validate file type matches the specified type
      const isValidType = allowedMimeTypes[type].includes(file.mimetype);

      if (!isValidType) {
        throw new AppError(`Invalid file type. Expected ${type} file but received ${file.mimetype}`, 400);
      }

      const fileExt = path.extname(file.originalname);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
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
        mimeType: file.mimetype
      });
    }

    // Start database transaction
    
    try {
      await client.query('BEGIN');

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
            new Date()
          ]
        );
        portfolioRecords.push(rows[0]);
      }

      await client.query('COMMIT');

      res.status(201).json({
        status: 'success',
        message: `Portfolio ${type}s uploaded successfully`,
        data: {
          uploadedCount: portfolioRecords.length,
          portfolios: portfolioRecords
        }
      });

    } catch (dbError) {
      await client.query('ROLLBACK');
      
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
    console.error("Portfolio upload error:", error);
    
    // If error occurred before transaction, cleanup MinIO files
    if (uploadedFiles.length > 0 && !error.message.includes('ROLLBACK')) {
      for (const fileData of uploadedFiles) {
        try {
          await minioClient.removeObject(BUCKET_NAME, fileData.objectName);
        } catch (minioError) {
          console.error("Failed to cleanup MinIO object:", minioError);
        }
      }
    }
    
    return next(
     new AppError("Failed to add portfolio", 500)
    );
  }
};
