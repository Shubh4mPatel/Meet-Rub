const {loginUser} = require('./auth/login/login');
const {otpSendApi} = require('./auth/send-otp/sendOtp');
const {verifyOtpAndProcess} = require('./auth/verify-otp/verifyOtp');
const {getUserProfile, editProfile} = require('./user-profile/userProfileController');
const {uploadBeforeAfter}= require('./before-after/BeforeAfter')

module.exports = {
    loginUser,
    otpSendApi,
    verifyOtpAndProcess,
    getUserProfile,
    editProfile,
    uploadBeforeAfter
};