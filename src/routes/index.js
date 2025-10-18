const express = require('express');
const router = express.Router();
const authroutes = require('./authRoutes');
const userProfileRoutes = require('./userProfileRoute');

router.use('/auth', authroutes);
router.use('/user-profile', userProfileRoutes);

module.exports = router;