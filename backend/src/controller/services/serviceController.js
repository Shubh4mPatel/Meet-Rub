const { query, pool } = require("../../../config/dbConfig");
const AppError = require("../../../utils/appError");
const { logger } = require("../../../utils/logger");
const { minioClient } = require("../../../config/minio");
const { createPresignedUrl } = require("../../../utils/helper");
// const { log } = require("node:console");

const expirySeconds = 4 * 60 * 60; // 4 hours

// ✅ Get all available services
const getServices = async (req, res, next) => {
  logger.info("Fetching available services");
  try {
    const service = req.query.service;
    const searchTerm = service ? service.trim() : '';
    const sql = searchTerm
      ? 'SELECT service_name FROM service_options WHERE service_name ILIKE $1 ORDER BY service_name ASC Limit 10'
      : 'SELECT service_name FROM service_options ORDER BY service_name ASC ';
    const params = searchTerm ? [`%${searchTerm}%`] : [];

    const { rows: services } = await query(
      sql,
      params
    );
    const availableServices = services.map(service => service.service_name);
    logger.debug(`Total available services found: ${services.length}`);

    if (services.length < 1) {
      logger.warn("No available services found");
      return next(
        new AppError("Services are not available at this moment", 404)
      );
    }

    return res.status(200).json({
      status: "success",
      message: "Services fetched successfully",
      data: availableServices,
    });
  } catch (error) {
    logger.error("Failed to fetch services:", error);
    return next(new AppError("Failed to fetch services", 500));
  }
};

const getNiches = async (req, res, next) => {
  logger.info("Fetching available niches");

  try {
    const niche = req.query.niche;
    const nicheTerm = niche ? niche.trim() : '';
    const sql = nicheTerm
      ? 'SELECT niche_name FROM niche WHERE niche_name ILIKE $1 ORDER BY niche_name ASC Limit 10'
      : 'SELECT niche_name FROM niche ORDER BY niche_name ASC ';
    const params = nicheTerm ? [`%${nicheTerm}%`] : [];

    const { rows: services } = await query(
      sql,
      params
    );
    const availableNiches = services.map(niche => niche.niche_name);
    logger.debug(`Total available niches found: ${services.length}`);

    if (services.length < 1) {
      logger.warn("No available services found");
      return next(
        new AppError("Services are not available at this moment", 404)
      );
    }

    return res.status(200).json({
      status: "success",
      message: "Services fetched successfully",
      data: availableNiches,
    });
  } catch (error) {
    logger.error("Failed to fetch niches:", error);
    return next(new AppError("Failed to fetch niches", 500));
  }
};

const addNiches = async (req, res, next) => {
  logger.info("Adding niches by admin");
  try {
    const { nicheType } = req.body;
    const user = req.user;
    const admin = user?.roleWiseId;
    logger.info("Admin user info:", user);
    logger.info("Extracted admin ID:", admin);
    if (!Array.isArray(nicheType) || nicheType.length === 0) {
      logger.warn("Invalid niche list received", nicheType);
      return next(new AppError("Please provide valid niches", 400));
    }
    const results = await Promise.all(
      nicheType.map((niche) =>
        query(
          `INSERT INTO niche(niche_name, created_by, created_at)
           VALUES ($1,$2,$3) RETURNING *`,
          [niche, admin, new Date()]
        )
      )
    );
    logger.info(`Added ${results.length} niches successfully`);
    return res.status(201).json({
      status: "success",
      message: "Niches added successfully",
      data: results.map((r) => r.rows[0]),
    });
  }
  catch (error) {
    logger.error("Failed to add niches:", error);
    return next(new AppError("Failed to add niches", 500));
  }
};

