const {loginUser} = require('./auth/login/login');
const {otpSendApi} = require('./auth/send-otp/sendOtp');
const {verifyOtpAndProcess} = require('./auth/verify-otp/verifyOtp');

module.exports = {
    loginUser,
    otpSendApi,
    verifyOtpAndProcess,
};