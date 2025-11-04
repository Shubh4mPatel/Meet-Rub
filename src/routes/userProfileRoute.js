const express = require('express');
const router = express.Router();
const { getUserProfile, editProfile } = require('../controller');
const upload = require('../../config/multer');

router.get('/getProfile', getUserProfile);
router.post('/editProfile', upload.single('file'), editProfile);

module.exports = router;