// ✅ Add available services by Admin
const addServices = async (req, res, next) => {
  logger.info("Adding services by admin");
  try {
    const { serviceName, serviceTitle, serviceDescription, showOnHomePage, images } = req.body;
    const admin = req.user?.roleWiseId;

    if (!serviceName || typeof serviceName !== 'string' || !serviceName.trim()) {
      return next(new AppError("serviceName is required", 400));
    }

    const { rows } = await query(
      `INSERT INTO service_options
         (service_name, service_title, service_description, show_on_home_page, images, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        serviceName.trim(),
        serviceTitle || null,
        serviceDescription || null,
        showOnHomePage === true || showOnHomePage === 'true',
        Array.isArray(images) ? images : [],
        admin,
      ]
    );

    logger.info(`Service '${serviceName}' added by admin ${admin}`);
    return res.status(201).json({
      status: "success",
      message: "Service added successfully",
      data: rows[0],
    });
  } catch (error) {
    logger.error("Failed to add services:", error);
    return next(new AppError("Failed to add services", 500));
  }
};

// ✅ Freelancer - Add their own servicesF
const addServicesByFreelancer = async (req, res, next) => {
  logger.info("Freelancer adding service");
  const BUCKET_NAME = "meet-rub-assets";
  let uploadedObjectName = null;

  try {
    const { service, price, description, deliveryDuration, planType } = req.body;
    const user = req.user;
    logger.info("Freelancer user info:", user);
    const freelancer_id = user?.roleWiseId;

    logger.info("Extracted freelancer_id:", freelancer_id);

    if (!freelancer_id) {
      logger.error("Freelancer ID not found in user token");
      return next(new AppError("Freelancer ID not found. Please log in again.", 401));
    }

    if (!service || !price || !description || !deliveryDuration) {
      logger.warn("Missing required fields");
      return next(new AppError("Service, price, description, and delivery duration are required", 400));
    }

    // Validate planType if provided
    if (planType && !['basic', 'pro', 'premium'].includes(planType.toLowerCase())) {
      logger.warn("Invalid plan type provided");
      return next(new AppError("Plan type must be 'basic', 'pro', or 'premium'", 400));
    }

    const { rows: existingService } = await query(
      `SELECT * FROM services WHERE freelancer_id=$1 AND service_name=$2`,
      [freelancer_id, service]
    );

    if (existingService.length > 0) {
      logger.warn("Service already exists for this freelancer");
      return next(new AppError("You have already added this service", 400));
    }

    // Handle file upload if provided
    let thumbnailFileUrl = null;
    if (req.file) {
      logger.info(`Uploading thumbnail file: ${req.file.originalname}`);
      const fileName = `${Date.now()}_${req.file.originalname}`;
      const folder = `freelancer/services/${user.user_id}`;
      const objectName = `${folder}/${fileName}`;
      thumbnailFileUrl = `${BUCKET_NAME}/${objectName}`;
      uploadedObjectName = objectName;

      // Validate file type (images and videos only)
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        logger.warn("Invalid file type uploaded");
        return next(new AppError("Only image (JPEG, PNG, GIF, WEBP) and video (MP4, MPEG, MOV, WEBM) files are allowed", 400));
      }

      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        req.file.buffer,
        req.file.size,
        { "Content-Type": req.file.mimetype }
      );

      logger.info(`Thumbnail file uploaded successfully: ${fileName}`);
    }

    const { rows } = await query(
      `INSERT INTO services (freelancer_id, service_name, service_description, service_price, created_at, updated_at, delivery_time, plan_type, thumbnail_file)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [freelancer_id, service, description, price, new Date(), new Date(), deliveryDuration, planType || null, thumbnailFileUrl]
    );

    logger.info("Service added successfully");

    // Generate presigned URL for thumbnail if exists
    const serviceData = rows[0];
    if (serviceData.thumbnail_file) {
      try {
        const objectName = serviceData.thumbnail_file.split("/").slice(1).join("/");
        const presignedUrl = await createPresignedUrl(
          BUCKET_NAME,
          objectName,
          expirySeconds
        );
        serviceData.thumbnail_file = presignedUrl;
      } catch (error) {
        logger.warn("Failed to generate presigned URL for thumbnail:", error);
        serviceData.thumbnail_file = null;
      }
    }

    return res.status(200).json({
      status: "success",
      message: "Service added successfully",
      data: serviceData,
    });
  } catch (error) {
    // Clean up uploaded file if service creation failed
    if (uploadedObjectName) {
      try {
        await minioClient.removeObject("meet-rub-assets", uploadedObjectName);
        logger.info("Cleaned up uploaded file after error");
      } catch (cleanupError) {
        logger.error("Failed to cleanup uploaded file:", cleanupError);
      }
    }

    logger.error("Failed to add freelancer service:", error);
    return next(new AppError("Failed to add service", 500));
  }
};

