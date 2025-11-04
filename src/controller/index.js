const { loginUser } = require('./auth/login/login');
const { otpSendApi } = require('./auth/send-otp/sendOtp');
const { verifyOtpAndProcess } = require('./auth/verify-otp/verifyOtp');
const { getUserProfile, editProfile } = require('./user-profile/userProfileController');
const { uploadBeforeAfter, getBeforeAfter } = require('./before-after/BeforeAfter');
const { approveProfile } = require('./admin/adminContoller');
const { addServices, getServices } = require('./services/serviceController');

module.exports = {
    loginUser,
    otpSendApi,
    verifyOtpAndProcess,
    getUserProfile,
    editProfile,
    uploadBeforeAfter,
    getBeforeAfter,
    approveProfile,
    getServices,
    addServices,
};