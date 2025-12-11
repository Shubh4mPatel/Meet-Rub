const { loginUser } = require('./auth/login/login');
const { otpSendApi } = require('./auth/send-otp/sendOtp');
const { verifyOtpAndProcess } = require('./auth/verify-otp/verifyOtp');
const { getUserProfile, editProfile,getAllFreelancers,getFreelancerById,getFreelancerPortfolio,getFreelancerImpact,addFreelancerToWhitelist } = require('./users/userProfileController');
const { uploadBeforeAfter, getBeforeAfter, deleteBeforeAfter } = require('./before-after/BeforeAfter');
const { approveProfile } = require('./admin/adminContoller');
const { addServices, getServices, addServicesByFreelancer, getServicesByFreelaner, deleteServiceByFreelancer, updateServiceByFreelancer ,createSreviceRequest, getUserServiceRequests, getUserServiceRequestsSuggestion,getUserServiceRequestsToAdmin } = require('./services/serviceController');
const { deleteFreelancerPortfolio, updateFreelancerPortfolio, addFreelancerPortfolio, getPortfolioByFreelancerId } = require('./portfoilio/portfolioController');

module.exports = {
    loginUser,
    otpSendApi,
    verifyOtpAndProcess,
    getUserProfile,
    editProfile,
    uploadBeforeAfter,
    getBeforeAfter,
    deleteBeforeAfter,
    approveProfile,
    getServices,
    addServices,
    getPortfolioByFreelancerId,
    addFreelancerPortfolio,
    updateFreelancerPortfolio,
    deleteFreelancerPortfolio,
    addServicesByFreelancer,
    getServicesByFreelaner,
    deleteServiceByFreelancer,
    updateServiceByFreelancer,
    createSreviceRequest,
    getUserServiceRequests,
    getUserServiceRequestsSuggestion,
    getUserServiceRequestsToAdmin,
    getAllFreelancers,
    getFreelancerById,
    getFreelancerPortfolio,
    getFreelancerImpact,
    addFreelancerToWhitelist
};