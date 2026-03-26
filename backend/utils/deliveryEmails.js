const fs = require('fs');
const path = require('path');
const { sendMail } = require('../config/email');

const TEMPLATES_DIR = path.join(__dirname, '../../Email-Templates');

const APP_URL         = process.env.APP_URL         || 'https://meetrub.com';
const LOGO_URL        = process.env.LOGO_URL        || `${APP_URL}/logo.png`;
const HELP_URL        = process.env.HELP_URL        || `${APP_URL}/help`;
const PRIVACY_URL     = process.env.PRIVACY_URL     || `${APP_URL}/privacy`;
const CURRENCY        = process.env.CURRENCY        || '₹';
const REVIEW_DAYS     = process.env.REVIEW_DAYS     || '7';

function fillTemplate(html, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ''),
    html
  );
}

function formatDeliveryTime(date) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

async function sendDeliverySubmittedEmail({ freelancerEmail, freelancerName, projectId, amount }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/deliverySubmitted.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    freelancer_username:  freelancerName,
    order_id:             String(projectId),
    delivery_time:        formatDeliveryTime(new Date()),
    currency:             CURRENCY,
    freelancer_earnings:  amount != null ? Number(amount).toFixed(2) : '—',
    order_url:            `${APP_URL}/freelancer/orders/${projectId}`,
    review_days:          REVIEW_DAYS,
    logo_url:             LOGO_URL,
    help_url:             HELP_URL,
    privacy_url:          PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `Delivery submitted — Order #${projectId}`, filled);
}

async function sendDeliveryReceivedEmail({
  creatorEmail,
  creatorName,
  freelancerName,
  projectId,
  serviceTitle,
  deliveryMessage,
}) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'creator/deliveryRecevied.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    creator_username:   creatorName,
    freelancer_username: freelancerName,
    order_id:           String(projectId),
    service_title:      serviceTitle || 'Your order',
    delivery_time:      formatDeliveryTime(new Date()),
    delivery_message:   deliveryMessage || '',
    logo_url:           LOGO_URL,
    help_url:           HELP_URL,
    privacy_url:        PRIVACY_URL,
    unsubscribe_url:    UNSUBSCRIBE_URL,
  });
  await sendMail(creatorEmail, `New delivery received — Order #${projectId}`, filled);
}

module.exports = { sendDeliverySubmittedEmail, sendDeliveryReceivedEmail };
