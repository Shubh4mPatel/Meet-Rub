const express = require('express');
const router = express.Router();
const { loginUser, otpSendApi, verifyOtpAndProcess } = require('../controller');
const { authenticateUser, refreshAccessToken, logout } = require('../middleware/authMiddleware');
const { changePassword } = require('../controller/auth/change-password/changePassword');
const { setTokenCookies } = require('../middleware/tokenCookieMiddleware');
const upload = require('../../config/multer');


router.post("/send-otp", otpSendApi);


router.post("/verify-otp", upload.fields([{ name: 'govIdImage', maxCount: 1 }, { name: 'panCardImage', maxCount: 1 }]), verifyOtpAndProcess, setTokenCookies, (req, res) => {

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


module.exports = router;