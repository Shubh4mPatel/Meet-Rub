const { query } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { decodedToken } = require('../../../utils/helper');
const {logger} = require('../../../utils/logger');

// ✅ Get all available services
const getServices = async (req, res, next) => {
  logger.info("Fetching available services");
  try {
    const { rows: services } = await query("SELECT service_type FROM available_services");
    logger.debug(`Total available services found: ${services.length}`);

    if (services.length < 1) {
      logger.warn("No available services found");
      return next(new AppError("Services are not available at this moment", 404));
    }

    return res.status(200).json({
      status: "success",
      message: "Services fetched successfully",
      data: services
    });
  } catch (error) {
    logger.error("Failed to fetch services:", error);
    return next(new AppError("Failed to fetch services", 500));
  }
};

// ✅ Add available services by Admin
const addServices = async (req, res, next) => {
  logger.info("Adding services by admin");
  try {
    const { serviceType } = req.body;
    const user = decodedToken(req.cookies?.AccessToken);
    const admin = user?.id;

    if (!Array.isArray(serviceType) || serviceType.length === 0) {
      logger.warn("Invalid service list received", serviceType);
      return next(new AppError("Please provide valid services", 400));
    }

    const results = await Promise.all(
      serviceType.map(service =>
        query(
          `INSERT INTO available_services(service_type, created_by, created_at)
           VALUES ($1,$2,$3) RETURNING *`,
          [service, admin, new Date()]
        )
      )
    );

    logger.info(`Added ${results.length} services successfully`);
    return res.status(201).json({
      status: "success",
      message: "Services added successfully",
      data: results.map(r => r.rows[0])
    });

  } catch (error) {
    logger.error("Failed to add services:", error);
    return next(new AppError("Failed to add services", 500));
  }
};

// ✅ Freelancer - Add their own services
const addServicesByFreelancer = async (req, res, next) => {
  logger.info("Freelancer adding service");
  try {
    const { service, price, description } = req.body;
    const user = decodedToken(req.cookies?.AccessToken);
    const freelancer_id = user?.roleWiseId;

    if (!service) {
      logger.warn("Service type missing");
      return next(new AppError("Service type is required", 400));
    }

    const { rows } = await query(
      `INSERT INTO services (freelancer_id, service_name, description, price, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [freelancer_id, service, description, price, new Date(), new Date()]
    );

    logger.info("Service added successfully");
    return res.status(200).json({
      status: "success",
      message: "Service added successfully",
      data: rows[0]
    });
  } catch (error) {
    logger.error("Failed to add freelancer service:", error);
    return next(new AppError("Failed to add service", 500));
  }
};

// ✅ Freelancer Update their service
const updateServiceByFreelancer = async (req, res, next) => {
  logger.info("Freelancer updating service");
  try {
    const { service, price, description, serviceId } = req.body;
    const user = decodedToken(req.cookies?.AccessToken);
    const freelancer_id = user?.roleWiseId;

    if (!serviceId || !service) {
      logger.warn("Missing required fields");
      return next(new AppError("Please provide valid information", 400));
    }

    const { rows } = await query(
      `UPDATE services 
       SET service_name=$1, price=$2, description=$3, updated_at=$4 
       WHERE id=$5 AND freelancer_id=$6 
       RETURNING *`,
      [service, price, description, new Date(), serviceId, freelancer_id]
    );

    if (!rows.length) {
      logger.warn("Service not found or unauthorized");
      return next(new AppError("Service not found", 404));
    }

    logger.info("Service updated successfully");
    return res.status(200).json({
      status: "success",
      message: "Service updated successfully",
      data: rows[0]
    });

  } catch (error) {
    logger.error("Failed to update service:", error);
    return next(new AppError("Failed to update service", 500));
  }
};

// ✅ Freelancer Delete their service
const deleteServiceByFreelancer = async (req, res, next) => {
  logger.info("Freelancer deleting service");
  try {
    const { id } = req.body;
    const user = decodedToken(req.cookies?.AccessToken);
    const freelancer_id = user?.roleWiseId;

    if (!id) {
      logger.warn("Service ID missing");
      return next(new AppError("Please provide service ID", 400));
    }

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
      message: "Service deleted successfully"
    });

  } catch (error) {
    logger.error("Failed to delete service:", error);
    return next(new AppError("Failed to delete service", 500));
  }
};

// ✅ Freelancer Get their services
const getServicesByFreelaner = async (req, res, next) => {
  logger.info("Fetching freelancer services");
  try {
    const user = decodedToken(req.cookies?.AccessToken);
    const freelancer_id = user.roleWiseId;

    const { rows: services } = await query(
      `SELECT * FROM services WHERE freelancer_id=$1 ORDER BY created_at DESC`,
      [freelancer_id]
    );

    logger.debug(`Total freelancer services: ${services.length}`);

    if (services.length < 1) {
      logger.warn("No services found for freelancer");
      return res.status(204).json({
        status: "success",
        message: "No services found"
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Services fetched successfully",
      data: services
    });

  } catch (error) {
    logger.error("Failed to fetch freelancer services:", error);
    return next(new AppError("Failed to fetch services", 500));
  }
};

module.exports = {
  getServices,
  addServices,
  deleteServiceByFreelancer,
  updateServiceByFreelancer,
  addServicesByFreelancer,
  getServicesByFreelaner
};
