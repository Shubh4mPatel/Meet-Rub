const express = require('express');
const router = express.Router();
const { googleLoginUser,otpSendApi, verifyOtpAndProcess, loginUser, blockUserController, unblockUserController, getDeleteUserListController, changePasswordController, deleteUserRequestController, deleteUserExecutionController } = require('../controller')
const { authenticateUser, refreshAccessToken, logout } = require('../middleware/authMiddleware');
const { setTokenCookies } = require('../middleware/tokenCookieMiddleware');
const { isFirstTime } = require('../controller/auth/isFirstTime/isFirstTimeController')
const { logger } = require('../utils/logger');

router.post("/send-otp", otpSendApi);
router.post("/verify-otp", verifyOtpAndProcess);
router.post("/login", loginUser, setTokenCookies, (req, res) => {
  const isMobile = req.headers['orangemobileaccesstoken'] === true || req.headers['orangemobileaccesstoken'] === 'true';

  logger.info("Login successful, setting cookies for user:", isMobile ? 'mobile' : 'web');
  res.status(200).json({
    message: "Login successful ",
    tokensCookieSet: true,
    deviceType: isMobile ? 'mobile' : 'web',

    refreshAccessToken: isMobile ? res.locals.refreshToken : "",
    accessToken: isMobile ? res.locals.accessToken : "",
  });

});

router.post('/refresh', refreshAccessToken, (req, res) => {
  res.status(200).json({ message: 'Access token refreshed' });
});

// Profile Chage Password 
router.post("/changePassword", authenticateUser, changePasswordController);
router.get("/delete-user-request", authenticateUser, deleteUserRequestController);
router.post("/delete-user", authenticateUser, deleteUserExecutionController);
router.get('/delete-user-list', authenticateUser, getDeleteUserListController);


router.post('/logout', authenticateUser, logout);

router.post('/block-user', authenticateUser, blockUserController);
router.post('/unblock-user', authenticateUser, unblockUserController);

router.get('/isFirstTime', authenticateUser, isFirstTime);

router.post('/google-signin', googleLoginUser, setTokenCookies, (req, res) => {
  res.status(200).json({
    message: "Google login successful",
    tokensCookieSet: true,
    accessToken: res.locals.accessToken,
    refreshAccessToken: res.locals.refreshToken
  });
});


module.exports = router;