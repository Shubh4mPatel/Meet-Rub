const {minioPublicClient,minioClient} = require('../config/minio');
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

function getNormalUrlFromPresigned(presignedUrl) {
  try {
    const parsedUrl = new URL(presignedUrl);
    // Extract just the pathname without query parameters
    const pathname = parsedUrl.pathname;
    // Construct the normal URL: protocol://host/pathname
    const normalUrl = `${parsedUrl.protocol}//${parsedUrl.host}${pathname}`;
    return normalUrl;
  } catch (err) {
    console.error("Invalid presigned URL:", err);
    return null;
  }
}

function validateFile(file, allowedTypes, maxSizeMB) {
  if (!file) {
    return { valid: false, error: "No file provided" };
  }

  const fileType = file.type; // MIME type
  const fileSizeMB = file.size / (1024 * 1024);

  if (!allowedTypes.includes(fileType)) {
    return { valid: false, error: "Invalid file type" };
  }

  if (fileSizeMB > maxSizeMB) {
    return { valid: false, error: "File is too large" };
  }

  return { valid: true };
}


async function createPresignedUrl(bucketName, objectName, expirySeconds) {
  try {
    const presignedUrl = await new Promise((resolve, reject) => {
      minioClient.presignedGetObject(bucketName, objectName, expirySeconds, (err, url) => {
        if (err) {
          return reject(err);
        }
        resolve(url);
      });
    });
    return presignedUrl; ;
  } catch (err) {
    throw err;
  }
}

module.exports = { getObjectNameFromUrl, addAssetsPrefix, getNormalUrlFromPresigned, validateFile,createPresignedUrl };