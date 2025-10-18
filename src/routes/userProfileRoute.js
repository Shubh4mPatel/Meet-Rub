const express = require('express');
const router = express.Router();
const { getUserProfile, editProfile } = require('../controller');
const { authenticateUser } = require('../middleware/authMiddleware');

router.get('/getProfile', authenticateUser, getUserProfile);
router.post('/editProfile', authenticateUser, editProfile);