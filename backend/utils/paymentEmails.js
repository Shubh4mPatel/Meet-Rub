const fs = require('fs');
const path = require('path');
const { sendMail } = require('../config/email');

const TEMPLATES_DIR = path.join(__dirname, '../../Email-Templates');

const APP_URL = process.env.APP_URL || 'https://meetrub.com';
const LOGO_SVG_PATH = path.join(__dirname, '../../Email-Templates/assets/logo-large.svg');
const LOGO_URL = process.env.LOGO_URL ||
    `data:image/svg+xml;base64,${fs.readFileSync(LOGO_SVG_PATH).toString('base64')}`;
const HELP_URL = process.env.HELP_URL || `${APP_URL}/help`;
const PRIVACY_URL = process.env.PRIVACY_URL || `${APP_URL}/privacy`;
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
        order_url: `${APP_URL}/creator/orders/${projectId}`,
        logo_url: LOGO_URL,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(creatorEmail, `Payment successful — Order #${projectId}`, filled);
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
        order_url: `${APP_URL}/freelancer/orders/${projectId}`,
        logo_url: LOGO_URL,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `New order — start work — Order #${projectId}`, filled);
}

module.exports = {
    sendPaymentSuccessEmailToCreator,
    sendWorkStartEmailToFreelancer
};
