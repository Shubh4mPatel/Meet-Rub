const express = require('express');
const router = express.Router();
const { getUserProfile, editProfile, getAllFreelancers, getFreelancerById, getFreelancerPortfolio, getFreelancerImpact, addFreelancerToWishlist } = require('../controller');
const upload = require('../../config/multer');

/**
 * @swagger
 * /user-profile/getProfile:
 *   get:
 *     summary: Get user profile
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.get('/getProfile', getUserProfile);

/**
 * @swagger
 * /user-profile/editProfile:
 *   post:
 *     summary: Edit user profile
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Profile picture
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
// Accept any single file upload field - more flexible
router.post('/editProfile', upload.any(), editProfile);



module.exports = router;