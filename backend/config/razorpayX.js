const Razorpay = require('razorpay');
require('dotenv').config();

console.log('[razorpayX] Initializing Razorpay X SDK...');
console.log('[razorpayX] Config check:', {
  hasKeyId: !!process.env.RAZORPAY_X_KEY_ID,
  hasKeySecret: !!process.env.RAZORPAY_X_KEY_SECRET,
  keyIdPrefix: process.env.RAZORPAY_X_KEY_ID?.substring(0, 8) + '...',
  razorpayModuleLoaded: !!Razorpay
});

let razorpayXInstance = null;

try {
  if (!process.env.RAZORPAY_X_KEY_ID || !process.env.RAZORPAY_X_KEY_SECRET) {
    console.error('[razorpayX] ERROR: Missing Razorpay X credentials in environment variables');
    console.error('[razorpayX] Required: RAZORPAY_X_KEY_ID and RAZORPAY_X_KEY_SECRET');
  } else {
    razorpayXInstance = new Razorpay({
      key_id: process.env.RAZORPAY_X_KEY_ID,
      key_secret: process.env.RAZORPAY_X_KEY_SECRET
    });

    console.log('[razorpayX] SDK initialized successfully');
    console.log('[razorpayX] Available APIs:', {
      contacts: !!razorpayXInstance.contacts,
      fundAccount: !!razorpayXInstance.fundAccount,
      payouts: !!razorpayXInstance.payouts,
      transactions: !!razorpayXInstance.transactions
    });
  }
} catch (error) {
  console.error('[razorpayX] FATAL ERROR during initialization:', {
    errorMessage: error.message,
    errorStack: error.stack
  });
}

module.exports = razorpayXInstance;
