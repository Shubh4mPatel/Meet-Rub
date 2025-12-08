const express = require('express');
const upload = require('../../config/multer');
const freelancerController = require('../controller/razor-pay-controllers/freelancerController');
const router = express.Router();
const { uploadBeforeAfter, getBeforeAfter, deleteBeforeAfter, getPortfolioByFreelancerId, addFreelancerPortfolio, updateFreelancerPortfolio, deleteFreelancerPortfolio } = require('../controller');
const { addServicesByFreelancer, getServicesByFreelaner, deleteServiceByFreelancer, updateServiceByFreelancer } = require('../controller');

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
router.post('/portfolio/upload-after-before', upload.fields([
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
router.get('/portfolio/get-after-before', getBeforeAfter)

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
router.delete('/portfolio/delete-after-before', deleteBeforeAfter)

/**
 * @swagger
 * /freelancer/add-services:
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
router.post('/add-services', addServicesByFreelancer)

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
router.get('/get-services', getServicesByFreelaner)

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
router.delete('/delete-services', deleteServiceByFreelancer)

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
router.put('/update-service', updateServiceByFreelancer)

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
router.get('/portfolio/get-protfolio', getPortfolioByFreelancerId)

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
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Modern Website Design
 *               description:
 *                 type: string
 *                 example: A responsive modern website with clean UI
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
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
router.post('/portfolio/add-protfolio', addFreelancerPortfolio)

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
router.put('/portfolio/update-protfolio', updateFreelancerPortfolio)

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
router.delete('/portfolio/delete-protfolios', deleteFreelancerPortfolio)


router.get('/payouts', freelancerController.getMyPayouts);
router.get('/earnings', freelancerController.getEarningsSummary);


module.exports = router 