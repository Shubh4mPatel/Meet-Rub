const express = require("express");
const router = express.Router();
const { sendContactEmailToAdmin } = require("../controller/users/userProfileController");
const { checkUsername } = require("../controller/public/checkUsername");
const { getUploadUrls } = require("../controller/prisingedurl/UploadUrlController");
const { getHomePageServices } = require("../controller/services/serviceController");
const { getFreelancerReviews } = require("../controller/users/freelancerReviewsController");
const { getIndianStates } = require("../controller/public/statesController");
const { getHomeContent } = require("../controller/home/homeContentController");

// Public route for contact form submission
router.post("/contact", sendContactEmailToAdmin);

// Check if a username (full name) is already taken
router.get("/check-username", checkUsername);

router.post('/get-upload-urls', getUploadUrls);

router.get('/home-services', getHomePageServices);

router.get('/freelancers/:id/reviews', getFreelancerReviews);

router.get('/states', getIndianStates);

// Public: dynamic home page content (How it works, Made with, Testimonials, CTA, FAQ)
router.get('/home-content', getHomeContent);

module.exports = router;