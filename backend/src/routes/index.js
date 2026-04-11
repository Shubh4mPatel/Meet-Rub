const express = require('express');
const router = express.Router();
const authroutes = require('./authRoutes');
const userProfileRoutes = require('./userProfileRoute');
const adminRoutes = require('./adminRoutes')
const freelancerRoutes = require('./freelancerRoutes')
const creatorRoutes = require('./creatorRoutes')
const paymentRoutes = require('./paymentRoutes');
const projectRoutes = require('./projectRoutes');
const webhookRoutes = require('./webhookRoutes');
const publicRoutes = require('./publicRoutes')
const notificationRoutes = require('./notificationRoutes');
const { authenticateUser, requireRole } = require('../middleware/authMiddleware');

router.use('/auth', authroutes);
router.use('/user-profile', authenticateUser, userProfileRoutes);
router.use('/admin', authenticateUser, requireRole(['admin']), adminRoutes)
router.use('/freelancer', freelancerRoutes)
router.use('/creator', creatorRoutes)
router.use('/payments', authenticateUser, paymentRoutes);
router.use('/projects', authenticateUser, projectRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/public', publicRoutes);
router.use('/notifications', authenticateUser, notificationRoutes);


module.exports = router;