const expess = require('express')
const { approveProfile, getServices, addServices, getUserServiceRequestsToAdmin } = require('../controller')
const adminController = require('../controller/razor-pay-controllers/adminController')
const { addNiches, getNiches, AssignFreelancerToRequest } = require('../controller/services/serviceController')
const { requireRole } = require('../middleware/authMiddleware')
const { getAllCreatorProfiles, getCreatorById, getFreelancerForAdmin, getFreeLancerByIdForAdmin } = require('../controller/users/userProfileController')
const router = expess.Router()

/**
 * @swagger
 * /admin/userApproval:
 *   post:
 *     summary: Approve or reject user profile (Admin only)
 *     tags: [Admin]
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
 *               - userId
 *               - status
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "abc123"
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *                 example: approved
 *     responses:
 *       200:
 *         description: User approval status updated
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 */
router.post('/userApproval', approveProfile)

/**
 * @swagger
 * /admin/getServices:
 *   get:
 *     summary: Get all services (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of all services
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 */
router.get('/getServices', getServices)

/**
 * @swagger
 * /admin/addServices:
 *   post:
 *     summary: Add new service (Admin only)
 *     tags: [Admin]
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Web Development
 *               description:
 *                 type: string
 *                 example: Full stack web development services
 *     responses:
 *       201:
 *         description: Service created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 */
router.post('/addServices', addServices)

/**
 * @swagger
 * /admin/service-requests:
 *   get:
 *     summary: Get all active service requests (Admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Service requests retrieved successfully
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
 *                   example: Service requests fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       creator_id:
 *                         type: integer
 *                       creator_name:
 *                         type: string
 *                       service:
 *                         type: string
 *                       details:
 *                         type: string
 *                       budget:
 *                         type: number
 *                       status:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 */
router.get('/service-requests', getUserServiceRequestsToAdmin)

router.post('/add-niches',addNiches);

/**
 * @swagger
 * /admin/escrow:
 *   get:
 *     summary: Get all escrow transactions
 *     description: Retrieve all escrow transactions with optional status filter. Admin only.
 *     tags: [Admin - Escrow]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [HELD, RELEASED, COMPLETED]
 *           default: HELD
 *         description: Filter by transaction status
 *     responses:
 *       200:
 *         description: Escrow transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *             example:
 *               count: 3
 *               transactions:
 *                 - id: "456"
 *                   project_id: "123"
 *                   client_id: "10"
 *                   freelancer_id: "20"
 *                   total_amount: 1100
 *                   freelancer_amount: 1000
 *                   platform_commission: 100
 *                   status: HELD
 *                   created_at: "2024-01-15T10:30:00Z"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Internal server error
 */
router.get('/escrow', adminController.getEscrowTransactions);

/**
 * @swagger
 * /admin/escrow/{id}/release:
 *   post:
 *     summary: Release escrow payment to freelancer
 *     description: Release held payment to freelancer after project completion verification. Admin only.
 *     tags: [Admin - Escrow]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *         example: "456"
 *     responses:
 *       200:
 *         description: Payment released successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment released successfully. Payout initiated.
 *                 transaction_id:
 *                   type: string
 *                 payout_id:
 *                   type: string
 *                 amount:
 *                   type: number
 *             example:
 *               message: Payment released successfully. Payout initiated.
 *               transaction_id: "456"
 *               payout_id: "789"
 *               amount: 1000
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               invalidStatus:
 *                 value:
 *                  error: "Cannot release payment. Transaction status: COMPLETED"
 *               projectNotCompleted:
 *                 value:
 *                   error: Project must be completed before releasing payment
 *                   project_status: IN_PROGRESS
 *       404:
 *         description: Transaction or project not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 */
router.post('/escrow/:id/release', adminController.releasePayment);

