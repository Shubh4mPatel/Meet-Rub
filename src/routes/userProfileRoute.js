const express = require('express');
const router = express.Router();
const { getUserProfile, editProfile, getAllFreelancers } = require('../controller');
const upload = require('../../config/multer');

router.get('/getProfile', getUserProfile);
router.post('/editProfile', upload.single('file'), editProfile);
router.get('/freelancers', getAllFreelancers);

module.exports = router;