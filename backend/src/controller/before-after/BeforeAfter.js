const { query, pool } = require("../../../config/dbConfig");
const { minioClient } = require("../../../config/minio");
const AppError = require("../../../utils/appError");
const { logger } = require("../../../utils/logger");
const path = require("path");
const crypto = require("crypto");
const { createPresignedUrl } = require("../../../utils/helper");

const BUCKET_NAME = "meet-rub-assets";
const expirySeconds = 4 * 60 * 60;

const uploadBeforeAfter = async (req, res, next) => {
  logger.info("Before/After upload started");

  let client;
  const uploadedFiles = [];

  try {
    const { serviceType } = req.body;
    const user = req.user
    const freelancerId = user?.roleWiseId;
    client = await pool.connect();

    logger.debug("Request payload", req.body);

    if (!serviceType) {
      logger.warn("Missing required fields serviceType ");
      return next(new AppError("Service and details are required", 400));
    }

    if (!req.files?.before?.[0] || !req.files?.after?.[0]) {
      logger.error("Before or After file missing");
      return next(new AppError("Both before and after files are required", 400));
    }

    const beforeFile = req.files.before[0];
    const afterFile = req.files.after[0];

    await client.query("BEGIN");
    logger.info("DB Transaction started");

    const filesToUpload = [
      { file: beforeFile, type: "before" },
      { file: afterFile, type: "after" }
    ];

    for (const { file, type } of filesToUpload) {
      const fileExt = path.extname(file.originalname);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      const folder = `freelancer/Impact/${user.user_id}/${type}`;
      const objectName = `${folder}/${fileName}`;
      const fileUrl = `${BUCKET_NAME}/${objectName}`;

      logger.debug(`Uploading ${type} file: ${file.originalname}`);

      await minioClient.putObject(BUCKET_NAME, objectName, file.buffer, file.size, {
        "Content-Type": file.mimetype,
      });
      const publicUrl = await createPresignedUrl(
        BUCKET_NAME,
        objectName,
        expirySeconds
      );
      logger.info(`${type} file uploaded to MinIO: ${objectName}`);

      uploadedFiles.push({ type, objectName, fileUrl, publicUrl });
    }

    const { rows } = await client.query(
      `INSERT INTO impact 
        (freelancer_id, service_type, before_service_url, after_service_url,
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        freelancerId,
        serviceType,
        uploadedFiles.find(f => f.type === "before").fileUrl,
        uploadedFiles.find(f => f.type === "after").fileUrl,
        new Date(),
        new Date(),
      ]
    );

    await client.query("COMMIT");
    logger.info("Impact saved — DB Transaction committed ✅");

    const impactData = {
      impact_id: rows[0].impact_id,
      freelancer_id: rows[0].freelancer_id,
      service_type: rows[0].service_type,
      before_service_public_url: uploadedFiles.find(f => f.type === "before").publicUrl,
      after_service_public_url: uploadedFiles.find(f => f.type === "after").publicUrl,
      impact_metric: rows[0].impact_metric,
      created_at: rows[0].created_at,
      updated_at: rows[0].updated_at,
    };

    return res.status(201).json({
      status: "success",
      message: "Before/After uploaded successfully",
      data: impactData,
    });

  } catch (error) {
    logger.error("Upload before/after error:", error);
    if (client) await client.query("ROLLBACK");

    for (const fileData of uploadedFiles) {
      try {
        await minioClient.removeObject(BUCKET_NAME, fileData.objectName);
        logger.warn("File rollback success:", fileData.objectName);
      } catch (cleanupError) {
        logger.error("File cleanup failed:", cleanupError);
      }
    }

    return next(new AppError("Failed to upload before/after", 500));
  } finally {
    if (client) client.release();
    logger.info("DB connection released");
  }
};

const getBeforeAfter = async (req, res, next) => {
  logger.info("Get before/after started");
  try {
    const serviceType = req.query.serviceType;
    const user = req.user
    const freelancerId = user?.roleWiseId;

    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;

    let records, totalRecords, totalPages, enrichedRecords, groupedByServiceType;

    if (!serviceType) {
      // Case 1: No serviceType provided - Show 5 most recent per service type
      const { rows: allRecords } = await query(
        `SELECT * FROM (
          SELECT *, 
                 ROW_NUMBER() OVER (PARTITION BY service_type ORDER BY updated_at DESC) as rn
          FROM impact 
          WHERE freelancer_id=$1
        ) ranked
        WHERE rn <= 5
        ORDER BY service_type, updated_at DESC`,
        [freelancerId]
      );

      enrichedRecords = await Promise.all(
        allRecords.map(async (record) => {
          const [beforeUrl, afterUrl] = await Promise.allSettled([
            createPresignedUrl(
              BUCKET_NAME,
              record.before_service_url.split("/").slice(1).join("/"),
              expirySeconds
            ),
            createPresignedUrl(
              BUCKET_NAME,
              record.after_service_url.split("/").slice(1).join("/"),
              expirySeconds
            )
          ]);

          return {
            impact_id: record.impact_id,
            freelancer_id: record.freelancer_id,
            service_type: record.service_type,
            before_service_public_url:
              beforeUrl.status === "fulfilled" ? beforeUrl.value : null,
            after_service_public_url:
              afterUrl.status === "fulfilled" ? afterUrl.value : null,
            impact_metric: record.impact_metric,
            created_at: record.created_at,
            updated_at: record.updated_at,
          };
        })
      );

      // Re-group enriched records
      groupedByServiceType = enrichedRecords.reduce((acc, record) => {
        if (!acc[record.service_type]) {
          acc[record.service_type] = [];
        }
        acc[record.service_type].push(record);
        return acc;
      }, {});

      logger.debug(`Impact found for multiple service types`);

      return res.status(200).json({
        status: "success",
        message: enrichedRecords.length ? "Impact data fetched" : "No before/after data",
        data: groupedByServiceType,
      });

    } else {
      // Case 2: serviceType provided - Use pagination for specific service type
      const { rows: countResult } = await query(
        `SELECT COUNT(*) AS total FROM impact WHERE freelancer_id=$1 AND service_type=$2`,
        [freelancerId, serviceType]
      );

      totalRecords = Number(countResult[0].total);
      totalPages = Math.ceil(totalRecords / limit);

      const { rows: records } = await query(
        `SELECT * FROM impact WHERE freelancer_id=$1 AND service_type=$2 
         ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,
        [freelancerId, serviceType, limit, offset]
      );

      logger.debug(`Total impact found for ${serviceType}: ${totalRecords}`);

      enrichedRecords = await Promise.all(
        records.map(async (record) => {
          const [beforeUrl, afterUrl] = await Promise.allSettled([
            createPresignedUrl(
              BUCKET_NAME,
              record.before_service_url.split("/").slice(1).join("/"),
              expirySeconds
            ),
            createPresignedUrl(
              BUCKET_NAME,
              record.after_service_url.split("/").slice(1).join("/"),
              expirySeconds
            )
          ]);

          return {
            impact_id: record.impact_id,
            freelancer_id: record.freelancer_id,
            service_type: record.service_type,
            before_service_public_url:
              beforeUrl.status === "fulfilled" ? beforeUrl.value : null,
            after_service_public_url:
              afterUrl.status === "fulfilled" ? afterUrl.value : null,
            impact_metric: record.impact_metric,
            created_at: record.created_at,
            updated_at: record.updated_at,
          };
        })
      );

      return res.status(200).json({
        status: "success",
        message: enrichedRecords.length ? "Impact data fetched" : "No before/after data",
        data: enrichedRecords,
        pagination: {
          total: totalRecords,
          totalPages,
          currentPage: page,
          limit,
          offset,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      });
    }

  } catch (error) {
    logger.error("Error fetching before/after:", error);
    return next(new AppError("Failed to fetch data", 500));
  }
};

