const { minioClient } = require('../../../config/minio');
const AppError = require('../../../utils/appError');
const { createPresignedUrl } = require('../../../utils/helper');
const { logger } = require('../../../utils/logger');

const BUCKET_NAME = process.env.BUCKET_NAME || 'meet-rub-assets';
const EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Determines file type based on MIME type
 */
const getFileType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'file'; // documents, PDFs, etc.
};

/**
 * Upload file to chat room
 * POST /api/chat/upload-file
 */
const uploadChatFile = async (req, res, next) => {
  let uploadedObjectName = null;

  try {
    const { chatRoomId } = req.body;
    const user = req.user;

    // Validate required fields
    if (!chatRoomId) {
      logger.warn('Chat room ID missing in upload request');
      return next(new AppError('Chat room ID is required', 400));
    }

    if (!req.file) {
      logger.warn('No file provided in upload request');
      return next(new AppError('No file uploaded', 400));
    }

    logger.info(`File upload started by user ${user.user_id} for room ${chatRoomId}`);

    // TODO: Add validation to check if user has access to this chat room
    // This would require querying chat_rooms table to verify user is participant

    const file = req.file;
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 8);
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const objectName = `chat-files/${chatRoomId}/${timestamp}-${randomStr}-${sanitizedFilename}`;

    logger.info(`Uploading file to MinIO: ${objectName}`);

    // Upload to MinIO
    await minioClient.putObject(
      BUCKET_NAME,
      objectName,
      file.buffer,
      file.size,
      { 'Content-Type': file.mimetype }
    );

    uploadedObjectName = objectName;
    logger.info(`File uploaded successfully to MinIO: ${objectName}`);

    // Generate presigned URL with download headers (force download)
    const presignedUrl = await minioClient.presignedGetObject(
      BUCKET_NAME,
      objectName,
      EXPIRY_SECONDS,
      {
        'response-content-disposition': `attachment; filename="${encodeURIComponent(file.originalname)}"`
      }
    );

    // Determine file type
    const fileType = getFileType(file.mimetype);

    // Return file metadata
    const response = {
      status: 'success',
      message: 'File uploaded successfully',
      data: {
        file_url: presignedUrl,
        filename: file.originalname,
        file_size: file.size,
        file_type: fileType,
        mime_type: file.mimetype,
        object_name: objectName // Path without bucket: chat-files/{roomId}/{filename}
      }
    };

    logger.info(`File upload completed for user ${user.user_id}`);
    return res.status(200).json(response);

  } catch (error) {
    // Clean up uploaded file if something went wrong
    if (uploadedObjectName) {
      try {
        await minioClient.removeObject(BUCKET_NAME, uploadedObjectName);
        logger.info(`Cleaned up uploaded file after error: ${uploadedObjectName}`);
      } catch (cleanupError) {
        logger.error('Failed to cleanup uploaded file:', cleanupError);
      }
    }

    logger.error('Chat file upload error:', error);
    return next(new AppError('Failed to upload file', 500));
  }
};

module.exports = {
  uploadChatFile
};
