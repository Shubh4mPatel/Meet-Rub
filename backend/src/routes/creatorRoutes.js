const express = require('express');
const { createSreviceRequest, getUserServiceRequests, getUserServiceRequestsSuggestion, addFreelancerToWishlist } = require('../controller');
const router = express.Router();
const  { requireRole, authenticateUser } =  require('../middleware/authMiddleware');
const { getNiches } = require('../controller/services/serviceController');
const { raiseDispute } = require('../controller/dispute/disputeController');
const { getWishlistFreelancers, removeFreelancerFromWishlist, getAllfreelancersForcreator, getFreelancerByIdForCreator } = require('../controller/users/userProfileController');

router.post('/service-request',authenticateUser, requireRole(['creator']), createSreviceRequest);


router.get('/service-requests',authenticateUser, requireRole(['creator']), getUserServiceRequests);


router.get('/service-requests/:requestId/suggestions',authenticateUser, requireRole(['creator']),getUserServiceRequestsSuggestion);


router.post('/wishlist', authenticateUser, requireRole(['creator']), addFreelancerToWishlist);

router.post('/remove-from-wishlist', authenticateUser, requireRole(['creator']), removeFreelancerFromWishlist);

router.get('/wishlist', authenticateUser, requireRole(['creator']), getWishlistFreelancers);

router.get('/niches',authenticateUser, requireRole(['creator']), getNiches);

router.get('/all-freelancers',authenticateUser, requireRole(['creator']), getAllfreelancersForcreator);

router.get('/get-freelancer-by-id/:freelancer_id', authenticateUser, requireRole(['creator']),getFreelancerByIdForCreator)

router.post('/dispute-raise', authenticateUser, requireRole(['creator']), raiseDispute);

module.exports = router;