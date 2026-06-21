// config/registerImageUpload.js
// Dedicated multer instance for registration image uploads (govId / PAN card).
// Only JPEG and PNG are allowed. Invalid types are rejected with HTTP 400.
const multer = require('multer');
const AppError = require('../utils/appError');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Registration documents must be JPEG or PNG images only
  const allowedMimes = ['image/jpeg', 'image/png'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only JPEG and PNG images are allowed.', 400));
  }
};

const registerImageUpload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: fileFilter
});

module.exports = registerImageUpload;
