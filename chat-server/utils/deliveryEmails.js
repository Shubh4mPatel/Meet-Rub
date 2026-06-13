const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { getLogger } = require('./logger');
const logger = getLogger('delivery-emails');

const TEMPLATES_DIR = path.join(__dirname, '../../Email-Templates');

const APP_URL = process.env.APP_URL || 'https://meetrub.com';
const ASSET_BASE = process.env.EMAIL_ASSET_BASE_URL || APP_URL;
const LOGO_SVG_PATH = path.join(__dirname, '../../Email-Templates/assets/logo-large.svg');
const LOGO_URL = process.env.LOGO_URL ||
    `data:image/svg+xml;base64,${fs.readFileSync(LOGO_SVG_PATH).toString('base64')}`;
const HELP_URL = process.env.HELP_URL || 'https://meetrub.com/contact-us';
const PRIVACY_URL = process.env.PRIVACY_URL || 'https://meetrub.com/privacy-policy';
const CURRENCY = process.env.CURRENCY || '₹';

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: process.env.EMAIL_SERVER_PORT,
    auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.SERVER_PASSWORD,
    },
});

function fillTemplate(html, vars) {
    return Object.entries(vars).reduce(
        (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ''),
        html
    );
}

async function sendMail(to, subject, html) {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_SERVER_USER,
            to,
            subject,
            html,
        });
        logger.info(`Email sent: to=${to}, subject="${subject}", messageId=${info.messageId}`);
        return info;
    } catch (error) {
        logger.error(`Email send failed: to=${to}, subject="${subject}", error=${error.message}`);
        throw error;
    }
}

async function sendDeadlineExtensionRequestEmail({ creatorEmail, creatorName, freelancerName, projectId, serviceTitle, extensionTime, currentDeadline, newDeadline }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'creator/deadlineExtensionRequest.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        creator_username: creatorName,
        freelancer_username: freelancerName,
        order_id: String(projectId),
        service_title: serviceTitle || 'Your order',
        extension_time: extensionTime,
        current_deadline: currentDeadline,
        new_deadline: newDeadline,
        extension_url: `${APP_URL}/creator/your-projects`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(creatorEmail, `Deadline extension requested — Order #${projectId}`, filled);
}

async function sendDeadlineExtensionAcceptedEmail({ freelancerEmail, freelancerName, creatorName, projectId, serviceTitle, extensionTime, newDeadline }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/deadlineExtensionAccepted.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        creator_username: creatorName,
        order_id: String(projectId),
        service_title: serviceTitle || 'Your order',
        extension_time: extensionTime,
        new_deadline: newDeadline,
        order_url: `${APP_URL}/freelancer/projects`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `Extension request accepted — Order #${projectId}`, filled);
}

async function sendDeadlineExtensionRejectedEmail({ freelancerEmail, freelancerName, creatorName, projectId, serviceTitle, currentDeadline }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/deadlineExtensionRejected.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        creator_username: creatorName,
        order_id: String(projectId),
        service_title: serviceTitle || 'Your order',
        current_deadline: currentDeadline,
        order_url: `${APP_URL}/freelancer/projects`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `Extension request declined — Order #${projectId}`, filled);
}

async function sendPackageRejectedEmail({ freelancerEmail, freelancerName, creatorName, serviceTitle, amount, deliveryDays, creatorUserId }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/offerRejected.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        creator_username: creatorName,
        service_title: serviceTitle || 'Custom Service',
        currency: CURRENCY,
        amount: String(amount),
        delivery_days: String(deliveryDays),
        chat_url: `${APP_URL}/freelancer/chatbot?userId=${creatorUserId}`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `Your offer was declined`, filled);
}

async function sendPackageAcceptedEmail({ freelancerEmail, freelancerName, creatorName, serviceTitle, amount, deliveryDays, creatorUserId }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/offerAccepted.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        creator_username: creatorName,
        service_title: serviceTitle || 'Custom Service',
        currency: CURRENCY,
        amount: String(amount),
        delivery_days: String(deliveryDays),
        chat_url: `${APP_URL}/freelancer/chatbot?userId=${creatorUserId}`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `Your offer was accepted — payment pending`, filled);
}

module.exports = {
    sendDeadlineExtensionRequestEmail,
    sendDeadlineExtensionAcceptedEmail,
    sendDeadlineExtensionRejectedEmail,
    sendPackageRejectedEmail,
    sendPackageAcceptedEmail,
};
