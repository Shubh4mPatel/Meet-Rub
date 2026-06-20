const {minioClient} = require('../config/minio');
const jwt = require("jsonwebtoken");
const { query } = require('../config/dbConfig');
const redisClient = require('../config/reddis');
const { logger } = require('./logger');

const USERNAMES_SET_KEY = "usernames:set";

async function loadUsernamesIntoRedis() {
  try {
    const result = await query("SELECT user_name FROM users WHERE user_name IS NOT NULL");
    const usernames = result.rows.map((r) => r.user_name).filter(Boolean);
    if (usernames.length > 0) {
      await redisClient.sAdd(USERNAMES_SET_KEY, usernames);
    }
    logger.info(`Loaded ${usernames.length} usernames into Redis set`);
  } catch (err) {
    logger.error("Failed to load usernames into Redis on startup:", err);
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
    console.log("Presigned URL generated from fun:", presignedUrl);
    
    // Replace MinIO server URL with staging domain
    const parsedUrl = new URL(presignedUrl);
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
    const modifiedUrl = `https://staging.meetrub.com${pathAndQuery}`;
    
    return modifiedUrl;
  } catch (err) {
    throw err;
  }
}

// Generate presigned URL with inline disposition, no filename — browser renders but cannot save-as
async function createViewOnlyPresignedUrl(bucketName, objectName, expirySeconds) {
  try {
    const presignedUrl = await new Promise((resolve, reject) => {
      minioClient.presignedGetObject(
        bucketName,
        objectName,
        expirySeconds,
        { 'response-content-disposition': 'inline' },
        (err, url) => {
          if (err) return reject(err);
          resolve(url);
        }
      );
    });
    const parsedUrl = new URL(presignedUrl);
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
    return `https://staging.meetrub.com${pathAndQuery}`;
  } catch (err) {
    throw err;
  }
}

// Convert a Google Drive URL to a preview (view-only embed) URL
function toGoogleDrivePreviewUrl(url) {
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/);
  if (fileMatch) {
    return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  }
  const openMatch = url.match(/[?&]id=([^&]+)/);
  if (openMatch) {
    return `https://drive.google.com/file/d/${openMatch[1]}/preview`;
  }
  return url;
}

// Generate presigned URL with attachment disposition — forces browser download dialog
async function createAttachmentPresignedUrl(bucketName, objectName, expirySeconds) {
  const filename = objectName.split('/').pop();
  try {
    const presignedUrl = await new Promise((resolve, reject) => {
      minioClient.presignedGetObject(
        bucketName,
        objectName,
        expirySeconds,
        { 'response-content-disposition': `attachment; filename="${encodeURIComponent(filename)}"` },
        (err, url) => {
          if (err) return reject(err);
          resolve(url);
        }
      );
    });
    const parsedUrl = new URL(presignedUrl);
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
    return `https://staging.meetrub.com${pathAndQuery}`;
  } catch (err) {
    throw err;
  }
}

// Generate presigned URL with inline disposition (viewable in browser, can also download)
async function createDownloadablePresignedUrl(bucketName, objectName, expirySeconds, filename) {
  try {
    const presignedUrl = await new Promise((resolve, reject) => {
      minioClient.presignedGetObject(
        bucketName,
        objectName,
        expirySeconds,
        {
          'response-content-disposition': `inline; filename="${encodeURIComponent(filename || 'download')}"`
        },
        (err, url) => {
          if (err) {
            return reject(err);
          }
          resolve(url);
        }
      );
    });
    
    // Replace MinIO server URL with staging domain
    const parsedUrl = new URL(presignedUrl);
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
    const modifiedUrl = `https://staging.meetrub.com${pathAndQuery}`;
    
    return modifiedUrl;
  } catch (err) {
    throw err;
  }
}

// Determine whether a stored file path/URL points to a video or an image,
// based on its extension. Returns 'video', 'image', or null if unknown/empty.
// Accepts raw object paths ("bucket/dir/file.mp4") or presigned URLs (extension
// is read from before the query string).
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'ogv'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'heic', 'heif'];

function getMediaType(filePathOrUrl) {
    if (!filePathOrUrl || typeof filePathOrUrl !== 'string') return null;
    const pathPart = filePathOrUrl.split('?')[0];
    const lastDot = pathPart.lastIndexOf('.');
    if (lastDot === -1) return null;
    const ext = pathPart.slice(lastDot + 1).toLowerCase();
    if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
    if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
    return null;
}

function generateTokens(user, roleWiseId, permissions = null) {
    const payload = {
        user_id: user.id,
        email: user.user_email,
        name: user.user_name,
        role: user.user_role,
        roleWiseId: roleWiseId,
        permissions: permissions,
    };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET);
    const refreshToken = jwt.sign({ user_id: user.id }, process.env.JWT_SECRET);

    return { accessToken, refreshToken };
}

module.exports = { getObjectNameFromUrl, addAssetsPrefix, getNormalUrlFromPresigned, validateFile, createPresignedUrl, createViewOnlyPresignedUrl, createAttachmentPresignedUrl, createDownloadablePresignedUrl, toGoogleDrivePreviewUrl, getMediaType, generateTokens, loadUsernamesIntoRedis, USERNAMES_SET_KEY };