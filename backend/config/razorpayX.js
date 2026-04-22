const Razorpay = require('razorpay');
require('dotenv').config();
const { getLogger } = require('../utils/logger');

const logger = getLogger('razorpayX-config');

logger.info('='.repeat(80));
logger.info('🚀 Initializing Razorpay X SDK...');
logger.info('Environment Check:', {
  nodeEnv: process.env.NODE_ENV || 'not set',
  hasKeyId: !!process.env.RAZORPAY_X_KEY_ID,
  hasKeySecret: !!process.env.RAZORPAY_X_KEY_SECRET,
  keyIdPrefix: process.env.RAZORPAY_X_KEY_ID?.substring(0, 12) || 'MISSING',
  keyIdLength: process.env.RAZORPAY_X_KEY_ID?.length || 0,
  keySecretLength: process.env.RAZORPAY_X_KEY_SECRET?.length || 0,
  razorpayModuleVersion: require('razorpay/package.json').version,
  razorpayModuleLoaded: !!Razorpay
});

let razorpayXInstance = null;

try {
  if (!process.env.RAZORPAY_X_KEY_ID || !process.env.RAZORPAY_X_KEY_SECRET) {
    logger.error('❌ ERROR: Missing Razorpay X credentials in environment variables');
    logger.error('Required variables:');
    logger.error('  - RAZORPAY_X_KEY_ID (current: ' + (process.env.RAZORPAY_X_KEY_ID ? 'SET' : 'MISSING') + ')');
    logger.error('  - RAZORPAY_X_KEY_SECRET (current: ' + (process.env.RAZORPAY_X_KEY_SECRET ? 'SET' : 'MISSING') + ')');
  } else {
    logger.info('✓ Credentials found, creating SDK instance...');
    
    razorpayXInstance = new Razorpay({
      key_id: process.env.RAZORPAY_X_KEY_ID,
      key_secret: process.env.RAZORPAY_X_KEY_SECRET
    });

    logger.info('✓ SDK instance created successfully');
    
    // Detailed API availability check
    logger.info('🔍 Checking available APIs...');
    logger.info('Instance type: ' + typeof razorpayXInstance);
    logger.info('Instance constructor: ' + (razorpayXInstance?.constructor?.name || 'unknown'));
    
    // Check each API individually with detailed info
    const apiChecks = {
      contacts: {
        exists: !!razorpayXInstance.contacts,
        type: typeof razorpayXInstance.contacts,
        hasCreate: !!(razorpayXInstance.contacts?.create)
      },
      fundAccount: {
        exists: !!razorpayXInstance.fundAccount,
        type: typeof razorpayXInstance.fundAccount,
        hasCreate: !!(razorpayXInstance.fundAccount?.create)
      },
      payouts: {
        exists: !!razorpayXInstance.payouts,
        type: typeof razorpayXInstance.payouts,
        hasCreate: !!(razorpayXInstance.payouts?.create)
      },
      transactions: {
        exists: !!razorpayXInstance.transactions,
        type: typeof razorpayXInstance.transactions
      }
    };

    logger.info('📊 API Availability Report:');
    Object.entries(apiChecks).forEach(([api, status]) => {
      const icon = status.exists ? '✅' : '❌';
      logger.info(`  ${icon} ${api}: ${JSON.stringify(status)}`);
    });

    // List all available properties on the instance
    logger.info('🔬 All instance properties: ' + Object.keys(razorpayXInstance || {}).join(', '));

    // Overall status
    const allApisAvailable = Object.values(apiChecks).every(check => check.exists);
    if (allApisAvailable) {
      logger.info('✅ SUCCESS: All RazorpayX APIs are available!');
    } else {
      logger.error('⚠️  WARNING: Some RazorpayX APIs are missing!');
      logger.error('This usually means you are using regular Razorpay keys instead of RazorpayX keys.');
      logger.error('Please verify you generated keys from the RazorpayX section of your dashboard.');
    }
  }
} catch (error) {
  logger.error('💥 FATAL ERROR during initialization:');
  logger.error('Error name: ' + error.name);
  logger.error('Error message: ' + error.message);
  logger.error('Error stack: ' + error.stack);
}

logger.info('='.repeat(80));

module.exports = razorpayXInstance;
