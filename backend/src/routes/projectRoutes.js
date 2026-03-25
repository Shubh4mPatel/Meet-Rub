const express = require('express');
const router = express.Router();
const{ createProject, getMyProjects, getProject, updateProjectStatus, deleteProject, getAllProjects, uploadDeliverable, sendHireRequest} = require('../controller/razor-pay-controllers/projectController');


router.post('/create-project',  createProject);


router.get('/get-my-projects',getMyProjects);


router.get('/get-project/:id', getProject);


router.put('/update-project-status/:id/status', updateProjectStatus);


router.delete('/delete-project/:id',  deleteProject);

router.get('/get-all-projects', getAllProjects);

// POST /projects/upload-deliverable  (freelancer only)
router.post('/upload-deliverable', uploadDeliverable);

// POST /projects/hire-request  (creator or freelancer)
router.post('/hire-request', sendHireRequest);

module.exports = router;
