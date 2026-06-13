const fs = require('fs');
const path = require('path');
const { sendMail } = require('../config/email');
const { query } = require('../config/db');

const TEMPLATES_DIR = path.join(__dirname, '../../Email-Templates');

const APP_URL = process.env.APP_URL || 'https://meetrub.com';
const ASSET_BASE = process.env.EMAIL_ASSET_BASE_URL || APP_URL;
const LOGO_SVG_PATH = path.join(__dirname, '../../Email-Templates/assets/logo-large.svg');
const LOGO_URL = process.env.LOGO_URL ||
    `data:image/svg+xml;base64,${fs.readFileSync(LOGO_SVG_PATH).toString('base64')}`;
const HELP_URL = process.env.HELP_URL || 'https://meetrub.com/contact-us';
const PRIVACY_URL = process.env.PRIVACY_URL || 'https://meetrub.com/privacy-policy';
const CURRENCY = process.env.CURRENCY || '₹';

function fillTemplate(html, vars) {
    return Object.entries(vars).reduce(
        (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ''),
        html
    );
}

// Send payment success email to creator
async function sendPaymentSuccessEmailToCreator({
    creatorEmail,
    creatorName,
    freelancerName,
    projectId,
    amount,
    serviceTitle,
    deliveryDate
}) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'creator/paymentSuccess.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        creator_username: creatorName,
        freelancer_username: freelancerName,
        order_id: String(projectId),
        service_title: serviceTitle || 'Your order',
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        delivery_date: deliveryDate || '—',
        order_url: `${APP_URL}/creator/your-projects`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(creatorEmail, `Payment successful — Order #${projectId}`, filled, null, 'payment_success', projectId);
}

// Send work start notification email to freelancer
async function sendWorkStartEmailToFreelancer({
    freelancerEmail,
    freelancerName,
    creatorName,
    projectId,
    amount,
    serviceTitle,
    deliveryDate
}) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/workStart.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        creator_username: creatorName,
        order_id: String(projectId),
        service_title: serviceTitle || 'Your order',
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        delivery_date: deliveryDate || '—',
        order_url: `${APP_URL}/freelancer/projects`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `New order — start work — Order #${projectId}`, filled, null, 'work_start', projectId);
}

async function sendPaymentReleasedEmail({ freelancerEmail, freelancerName, serviceTitle, totalAmount, freelancerEarnings, platformFee, walletBalance }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/paymentrealsed.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        service_title: serviceTitle || 'Your order',
        currency: CURRENCY,
        total_amount: totalAmount != null ? Number(totalAmount).toFixed(2) : '—',
        freelancer_earnings: freelancerEarnings != null ? Number(freelancerEarnings).toFixed(2) : '—',
        platform_fee: platformFee != null ? Number(platformFee).toFixed(2) : '—',
        wallet_balance: walletBalance != null ? Number(walletBalance).toFixed(2) : '—',
        withdraw_url: `${APP_URL}/freelancer/wallet/withdrawal-history`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, 'Payment released to your wallet', filled, null, 'payment_released', null);
}

async function sendWithdrawalRequestEmail({ freelancerName, amount, bankLast4, requestTime }) {
    const adminRes = await query("SELECT user_email FROM users WHERE user_role = 'admin'");
    if (adminRes.rows.length === 0) return;

    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/withdrawalResquest.html'),
        'utf8'
    );
    const APP_ADMIN_URL = process.env.APP_ADMIN_URL || `${APP_URL}/admin`;
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        bank_last4: bankLast4 || '****',
        request_time: requestTime || new Intl.DateTimeFormat('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Kolkata',
        }).format(new Date()),
        wallet_url: `${APP_ADMIN_URL}/payment-request`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await Promise.all(
        adminRes.rows.map((admin) =>
            sendMail(admin.user_email, `New withdrawal request — ${freelancerName}`, filled, null, 'withdrawal_request', null)
        )
    );
}

async function sendWithdrawalApprovedEmail({ freelancerEmail, freelancerName, amount, bankLast4, txnId, arrivalDate }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/withdrawalApproved.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        bank_last4: bankLast4 || '****',
        txn_id: txnId || '—',
        arrival_date: arrivalDate || '3–5 business days',
        wallet_url: `${APP_URL}/freelancer/wallet`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, 'Withdrawal approved — funds on the way', filled, null, 'withdrawal_approved', null);
}

module.exports = {
    sendPaymentSuccessEmailToCreator,
    sendWorkStartEmailToFreelancer,
    sendPaymentReleasedEmail,
    sendWithdrawalRequestEmail,
    sendWithdrawalApprovedEmail,
};
