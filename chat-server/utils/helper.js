const jwt = require('jsonwebtoken');
const { minioClient } = require('../config/minio');

const PRESIGNED_EXPIRY = 4 * 60 * 60; // 4 hours

const decodedToken = (token) => {
    return  jwt.verify(token, process.env.JWT_SECRET);
}

async function createPresignedUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const slash = rawUrl.indexOf('/');
    if (slash === -1) return null;
    const bucket = rawUrl.substring(0, slash);
    const object = rawUrl.substring(slash + 1);
    const url = await new Promise((resolve, reject) => {
      minioClient.presignedGetObject(bucket, object, PRESIGNED_EXPIRY, (err, u) => {
        if (err) return reject(err);
        resolve(u);
      });
    });
    const parsed = new URL(url);
    return `https://staging.meetrub.com${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}
function getObjectNameFromUrl(url, bucketName) {
    try {
      const parsedUrl = new URL(url);
      // Example: pathname = "/my-bucket/uploads/freelancer-1/work1.png"
      const path = parsedUrl.pathname;
      // Remove leading '/' and bucket name prefix
      return path.replace(`/${bucketName}/`, '');
    } catch (err) {
      console.error("Invalid URL:", err);
      return err;
    }
  }
  function addAssetsPrefix(rawUrl) {
  const u = new URL(rawUrl);
  // Normalize existing path (remove leading slash for split)
  const parts = u.pathname.replace(/^\/+/, '').split('/');
  // If it already starts with 'assets', do nothing
  if (parts[0] !== 'assets') parts.unshift('assets');
  u.pathname = '/' + parts.join('/');
  return u.toString();
}
module.exports = { decodedToken, getObjectNameFromUrl, addAssetsPrefix, createPresignedUrl };