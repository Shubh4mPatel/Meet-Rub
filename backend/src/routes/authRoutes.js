const express = require('express');
const router = express.Router();
const { loginUser, otpSendApi, verifyOtpAndProcess } = require('../controller');
const { authenticateUser, refreshAccessToken, logout } = require('../middleware/authMiddleware');
const { changePassword } = require('../controller/auth/change-password/changePassword');
const { setTokenCookies } = require('../middleware/tokenCookieMiddleware');
const upload = require('../../config/multer');


router.post("/send-otp", otpSendApi);


router.post("/verify-otp", upload.single('file'), verifyOtpAndProcess, setTokenCookies, (req, res) => {

  res.status(200).json({
    message: "Login successful ",
    tokensCookieSet: true,
  });
  
});


router.post("/login", loginUser, setTokenCookies, (req, res) => {

  res.status(200).json({
    message: "Login successful",
    tokensCookieSet: true,
    userInfo: res.locals.user,
    // Tokens also returned in body for Postman / non-browser clients
    // Use as: Authorization: Bearer <accessToken>
    accessToken: res.locals.accessToken,
    refreshToken: res.locals.refreshToken,
  });

});


router.post('/refresh', refreshAccessToken, (req, res) => {
  res.status(200).json({ message: 'Access token refreshed' });
});


router.get('/logout', authenticateUser, logout);


router.put('/change-password', authenticateUser, changePassword);


module.exports = router;