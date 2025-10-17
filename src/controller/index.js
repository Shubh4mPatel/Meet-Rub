const {loginUser} = require('./auth/login/login');
const {otpSendApi} = require('./auth/send-otp/sendOtp');

module.exports = {
    loginUser,
    otpSendApi
};