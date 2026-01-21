const express = require('express');
const upload = require('../../config/multer');
const {getMyPayouts,getEarningsSummary } = require('../controller/razor-pay-controllers/freelancerController');
const router = express.Router();
const  { requireRole, authenticateUser } =  require('../middleware/authMiddleware');
const { uploadBeforeAfter, getBeforeAfter, deleteBeforeAfter, getPortfolioByFreelancerId, addFreelancerPortfolio, updateFreelancerPortfolio, deleteFreelancerPortfolio, getAllFreelancers, getFreelancerById, getFreelancerPortfolio, getFreelancerImpact, addFreelancerToWhitelist, getServices } = require('../controller');
const { addServicesByFreelancer, getServicesByFreelaner, deleteServiceByFreelancer, updateServiceByFreelancer } = require('../controller');
const { getUserProfileProgress } = require('../controller/users/userProfileController');
const { deleteFreelancerProtfolioItem } = require("../controller/portfoilio/portfolioController");
const { getNiches } = require('../controller/services/serviceController');

/**
 * @swagger
 * /freelancer/portfolio/upload-after-before:
 *   post:
 *     summary: Upload before and after images for portfolio
 *     tags: [Freelancer Portfolio]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - before
 *               - after
 *             properties:
 *               before:
 *                 type: string
 *                 format: binary
 *                 description: Before image
 *               after:
 *                 type: string
 *                 format: binary
 *                 description: After image
 *     responses:
 *       200:
 *         description: Images uploaded successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 */
router.post('/portfolio/upload-after-before',authenticateUser, requireRole(['freelancer']), upload.fields([
    {
        name: 'before',
        maxCount: 1
    },
    {
        name: 'after',
        maxCount: 1,
    }
]), uploadBeforeAfter)

/**
 * @swagger
 * /freelancer/portfolio/get-after-before:
 *   get:
 *     summary: Get before and after images
 *     tags: [Freelancer Portfolio]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Before/After images retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   beforeImage:
 *                     type: string
 *                   afterImage:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 */
router.get('/portfolio/get-after-before',authenticateUser,  getBeforeAfter)

/**
 * @swagger
 * /freelancer/portfolio/delete-after-before:
 *   delete:
 *     summary: Delete before and after images
 *     tags: [Freelancer Portfolio]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the before/after image pair to delete
 *     responses:
 *       200:
 *         description: Images deleted successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 *       404:
 *         description: Images not found
 */
router.delete('/portfolio/delete-after-before',authenticateUser, requireRole(['freelancer']), deleteBeforeAfter)

/**
 * @swagger
 * /freelancer/add-service:
 *   post:
 *     summary: Add services offered by freelancer
 *     tags: [Freelancer Services]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serviceId
 *             properties:
 *               serviceId:
 *                 type: string
 *                 example: "service123"
 *               price:
 *                 type: number
 *                 example: 50
 *               description:
 *                 type: string
 *                 example: Professional web development
 *     responses:
 *       201:
 *         description: Service added successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 */
router.post('/add-service',authenticateUser, requireRole(['freelancer']), addServicesByFreelancer)

/**
 * @swagger
 * /freelancer/get-services:
 *   get:
 *     summary: Get services offered by freelancer
 *     tags: [Freelancer Services]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Services retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   serviceId:
 *                     type: string
 *                   price:
 *                     type: number
 *                   description:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 */
router.get('/get-services',authenticateUser, requireRole(['freelancer']), getServicesByFreelaner)

router.get('/get-available-services', getServices);

/**
 * @swagger
 * /freelancer/delete-services:
 *   delete:
 *     summary: Delete a service
 *     tags: [Freelancer Services]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Service ID to delete
 *     responses:
 *       200:
 *         description: Service deleted successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 *       404:
 *         description: Service not found
 */
router.delete('/delete-services',authenticateUser, requireRole(['freelancer']), deleteServiceByFreelancer)

/**
 * @swagger
 * /freelancer/update-service:
 *   put:
 *     summary: Update a service
 *     tags: [Freelancer Services]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 example: "service123"
 *               price:
 *                 type: number
 *                 example: 75
 *               description:
 *                 type: string
 *                 example: Updated service description
 *     responses:
 *       200:
 *         description: Service updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 *       404:
 *         description: Service not found
 */
router.put('/update-service',authenticateUser, requireRole(['freelancer']), updateServiceByFreelancer)

/**
 * @swagger
 * /freelancer/portfolio/get-protfolio:
 *   get:
 *     summary: Get freelancer portfolio
 *     tags: [Freelancer Portfolio]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Portfolio retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   title:
 *                     type: string
 *                   description:
 *                     type: string
 *                   images:
 *                     type: array
 *                     items:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 */
router.get('/portfolio/get-protfolio',authenticateUser, requireRole(['freelancer']), getPortfolioByFreelancerId)

/**
 * @swagger
 * /freelancer/portfolio/add-protfolio:
 *   post:
 *     summary: Add portfolio item
 *     tags: [Freelancer Portfolio]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - serviceType
 *               - files
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [image, video]
 *                 example: image
 *               serviceType:
 *                 type: string
 *                 example: Web Development
 *               itemDescription:
 *                 type: string
 *                 example: A responsive modern website with clean UI
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Portfolio item added successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 */
router.post('/portfolio/add-protfolio',authenticateUser, requireRole(['freelancer']), upload.array('files'), addFreelancerPortfolio)

