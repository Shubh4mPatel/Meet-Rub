const AppError = require("../../../utils/appError");
const { decodedToken } = require("../../../utils/helper");

const uploadBeforeAfter = async (req, res, next) => {
    try {
        const { matric, serviceType } = req.body;
        const user = decodedToken(req.cookies?.AccessToken);

        if(! serviceType || ! matric){
            return next( new AppError ('Service and detials are required',400))
        }
        if (!req.files || !req.files.before || !req.files.after) {
            return next(new AppError('Both before and after files are required', 400));
        }
        const beforeFile = req.files.before[0];
        const afterFile = req.files.after[0];
        await client.query('BEGIN');

        // Upload both files to MinIO
        const filesToUpload = [
            { file: beforeFile, type: 'before' },
            { file: afterFile, type: 'after' }
        ];

        for (const { file, type } of filesToUpload) {

            // const mediaType = file.mimetype.startsWith('image') ? 'image' : 'video';
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
                { 'Content-Type': file.mimetype }
            );

            uploadedFiles.push({
                type,
                objectName,
                fileUrl,
                originalName: file.originalname,
                mimeType: file.mimetype,
            });
        }
        const { rows } = await client.query(
            `INSERT INTO portfolio 
      (freelancer_id, service_type, before_service_url, 
       after_service_url, impact_matric, 
       created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
            [
                freelancerId,
                serviceType,
                uploadedFiles.find(f => f.type === 'before').fileUrl,
                uploadedFiles.find(f => f.type === 'after').fileUrl,
                matric,
                new Date.now(),
                new Date.now(),
            ]
        );

        await client.query('COMMIT');

        res.status(201).json({
            status: 'success',
            message: 'Before/After files uploaded successfully',
            data: {
                portfolio: rows[0],
                files: uploadedFiles,
            },
        });


    } catch (error) {
        return next(new AppError('failed to add Impact'))
    }
}
module.exports = { uploadBeforeAfter }