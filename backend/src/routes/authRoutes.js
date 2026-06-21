const express = require('express');
const router = express.Router();
const { loginUser, otpSendApi, verifyOtpAndProcess } = require('../controller');
const { socialLoginUser } = require('../controller/auth/login/socialLogin');
const { googleRegisterUser } = require('../controller/auth/register/googleRegister');
const { authenticateUser, refreshAccessToken, logout } = require('../middleware/authMiddleware');
const { changePassword } = require('../controller/auth/change-password/changePassword');
const { setTokenCookies } = require('../middleware/tokenCookieMiddleware');
const upload = require('../../config/multer');
const registerImageUpload = require('../../config/registerImageUpload');


router.post("/send-otp", otpSendApi);


router.post("/verify-otp", registerImageUpload.fields([{ name: 'govIdImage', maxCount: 1 }, { name: 'panCardImage', maxCount: 1 }]), verifyOtpAndProcess, setTokenCookies, (req, res) => {

  res.status(200).json({
    message: "Login successful ",
    userInfo: res.locals.user,

  });

});


router.post("/login", loginUser, setTokenCookies, (req, res) => {

  res.status(200).json({
    message: "Login successful",
    userInfo: res.locals.user
  });

});


router.post('/refresh', refreshAccessToken, (req, res) => {
  res.status(200).json({ message: 'Access token refreshed' });
});


router.get('/logout', authenticateUser, logout);


router.put('/change-password', authenticateUser, changePassword);


router.post('/social-login', socialLoginUser, setTokenCookies, (req, res) => {
  res.status(200).json({
    message: 'Login successful',
    userInfo: res.locals.user,
  });
});


router.post(
  '/social-register',
  registerImageUpload.single('pan_card_document'),
  googleRegisterUser,
  setTokenCookies,
  (req, res) => {
    res.status(201).json({
      message: 'Registration successful',
      userInfo: res.locals.user,
    });
  }
);


module.exports = router;