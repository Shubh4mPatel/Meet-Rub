const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const TEMPLATES_DIR = path.join(__dirname, '../../../Email-Templates');

const APP_URL         = process.env.APP_URL         || 'https://meetrub.com';
const LOGO_URL        = process.env.LOGO_URL        || `${APP_URL}/logo.png`;
const HELP_URL        = process.env.HELP_URL        || `${APP_URL}/help`;
const PRIVACY_URL     = process.env.PRIVACY_URL     || `${APP_URL}/privacy`;
const CURRENCY        = process.env.CURRENCY        || '₹';

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
  await transporter.sendMail({
    from: process.env.EMAIL_SERVER_USER,
    to,
    subject,
    html,
  });
}

async function sendOfferSentEmail({ freelancerEmail, freelancerName, creatorName, serviceTitle, amount, deliveryDays, chatRoomId }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/offersent.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    freelancer_username: freelancerName,
    creator_username:    creatorName,
    service_title:       serviceTitle || 'Custom Package',
    currency:            CURRENCY,
    amount:              amount != null ? Number(amount).toFixed(2) : '—',
    delivery_days:       deliveryDays || '—',
    chat_url:            `${APP_URL}/freelancer/chat/${chatRoomId}`,
    logo_url:            LOGO_URL,
    help_url:            HELP_URL,
    privacy_url:         PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `Offer sent to ${creatorName}`, filled);
}

async function sendOfferReceivedEmail({ creatorEmail, creatorName, freelancerName, serviceTitle, amount, deliveryDays, chatRoomId }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'creator/offerRecived.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    creator_username:    creatorName,
    freelancer_username: freelancerName,
    service_title:       serviceTitle || 'Custom Package',
    currency:            CURRENCY,
    amount:              amount != null ? Number(amount).toFixed(2) : '—',
    delivery_days:       deliveryDays || '—',
    offer_url:           `${APP_URL}/creator/chat/${chatRoomId}`,
    chat_url:            `${APP_URL}/creator/chat/${chatRoomId}`,
    logo_url:            LOGO_URL,
    help_url:            HELP_URL,
    privacy_url:         PRIVACY_URL,
  });
  await sendMail(creatorEmail, `New offer from ${freelancerName}`, filled);
}

async function sendHireRequestEmail({ creatorEmail, creatorName, freelancerName, serviceTitle, amount, deliveryDays, chatRoomId }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'creator/hireRequest.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    creator_username:    creatorName,
    freelancer_username: freelancerName,
    service_title:       serviceTitle || 'Custom Package',
    currency:            CURRENCY,
    amount:              amount != null ? Number(amount).toFixed(2) : '—',
    deadline:            deliveryDays ? `${deliveryDays} days` : '—',
    chat_url:            `${APP_URL}/creator/chat/${chatRoomId}`,
    logo_url:            LOGO_URL,
    help_url:            HELP_URL,
    privacy_url:         PRIVACY_URL,
  });
  await sendMail(creatorEmail, `Your hire request was sent to ${freelancerName}`, filled);
}

async function sendHireRequestReceivedEmail({ freelancerEmail, freelancerName, creatorName, serviceTitle, amount, deliveryDays, chatRoomId }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/hireRequestRecevied.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    freelancer_username: freelancerName,
    creator_username:    creatorName,
    service_title:       serviceTitle || 'Custom Package',
    currency:            CURRENCY,
    amount:              amount != null ? Number(amount).toFixed(2) : '—',
    deadline:            deliveryDays ? `${deliveryDays} days` : '—',
    chat_url:            `${APP_URL}/freelancer/chat/${chatRoomId}`,
    logo_url:            LOGO_URL,
    help_url:            HELP_URL,
    privacy_url:         PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `New hire request from ${creatorName}`, filled);
}

module.exports = { sendOfferSentEmail, sendOfferReceivedEmail, sendHireRequestEmail, sendHireRequestReceivedEmail };