// ✅ Freelancer Update their service
const updateServiceByFreelancer = async (req, res, next) => {
  logger.info("Freelancer updating service");
  const BUCKET_NAME = "meet-rub-assets";
  const client = await pool.connect();
  let uploadedObjectName = null;

  try {
    const { service, price, description, serviceId, deliveryDuration, planType  } = req.body;
    const user = req.user;
    const freelancer_id = user?.roleWiseId;

    if (!serviceId || !service || !price || !description || !deliveryDuration) {
      logger.warn("Missing required fields");
      return next(new AppError("Please provide valid information", 400));
    }

    // Validate planType if provided
    if (planType && !['basic', 'pro', 'premium'].includes(planType.toLowerCase())) {
      logger.warn("Invalid plan type provided");
      return next(new AppError("Plan type must be 'basic', 'pro', or 'premium'", 400));
    }

    // Begin transaction
    await client.query('BEGIN');
    logger.debug("Transaction started for service update");

    // Fetch existing service data
    const { rows: existingService } = await client.query(
      `SELECT thumbnail_file FROM services WHERE id=$1 AND freelancer_id=$2`,
      [serviceId, freelancer_id]
    );

    if (!existingService.length) {
      await client.query('ROLLBACK');
      logger.warn("Service not found or unauthorized - transaction rolled back");
      return next(new AppError("Service not found", 404));
    }

    let thumbnailFileUrl = existingService[0].thumbnail_file;
    let oldObjectName = null;

    // Handle file upload if provided
    if (req.file) {
      logger.info(`Uploading new thumbnail file: ${req.file.originalname}`);
      const fileName = `${Date.now()}_${req.file.originalname}`;
      const folder = `freelancer/services/${user.user_id}`;
      const objectName = `${folder}/${fileName}`;
      thumbnailFileUrl = `${BUCKET_NAME}/${objectName}`;
      uploadedObjectName = objectName;

      // Validate file type (images and videos only)
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        await client.query('ROLLBACK');
        logger.warn("Invalid file type uploaded");
        return next(new AppError("Only image (JPEG, PNG, GIF, WEBP) and video (MP4, MPEG, MOV, WEBM) files are allowed", 400));
      }

      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        req.file.buffer,
        req.file.size,
        { "Content-Type": req.file.mimetype }
      );

      logger.info(`New thumbnail file uploaded successfully: ${fileName}`);

      // Store old object name for deletion after successful update
      if (existingService[0].thumbnail_file) {
        oldObjectName = existingService[0].thumbnail_file.split("/").slice(1).join("/");
      }
    }

    const { rows } = await client.query(
      `UPDATE services
       SET service_name=$1, service_price=$2, service_description=$3, updated_at=$4, delivery_time=$5, plan_type=$6, thumbnail_file=$7
       WHERE id=$8 AND freelancer_id=$9
       RETURNING *`,
      [service, price, description, new Date(), deliveryDuration, planType || null, thumbnailFileUrl, serviceId, freelancer_id]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      logger.warn("Service not found or unauthorized - transaction rolled back");
      return next(new AppError("Service not found", 404));
    }

    // Commit transaction
    await client.query('COMMIT');
    logger.info("Service updated successfully - transaction committed");

    // Delete old thumbnail file if a new one was uploaded
    if (oldObjectName && req.file) {
      try {
        await minioClient.removeObject(BUCKET_NAME, oldObjectName);
        logger.info(`Old thumbnail file deleted from MinIO: ${oldObjectName}`);
      } catch (minioError) {
        logger.warn(`Failed to delete old thumbnail file: ${oldObjectName}`, minioError);
      }
    }

    // Generate presigned URL for thumbnail if exists
    const serviceData = rows[0];
    if (serviceData.thumbnail_file) {
      try {
        const objectName = serviceData.thumbnail_file.split("/").slice(1).join("/");
        const presignedUrl = await createPresignedUrl(
          BUCKET_NAME,
          objectName,
          expirySeconds
        );
        serviceData.thumbnail_file = presignedUrl;
      } catch (error) {
        logger.warn("Failed to generate presigned URL for thumbnail:", error);
        serviceData.thumbnail_file = null;
      }
    }

    return res.status(200).json({
      status: "success",
      message: "Service updated successfully",
      data: serviceData,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error("Failed to update service - transaction rolled back:", error);

    // Clean up uploaded file if update failed
    if (uploadedObjectName) {
      try {
        await minioClient.removeObject(BUCKET_NAME, uploadedObjectName);
        logger.info("Cleaned up uploaded file after error");
      } catch (cleanupError) {
        logger.error("Failed to cleanup uploaded file:", cleanupError);
      }
    }

    return next(new AppError("Failed to update service", 500));
  } finally {
    client.release();
    logger.debug("Database connection released");
  }
};

