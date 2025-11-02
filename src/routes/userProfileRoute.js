const express = require('express');
const router = express.Router();
const { getUserProfile, editProfile } = require('../controller');
const { authenticateUser, requireRole } = require('../middleware/authMiddleware');
const upload = require('../../config/multer');

router.get('/getProfile', authenticateUser, getUserProfile);
router.post('/editProfile', authenticateUser, upload.single('file'),editProfile);

module.exports = router;