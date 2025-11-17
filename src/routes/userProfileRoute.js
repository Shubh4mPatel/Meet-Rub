const express = require('express');
const router = express.Router();
const { getUserProfile, editProfile, getAllFreelancers, getFreelancerById, addFreelancerToWhitelist } = require('../controller');
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
router.post('/editProfile', upload.single('file'), editProfile);

/**
 * @swagger
 * /user-profile/freelancers:
 *   get:
 *     summary: Get all freelancers with pagination, search and filters
 *     tags: [User Profile]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by freelancer name
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *           default: 0
 *         description: Minimum service price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum service price filter
 *       - in: query
 *         name: serviceType
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Filter by service types (can be multiple)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [toprated, newest]
 *           default: newest
 *         description: Sort freelancers by rating or creation date
 *       - in: query
 *         name: deliveryTime
 *         schema:
 *           type: string
 *         description: Filter by delivery time (e.g., "2-3 days")
 *     responses:
 *       200:
 *         description: Freelancers retrieved successfully with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     freelancers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           freelancer_id:
 *                             type: string
 *                           freelancer_full_name:
 *                             type: string
 *                           profile_title:
 *                             type: string
 *                           profile_image_url:
 *                             type: string
 *                           rating:
 *                             type: number
 *                           service_type:
 *                             type: string
 *                           service_price:
 *                             type: number
 *                           delivery_time:
 *                             type: string
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *       500:
 *         description: Server error
 */
router.get('/freelancers', getAllFreelancers);

/**
 * @swagger
 * /user-profile/freelancers/{id}:
 *   get:
 *     summary: Get freelancer details by ID
 *     tags: [User Profile]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Freelancer ID
 *     responses:
 *       200:
 *         description: Freelancer details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     freelancer:
 *                       type: object
 *                       properties:
 *                         freelancer_id:
 *                           type: string
 *                         freelancer_full_name:
 *                           type: string
 *                         profile_title:
 *                           type: string
 *                         profile_image_url:
 *                           type: string
 *                     portfolio:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           portfolio_item_service_type:
 *                             type: string
 *                           portfolio_items:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 portfolio_id:
 *                                   type: string
 *                                 portfolio_item_url:
 *                                   type: string
 *                                 portfolio_item_description:
 *                                   type: string
 *       404:
 *         description: Freelancer not found
 *       500:
 *         description: Server error
 */
router.get('/freelancers/:id', getFreelancerById);

/**
 * @swagger
 * /user-profile/freelancers/{id}/whitelist:
 *   post:
 *     summary: Add freelancer to user's whitelist
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Freelancer ID to add to whitelist
 *     responses:
 *       200:
 *         description: Freelancer added to whitelist successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Freelancer added to whitelist successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/freelancers/whitelist', addFreelancerToWhitelist);

module.exports = router;