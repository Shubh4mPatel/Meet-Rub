const express = require('express');
const router = express.Router();
const authroutes = require('./authRoutes');
const userProfileRoutes = require('./userProfileRoute');
const adminRoutes = require('./adminRoutes')
const freelancerRoutes = require('./freelancerRoutes')
const { authenticateUser, requireRole } = require('../middleware/authMiddleware');

router.use('/auth', authroutes);
router.use('/user-profile', authenticateUser, userProfileRoutes);
router.use('/admin', authenticateUser, requireRole(['admin']), adminRoutes)
router.use('/freelancer', authenticateUser, requireRole(['freelancer']), freelancerRoutes)

module.exports = router;