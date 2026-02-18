const expess = require('express')
const { approveProfile, getServices, addServices, getUserServiceRequestsToAdmin } = require('../controller')
const adminController = require('../controller/razor-pay-controllers/adminController')
const { addNiches, getNiches, AssignFreelancerToRequest } = require('../controller/services/serviceController')
const { requireRole } = require('../middleware/authMiddleware')
const { getAllCreatorProfiles, getCreatorById, getFreelancerForAdmin, getFreeLancerByIdForAdmin, getFreelancerForSuggestion, getFreelancerForKYCApproval } = require('../controller/users/userProfileController')
const router = expess.Router()


router.post('/userApproval', approveProfile)


router.get('/getServices', getServices)


router.post('/addServices', addServices)


router.get('/service-requests', getUserServiceRequestsToAdmin)

router.post('/add-niches',addNiches);


router.get('/escrow', adminController.getEscrowTransactions);


router.post('/escrow/:id/release', adminController.releasePayment);


router.get('/payouts', adminController.getAllPayouts);


router.get('/payouts/:id', adminController.getPayoutDetails);


router.get('/stats', adminController.getPlatformStats);


router.put('/commission', adminController.updateCommission);

router.get('/niches', requireRole(['admin']), getNiches);

router.post('/assignfreelancer-to-request', requireRole(['admin']), AssignFreelancerToRequest);

router.post('/approve-kyc/:freelancer_id', requireRole(['admin']), adminController.approveKYCByAdmin);

router.get('/get-all-creators', requireRole(['admin']), getAllCreatorProfiles);

router.get('/get-creatorby-id/:creator_id', requireRole(['admin']), getCreatorById);

router.get('/freelancers-for-KYC-approval', requireRole(['admin']),getFreelancerForKYCApproval);

router.get('/get-all-freelancers', requireRole(['admin']),getFreelancerForAdmin);

router.get('/get-freelancerby-id/:freelancer_id', requireRole(['admin']),getFreeLancerByIdForAdmin);

router.get('/get-freelancers-for-suggestion', requireRole(['admin']),getFreelancerForSuggestion);

router.post('/reject-kyc/', requireRole(['admin']), adminController.rejectKYCByAdmin);

router.post('/suspend-freelancer', requireRole(['admin']), adminController.suspendFreelancerByAdmin);


module.exports = router