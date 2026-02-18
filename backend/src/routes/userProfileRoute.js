const express = require('express');
const router = express.Router();
const { getUserProfile, editProfile, getAllFreelancers, getFreelancerById, getFreelancerPortfolio, getFreelancerImpact, addFreelancerToWishlist } = require('../controller');
const upload = require('../../config/multer');


router.get('/getProfile', getUserProfile);


// Accept any single file upload field - more flexible
router.post('/editProfile', upload.any(), editProfile);



module.exports = router;