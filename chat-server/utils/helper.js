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

// Generate presigned URL with download headers for chat files
async function createDownloadablePresignedUrl(objectPath, filename) {
  if (!objectPath) return null;

  console.log('[createDownloadablePresignedUrl] Input objectPath:', objectPath);
  console.log('[createDownloadablePresignedUrl] Input filename:', filename);

  try {
    // objectPath should be like: "chat-files/102-109/1776884991094-za2ezh-file.pdf"
    // NOT a full URL, NOT with bucket prefix
    const bucket = process.env.MINIO_BUCKET_NAME || 'meet-rub-assets';
    const object = objectPath;

    console.log('[createDownloadablePresignedUrl] Using bucket:', bucket);
    console.log('[createDownloadablePresignedUrl] Using object:', object);

    // Generate presigned URL with Content-Disposition header to force download
    const url = await minioClient.presignedGetObject(
      bucket,
      object,
      PRESIGNED_EXPIRY,
      {
        'response-content-disposition': `attachment; filename="${encodeURIComponent(filename || 'download')}"`
      }
    );

    console.log('[createDownloadablePresignedUrl] Generated URL:', url);

    const parsed = new URL(url);
    const finalUrl = `https://staging.meetrub.com${parsed.pathname}${parsed.search}`;

    console.log('[createDownloadablePresignedUrl] Final URL:', finalUrl);

    return finalUrl;
  } catch (err) {
    console.error('[createDownloadablePresignedUrl] Error:', err);
    return null;
  }
}

module.exports = { decodedToken, getObjectNameFromUrl, addAssetsPrefix, createPresignedUrl, createDownloadablePresignedUrl };