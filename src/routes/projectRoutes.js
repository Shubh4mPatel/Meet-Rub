const express = require('express');
const router = express.Router();
const projectController = require('../controller/razor-pay-controllers/projectController');

// Create project (clients only)
router.post('/', isClient, projectController.createProject);

// Get projects
router.get('/', projectController.getMyProjects);
router.get('/:id', projectController.getProject);

// Update project
router.put('/:id/status', projectController.updateProjectStatus);

// Delete project (clients only)
router.delete('/:id', isClient, projectController.deleteProject);

module.exports = router;
