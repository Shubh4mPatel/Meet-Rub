
// ============================================
// FILE: config/minio.config.js
// ============================================
const { Client } = require('minio');

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT ,
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL:  false,
  accessKey: process.env.MINIO_ACCESS_KEY ,
  secretKey: process.env.MINIO_SECRET_KEY
});

// const minioPublicClient = new Client({
//   endPoint: process.env.MINIO_PUBLIC_ENDPOINT , // Public IP or domain
//   port: parseInt(process.env.MINIO_PUBLIC_PORT) || 9000,
//   useSSL: false,
//   accessKey: process.env.MINIO_ACCESS_KEY,
//   secretKey: process.env.MINIO_SECRET_KEY
// });
// const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'media-uploads';

// Ensure bucket exists
const ensureBucketExists = async (bucketName) => {
    try {
      const exists = await minioClient.bucketExists(bucketName);
      if (!exists) {
        await minioClient.makeBucket(bucketName);
        console.log(`✓ Bucket '${bucketName}' created successfully`);
      }
      return true;
    } catch (err) {
      console.error(`✗ Error with bucket '${bucketName}':`, err.message);
      throw err;
    }
  };
  

module.exports = {
  minioClient,
  minioPublicClient
};