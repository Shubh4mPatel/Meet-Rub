const express = require('express');
const { createSreviceRequest, getUserServiceRequests, getUserServiceRequestsSuggestion } = require('../controller');
const router = express.Router();

/**
 * @swagger
 * /creator/service-request:
 *   post:
 *     summary: Create a new service request
 *     tags: [Creator Service Requests]
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
 *               - service
 *               - details
 *               - budget
 *             properties:
 *               service:
 *                 type: string
 *                 example: Video Editing
 *               details:
 *                 type: string
 *                 example: Need professional video editing for YouTube content
 *               budget:
 *                 type: number
 *                 example: 500
 *     responses:
 *       201:
 *         description: Service request created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Creator role required
 */
router.post('/service-request', createSreviceRequest);

/**
 * @swagger
 * /creator/service-requests:
 *   get:
 *     summary: Get all service requests created by the creator
 *     tags: [Creator Service Requests]
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
 *         description: Forbidden - Creator role required
 */
router.get('/service-requests', getUserServiceRequests);

/**
 * @swagger
 * /creator/service-requests/{requestId}/suggestions:
 *   get:
 *     summary: Get freelancer suggestions for a specific service request
 *     tags: [Creator Service Requests]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Service request ID
 *     responses:
 *       200:
 *         description: Suggestions retrieved successfully
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
 *                   example: Suggestions fetched successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       freelancer_full_name:
 *                         type: string
 *                       profile_picture:
 *                         type: string
 *                       rating:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Creator role required
 */
router.get('/service-requests/:requestId/suggestions', getUserServiceRequestsSuggestion);

module.exports = router;