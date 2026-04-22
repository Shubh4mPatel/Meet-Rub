const express = require('express');
const router = express.Router();
const chatUpload = require('../../config/chatMulter');
const { uploadChatFile } = require('../controller/chat/chatFileUploadController');
const { authenticateUser } = require('../middleware/authMiddleware');

// Upload file for chat with error handling
router.post('/upload-file', authenticateUser, (req, res, next) => {
  chatUpload.single('file')(req, res, (err) => {
    if (err) {
      // Handle Multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          status: 'error',
          message: 'File size too large. Please upload a file smaller than 20MB.'
        });
      }

      // Handle other multer errors
      return res.status(400).json({
        status: 'error',
        message: err.message || 'File upload failed'
      });
    }

    // No error, proceed to controller
    next();
  });
}, uploadChatFile);

module.exports = router;
