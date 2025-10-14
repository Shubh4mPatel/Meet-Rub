const express = require('express');
const router = express.Router();
const { loginUser, registerUser,otpSendApi } = require('../controller');
const { authenticateUser, refreshAccessToken, logout } = require('../middleware/authMiddleware');
const { setTokenCookies } = require('../middleware/tokenCookieMiddleware');
// const { isFirstTime } = require('../controller/auth/isFirstTime/isFirstTimeController')
const { logger } = require('../../utils/logger');

router.post("/send-otp", otpSendApi);
// router.post("/verify-otp", verifyOtpAndProcess);
router.post("/login", loginUser, setTokenCookies, (req, res) => {

  res.status(200).json({
    message: "Login successful ",
    tokensCookieSet: true,
  });

});

router.post('/refresh', refreshAccessToken, (req, res) => {
  res.status(200).json({ message: 'Access token refreshed' });
});

// Profile Chage Password 
// router.post("/changePassword", authenticateUser, changePasswordController);
// router.get("/delete-user-request", authenticateUser, deleteUserRequestController);
// router.post("/delete-user", authenticateUser, deleteUserExecutionController);
// router.get('/delete-user-list', authenticateUser, getDeleteUserListController);


router.post('/logout', authenticateUser, logout);
router.post('/register', registerUser)

// router.post('/block-user', authenticateUser, blockUserController);
// router.post('/unblock-user', authenticateUser, unblockUserController);

// router.get('/isFirstTime', authenticateUser, isFirstTime);

// router.post('/google-signin', googleLoginUser, setTokenCookies, (req, res) => {
//   res.status(200).json({
//     message: "Google login successful",
//     tokensCookieSet: true,
//     accessToken: res.locals.accessToken,
//     refreshAccessToken: res.locals.refreshToken
//   });
// });


module.exports = router;