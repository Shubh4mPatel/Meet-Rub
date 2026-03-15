const express = require("express");
const router = express.Router();
const { sendContactEmailToAdmin } = require("../controller/users/userProfileController");
const { checkUsername } = require("../controller/public/checkUsername");
const { getUploadUrls } = require("../controller/prisingedurl/UploadUrlController");

// Public route for contact form submission
router.post("/contact", sendContactEmailToAdmin);

// Check if a username (full name) is already taken
router.get("/check-username", checkUsername);

router.post('/get-upload-urls', getUploadUrls);

module.exports = router;