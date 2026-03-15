// uploadController.js
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { S3Client } = require('@aws-sdk/client-s3');
const { UPLOAD_CONFIGS } = require('../../../config/uploadConfig');
const { createPresignedUrl } = require('../../../utils/helper');

const expirySeconds = 4 * 60 * 60; // 4 hours

// ─── MinIO S3 Client ─────────────────────────────────────────────────────────
const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint:"http://147.93.108.64:9000",
  // endpoint: `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || 9000}`,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET_NAME;
const PUBLIC_BASE_URL = process.env.MINIO_PUBLIC_URL;

// ─── helpers ─────────────────────────────────────────────────────────────────

const buildKey = (keyPrefix, uploadType, slotName) =>
  `${keyPrefix}/${uploadType}/${Date.now()}-${slotName}-${Math.random().toString(36).slice(2, 8)}`;

const generatePresignedPost = async (slot, uploadType) => {
  const blobKey = buildKey(slot.keyPrefix, uploadType, slot.name);

  const { url, fields } = await createPresignedPost(s3Client, {
    Bucket: BUCKET,
    Key: blobKey,
    Conditions: [
      ['content-length-range', 0, slot.maxSizeBytes],
      ['starts-with', '$Content-Type', ''],
      ['starts-with', '$key', slot.keyPrefix],
    ],
    Fields: {},
    Expires: 600,
  });

  const fileUrl = await createPresignedUrl(BUCKET, blobKey, expirySeconds);

  return {
    uploadUrl: url,
    fields,
    fileUrl,
    blobKey,
    allowedTypes: slot.allowedTypes,
    maxSizeBytes: slot.maxSizeBytes,
    required: slot.required,
  };
};

// ─── controller ──────────────────────────────────────────────────────────────

const getUploadUrls = async (req, res) => {
  try {
    const { uploadType } = req.body;

    if (!uploadType) {
      return res.status(400).json({ error: 'uploadType is required' });
    }

    const config = UPLOAD_CONFIGS[uploadType];
    if (!config) {
      return res.status(400).json({
        error: `Unknown uploadType "${uploadType}"`,
        validTypes: Object.keys(UPLOAD_CONFIGS),
      });
    }

    const slotEntries = await Promise.all(
      config.slots.map(async (slot) => {
        const presigned = await generatePresignedPost(slot, uploadType);
        return [slot.name, presigned];
      })
    );

    const slots = Object.fromEntries(slotEntries);

    return res.status(200).json({ uploadType, slots });

  } catch (err) {
    console.error('[getUploadUrls] error:', err);
    return res.status(500).json({ error: 'Failed to generate upload URLs' });
  }
};

module.exports = { getUploadUrls };