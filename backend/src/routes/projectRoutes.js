const express = require('express');
const router = express.Router();
const{ createProject, getMyProjects, getProject, updateProjectStatus, deleteProject, getAllProjects} = require('../controller/razor-pay-controllers/projectController');

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a new project
 *     description: Create a new project with a freelancer. Requires freelancer ID, title, and amount. Client role required.
 *     tags: [Projects]
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
 *               - freelancer_id
 *               - title
 *               - amount
 *             properties:
 *               freelancer_id:
 *                 type: string
 *                 description: ID of the freelancer to work on the project
 *                 example: "20"
 *               title:
 *                 type: string
 *                 description: Project title
 *                 example: Website Redesign
 *               description:
 *                 type: string
 *                 description: Detailed project description
 *                 example: Complete redesign of company website with modern UI/UX
 *               amount:
 *                 type: number
 *                 description: Project amount in INR
 *                 example: 5000
 *           example:
 *             freelancer_id: "20"
 *             title: Website Redesign
 *             description: Complete redesign of company website with modern UI/UX
 *             amount: 5000
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project created successfully
 *                 project_id:
 *                   type: number
 *                   example: 123
 *                 amount:
 *                   type: number
 *                   example: 5000
 *             example:
 *               message: Project created successfully
 *               project_id: 123
 *               amount: 5000
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
 *               missingFields:
 *                 value:
 *                   error: Freelancer ID, title, and amount are required
 *               invalidAmount:
 *                 value:
 *                   error: Invalid amount
 *       404:
 *         description: Freelancer not found or inactive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Freelancer not found or inactive
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/create-project',  createProject);

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: Get my projects
 *     description: Retrieve all projects for the authenticated user. Returns different projects based on user type (client or freelancer). Can filter by status.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *         description: Filter projects by status
 *         example: IN_PROGRESS
 *     responses:
 *       200:
 *         description: Projects retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 2
 *                 projects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       client_id:
 *                         type: string
 *                       freelancer_id:
 *                         type: string
 *                       client_name:
 *                         type: string
 *                       freelancer_name:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       completed_at:
 *                         type: string
 *                         format: date-time
 *             example:
 *               count: 2
 *               projects:
 *                 - id: "123"
 *                   client_id: "10"
 *                   freelancer_id: "20"
 *                   client_name: John Doe
 *                   freelancer_name: Jane Smith
 *                   title: Website Redesign
 *                   description: Complete redesign of company website
 *                   amount: 5000
 *                   status: IN_PROGRESS
 *                   created_at: "2024-01-15T10:30:00Z"
 *                   completed_at: null
 *                 - id: "124"
 *                   client_id: "10"
 *                   freelancer_id: "21"
 *                   client_name: John Doe
 *                   freelancer_name: Bob Johnson
 *                   title: Mobile App Development
 *                   description: Develop iOS and Android app
 *                   amount: 15000
 *                   status: COMPLETED
 *                   created_at: "2024-01-10T09:00:00Z"
 *                   completed_at: "2024-01-20T18:00:00Z"
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
router.get('/get-my-projects',getMyProjects);

/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: Get project details
 *     description: Retrieve detailed information about a specific project. Accessible to involved client, freelancer, or admin.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *         example: "123"
 *     responses:
 *       200:
 *         description: Project details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 client_id:
 *                   type: string
 *                 freelancer_id:
 *                   type: string
 *                 client_name:
 *                   type: string
 *                 client_email:
 *                   type: string
 *                 freelancer_name:
 *                   type: string
 *                 freelancer_email:
 *                   type: string
 *                 title:
 *                   type: string
 *                 description:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 status:
 *                   type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *                 completed_at:
 *                   type: string
 *                   format: date-time
 *             example:
 *               id: "123"
 *               client_id: "10"
 *               freelancer_id: "20"
 *               client_name: John Doe
 *               client_email: john@example.com
 *               freelancer_name: Jane Smith
 *               freelancer_email: jane@example.com
 *               title: Website Redesign
 *               description: Complete redesign of company website with modern UI/UX
 *               amount: 5000
 *               status: IN_PROGRESS
 *               created_at: "2024-01-15T10:30:00Z"
 *               updated_at: "2024-01-15T10:30:00Z"
 *               completed_at: null
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
 *       403:
 *         description: Access denied - user not involved in project
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
router.get('/get-project/:id', getProject);

/**
 * @swagger
 * /projects/{id}/status:
 *   put:
 *     summary: Update project status
 *     description: Update the status of a project. Only freelancer can mark as COMPLETED, only client can CANCEL. Admin can change any status.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *         example: "123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *                 description: New project status
 *                 example: COMPLETED
 *           example:
 *             status: COMPLETED
 *     responses:
 *       200:
 *         description: Project status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project status updated successfully
 *                 project_id:
 *                   type: string
 *                   example: "123"
 *                 new_status:
 *                   type: string
 *                   example: COMPLETED
 *             example:
 *               message: Project status updated successfully
 *               project_id: "123"
 *               new_status: COMPLETED
 *       400:
 *         description: Invalid status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               missingStatus:
 *                 value:
 *                   error: Status is required
 *               invalidStatus:
 *                 value:
 *                   error: Invalid status
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
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               freelancerOnly:
 *                 value:
 *                   error: Only freelancer can mark project as completed
 *               clientOnly:
 *                 value:
 *                   error: Only client can cancel project
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/update-project-status/:id/status', updateProjectStatus);

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     summary: Delete project
 *     description: Delete a project. Only client can delete and only if no transactions exist for the project. Admin can also delete.
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *         example: "123"
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Project deleted successfully
 *                 project_id:
 *                   type: string
 *                   example: "123"
 *             example:
 *               message: Project deleted successfully
 *               project_id: "123"
 *       400:
 *         description: Cannot delete project with transactions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Cannot delete project with associated transactions
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
 *       403:
 *         description: Forbidden - only client can delete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Only client can delete project
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/delte-project/:id',  deleteProject);

router.get('/get-all-projects', getAllProjects);

module.exports = router;
