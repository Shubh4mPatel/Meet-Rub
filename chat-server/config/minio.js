const { Client } = require('minio');

const minioClient = new Client({
  endPoint:  process.env.MINIO_ENDPOINT,
  port:      parseInt(process.env.MINIO_PORT) || 9000,
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

module.exports = { minioClient };
