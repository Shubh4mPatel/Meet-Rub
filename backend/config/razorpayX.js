const axios = require('axios');
require('dotenv').config();
const { getLogger } = require('../utils/logger');

const logger = getLogger('razorpayX-config');

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  logger.error('Missing Razorpay credentials: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required');
}

if (!process.env.RAZORPAY_ACCOUNT_NUMBER) {
  logger.error('Missing RAZORPAY_ACCOUNT_NUMBER - required for payouts');
}

const razorpayX = axios.create({
  baseURL: 'https://api.razorpay.com/v1',
  auth: {
    username: process.env.RAZORPAY_KEY_ID,
    password: process.env.RAZORPAY_KEY_SECRET,
  },
  headers: { 'Content-Type': 'application/json' },
});

logger.info('RazorpayX axios client initialized', {
  hasKeyId: !!process.env.RAZORPAY_KEY_ID,
  hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
  hasAccountNumber: !!process.env.RAZORPAY_ACCOUNT_NUMBER,
  keyIdPrefix: process.env.RAZORPAY_KEY_ID?.substring(0, 12) || 'MISSING'
});

module.exports = razorpayX;
