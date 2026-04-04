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
  const BUCKET_NAME = "meet-rub-assets";
  const uploadedObjects = [];

  try {
    const { serviceName, serviceTitle, serviceDescription, showOnHomePage } = req.body;
    const admin = req.user?.roleWiseId;

    if (!serviceName || typeof serviceName !== 'string' || !serviceName.trim()) {
      return next(new AppError("serviceName is required", 400));
    }

    // Validate all 3 gallery images are provided
    const imageSlots = ['gallery_1', 'gallery_2', 'gallery_3'];
    const missingSlots = imageSlots.filter(slot => !req.files?.[slot]?.[0]);
    if (missingSlots.length > 0) {
      return next(new AppError(`All 3 gallery images are required (missing: ${missingSlots.join(', ')})`, 400));
    }

    // Check for duplicate service name (case-insensitive)
    const { rows: existing } = await query(
      `SELECT service_name FROM service_options WHERE LOWER(service_name) = LOWER($1)`,
      [serviceName.trim()]
    );

    if (existing.length > 0) {
      logger.warn(`Duplicate service rejected: '${serviceName}'`);
      return next(new AppError(`Service '${serviceName}' already exists. Please use a different name.`, 409));
    }

    // Upload gallery images to MinIO
    const imagePaths = [];
    for (const slot of imageSlots) {
      const file = req.files[slot][0];
      const objectName = `services/gallery/service_images/${Date.now()}-${slot}-${Math.random().toString(36).slice(2, 8)}`;
      await minioClient.putObject(BUCKET_NAME, objectName, file.buffer, file.size, { 'Content-Type': file.mimetype });
      uploadedObjects.push(objectName);
      imagePaths.push(objectName);
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
        imagePaths,
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
    // Clean up any uploaded files on failure
    for (const obj of uploadedObjects) {
      await minioClient.removeObject(BUCKET_NAME, obj).catch(() => {});
    }
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

    // Validate deliveryDuration must be in "X-Y" format (e.g. "6-7")
    const deliveryDurationMatch = String(deliveryDuration).trim().match(/^(\d+)-(\d+)$/);
    if (!deliveryDurationMatch) {
      logger.warn("Invalid delivery duration format:", deliveryDuration);
      return next(new AppError("Delivery duration must be in 'X-Y' format (e.g. '6-7')", 400));
    }
    const minDeliveryDays = parseInt(deliveryDurationMatch[1]);
    const maxDeliveryDays = parseInt(deliveryDurationMatch[2]);

    // Validate planType if provided
    const normalizedPlanType = planType ? planType.toLowerCase() : 'basic';
    if (!['basic', 'pro', 'premium'].includes(normalizedPlanType)) {
      logger.warn("Invalid plan type provided");
      return next(new AppError("Plan type must be 'basic', 'pro', or 'premium'", 400));
    }

    // Check duplicate for this specific plan type
    const { rows: existingService } = await query(
      `SELECT * FROM services WHERE freelancer_id=$1 AND service_name=$2 AND plan_type=$3`,
      [freelancer_id, service, normalizedPlanType]
    );

    if (existingService.length > 0) {
      logger.warn("Service with this plan type already exists for this freelancer");
      return next(new AppError(`You have already added a ${normalizedPlanType} plan for this service`, 400));
    }

    // Only basic plan accepts a file upload
    if (req.file && normalizedPlanType !== 'basic') {
      logger.warn(`File upload rejected for plan type: ${normalizedPlanType}`);
      return next(new AppError("Image can only be uploaded when creating the basic plan", 400));
    }

    // Thumbnail is required for basic plan
    if (normalizedPlanType === 'basic' && !req.file) {
      logger.warn("Thumbnail image is required for basic plan");
      return next(new AppError("Please add a thumbnail image for the basic plan", 400));
    }

    // Handle file upload — basic plan only
    let thumbnailFileUrl = null;
    if (normalizedPlanType === 'basic' && req.file) {
      logger.info(`Uploading thumbnail file: ${req.file.originalname}`);

      // Validate file type (images and videos only)
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        logger.warn("Invalid file type uploaded");
        return next(new AppError("Only image (JPEG, PNG, GIF, WEBP) and video (MP4, MPEG, MOV, WEBM) files are allowed", 400));
      }

      const fileName = `${Date.now()}_${req.file.originalname}`;
      const objectName = `freelancer/services/${user.user_id}/${fileName}`;
      thumbnailFileUrl = `${BUCKET_NAME}/${objectName}`;
      uploadedObjectName = objectName;

      await minioClient.putObject(
        BUCKET_NAME,
        objectName,
        req.file.buffer,
        req.file.size,
        { "Content-Type": req.file.mimetype }
      );

      logger.info(`Thumbnail file uploaded successfully: ${fileName}`);
    } else if (normalizedPlanType !== 'basic') {
      // Reuse the thumbnail from the basic plan for the same service
      const { rows: basicPlan } = await query(
        `SELECT thumbnail_file FROM services WHERE freelancer_id=$1 AND service_name=$2 AND plan_type='basic'`,
        [freelancer_id, service]
      );
      thumbnailFileUrl = basicPlan[0]?.thumbnail_file || null;
      logger.info(`Reusing basic plan thumbnail for ${normalizedPlanType} plan: ${thumbnailFileUrl}`);
    }

    const { rows } = await query(
      `INSERT INTO services (freelancer_id, service_name, service_description, service_price, created_at, updated_at, min_delivery_days, max_delivery_days, plan_type, thumbnail_file)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [freelancer_id, service, description, price, new Date(), new Date(), minDeliveryDays, maxDeliveryDays, normalizedPlanType, thumbnailFileUrl]
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

    serviceData.delivery_time = serviceData.min_delivery_days != null && serviceData.max_delivery_days != null
      ? `${serviceData.min_delivery_days}-${serviceData.max_delivery_days}`
      : null;
    delete serviceData.min_delivery_days;
    delete serviceData.max_delivery_days;

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

    // Validate deliveryDuration must be in "X-Y" format (e.g. "6-7")
    const deliveryDurationMatch = String(deliveryDuration).trim().match(/^(\d+)-(\d+)$/);
    if (!deliveryDurationMatch) {
      logger.warn("Invalid delivery duration format:", deliveryDuration);
      return next(new AppError("Delivery duration must be in 'X-Y' format (e.g. '6-7')", 400));
    }
    const minDeliveryDays = parseInt(deliveryDurationMatch[1]);
    const maxDeliveryDays = parseInt(deliveryDurationMatch[2]);

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
       SET service_name=$1, service_price=$2, service_description=$3, updated_at=$4, min_delivery_days=$5, max_delivery_days=$6, plan_type=$7, thumbnail_file=$8
       WHERE id=$9 AND freelancer_id=$10
       RETURNING *`,
      [service, price, description, new Date(), minDeliveryDays, maxDeliveryDays, planType || null, thumbnailFileUrl, serviceId, freelancer_id]
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

    serviceData.delivery_time = serviceData.min_delivery_days != null && serviceData.max_delivery_days != null
      ? `${serviceData.min_delivery_days}-${serviceData.max_delivery_days}`
      : null;
    delete serviceData.min_delivery_days;
    delete serviceData.max_delivery_days;

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
        delivery_time: service.min_delivery_days != null && service.max_delivery_days != null
          ? `${service.min_delivery_days}-${service.max_delivery_days}`
          : null,
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
    const { search = '', service = '' } = req.query;

    const params = [creator_id];
    let paramCount = 2;
    const conditions = [];

    if (service.trim()) {
      conditions.push(`desired_service = $${paramCount++}`);
      params.push(service.trim());
    }
    if (search.trim()) {
      conditions.push(`(desired_service ILIKE $${paramCount} OR details ILIKE $${paramCount})`);
      params.push(`%${search.trim()}%`);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const { rows: serviceRequests } = await query(
      `SELECT * FROM service_requests
       WHERE creator_id = $1 ${whereClause}
       ORDER BY created_at DESC`,
      params
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

    // Service type-wise banner: use desiredService from the request
    const serviceSubquery = desiredService ? `AND s2.service_name = $3` : ``;

    // Build the query — return all suggested freelancers by ID only
    let queryText = `
      SELECT
        f.freelancer_id,
        f.freelancer_full_name,
        f.profile_image_url,
        f.freelancer_thumbnail_image,
        f.rating,
        f.profile_title,
        f.worked_with,
        ARRAY_AGG(DISTINCT s.service_name) FILTER (WHERE s.service_name IS NOT NULL) as service_names,
        MIN(s.service_price) as lowest_price,
        CASE WHEN w.freelancer_id IS NOT NULL THEN true ELSE false END as in_wishlist,
        (SELECT s2.thumbnail_file FROM services s2 WHERE s2.freelancer_id = f.freelancer_id ${serviceSubquery} ORDER BY s2.created_at DESC LIMIT 1) as service_banner,
        (SELECT s2.service_name FROM services s2 WHERE s2.freelancer_id = f.freelancer_id ${serviceSubquery} ORDER BY s2.created_at DESC LIMIT 1) as matched_service_title
      FROM freelancer f
      LEFT JOIN services s ON f.freelancer_id = s.freelancer_id
      LEFT JOIN wishlist w ON f.freelancer_id = w.freelancer_id AND w.creator_id = $1
      WHERE f.freelancer_id = ANY($2::int[])
    `;

    const queryParams = desiredService
      ? [creator_id, suggestedFreelancerIds, desiredService]
      : [creator_id, suggestedFreelancerIds];
    let paramCount = desiredService ? 4 : 3;

    // Add search condition
    if (searchTerm) {
      queryText += ` AND f.freelancer_full_name ILIKE $${paramCount}`;
      queryParams.push(`%${searchTerm}%`);
      paramCount++;
    }

    // Add GROUP BY clause
    queryText += ` GROUP BY f.freelancer_id, f.freelancer_full_name, f.profile_title, f.profile_image_url, f.freelancer_thumbnail_image, f.rating, f.worked_with, w.freelancer_id`;

    // If desiredService is set, exclude freelancers with no matching service
    if (desiredService) {
      queryText += ` HAVING (SELECT s2.thumbnail_file FROM services s2 WHERE s2.freelancer_id = f.freelancer_id AND s2.service_name = $3 ORDER BY s2.created_at DESC LIMIT 1) IS NOT NULL`;
    }

    // Count total before pagination
    const countQuery = `SELECT COUNT(*) as count FROM (${queryText}) as sub`;
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

        // Generate presigned URL for service banner
        if (freelancer.service_banner) {
          const parts = freelancer.service_banner.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");
          try {
            freelancer.service_banner = await createPresignedUrl(bucketName, objectName, expirySeconds);
          } catch {
            freelancer.service_banner = null;
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
    const startDate = req.query.startDate?.trim() || '';
    const endDate = req.query.endDate?.trim() || '';

    const allowedSortFields = ['created_at', 'creator_name'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const orderByClause = sortField === 'creator_name' ? `c.full_name ${sortOrder}` : `sr.${sortField} ${sortOrder}`;

    const filterParams = [];
    const conditions = [`sr.status NOT IN ('assigned','completed')`];

    if (searchTerm) {
      filterParams.push(`%${searchTerm}%`);
      conditions.push(`c.full_name ILIKE $${filterParams.length}`);
    }
    if (startDate) {
      filterParams.push(startDate);
      conditions.push(`sr.created_at >= $${filterParams.length}::date`);
    }
    if (endDate) {
      filterParams.push(endDate);
      conditions.push(`sr.created_at < ($${filterParams.length}::date + INTERVAL '1 day')`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await query(
      `SELECT COUNT(*) FROM service_requests sr
       LEFT JOIN creators c ON sr.creator_id = c.creator_id
       ${whereClause}`,
      filterParams
    );
    const totalCount = parseInt(countResult.rows[0].count);

    const queryParams = [...filterParams, limit, offset];

    const { rows: serviceRequests } = await query(
      `SELECT
         sr.*,
         c.full_name AS creator_name
       FROM service_requests sr
       LEFT JOIN creators c ON sr.creator_id = c.creator_id
       ${whereClause}
       ORDER BY ${orderByClause}
       LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
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
    logger.debug(`Admin service options query executed. Rows returned: ${dataResult.rows.length}`,dataResult.rows);
    const total      = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Generate presigned URLs for each image in the images array
    const services = await Promise.all(
      dataResult.rows.map(async (service) => {
        if (Array.isArray(service.images) && service.images.length > 0) {
          service.images = await Promise.all(
            service.images.map(async (imgPath) => {
              if (!imgPath) return null;
              try {
                return await createPresignedUrl('meet-rub-assets', imgPath, expirySeconds);
              } catch {
                return null;
              }
            })
          );
        }
        return service;
      })
    );
    
    logger.info(`getServicesForAdmin: total=${total} page=${page}`,services);
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

// ✅ Public - Get services shown on home page
const getHomePageServices = async (req, res, next) => {
  logger.info("Fetching home page services");
  try {
    const { rows } = await query(
      `SELECT id, service_name, service_title, service_description, images
       FROM service_options
       WHERE show_on_home_page = true
       ORDER BY updated_at DESC`
    );

    const services = await Promise.all(
      rows.map(async (service) => {
        if (Array.isArray(service.images) && service.images.length > 0) {
          service.images = await Promise.all(
            service.images.map(async (imgPath) => {
              if (!imgPath) return null;
              try { return await createPresignedUrl('meet-rub-assets', imgPath, expirySeconds); }
              catch { return null; }
            })
          );
        }
        return service;
      })
    );

    return res.status(200).json({ status: 'success', data: services });
  } catch (error) {
    logger.error('getHomePageServices error:', error);
    return next(new AppError('Failed to fetch home page services', 500));
  }
};

const editServiceForAdmin = async (req, res, next) => {
  logger.info("Admin editing service option");
  const BUCKET_NAME = "meet-rub-assets";
  const uploadedObjects = [];

  try {
    const { id } = req.params;
    const { serviceName, serviceTitle, serviceDescription, showOnHomePage } = req.body;
    
    if (!id) return next(new AppError("Service ID is required", 400));

    const existing = await query(`SELECT * FROM service_options WHERE id = $1`, [id]);
    if (existing.rows.length === 0) return next(new AppError("Service not found", 404));

    const existingImages = existing.rows[0].images || [];

    // For each slot: upload new file if provided, otherwise keep existing DB path
    const imageSlots = ['gallery_1', 'gallery_2', 'gallery_3'];
    const finalImages = [];
    const objectsToDelete = [];

    for (let i = 0; i < imageSlots.length; i++) {
      const slot = imageSlots[i];
      const file = req.files?.[slot]?.[0];
      if (file) {
        const objectName = `services/gallery/service_images/${Date.now()}-${slot}-${Math.random().toString(36).slice(2, 8)}`;
        await minioClient.putObject(BUCKET_NAME, objectName, file.buffer, file.size, { 'Content-Type': file.mimetype });
        uploadedObjects.push(objectName);
        finalImages.push(objectName);
        // Queue old image for deletion
        if (existingImages[i]) objectsToDelete.push(existingImages[i]);
      } else {
        finalImages.push(existingImages[i] || null);
      }
    }

    const { rows } = await query(
      `UPDATE service_options
       SET service_name        = COALESCE($1, service_name),
           service_title       = COALESCE($2, service_title),
           service_description = COALESCE($3, service_description),
           show_on_home_page   = COALESCE($4, show_on_home_page),
           images              = $5,
           updated_at          = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        serviceName?.trim() || null,
        serviceTitle        || null,
        serviceDescription  || null,
        showOnHomePage != null ? (showOnHomePage === true || showOnHomePage === 'true') : null,
        finalImages.filter(Boolean),
        id,
      ]
    );

    // Delete old MinIO objects after successful DB update
    for (const obj of objectsToDelete) {
      await minioClient.removeObject(BUCKET_NAME, obj).catch(() => {});
    }

    // Generate presigned URLs for response
    const service = rows[0];
    if (Array.isArray(service.images) && service.images.length > 0) {
      service.images = await Promise.all(
        service.images.map(async (imgPath) => {
          if (!imgPath) return null;
          try { return await createPresignedUrl(BUCKET_NAME, imgPath, expirySeconds); }
          catch { return null; }
        })
      );
    }

    logger.info(`Service ${id} updated by admin`);
    return res.status(200).json({ status: 'success', message: 'Service updated successfully', data: service });
  } catch (error) {
    // Clean up any newly uploaded files on failure
    for (const obj of uploadedObjects) {
      await minioClient.removeObject(BUCKET_NAME, obj).catch(() => {});
    }
    logger.error('editServiceForAdmin error:', error);
    return next(new AppError('Failed to update service', 500));
  }
};

const deleteServiceForAdmin = async (req, res, next) => {
  logger.info("Admin deleting service option");
  try {
    const { id } = req.params;

    if (!id) return next(new AppError("Service ID is required", 400));

    const { rows } = await query(
      `DELETE FROM service_options WHERE id = $1 RETURNING id, service_name`,
      [id]
    );

    if (rows.length === 0) return next(new AppError("Service not found", 404));

    logger.info(`Service ${id} deleted by admin`);
    return res.status(200).json({ status: 'success', message: 'Service deleted successfully', data: rows[0] });
  } catch (error) {
    logger.error('deleteServiceForAdmin error:', error);
    return next(new AppError('Failed to delete service', 500));
  }
};

module.exports = {
  getServices,
  addServices,
  getServicesForAdmin,
  getHomePageServices,
  editServiceForAdmin,
  deleteServiceForAdmin,
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