/**
 * @swagger
 * /admin/payouts:
 *   get:
 *     summary: Get all payouts
 *     description: Retrieve all freelancer payouts with optional status filter. Admin only.
 *     tags: [Admin - Payouts]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [QUEUED, PENDING, PROCESSING, PROCESSED, FAILED]
 *         description: Filter by payout status
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
 *                 payouts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       transaction_id:
 *                         type: string
 *                       freelancer_id:
 *                         type: string
 *                       freelancer_name:
 *                         type: string
 *                       freelancer_email:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       project_id:
 *                         type: string
 *                       total_amount:
 *                         type: number
 *                       platform_commission:
 *                         type: number
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *             example:
 *               count: 5
 *               payouts:
 *                 - id: "789"
 *                   transaction_id: "456"
 *                   freelancer_id: "20"
 *                   freelancer_name: Jane Smith
 *                   freelancer_email: jane@example.com
 *                   amount: 1000
 *                   status: PROCESSED
 *                   project_id: "123"
 *                   total_amount: 1100
 *                   platform_commission: 100
 *                   created_at: "2024-01-16T10:30:00Z"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Internal server error
 */
router.get('/payouts', adminController.getAllPayouts);

/**
 * @swagger
 * /admin/payouts/{id}:
 *   get:
 *     summary: Get payout details
 *     description: Retrieve detailed information about a specific payout. Admin only.
 *     tags: [Admin - Payouts]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payout ID
 *         example: "789"
 *     responses:
 *       200:
 *         description: Payout details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 transaction_id:
 *                   type: string
 *                 freelancer_id:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 status:
 *                   type: string
 *                 razorpay_payout_id:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 processed_at:
 *                   type: string
 *                   format: date-time
 *             example:
 *               id: "789"
 *               transaction_id: "456"
 *               freelancer_id: "20"
 *               amount: 1000
 *               status: PROCESSED
 *               razorpay_payout_id: payout_XXXXXXXXXXXXXX
 *               created_at: "2024-01-16T10:30:00Z"
 *               processed_at: "2024-01-16T11:00:00Z"
 *       404:
 *         description: Payout not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Internal server error
 */
router.get('/payouts/:id', adminController.getPayoutDetails);

/**
 * @swagger
 * /admin/stats:
 *   get:
 *     summary: Get platform statistics
 *     description: Retrieve comprehensive platform statistics including transactions, revenue, escrow, and payouts. Admin only.
 *     tags: [Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Platform statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_transactions:
 *                   type: integer
 *                 total_commission_earned:
 *                   type: number
 *                 escrow:
 *                   type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                     total_amount:
 *                       type: number
 *                 payouts:
 *                   type: object
 *                   properties:
 *                     completed:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         total_amount:
 *                           type: number
 *                     pending:
 *                       type: object
 *                       properties:
 *                         count:
 *                           type: integer
 *                         total_amount:
 *                           type: number
 *             example:
 *               total_transactions: 150
 *               total_commission_earned: 15000
 *               escrow:
 *                 count: 5
 *                 total_amount: 5500
 *               payouts:
 *                 completed:
 *                   count: 100
 *                   total_amount: 90000
 *                 pending:
 *                   count: 10
 *                   total_amount: 9000
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Internal server error
 */
router.get('/stats', adminController.getPlatformStats);

/**
 * @swagger
 * /admin/commission:
 *   put:
 *     summary: Update platform commission percentage
 *     description: Update the platform commission percentage for all future transactions. Admin only.
 *     tags: [Admin - Settings]
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
 *               - percentage
 *             properties:
 *               percentage:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Commission percentage (0-100)
 *                 example: 10
 *           example:
 *             percentage: 10
 *     responses:
 *       200:
 *         description: Commission percentage updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Commission percentage updated successfully
 *                 new_percentage:
 *                   type: number
 *                   example: 10
 *             example:
 *               message: Commission percentage updated successfully
 *               new_percentage: 10
 *       400:
 *         description: Invalid commission percentage
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid commission percentage
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin role required
 *       500:
 *         description: Internal server error
 */
router.put('/commission', adminController.updateCommission);

router.get('/niches', requireRole(['admin']), getNiches);

router.post('/assignfreelancer-to-request', requireRole(['admin']), AssignFreelancerToRequest);

router.post('/approve-kyc/:freelancer_id', requireRole(['admin']), adminController.ApproveKYCByAdmin);

router.get('/get-all-creators', requireRole(['admin']), getAllCreatorProfiles);

router.get('/get-creatorby-id/:creator_id', requireRole(['admin']), getCreatorById);

router.get('/get-all-freelancers', requireRole(['admin']),getFreelancerForAdmin);

router.get('/get-freelancerby-id/:freelancer_id', requireRole(['admin']),getFreeLancerByIdForAdmin);


module.exports = router