const {query}=require('../../../config/dbConfig')
const AppError = require('../../../utils/appError')
const { decodedToken } = require("../../../utils/helper");



const getPortfolioByFreelancerId=async(req,res,next)=>{
    try{
        const user = decodedToken(req.cookies?.AccessToken); 
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
          }
      const bucketName = req.body.bucket || 'default-uploads';


      }
    catch(error){
        return next(new AppError("Failed to get portfolio", 500));
    }
}

router.post('/upload',  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
  
      // Get bucket name from request body or use default
      
      // Ensure bucket exists
      await ensureBucketExists(bucketName);
  
      // Generate unique filename
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      
      // Determine folder based on file type
      const folder = req.file.mimetype.startsWith('image/') ? 'images' : 'videos';
      const objectName = `${folder}/${fileName}`;
  
      // Upload to MinIO
      await minioClient.putObject(
        bucketName,
        objectName,
        req.file.buffer,
        req.file.size,
        {
          'Content-Type': req.file.mimetype,
          'X-Original-Name': req.file.originalname
        }
      );
  
      // Generate presigned URL (optional, for direct access)
      const url = await minioClient.presignedGetObject(bucketName, objectName, 24 * 60 * 60); // 24 hours
  
      res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          bucket: bucketName,
          fileName: fileName,
          originalName: req.file.originalname,
          objectName: objectName,
          size: req.file.size,
          mimeType: req.file.mimetype,
          url: url
        }
      });
  
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to upload file',
        details: error.message
      });
    }
  });