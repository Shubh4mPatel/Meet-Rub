const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: 'us-east-1',                                    // required by SDK, MinIO ignores it
  endpoint: `${process.env.MINIO_USE_SSL === 'true' 
    ? 'https' 
    : 'http'}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || 9000}`,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,                                   // required for MinIO
});

module.exports = { s3Client };