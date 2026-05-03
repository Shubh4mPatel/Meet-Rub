const express = require('express');
const upload = require('../../config/multer');
const { 
  getMyPayouts, 
  requestPayout, 
  getWalletDashboard, 
  getTransactionHistory, 
  onboardLinkedAccount, 
  getLinkedAccountStatus,
  addBankAccount,
  getBankAccount,
  addAddress,
  getAddress
} = require('../controller/razor-pay-controllers/freelancerController');
const router = express.Router();
const { requireRole, authenticateUser } = require('../middleware/authMiddleware');
const { uploadBeforeAfter, getBeforeAfter, deleteBeforeAfter, updateBeforeAfter, getPortfolioByFreelancerId, addFreelancerPortfolio, updateFreelancerPortfolio, deleteFreelancerPortfolio, getAllFreelancers, getFreelancerById, getFreelancerPortfolio, getFreelancerImpact, addFreelancerToWishlist, getServices } = require('../controller');
const { addServicesByFreelancer, getServicesByFreelaner, deleteServiceByFreelancer, updateServiceByFreelancer } = require('../controller');
const { getUserProfileProgress, getCreatorByUserId } = require('../controller/users/userProfileController');
const { deleteFreelancerProtfolioItem } = require("../controller/portfoilio/portfolioController");
const { getFreelancerOverview } = require("../controller/users/freelancerOverviewController");
const { getNiches } = require('../controller/services/serviceController');
const { raiseDispute, getDisputes } = require('../controller/dispute/disputeController');
const { rateFreelancer } = require('../controller/razor-pay-controllers/projectController');
const { getMyReviews } = require('../controller/users/freelancerReviewsController');


router.post('/portfolio/upload-after-before', authenticateUser, requireRole(['freelancer']), upload.fields([
    {
        name: 'before',
        maxCount: 1
    },
    {
        name: 'after',
        maxCount: 1,
    }
]), uploadBeforeAfter)


router.get('/portfolio/get-after-before', authenticateUser, getBeforeAfter)


router.delete('/portfolio/delete-after-before', authenticateUser, requireRole(['freelancer']), deleteBeforeAfter)


router.put('/portfolio/update-after-before/:id', authenticateUser, requireRole(['freelancer']), upload.fields([
    { name: 'before', maxCount: 1 },
    { name: 'after', maxCount: 1 },
]), updateBeforeAfter)


router.post('/add-service', authenticateUser, requireRole(['freelancer']), upload.single('file'), addServicesByFreelancer)


router.get('/get-services', authenticateUser, requireRole(['freelancer']), getServicesByFreelaner)

router.get('/get-available-services', getServices);


router.delete('/delete-services', authenticateUser, requireRole(['freelancer']), deleteServiceByFreelancer)


router.put('/update-service', authenticateUser, requireRole(['freelancer']), upload.single('file'), updateServiceByFreelancer)


router.get('/portfolio/get-protfolio', authenticateUser, requireRole(['freelancer']), getPortfolioByFreelancerId)


router.post('/portfolio/add-protfolio', authenticateUser, requireRole(['freelancer']), upload.array('files'), addFreelancerPortfolio)


router.put('/portfolio/update-protfolio', authenticateUser, requireRole(['freelancer']), upload.single('file'), updateFreelancerPortfolio)


router.delete('/portfolio/delete-portfolio', authenticateUser, requireRole(['freelancer']), deleteFreelancerPortfolio)


router.get('/freelancers', getAllFreelancers);


router.get('/freelancers/:id', getFreelancerById);


router.get('/freelancers/:id/portfolio', getFreelancerPortfolio);


router.get('/freelancers/:id/impact', getFreelancerImpact);


router.get('/freelancers/:id/overview', getFreelancerOverview);


router.get('/payouts', authenticateUser, requireRole(['freelancer']), getMyPayouts);

router.post('/payouts/request', authenticateUser, requireRole(['freelancer']), requestPayout);


router.get('/wallet/dashboard', authenticateUser, requireRole(['freelancer']), getWalletDashboard);

router.get('/wallet/transactions', authenticateUser, requireRole(['freelancer']), getTransactionHistory);


router.get('/profile-progress', authenticateUser, requireRole(['freelancer']), getUserProfileProgress);

router.delete("/portfolio/delete-portfolio-item", authenticateUser, requireRole(['freelancer']), deleteFreelancerProtfolioItem);

router.get('/niches', getNiches);

router.post('/dispute-raise', authenticateUser, requireRole(['freelancer']), raiseDispute);

router.get('/disputes', authenticateUser, requireRole(['freelancer']), getDisputes);

router.get('/get-creator-by-user-id/:creator_id', authenticateUser, requireRole(['freelancer']), getCreatorByUserId);

router.post('/rate-creator/:projectId', authenticateUser, requireRole(['freelancer']), rateFreelancer);

router.get('/my-reviews', authenticateUser, requireRole(['freelancer']), getMyReviews);

// Bank account management (required for Razorpay Routes)
router.put('/bank-account', authenticateUser, requireRole(['freelancer']), addBankAccount);
router.get('/bank-account', authenticateUser, requireRole(['freelancer']), getBankAccount);

// Address management (required for Razorpay Routes onboarding)
router.put('/address', authenticateUser, requireRole(['freelancer']), addAddress);
router.get('/address', authenticateUser, requireRole(['freelancer']), getAddress);

// Razorpay Routes - Linked Account onboarding
router.post('/onboard-linked-account', authenticateUser, requireRole(['freelancer']), onboardLinkedAccount);
router.get('/linked-account-status', authenticateUser, requireRole(['freelancer']), getLinkedAccountStatus);

module.exports = router