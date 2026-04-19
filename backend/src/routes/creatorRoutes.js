const express = require('express');
const { createSreviceRequest, getUserServiceRequests, getUserServiceRequestsSuggestion, addFreelancerToWishlist } = require('../controller');
const router = express.Router();
const  { requireRole, authenticateUser } =  require('../middleware/authMiddleware');
const { getNiches } = require('../controller/services/serviceController');
const { raiseDispute, getDisputes } = require('../controller/dispute/disputeController');
const { getWishlistFreelancers, removeFreelancerFromWishlist, getAllfreelancersForcreator, getFreelancerByIdForCreator, getFreeLancerByUserId, getFreelancerImpact, getFreelancerPortfolio, getWishlistCount } = require('../controller/users/userProfileController');
const { getFreelancerOverview } = require('../controller/users/freelancerOverviewController');
const { getFreelancerReviews } = require('../controller/users/freelancerReviewsController');
const { rateFreelancer } = require('../controller/razor-pay-controllers/projectController');
const { getMyTransactions } = require('../controller/razor-pay-controllers/paymentController');

router.post('/service-request',authenticateUser, requireRole(['creator']), createSreviceRequest);


router.get('/service-requests',authenticateUser, requireRole(['creator']), getUserServiceRequests);


router.get('/service-requests/:requestId/suggestions',authenticateUser, requireRole(['creator']),getUserServiceRequestsSuggestion);


router.post('/wishlist', authenticateUser, requireRole(['creator']), addFreelancerToWishlist);

router.post('/remove-from-wishlist', authenticateUser, requireRole(['creator']), removeFreelancerFromWishlist);

router.get('/wishlist', authenticateUser, requireRole(['creator']), getWishlistFreelancers);

router.get('/wishlist/count', authenticateUser, requireRole(['creator']), getWishlistCount);

router.get('/niches',authenticateUser, requireRole(['creator']), getNiches);

router.get('/all-freelancers',authenticateUser, requireRole(['creator']), getAllfreelancersForcreator);

router.get('/get-freelancer-by-id/:freelancer_id', authenticateUser, requireRole(['creator']),getFreelancerByIdForCreator)

router.get('/get-freelancer-by-user-id/:freelancer_id', authenticateUser, requireRole(['creator']), getFreeLancerByUserId);

router.post('/dispute-raise', authenticateUser, requireRole(['creator']), raiseDispute);

router.get('/disputes', authenticateUser, requireRole(['creator']), getDisputes);

router.get('/freelancers/:id/overview', authenticateUser, requireRole(['creator']), getFreelancerOverview); 

router.get('/freelancers/:id/impact', authenticateUser, requireRole(['creator']), getFreelancerImpact);

router.get('/freelancers/:id/portfolio', authenticateUser, requireRole(['creator']), getFreelancerPortfolio);

router.get('/freelancers/:id/reviews', authenticateUser, requireRole(['creator']), getFreelancerReviews);

router.post(`/rate-freelancer/:projectId`, authenticateUser, requireRole(['creator']),rateFreelancer);

router.get('/my-transactions', authenticateUser, requireRole(['creator']), getMyTransactions);

module.exports = router;