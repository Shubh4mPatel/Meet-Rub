const {registerUser} = require('./auth/register/register');
const {loginUser} = require('./auth/login/login');
const {otpSendApi} = require('./auth/send-otp/sendOtp');

module.exports = {
    registerUser,
    loginUser,
    otpSendApi
};