const { minioClient } = require('../../../config/minio');
const { UPLOAD_CONFIGS } = require('../../../config/uploadConfig');

const BUCKET = process.env.MINIO_BUCKET_NAME;
const EXPIRY_SECONDS = 10 * 60; // 10 minutes to complete the upload

const buildKey = (keyPrefix, uploadType, slotName) =>
  `${keyPrefix}/${uploadType}/${Date.now()}-${slotName}-${Math.random().toString(36).slice(2, 8)}`;

const generatePresignedPut = async (slot, uploadType) => {
  const objectKey = buildKey(slot.keyPrefix, uploadType, slot.name);

  const uploadUrl = await minioClient.presignedPutObject(BUCKET, objectKey, EXPIRY_SECONDS);

  // Replace internal MinIO host with the public-facing domain
  const parsed = new URL(uploadUrl);
  const publicUploadUrl = `https://staging.meetrub.com${parsed.pathname}${parsed.search}`;

  return {
    uploadUrl: publicUploadUrl,
    objectKey,
    allowedTypes: slot.allowedTypes,
    maxSizeBytes: slot.maxSizeBytes,
    required: slot.required,
  };
};

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
        const presigned = await generatePresignedPut(slot, uploadType);
        return [slot.name, presigned];
      })
    );

    return res.status(200).json({
      uploadType,
      slots: Object.fromEntries(slotEntries),
    });
  } catch (err) {
    console.error('[getUploadUrls] error:', err);
    return res.status(500).json({ error: 'Failed to generate upload URLs' });
  }
};

module.exports = { getUploadUrls };
