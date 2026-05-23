const express = require('express');
const router = express.Router();
const { createProject, getMyProjects, getProject, updateProjectStatus, deleteProject, getAllProjects, uploadDeliverable, sendHireRequest, approveProject, rejectProject } = require('../controller/razor-pay-controllers/projectController');
const { requestDeadlineExtension, respondToDeadlineExtension, getExtensionRequests } = require('../controller/deadline/deadlineExtensionController');
const { requireRole } = require('../middleware/authMiddleware');


router.post('/create-project', createProject);


router.get('/get-my-projects', getMyProjects);


router.get('/get-project/:id', getProject);


router.put('/update-project-status/:id/status', updateProjectStatus);


router.delete('/delete-project/:id', deleteProject);

router.get('/get-all-projects', getAllProjects);

// POST /projects/upload-deliverable  (freelancer only)
router.post('/upload-deliverable', uploadDeliverable);

// POST /projects/hire-request  (creator or freelancer)
router.post('/hire-request', sendHireRequest);

// Creator approves completed project — credits freelancer earnings_balance
router.post('/:id/approve', requireRole(['creator']), approveProject);

// Creator rejects completed project — auto-creates dispute, funds stay in escrow
router.post('/:id/reject', requireRole(['creator']), rejectProject);

// Deadline extension routes
// Freelancer requests deadline extension
router.post('/deadline-extension/request', requireRole(['freelancer']), requestDeadlineExtension);

// Creator accepts/rejects deadline extension
router.post('/deadline-extension/:extension_id/respond', requireRole(['creator']), respondToDeadlineExtension);

// Get extension requests for a project
router.get('/:project_id/deadline-extensions', getExtensionRequests);

module.exports = router;
