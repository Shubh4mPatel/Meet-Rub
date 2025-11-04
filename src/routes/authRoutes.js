const express = require('express');
const router = express.Router();
const { loginUser, otpSendApi, verifyOtpAndProcess } = require('../controller');
const { authenticateUser, refreshAccessToken, logout } = require('../middleware/authMiddleware');
const { setTokenCookies } = require('../middleware/tokenCookieMiddleware');
const { logger } = require('../../utils/logger');
const upload = require('../../config/multer');

router.post("/send-otp", otpSendApi);
router.post("/verify-otp", upload.single('file'), verifyOtpAndProcess);
router.post("/login", loginUser, setTokenCookies, (req, res) => {

  res.status(200).json({
    message: "Login successful ",
    tokensCookieSet: true,
  });

});

router.post('/refresh', refreshAccessToken, (req, res) => {
  res.status(200).json({ message: 'Access token refreshed' });
});

router.post('/logout', authenticateUser, logout);


module.exports = router;