// ✅ NEW CONTROLLER — DELETE Impact Data
const deleteBeforeAfter = async (req, res, next) => {
  logger.info("Deleting before/after item");
  let client;
  try {
    const { id } = req.query;
    const user = req.user

    if (!id) {
      logger.warn("ID missing for delete operation");
      return next(new AppError("Impact ID required", 400));
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT before_service_url, after_service_url FROM impact 
       WHERE impact_id=$1 AND freelancer_id=$2`,
      [id, user.roleWiseId]
    );

    if (!rows.length) {
      logger.warn("No impact record found for delete");
      return next(new AppError("Record not found or unauthorized", 404));
    }

    for (const key of ["before_service_url", "after_service_url"]) {
      const parts = rows[0][key].split("/");
      const objName = parts.slice(3).join("/");
      await minioClient.removeObject(BUCKET_NAME, objName);
      logger.debug(`Deleted file from MinIO: ${objName}`);
    }

    await client.query(`DELETE FROM impact WHERE impact_id=$1`, [id]);
    await client.query("COMMIT");

    logger.info("Impact deleted successfully ✅");

    return res.status(200).json({
      status: "success",
      message: "Impact deleted successfully",
    });

  } catch (error) {
    if (client) await client.query("ROLLBACK");
    logger.error("Delete impact error:", error);
    return next(new AppError("Failed to delete impact", 500));
  } finally {
    if (client) client.release();
  }
};


module.exports = {
  uploadBeforeAfter,
  getBeforeAfter,
  deleteBeforeAfter,
};