// ✅ Freelancer Delete their service
const deleteServiceByFreelancer = async (req, res, next) => {
  const BUCKET_NAME = "meet-rub-assets";

  try {
    logger.info("Request query parameters:", req.query);
    const id = req.query?.serviceId;
    logger.info("Service ID to delete:", id);
    const user = req.user;
    const freelancer_id = user?.roleWiseId;

    if (!id) {
      logger.warn("Service ID missing");
      return next(new AppError("Please provide service ID", 400));
    }

    // Fetch service data to get thumbnail file path
    const { rows: serviceData } = await query(
      `SELECT thumbnail_file FROM services WHERE id=$1 AND freelancer_id=$2`,
      [id, freelancer_id]
    );

    if (serviceData.length === 0) {
      logger.warn("Service not found or unauthorized deletion attempt");
      return next(new AppError("Service not found", 404));
    }

    // Delete thumbnail file from MinIO if exists
    if (serviceData[0].thumbnail_file) {
      try {
        const objectName = serviceData[0].thumbnail_file.split("/").slice(1).join("/");
        await minioClient.removeObject(BUCKET_NAME, objectName);
        logger.info(`Thumbnail file deleted from MinIO: ${objectName}`);
      } catch (minioError) {
        logger.warn(`Failed to delete thumbnail file from MinIO:`, minioError);
        // Continue with service deletion even if file deletion fails
      }
    }

    // Delete service from database
    const { rowCount } = await query(
      `DELETE FROM services WHERE id=$1 AND freelancer_id=$2`,
      [id, freelancer_id]
    );

    if (rowCount === 0) {
      logger.warn("Service not found or unauthorized deletion attempt");
      return next(new AppError("Service not found", 404));
    }

    logger.info(`Service ID ${id} deleted successfully`);
    return res.status(200).json({
      status: "success",
      message: "Service deleted successfully",
    });
  } catch (error) {
    logger.error("Failed to delete service:", error);
    return next(new AppError("Failed to delete service", 500));
  }
};

// ✅ Freelancer Get their services
const getServicesByFreelaner = async (req, res, next) => {
  logger.info("Fetching freelancer services");
  const BUCKET_NAME = "meet-rub-assets";

  try {
    const user = req.user;
    const freelancer_id = user.roleWiseId;

    const { rows: services } = await query(
      `SELECT * FROM services WHERE freelancer_id=$1 ORDER BY created_at DESC`,
      [freelancer_id]
    );

    logger.debug(`Total freelancer services: ${services.length}`);

    if (services.length < 1) {
      logger.warn("No services found for freelancer");
      return res.status(200).json({
        status: "success",
        message: "No services found",
        data: []
      });
    }

    // Generate presigned URLs for thumbnails
    const servicesWithSignedUrls = await Promise.all(
      services.map(async (service) => {
        if (service.thumbnail_file) {
          try {
            const objectName = service.thumbnail_file.split("/").slice(1).join("/");
            const signedUrl = await createPresignedUrl(
              BUCKET_NAME,
              objectName,
              expirySeconds
            );
            service.thumbnail_file = signedUrl;
          } catch (error) {
            logger.error(
              `Error generating signed URL for service ${service.id}:`,
              error
            );
            service.thumbnail_file = null;
          }
        }
        return service;
      })
    );

    // Group services by service_name
    const groupedServices = servicesWithSignedUrls.reduce((acc, service) => {
      const serviceName = service.service_name;

      if (!acc[serviceName]) {
        acc[serviceName] = {
          service_name: serviceName,
          service_options: []
        };
      }

      // Add service details to service_options array
      acc[serviceName].service_options.push({
        id: service.id,
        plan_type: service.plan_type,
        service_description: service.service_description,
        service_price: service.service_price,
        delivery_time: service.delivery_time,
        thumbnail_file: service.thumbnail_file,
        is_active: service.is_active,
        created_at: service.created_at,
        updated_at: service.updated_at
      });

      return acc;
    }, {});

    // Convert grouped object to array
    const formattedServices = Object.values(groupedServices);

    logger.info(`Services grouped by name: ${formattedServices.length} unique services`);

    return res.status(200).json({
      status: "success",
      message: "Services fetched successfully",
      data: formattedServices,
    });
  } catch (error) {
    logger.error("Failed to fetch freelancer services:", error);
    return next(new AppError("Failed to fetch services", 500));
  }
};

