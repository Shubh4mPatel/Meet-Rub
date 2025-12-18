const express = require('express');
const router = express.Router();
const {getBalance,createLoadOrder,verifyLoadPayment,getTransactions,getTransaction} = require('../controller/razor-pay-controllers/walletController');

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Get wallet balance
 *     description: Retrieve the current balance, currency, and status of the authenticated user's wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Wallet balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   example: 5000.50
 *                 currency:
 *                   type: string
 *                   example: INR
 *                 status:
 *                   type: string
 *                   example: ACTIVE
 *       404:
 *         description: Wallet not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Wallet not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/balance', getBalance);

/**
 * @swagger
 * /wallet/load/create-order:
 *   post:
 *     summary: Create wallet load order
 *     description: Create a Razorpay order to add funds to wallet. Amount must be between minimum and maximum load limits.
 *     tags: [Wallet]
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
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Amount to load into wallet (minimum 100, maximum 100000)
 *                 example: 1000
 *           example:
 *             amount: 1000
 *     responses:
 *       200:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Order created successfully
 *                 order:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: order_NXmjDXXXXXXXXX
 *                     amount:
 *                       type: number
 *                       example: 1000
 *                     currency:
 *                       type: string
 *                       example: INR
 *                     key:
 *                       type: string
 *                       example: rzp_test_XXXXXXXXXXXXXX
 *             example:
 *               message: Order created successfully
 *               order:
 *                 id: order_NXmjDYHG5hKfZ9
 *                 amount: 1000
 *                 currency: INR
 *                 key: rzp_test_XXXXXXXXXXXXXX
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               invalidAmount:
 *                 value:
 *                   error: Invalid amount
 *               minAmount:
 *                 value:
 *                   error: Minimum wallet load amount is 100
 *               maxAmount:
 *                 value:
 *                   error: Maximum wallet load amount is 100000
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/load/create-order', createLoadOrder);

/**
 * @swagger
 * /wallet/load/verify:
 *   post:
 *     summary: Verify wallet load payment
 *     description: Verify Razorpay payment signature and credit the amount to user's wallet
 *     tags: [Wallet]
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
 *         description: Wallet loaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Wallet loaded successfully
 *                 amount:
 *                   type: number
 *                   example: 1000
 *             example:
 *               message: Wallet loaded successfully
 *               amount: 1000
 *       400:
 *         description: Invalid payment or verification failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid payment signature
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/load/verify', verifyLoadPayment);

/**
 * @swagger
 * /wallet/transactions:
 *   get:
 *     summary: Get wallet transactions
 *     description: Retrieve paginated list of all wallet transactions for the authenticated user
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of transactions to retrieve
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of transactions to skip
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 transactions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     total:
 *                       type: integer
 *             example:
 *               transactions:
 *                 - id: "1"
 *                   type: LOAD
 *                   amount: 1000
 *                   status: COMPLETED
 *                   created_at: "2024-01-15T10:30:00Z"
 *                 - id: "2"
 *                   type: PAYMENT
 *                   amount: -500
 *                   status: COMPLETED
 *                   created_at: "2024-01-16T14:20:00Z"
 *               pagination:
 *                 limit: 50
 *                 offset: 0
 *                 total: 2
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/transactions', getTransactions);

/**
 * @swagger
 * /wallet/transactions/{id}:
 *   get:
 *     summary: Get single wallet transaction
 *     description: Retrieve details of a specific wallet transaction by ID
 *     tags: [Wallet]
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
 *         example: "1"
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
 *                 user_id:
 *                   type: string
 *                 type:
 *                   type: string
 *                 amount:
 *                   type: number
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
 *               id: "1"
 *               user_id: "123"
 *               type: LOAD
 *               amount: 1000
 *               status: COMPLETED
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
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/transactions/:id', getTransaction);

module.exports = router;
