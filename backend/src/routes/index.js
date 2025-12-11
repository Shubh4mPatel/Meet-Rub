const express = require('express');
const router = express.Router();
const authroutes = require('./authRoutes');
const userProfileRoutes = require('./userProfileRoute');
const adminRoutes = require('./adminRoutes')
const freelancerRoutes = require('./freelancerRoutes')
const creatorRoutes = require('./creatorRoutes')
const paymentRoutes = require('./paymentRoutes');
const walletRoutes = require('./walletRoutes');
const { authenticateUser, requireRole } = require('../middleware/authMiddleware');

router.use('/auth', authroutes);
router.use('/user-profile', authenticateUser, userProfileRoutes);
router.use('/admin', authenticateUser, requireRole(['admin']), adminRoutes)
router.use('/freelancer', authenticateUser, requireRole(['freelancer']), freelancerRoutes)
router.use('/creator', authenticateUser, requireRole(['creator']), creatorRoutes)
router.use('/payments',authenticateUser, paymentRoutes);
router.use('/wallet', authenticateUser, walletRoutes);


module.exports = router;