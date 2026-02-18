const express = require("express");
const router = express.Router();
const { sendContactEmailToAdmin } = require("../controller/users/userProfileController");

// Public route for contact form submission
router.post("/contact", sendContactEmailToAdmin);

module.exports = router;