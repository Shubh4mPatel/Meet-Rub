const express = require('express');
const upload = require('../../config/multer');
const router = express.Router();
const { uploadBeforeAfter, getBeforeAfter, deleteBeforeAfter, getPortfolioByFreelancerId, addFreelancerPortfolio, updateFreelancerPortfolio, deleteFreelancerPortfolio } = require('../controller');
const { addServicesByFreelancer, getServicesByFreelaner, deleteServiceByFreelancer, updateServiceByFreelancer } = require('../controller');


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
router.get('/portfolio/get-after-before', getBeforeAfter)
router.delete('/portfolio/delete-after-before', deleteBeforeAfter)
router.post('/add-services', addServicesByFreelancer)
router.get('/get-services', getServicesByFreelaner)
router.delete('/delete-services', deleteServiceByFreelancer)
router.put('/update-service', updateServiceByFreelancer)
router.get('/portfolio/get-protfolio', getPortfolioByFreelancerId)
router.post('/portfolio/add-protfolio', addFreelancerPortfolio)
router.put('/portfolio/update-protfolio', updateFreelancerPortfolio)
router.delete('/portfolio/delete-protfolios', deleteFreelancerPortfolio)

module.exports = router 