const fs = require('fs');
const path = require('path');
const { sendMail } = require('../config/email');

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

async function sendOfferSentEmail({ freelancerEmail, freelancerName, creatorName, serviceTitle, amount, deliveryDays, chatRoomId }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/offersent.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        creator_username: creatorName,
        service_title: serviceTitle || 'Custom Package',
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        delivery_days: deliveryDays || '—',
        chat_url: `${APP_URL}/freelancer/chat/${chatRoomId}`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `Offer sent to ${creatorName}`, filled, null, 'offer_sent', null);
}

async function sendOfferReceivedEmail({ creatorEmail, creatorName, freelancerName, serviceTitle, amount, deliveryDays, chatRoomId }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'creator/offerRecived.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        creator_username: creatorName,
        freelancer_username: freelancerName,
        service_title: serviceTitle || 'Custom Package',
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        delivery_days: deliveryDays || '—',
        offer_url: `${APP_URL}/creator/chat/${chatRoomId}`,
        chat_url: `${APP_URL}/creator/chat/${chatRoomId}`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(creatorEmail, `New offer from ${freelancerName}`, filled, null, 'offer_received', null);
}

async function sendHireRequestEmail({ creatorEmail, creatorName, freelancerName, serviceTitle, amount, deliveryDays, chatRoomId }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'creator/hireRequest.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        creator_username: creatorName,
        freelancer_username: freelancerName,
        service_title: serviceTitle || 'Custom Package',
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        deadline: deliveryDays ? `${deliveryDays} days` : '—',
        chat_url: `${APP_URL}/creator/chat/${chatRoomId}`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(creatorEmail, `Your hire request was sent to ${freelancerName}`, filled, null, 'hire_request_sent', null);
}

async function sendHireRequestReceivedEmail({ freelancerEmail, freelancerName, creatorName, serviceTitle, amount, deliveryDays, chatRoomId }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'freelancer/hireRequestRecevied.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        freelancer_username: freelancerName,
        creator_username: creatorName,
        service_title: serviceTitle || 'Custom Package',
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        deadline: deliveryDays ? `${deliveryDays} days` : '—',
        chat_url: `${APP_URL}/freelancer/chat/${chatRoomId}`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(freelancerEmail, `New hire request from ${creatorName}`, filled, null, 'hire_request_received', null);
}

async function sendHireAcceptedEmail({ creatorEmail, creatorName, freelancerName, serviceTitle, amount, deadline, chatRoomId }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'creator/hierAccepted.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        creator_username: creatorName,
        freelancer_username: freelancerName,
        service_title: serviceTitle || 'Custom Package',
        currency: CURRENCY,
        amount: amount != null ? Number(amount).toFixed(2) : '—',
        deadline: deadline ? `${deadline} days` : '—',
        payment_url: `${APP_URL}/creator/chat/${chatRoomId}`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(creatorEmail, `${freelancerName} accepted your hire request`, filled, null, 'hire_accepted', null);
}

async function sendHireDeclinedEmail({ creatorEmail, creatorName, freelancerName }) {
    const html = fs.readFileSync(
        path.join(TEMPLATES_DIR, 'creator/hireDeclined.html'),
        'utf8'
    );
    const filled = fillTemplate(html, {
        creator_username: creatorName,
        freelancer_username: freelancerName,
        browse_url: `${APP_URL}/creator/hire-freelancer`,
        asset_base: ASSET_BASE,
        help_url: HELP_URL,
        privacy_url: PRIVACY_URL,
    });
    await sendMail(creatorEmail, `${freelancerName} declined your hire request`, filled, null, 'hire_declined', null);
}

module.exports = { sendOfferSentEmail, sendOfferReceivedEmail, sendHireRequestEmail, sendHireRequestReceivedEmail, sendHireAcceptedEmail, sendHireDeclinedEmail };
