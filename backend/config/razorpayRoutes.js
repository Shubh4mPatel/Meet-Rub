const axios = require('axios');
require('dotenv').config();
const { getLogger } = require('../utils/logger');

const logger = getLogger('razorpayRoutes-config');

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    logger.error('Missing Razorpay credentials: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required');
}

const razorpayRoutes = axios.create({
    baseURL: 'https://api.razorpay.com',
    auth: {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET,
    },
    headers: { 'Content-Type': 'application/json' },
});

logger.info('RazorpayRoutes axios client initialized', {
    hasKeyId: !!process.env.RAZORPAY_KEY_ID,
    hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
    keyIdPrefix: process.env.RAZORPAY_KEY_ID?.substring(0, 12) || 'MISSING'
});

module.exports = razorpayRoutes;
