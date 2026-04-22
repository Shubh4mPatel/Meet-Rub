// config/chatMulter.js
const multer = require('multer');

// Configure multer for memory storage (blob handling)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept all file types for chat
  cb(null, true);
};

const chatUpload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: fileFilter
});

module.exports = chatUpload;
