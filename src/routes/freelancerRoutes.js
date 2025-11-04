const express = require('express');
const upload = require('../../config/multer');
const router = express.Router();
const { uploadBeforeAfter, getBeforeAfter } = require('../controller');
const { deleteBeforeAfter } = require('../controller/before-after/BeforeAfter');
const { addServicesByFreelancer, getServicesByFreelaner, deleteServiceByFreelancer, updateServiceByFreelancer } = require('../controller/services/serviceController');


router.post('/upload-after-before', upload.fields([
    {
        name: 'before',
        maxCount: 1
    },
    {
        name: 'after',
        maxCount: 1,
    }
]), uploadBeforeAfter)
router.get('/get-after-before', getBeforeAfter)
router.delete('/delete-after-before', deleteBeforeAfter)
router.post('/add-services', addServicesByFreelancer)
router.get('/get-services', getServicesByFreelaner)
router.delete('/delete-services', deleteServiceByFreelancer)
router.post('/update-service', updateServiceByFreelancer)

module.exports = router 