const { query } = require('../../../config/dbConfig')
const AppError = require('../../../utils/appError')
const { decodedToken } = require('../../../utils/helper')
const logger = require('../../../utils/logger')

const getServices = async (req, res, next) => {
    try {
        const { rows: services } = await query('SELECT service_type FROM available_services')
        if (!services.length > 1) {
            return next(new AppError('service are not availble at this moment', 500))
        }
        res.status(200).json({
            status: 'success',
            message: 'service fetched sucessfully',
            data: services
        })
    } catch (error) {
        logger.error(error);

        return next(new AppError('failed to fetch services', 500))
    }
}

const addServices = async (req, res, next) => {
    try {
        const { serviceType } = req.body;
        const user = decodedToken(req.cookies?.AccessToken);
        const admin = user?.id;

        if (!Array.isArray(serviceType) || serviceType.length === 0) {
            return next(new AppError("Please provide valid services to add", 400));
        }

        const queryText = `
      INSERT INTO available_services (service_type, created_by,created_at)
      VALUES ($1, $2,$3)
      RETURNING *;
    `;

        const insertPromises = serviceType.map(service => {
            return query(queryText, [service, admin, new Date.now()]);
        });

        const results = await Promise.all(insertPromises);

        res.status(201).json({
            success: true,
            message: "Services added successfully!",
            services: results.map(r => r.rows[0])
        });

    } catch (error) {
        console.error(error);
        return next(error);
    }
};

const addServicesByFreelancer = async (req, res, next) => {
    try {
        const { service, price, description } = req.body;
        const user = decodedToken(req.cookies?.AccessToken);
        const freelancer_id = user?.roleWiseId;

        if (!service) {
            return next(new AppError("Service type is required", 400));
        }

        const { rows } = await query(
            `INSERT INTO services 
        (freelancer_id, service_name, description, price, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
            [freelancer_id, service, description, price, new Date(), new Date()]
        );

        return res.status(200).json({
            status: "success",
            message: "Service added successfully",
            data: rows[0],
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError("Failed to add service", 500));
    }
};

const updateServiceByFreelancer = async (req, res, next) => {
    try {
        const { service, price, description, serviceId } = req.body;
        if (!serviceId || !service) {
            return next('please provide base information', 400)
        }

        const { rows } = await query(
            `UPDATE services 
       SET service_name = $1, price = $2, description = $3, updated_at = $4 
       WHERE id=$5   RETURNING *`,
            [service, price, description, new Date(), serviceId]
        );

        if (!rows.length) {
            return next(new AppError("Service not found", 404));
        }

        return res.status(200).json({
            status: "success",
            message: "Service updated successfully",
            data: rows[0],
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError("Failed to update service", 500));
    }
};

const deleteServiceByFreelancer = async (req, res, next) => {
    try {
        const { id } = req.body;
        if (!id) {
            return next('please provide id ', 400)
        }

        const { rowCount } = await query(
            `DELETE FROM services WHERE id = $1`,
            [id]
        );

        if (rowCount === 0) {
            return next(new AppError("Service not found", 404));
        }

        return res.status(200).json({
            status: "success",
            message: "Service deleted successfully",
        });
    } catch (error) {
        logger.error(error);
        return next(new AppError("Failed to delete service", 500));
    }
};

const getServicesByFreelaner = async (req, res, next) => {
    try {
        const user = decodedToken(req.cookies?.AccessToken);
        const freelancer_id = user.roleWiseId;

        const { rows: services } = await query('SELECT * FROM services WHERE freelancer_id = $1 order by created_at desc', [freelancer_id]);
        if (!services.length > 1) {
            return res.status(204).json({
                status: 'success',
                message: 'No services found',
            })
        }
        return res.status(200).json({
            status: 'success',
            message: 'services fetched successfully',
            data: services
        })
    } catch (error) {
        logger.error(error)
        return next(new AppError('failed to fetch services', 500))
    }
}

module.exports = { getServices, addServices, deleteServiceByFreelancer, updateServiceByFreelancer, addServicesByFreelancer, getServicesByFreelaner }