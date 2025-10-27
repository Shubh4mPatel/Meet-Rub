const { query, client } = require("../../../config/dbConfig");
const { minioClient } = require("../../../config/minio");
const AppError = require("../../../utils/appError");
const { decodedToken } = require("../../../utils/helper");

const BUCKET_NAME = "freelancer-portfolios";
const expirySeconds = 4 * 60 * 60;

const uploadBeforeAfter = async (req, res, next) => {
    const uploadedFiles = [];
    try {
        const { matric, serviceType } = req.body;
        const user = decodedToken(req.cookies?.AccessToken);
        const freelancerId = user?.roleWiseId;

        if (!serviceType || !matric) {
            return next(new AppError('Service and detials are required', 400))
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
            const folder = `Impact/${user.user_id}/${type}`;
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
            `INSERT INTO impact 
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
        await client.query('ROLLBACK');
        logger.error('Before/After upload error:', error);

        const filesToUpload = [
            { file: beforeFile, type: 'before' },
            { file: afterFile, type: 'after' }
        ];
        // Cleanup: Remove uploaded files from MinIO
        for (const fileData of uploadedFiles) {
            try {
                await minioClient.removeObject(BUCKET_NAME, fileData.objectName);
            } catch (minioError) {
                logger.error('Failed to cleanup MinIO object:', minioError);
            }
        }
        return next(new AppError('failed to add Impact'))
    }
}

const getBeforeAfter = async (req, res, next) => {
    try {
        const user = decodedToken(req.cookies?.AccessToken);
        const freelancerId = user?.roleWiseId;


        const { rows: portfolios } = await query(
            `SELECT * FROM impact 
       WHERE freelancer_id = $1 
       AND before_service_url IS NOT NULL 
       AND after_service_url IS NOT NULL
       ORDER BY updated_at DESC`,
            [freelancerId]
        );

        if (portfolios.length === 0) {
            return res.status(204).json({
                status: 'success',
                message: 'No before/after data found',
            });
        }

        // Generate presigned URLs
        const portfoliosWithUrls = await Promise.all(
            portfolios.map(async (portfolio) => {
                const beforeObjectName = getObjectNameFromUrl(portfolio.before_service_url, BUCKET_NAME)
                const afterObjectName = getObjectNameFromUrl(portfolio.after_service_url, BUCKET_NAME)

                const beforeUrl = await minioClient.presignedGetObject(
                    BUCKET_NAME,
                    beforeObjectName,
                    expirySeconds
                );

                const afterUrl = await minioClient.presignedGetObject(
                    BUCKET_NAME,
                    afterObjectName,
                    expirySeconds
                );

                return {
                    ...portfolio,
                    portfolio_item_url_before: beforeUrl,
                    portfolio_item_url_after: afterUrl,
                };
            })
        );

        return res.status(200).json({
            status: 'success',
            data: portfoliosWithUrls,
            message: 'Before/After data found',
        });

    } catch (error) {
        logger.error('Get before/after error:', error);
        return next(new AppError('Failed to get before/after data', 500));
    }
};

module.exports = {
    uploadBeforeAfter,
    getBeforeAfter,
};
