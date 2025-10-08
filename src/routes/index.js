const express = require('express');
const router = express.Router();
const authroutes = require('./authRoutes');

router.use('/auth', authroutes);

module.exports = router;