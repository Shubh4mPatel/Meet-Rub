const {query} = require('../../../config/dbConfig')
const AppError = require ('../../../utils/appError')
const logger = require('../../../utils/logger')

const getServices = async(req,res,next)=>{
    try{
        const {rows:services} = await query('SELECT service_type FROM available_services')
        if(!services.length>1){
            return next( new AppError('service are not availble at this moment',500))
        }
        res.status(200).json({
            status:'success',
            message:'service fetched sucessfully',
            data: services
        })
    }catch(error){
        logger.error(error);
        
        return next( new AppError('failed to fetch services',500))
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
      return query(queryText, [service, admin,new Date.now()]);
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


module.exports={getServices,addServices}