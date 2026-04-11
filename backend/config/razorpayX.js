const Razorpay = require('razorpay');
require('dotenv').config();

const razorpayXInstance = new Razorpay({
  key_id: process.env.RAZORPAY_X_KEY_ID,
  key_secret: process.env.RAZORPAY_X_KEY_SECRET
});

module.exports = razorpayXInstance;