/**
 * @swagger
 * /freelancer/portfolio/update-protfolio:
 *   put:
 *     summary: Update portfolio item
 *     tags: [Freelancer Portfolio]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Portfolio item updated successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 *       404:
 *         description: Portfolio item not found
 */
router.put('/portfolio/update-protfolio', authenticateUser, requireRole(['freelancer']),upload.single('file'), updateFreelancerPortfolio)

/**
 * @swagger
 * /freelancer/portfolio/delete-protfolios:
 *   delete:
 *     summary: Delete portfolio item
 *     tags: [Freelancer Portfolio]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio item ID to delete
 *     responses:
 *       200:
 *         description: Portfolio item deleted successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 *       404:
 *         description: Portfolio item not found
 */
router.delete('/portfolio/delete-portfolio', authenticateUser, requireRole(['freelancer']), deleteFreelancerPortfolio)

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
 *                     services:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           service_id:
 *                             type: string
 *                           service_type:
 *                             type: string
 *                           service_description:
 *                             type: string
 *                           service_price:
 *                             type: number
 *                           delivery_time:
 *                             type: string
 *       404:
 *         description: Freelancer not found
 *       500:
 *         description: Server error
 */
router.get('/freelancers/:id', getFreelancerById);

/**
 * @swagger
 * /user-profile/freelancers/{id}/portfolio:
 *   get:
 *     summary: Get freelancer portfolio by ID
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
 *         description: Freelancer portfolio retrieved successfully
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
router.get('/freelancers/:id/portfolio', getFreelancerPortfolio);

/**
 * @swagger
 * /user-profile/freelancers/{id}/impact:
 *   get:
 *     summary: Get freelancer impact (before/after) data by ID
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
 *         description: Freelancer impact data retrieved successfully
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
 *                     impact:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           service_type:
 *                             type: string
 *                           impact_items:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 impact_id:
 *                                   type: string
 *                                 before_service_url:
 *                                   type: string
 *                                 after_service_url:
 *                                   type: string
 *                                 impact_metric:
 *                                   type: string
 *       404:
 *         description: Freelancer not found
 *       500:
 *         description: Server error
 */
router.get('/freelancers/:id/impact', getFreelancerImpact);

/**
 * @swagger
 * /freelancer/payouts:
 *   get:
 *     summary: Get my payouts
 *     description: Retrieve all payouts for the authenticated freelancer including status and transaction details
 *     tags: [Freelancer Payouts]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Payouts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 5
 *                 payouts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       transaction_id:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                         enum: [QUEUED, PENDING, PROCESSING, PROCESSED, FAILED]
 *                       razorpay_payout_id:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       processed_at:
 *                         type: string
 *                         format: date-time
 *             example:
 *               count: 5
 *               payouts:
 *                 - id: "789"
 *                   transaction_id: "456"
 *                   amount: 1000
 *                   status: PROCESSED
 *                   razorpay_payout_id: payout_XXXXXXXXXXXXXX
 *                   created_at: "2024-01-16T10:30:00Z"
 *                   processed_at: "2024-01-16T11:00:00Z"
 *                 - id: "790"
 *                   transaction_id: "457"
 *                   amount: 2000
 *                   status: PENDING
 *                   razorpay_payout_id: payout_YYYYYYYYYYYYYY
 *                   created_at: "2024-01-17T14:20:00Z"
 *                   processed_at: null
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 *       500:
 *         description: Internal server error
 */
router.get('/payouts',authenticateUser,requireRole(['freelancer']), getMyPayouts);

/**
 * @swagger
 * /freelancer/earnings:
 *   get:
 *     summary: Get earnings summary
 *     description: Retrieve comprehensive earnings summary including completed, pending, and processing amounts for the authenticated freelancer
 *     tags: [Freelancer Payouts]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Earnings summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 completed_earnings:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       description: Number of completed transactions
 *                     total:
 *                       type: number
 *                       description: Total completed earnings amount
 *                 pending_release:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       description: Number of transactions held in escrow
 *                     total:
 *                       type: number
 *                       description: Total amount pending release
 *                 processing:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       description: Number of released transactions being processed
 *                     total:
 *                       type: number
 *                       description: Total amount being processed
 *                 total_lifetime_earnings:
 *                   type: number
 *                   description: Total lifetime earnings (completed only)
 *             example:
 *               completed_earnings:
 *                 count: 50
 *                 total: 45000
 *               pending_release:
 *                 count: 5
 *                 total: 4500
 *               processing:
 *                 count: 3
 *                 total: 2700
 *               total_lifetime_earnings: 45000
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Freelancer role required
 *       500:
 *         description: Internal server error
 */
router.get('/earnings',authenticateUser,requireRole(['freelancer']), getEarningsSummary);


router.get('/profile-progress', authenticateUser, requireRole(['freelancer']), getUserProfileProgress);

router.delete("/portfolio/delete-portfolio-item",authenticateUser, requireRole(['freelancer']), deleteFreelancerProtfolioItem);

router.get('/niches', getNiches);

module.exports = router