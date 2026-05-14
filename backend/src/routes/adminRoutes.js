const expess = require('express')
const { approveProfile, getServices, addServices, getUserServiceRequestsToAdmin } = require('../controller')
const {  approvePayout, rejectPayout, getAllPayouts, getPayoutDetails, getPlatformStats, updateCommission, approveKYCByAdmin, rejectKYCByAdmin, suspendFreelancerByAdmin, revokeFreelancerSuspension, addFeaturedFreelancer, removeFeaturedFreelancer, suspendCreatorByAdmin, revokeCreatorSuspension, getEscrowTransactions, releaseTransfer, createFreelancerLinkedAccount, getFreelancerLinkedAccountStatus, resetFreelancerLinkedAccount } = require('../controller/razor-pay-controllers/adminController')
const { addNiches, getNiches, AssignFreelancerToRequest, getServicesForAdmin, editServiceForAdmin, deleteServiceForAdmin } = require('../controller/services/serviceController')
const { requireRole, requirePermission } = require('../middleware/authMiddleware')
const upload = require('../../config/multer')
const { getAllDisputes, resolveDispute, getDisputeById } = require('../controller/dispute/disputeController')
const { getAllCreatorProfiles, getCreatorById, getFreelancerForAdmin, getFreeLancerByIdForAdmin, getFreelancerForSuggestion, getFreelancerForKYCApproval } = require('../controller/users/userProfileController')
const { createAdmin } = require('../controller/admin/adminContoller')
const router = expess.Router()


router.post('/userApproval', approveProfile)

router.post('/create-admin', requireRole(['admin']), requirePermission('admin_management', 'create'), createAdmin)


router.get('/getServices', getServices)


router.post('/addServices', upload.fields([
  { name: 'gallery_1', maxCount: 1 },
  { name: 'gallery_2', maxCount: 1 },
  { name: 'gallery_3', maxCount: 1 },
]), addServices)


router.get('/service-requests', getUserServiceRequestsToAdmin)

router.post('/add-niches', requireRole(['admin']), requirePermission('projects', 'create'), addNiches);




router.get('/payouts', requireRole(['admin']), requirePermission('payments', 'view'), getAllPayouts);

router.get('/payouts/:id', requireRole(['admin']), requirePermission('payments', 'view'), getPayoutDetails);

router.post('/payouts/:id/approve', requireRole(['admin']), requirePermission('payments', 'approve'), approvePayout);

router.post('/payouts/:id/reject', requireRole(['admin']), requirePermission('payments', 'approve'), rejectPayout);

router.get('/stats', requireRole(['admin']), requirePermission('payments', 'view'), getPlatformStats);

router.put('/commission', requireRole(['admin']), requirePermission('payments', 'update'), updateCommission);

router.get('/niches', requireRole(['admin']), requirePermission('projects', 'view'), getNiches);

router.post('/assignfreelancer-to-request', requireRole(['admin']), requirePermission('projects', 'create'), AssignFreelancerToRequest);

router.post('/approve-kyc/:freelancer_id', requireRole(['admin']), requirePermission('user_management', 'approve'), approveKYCByAdmin);

router.get('/get-all-creators', requireRole(['admin']), requirePermission('user_management', 'view'), getAllCreatorProfiles);

router.get('/get-creatorby-id/:creator_id', requireRole(['admin']), requirePermission('user_management', 'view'), getCreatorById);

router.get('/freelancers-for-KYC-approval', requireRole(['admin']), requirePermission('user_management', 'view'), getFreelancerForKYCApproval);

router.get('/get-all-freelancers', requireRole(['admin']), requirePermission('user_management', 'view'), getFreelancerForAdmin);

router.get('/get-freelancerby-id/:freelancer_id', requireRole(['admin']), requirePermission('user_management', 'view'), getFreeLancerByIdForAdmin);

router.get('/get-freelancers-for-suggestion', requireRole(['admin']), requirePermission('user_management', 'view'), getFreelancerForSuggestion);

router.post('/reject-kyc/', requireRole(['admin']), requirePermission('user_management', 'approve'), rejectKYCByAdmin);

router.post('/suspend-freelancer', requireRole(['admin']), requirePermission('user_management', 'update'), suspendFreelancerByAdmin)

router.post('/suspend-creator', requireRole(['admin']), requirePermission('user_management', 'update'), suspendCreatorByAdmin)

router.post('/revoke-freelancer-suspension', requireRole(['admin']), requirePermission('user_management', 'update'), revokeFreelancerSuspension)

router.post('/revoke-creator-suspension', requireRole(['admin']), requirePermission('user_management', 'update'), revokeCreatorSuspension)

router.get('/disputes', requireRole(['admin']), requirePermission('disputes', 'view'), getAllDisputes);
router.get('/disputes/:id', requireRole(['admin']), requirePermission('disputes', 'view'), getDisputeById);
router.patch('/disputes/resolve/:id', requireRole(['admin']), requirePermission('disputes', 'update'), resolveDispute)

router.get('/services-list', requireRole(['admin']), requirePermission('projects', 'view'), getServicesForAdmin);

router.patch('/services/:id', requireRole(['admin']), requirePermission('projects', 'update'), upload.fields([
  { name: 'gallery_1', maxCount: 1 },
  { name: 'gallery_2', maxCount: 1 },
  { name: 'gallery_3', maxCount: 1 },
]), editServiceForAdmin);

router.delete('/services/:id', requireRole(['admin']), requirePermission('projects', 'update'), deleteServiceForAdmin);

router.post('/featured-freelancers', requireRole(['admin']), requirePermission('user_management', 'update'), addFeaturedFreelancer);
router.delete('/featured-freelancers', requireRole(['admin']), requirePermission('user_management', 'update'), removeFeaturedFreelancer);

// Razorpay Routes - Escrow transactions & transfer management
router.get('/transactions/escrow', requireRole(['admin']), requirePermission('payments', 'view'), getEscrowTransactions);
router.post('/transactions/:id/release', requireRole(['admin']), requirePermission('payments', 'approve'), releaseTransfer);
router.post('/freelancer/:freelancer_id/create-linked-account', requireRole(['admin']), requirePermission('payments', 'update'), createFreelancerLinkedAccount);
router.get('/freelancer/:freelancer_id/linked-account-status', requireRole(['admin']), requirePermission('payments', 'view'), getFreelancerLinkedAccountStatus);
router.delete('/freelancer/:freelancer_id/reset-linked-account', requireRole(['admin']), requirePermission('payments', 'update'), resetFreelancerLinkedAccount);

module.exports = router