const createSreviceRequest = async (req, res, next) => {
  logger.info("Creating service request");
  try {
    const { service, details, budget } = req.body;
    const user = req.user;
    const creator_id = user?.roleWiseId;

    if (!service || !details || !budget) {
      logger.warn("Missing required fields for service request");
      return next(new AppError("Please provide all required fields", 400));
    }

    const { rows } = await query(
      `INSERT INTO service_requests (creator_id, desired_service, details, budget, created_at, updated_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [creator_id, service, details, budget, new Date(), new Date(), "active"]
    );

    logger.info("Service request created successfully");
    return res.status(201).json({
      status: "success",
      message: "Service request created successfully",
      data: rows[0],
    });
  } catch (error) {
    logger.error("Failed to create service request:", error);
    return next(new AppError("Failed to create service request", 500));
  }
};

// ✅ Get user's service requests
const getUserServiceRequests = async (req, res, next) => {
  logger.info("Fetching user service requests");
  try {
    const user = req.user;
    const creator_id = user?.roleWiseId;

    const { rows: serviceRequests } = await query(
      `SELECT * FROM service_requests
       WHERE creator_id = $1
       ORDER BY created_at DESC`,
      [creator_id]
    );

    logger.debug(`Total service requests found: ${serviceRequests.length}`);

    if (serviceRequests.length < 1) {
      logger.warn("No service requests found for user");
      return res.status(200).json({
        status: "success",
        message: "No service requests found",
        data: [],
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Service requests fetched successfully",
      data: serviceRequests,
    });
  } catch (error) {
    logger.error("Failed to fetch service requests:", error);
    return next(new AppError("Failed to fetch service requests", 500));
  }
};

const getUserServiceRequestsSuggestion = async (req, res, next) => {
  logger.info("Fetching user service requests suggestions");
  try {
    const user = req.user;
    const requestId = req.params.requestId;
    logger.info(`Request ID: ${requestId}`);  
    const creator_id = user?.roleWiseId;

    // Get the service request details including desired_service
    const {rows : requestExists} = await query(
      `SELECT request_id, desired_service FROM service_requests WHERE request_id = $1`,
      [requestId]
    );

    if (requestExists.length === 0) {
      logger.warn("Service request not found");
      return res.status(404).json({
        status: "error",
        message: "Service request not found"
      });
    }

    const desiredService = requestExists[0].desired_service;
    logger.debug(`Desired service for request ${requestId}: ${desiredService}`);

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Search and filter parameters
    const searchTerm = req.query.search?.trim() || '';
    const sortBy = req.query.sortBy || 'rating'; // rating, name
    const sortOrder = req.query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // First, get the suggested freelancer IDs for this request
    const { rows: suggestionRows } = await query(
      `SELECT freelancer_id FROM service_request_suggestions
       WHERE request_id = $1`,
      [requestId]
    );

    if (suggestionRows.length === 0 || !suggestionRows[0].freelancer_id) {
      logger.warn("No suggestions found for service request");
      return res.status(200).json({
        status: "success",
        message: "No suggestions found",
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalCount: 0,
          limit
        }
      });
    }

    const suggestedFreelancerIds = suggestionRows[0].freelancer_id;
    logger.debug(`Total suggested freelancer IDs: ${suggestedFreelancerIds.length}`);

    // Build the query — return all suggested freelancers by ID only
    let queryText = `
      SELECT
        f.freelancer_id,
        f.freelancer_full_name,
        f.profile_image_url,
        f.freelancer_thumbnail_image,
        f.rating,
        f.profile_title,
        CASE WHEN w.freelancer_id IS NOT NULL THEN true ELSE false END as in_wishlist
      FROM freelancer f
      LEFT JOIN wishlist w ON f.freelancer_id = w.freelancer_id AND w.creator_id = $1
      WHERE f.freelancer_id = ANY($2::int[])
    `;

    const queryParams = [creator_id, suggestedFreelancerIds];
    let paramCount = 3;

    // Add search condition
    if (searchTerm) {
      queryText += ` AND f.freelancer_full_name ILIKE $${paramCount}`;
      queryParams.push(`%${searchTerm}%`);
      paramCount++;
    }

    // Count total before pagination
    const countQuery = queryText.replace(
      /SELECT[\s\S]+FROM/,
      'SELECT COUNT(DISTINCT f.freelancer_id) as count FROM'
    );
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add sorting
    let orderByClause = '';
    switch (sortBy) {
      case 'name':
        orderByClause = `ORDER BY f.freelancer_full_name ${sortOrder}`;
        break;
      case 'rating':
      default:
        orderByClause = `ORDER BY f.rating ${sortOrder} NULLS LAST`;
        break;
    }

    queryText += ` ${orderByClause} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    const { rows: freelancers } = await query(queryText, queryParams);
    logger.debug(`Total freelancers found: ${freelancers.length}`);

    // Generate presigned URLs for profile pictures and thumbnails
    const freelancersWithSignedUrls = await Promise.all(
      freelancers.map(async (freelancer) => {
        // Generate presigned URL for profile image
        if (freelancer.profile_image_url) {
          try {
            const parts = freelancer.profile_image_url.split("/");
            const bucketName = parts[0];
            const objectName = parts.slice(1).join("/");

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

        // Generate presigned URL for thumbnail image
        if (freelancer.freelancer_thumbnail_image) {
          try {
            const parts = freelancer.freelancer_thumbnail_image.split("/");
            const bucketName = parts[0];
            const objectName = parts.slice(1).join("/");

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

    // Sort to put wishlisted freelancers at the top
    const sortedFreelancers = freelancersWithSignedUrls.sort((a, b) => {
      if (a.in_wishlist && !b.in_wishlist) return -1;
      if (!a.in_wishlist && b.in_wishlist) return 1;
      return 0;
    });

    logger.info(`Suggestions fetched successfully. Total: ${totalCount}, Wishlisted: ${sortedFreelancers.filter(f => f.in_wishlist).length}`);
    return res.status(200).json({
      status: "success",
      message: "Suggestions fetched successfully",
      data: sortedFreelancers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit
      }
    });
  } catch (error) {
    logger.error("Failed to fetch service request suggestions:", error);
    return next(
      new AppError("Failed to fetch service request suggestions", 500)
    );
  }
};

const getUserServiceRequestsToAdmin = async (req, res, next) => {
  logger.info("Admin fetching all user service requests");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.search?.trim() || '';
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const allowedSortFields = ['created_at', 'creator_name'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const orderByClause = sortField === 'creator_name' ? `c.full_name ${sortOrder}` : `sr.${sortField} ${sortOrder}`;

    const searchCondition = searchTerm ? `AND c.full_name ILIKE $3` : '';
    const countParams = searchTerm ? [`%${searchTerm}%`] : [];

    const countResult = await query(
      `SELECT COUNT(*) FROM service_requests sr
       LEFT JOIN creators c ON sr.creator_id = c.creator_id
       WHERE sr.status NOT IN ('assigned','completed') ${searchCondition}`,
      countParams
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const queryParams = searchTerm ? [limit, offset, `%${searchTerm}%`] : [limit, offset];

    const { rows: serviceRequests } = await query(
      `SELECT
         sr.*,
         c.full_name AS creator_name
       FROM service_requests sr
       LEFT JOIN creators c ON sr.creator_id = c.creator_id
       WHERE sr.status NOT IN ('assigned','completed') ${searchCondition}
       ORDER BY ${orderByClause}
       LIMIT $1 OFFSET $2`,
      queryParams
    );

    logger.debug(`Total service requests found: ${serviceRequests.length}`);

    if (serviceRequests.length < 1) {
      logger.warn("No service requests found");
      return res.status(200).json({
        status: "success",
        message: "No service requests found",
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalCount: 0,
          limit
        }
      });
    }

    logger.info("Service requests fetched successfully");
    return res.status(200).json({
      status: "success",
      message: "Service requests fetched successfully",
      data: serviceRequests,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit
      }
    });
  } catch (error) {
    logger.error("Failed to fetch all service requests:", error);
    return next(new AppError("Failed to fetch all service requests", 500));
  }
};

const AssignFreelancerToRequest = async (req, res, next) => {
  logger.info("Admin assigning freelancers to service request");
  try {
    const { requestId, freelancerIds, adminNotes } = req.body;
    adminId = req.user?.roleWiseId;

    // Validation
    if (!requestId) {
      logger.warn("Request ID is missing");
      return next(new AppError("Request ID is required", 400));
    }

    if (!freelancerIds || !Array.isArray(freelancerIds) || freelancerIds.length === 0) {
      logger.warn("Invalid freelancer IDs array");
      return next(new AppError("At least one freelancer ID is required", 400));
    }

    // Check if service request exists
    const { rows: serviceRequest } = await query(
      `SELECT request_id FROM service_requests WHERE request_id = $1`,
      [requestId]
    );

    if (serviceRequest.length === 0) {
      logger.warn(`Service request ${requestId} not found`);
      return next(new AppError("Service request not found", 404));
    }

    // Verify all freelancer IDs exist
    const { rows: freelancers } = await query(
      `SELECT freelancer_id FROM freelancer WHERE freelancer_id = ANY($1::int[])`,
      [freelancerIds]
    );

    if (freelancers.length !== freelancerIds.length) {
      logger.warn("One or more freelancer IDs are invalid");
      return next(new AppError("One or more freelancer IDs are invalid", 400));
    }

    // Insert or update suggestions using UPSERT
    const { rows } = await query(
      `INSERT INTO service_request_suggestions
       (request_id, freelancer_id, admin_notes,admin_id ,created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5,$6)
       ON CONFLICT (request_id)
       DO UPDATE SET
         freelancer_id = $2,
         admin_notes = $3,
         updated_at = $6
       RETURNING *`,
      [requestId, freelancerIds, adminNotes || null, adminId ,new Date().toISOString(), new Date().toISOString()]
    );

    logger.info(`Freelancers assigned to request ${requestId} successfully`);
    return res.status(200).json({
      status: "success",
      message: "Freelancers assigned to service request successfully",
      data: rows[0],
    });
  } catch (error) {
    logger.error("Failed to assign freelancers to service request:", error);
    return next(new AppError("Failed to assign freelancers", 500));
  }
};

const getServicesForAdmin = async (req, res, next) => {
  logger.info("Admin fetching service options");
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    const search = req.query.search?.trim() || '';

    const params = [];
    let nextParam = 1;
    const searchFilter = search ? `WHERE service_name ILIKE $${nextParam++}` : '';
    if (search) params.push(`%${search}%`);

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT id, service_name, service_title, service_description, show_on_home_page, images, created_at, updated_at
         FROM service_options
         ${searchFilter}
         ORDER BY service_name ASC
         LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) AS total FROM service_options ${searchFilter}`,
        params
      ),
    ]);

    const total      = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Generate presigned URLs for each image in the images array
    const services = await Promise.all(
      dataResult.rows.map(async (service) => {
        if (Array.isArray(service.images) && service.images.length > 0) {
          service.images = await Promise.all(
            service.images.map(async (imgPath) => {
              if (!imgPath) return null;
              const idx = imgPath.indexOf('/');
              if (idx === -1) return null;
              try {
                return await createPresignedUrl(
                  imgPath.substring(0, idx),
                  imgPath.substring(idx + 1),
                  expirySeconds
                );
              } catch {
                return null;
              }
            })
          );
        }
        return service;
      })
    );

    logger.info(`getServicesForAdmin: total=${total} page=${page}`);
    return res.status(200).json({
      status: 'success',
      data: {
        services,
        pagination: {
          total,
          totalPages,
          currentPage: page,
          limit,
        },
      },
    });
  } catch (error) {
    logger.error('getServicesForAdmin error:', error);
    return next(new AppError('Failed to fetch services', 500));
  }
};

module.exports = {
  getServices,
  addServices,
  getServicesForAdmin,
  deleteServiceByFreelancer,
  updateServiceByFreelancer,
  addServicesByFreelancer,
  getServicesByFreelaner,
  createSreviceRequest,
  getUserServiceRequests,
  getUserServiceRequestsSuggestion,
  getUserServiceRequestsToAdmin,
  getNiches,
  addNiches,
  AssignFreelancerToRequest
};
