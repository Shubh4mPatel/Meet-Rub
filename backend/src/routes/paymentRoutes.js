const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authMiddleware');
const {payFromWallet,createPaymentOrder,verifyPayment,getTransaction,getMyTransactions} = require('../controller/razor-pay-controllers/paymentController');

/**
 * @swagger
 * /payments/pay-wallet:
 *   post:
 *     summary: Pay for project from wallet
 *     description: Make payment for a project using wallet balance. Funds are held in escrow until project completion. Creator role required.
 *     tags: [Payments]
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
 *               - project_id
 *             properties:
 *               project_id:
 *                 type: string
 *                 description: ID of the project to pay for
 *                 example: "123"
 *           example:
 *             project_id: "123"
 *     responses:
 *       200:
 *         description: Payment successful and funds held in escrow
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment successful. Funds held in escrow.
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     transaction_id:
 *                       type: string
 *                     project_id:
 *                       type: string
 *                     total_amount:
 *                       type: number
 *                     platform_commission:
 *                       type: number
 *                     freelancer_amount:
 *                       type: number
 *                     status:
 *                       type: string
 *             example:
 *               message: Payment successful. Funds held in escrow.
 *               transaction:
 *                 transaction_id: "456"
 *                 project_id: "123"
 *                 total_amount: 1000
 *                 platform_commission: 100
 *                 freelancer_amount: 900
 *                 status: HELD
 *       400:
 *         description: Invalid input or insufficient balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               missingProjectId:
 *                 value:
 *                   error: Project ID is required
 *               insufficientBalance:
 *                 value:
 *                   error: Insufficient wallet balance
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Project not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Creator role required
 */
router.post('/pay-wallet',  requireRole(['creator']), payFromWallet);

/**
 * @swagger
 * /payments/create-order:
 *   post:
 *     summary: Create payment order for project
 *     description: Create a Razorpay payment order for a project. Calculates total amount including platform commission. Creator role required.
 *     tags: [Payments]
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
 *               - project_id
 *             properties:
 *               project_id:
 *                 type: string
 *                 description: ID of the project to create payment for
 *                 example: "123"
 *           example:
 *             project_id: "123"
 *     responses:
 *       200:
 *         description: Payment order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment order created
 *                 transaction_id:
 *                   type: string
 *                   example: "456"
 *                 order:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: order_NXmjDYHG5hKfZ9
 *                     amount:
 *                       type: number
 *                       example: 1100
 *                     currency:
 *                       type: string
 *                       example: INR
 *                     key:
 *                       type: string
 *                       example: rzp_test_XXXXXXXXXXXXXX
 *                 breakdown:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                       example: 1100
 *                     platform_commission:
 *                       type: number
 *                       example: 100
 *                     freelancer_amount:
 *                       type: number
 *                       example: 1000
 *             example:
 *               message: Payment order created
 *               transaction_id: "456"
 *               order:
 *                 id: order_NXmjDYHG5hKfZ9
 *                 amount: 1100
 *                 currency: INR
 *                 key: rzp_test_XXXXXXXXXXXXXX
 *               breakdown:
 *                 total: 1100
 *                 platform_commission: 100
 *                 freelancer_amount: 1000
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Project ID is required
 *       404:
 *         description: Project not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Creator role required
 */
router.post('/create-order',  requireRole(['creator']), createPaymentOrder);

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Verify payment
 *     description: Verify Razorpay payment signature and hold funds in escrow. Creator role required.
 *     tags: [Payments]
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
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *                 example: order_NXmjDYHG5hKfZ9
 *               razorpay_payment_id:
 *                 type: string
 *                 example: pay_NXmjE8XXXXXXXXX
 *               razorpay_signature:
 *                 type: string
 *                 example: 9d3b8f7c6e5a4b3c2d1e0f9g8h7i6j5k
 *           example:
 *             razorpay_order_id: order_NXmjDYHG5hKfZ9
 *             razorpay_payment_id: pay_NXmjE8XXXXXXXXX
 *             razorpay_signature: 9d3b8f7c6e5a4b3c2d1e0f9g8h7i6j5k
 *     responses:
 *       200:
 *         description: Payment verified and funds held in escrow
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment verified. Funds held in escrow.
 *                 transaction_id:
 *                   type: string
 *                   example: "456"
 *             example:
 *               message: Payment verified. Funds held in escrow.
 *               transaction_id: "456"
 *       400:
 *         description: Invalid payment details or verification failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               missingDetails:
 *                 value:
 *                   error: Missing payment details
 *               invalidSignature:
 *                 value:
 *                   error: Invalid payment signature
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Creator role required
 */
router.post('/verify',  requireRole(['creator']), verifyPayment);

/**
 * @swagger
 * /payments/transactions/{id}:
 *   get:
 *     summary: Get transaction details
 *     description: Retrieve details of a specific payment transaction. Accessible to involved client, freelancer, or admin.
 *     tags: [Payments]
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
 *         description: Transaction details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 project_id:
 *                   type: string
 *                 client_id:
 *                   type: string
 *                 freelancer_id:
 *                   type: string
 *                 total_amount:
 *                   type: number
 *                 platform_commission:
 *                   type: number
 *                 freelancer_amount:
 *                   type: number
 *                 payment_method:
 *                   type: string
 *                 status:
 *                   type: string
 *                 razorpay_order_id:
 *                   type: string
 *                 razorpay_payment_id:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *             example:
 *               id: "456"
 *               project_id: "123"
 *               client_id: "10"
 *               freelancer_id: "20"
 *               total_amount: 1100
 *               platform_commission: 100
 *               freelancer_amount: 1000
 *               payment_method: RAZORPAY
 *               status: HELD
 *               razorpay_order_id: order_NXmjDYHG5hKfZ9
 *               razorpay_payment_id: pay_NXmjE8XXXXXXXXX
 *               created_at: "2024-01-15T10:30:00Z"
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Transaction not found
 *       403:
 *         description: Access denied - user not involved in transaction
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Access denied
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/transactions/:id', getTransaction);

/**
 * @swagger
 * /payments/my-transactions:
 *   get:
 *     summary: Get my transactions
 *     description: Retrieve all payment transactions for the authenticated user (either as client or freelancer)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   project_id:
 *                     type: string
 *                   client_id:
 *                     type: string
 *                   freelancer_id:
 *                     type: string
 *                   total_amount:
 *                     type: number
 *                   platform_commission:
 *                     type: number
 *                   freelancer_amount:
 *                     type: number
 *                   payment_method:
 *                     type: string
 *                   status:
 *                     type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *             example:
 *               - id: "456"
 *                 project_id: "123"
 *                 client_id: "10"
 *                 freelancer_id: "20"
 *                 total_amount: 1100
 *                 platform_commission: 100
 *                 freelancer_amount: 1000
 *                 payment_method: RAZORPAY
 *                 status: HELD
 *                 created_at: "2024-01-15T10:30:00Z"
 *               - id: "457"
 *                 project_id: "124"
 *                 client_id: "10"
 *                 freelancer_id: "21"
 *                 total_amount: 2200
 *                 platform_commission: 200
 *                 freelancer_amount: 2000
 *                 payment_method: WALLET
 *                 status: COMPLETED
 *                 created_at: "2024-01-16T14:20:00Z"
 *       400:
 *         description: Invalid user type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid user type
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/my-transactions', getMyTransactions);

module.exports = router;
