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
const REVIEW_DAYS = process.env.REVIEW_DAYS || '7';

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
    freelancer_username: freelancerName,
    order_id: String(projectId),
    delivery_time: formatDeliveryTime(new Date()),
    currency: CURRENCY,
    freelancer_earnings: amount != null ? Number(amount).toFixed(2) : '—',
    order_url: `${APP_URL}/freelancer/projects`,
    review_days: REVIEW_DAYS,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `Delivery submitted — Order #${projectId}`, filled, null, 'delivery_submitted', projectId);
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
    creator_username: creatorName,
    freelancer_username: freelancerName,
    order_id: String(projectId),
    service_title: serviceTitle || 'Your order',
    delivery_time: formatDeliveryTime(new Date()),
    delivery_message: deliveryMessage || '',
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(creatorEmail, `New delivery received — Order #${projectId}`, filled, null, 'delivery_received', projectId);
}

async function sendCreatorRatingRequestEmail({ creatorEmail, creatorName, freelancerName, projectId, serviceTitle }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'creator/ratingRequest.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    creator_username: creatorName,
    freelancer_username: freelancerName,
    order_id: String(projectId),
    service_title: serviceTitle || 'Your order',
    review_url: `${APP_URL}/creator/your-projects`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(creatorEmail, `Project completed — rate your freelancer — Order #${projectId}`, filled, null, 'creator_rating_request', projectId);
}

async function sendFreelancerRatingRequestEmail({ freelancerEmail, freelancerName, creatorName, projectId, serviceTitle }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/ratingRequest.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    freelancer_username: freelancerName,
    creator_username: creatorName,
    order_id: String(projectId),
    service_title: serviceTitle || 'Your order',
    review_url: `${APP_URL}/freelancer/projects`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `Project completed — rate your client — Order #${projectId}`, filled, null, 'freelancer_rating_request', projectId);
}

async function sendOrderApprovedEmail({ freelancerEmail, freelancerName, creatorName, projectId, serviceTitle, amount }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/orderApproved.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    freelancer_username: freelancerName,
    creator_username: creatorName,
    order_id: String(projectId),
    service_title: serviceTitle || 'Your order',
    currency: CURRENCY,
    amount: amount != null ? Number(amount).toFixed(2) : '—',
    withdraw_url: `${APP_URL}/freelancer/wallet`,
    order_url: `${APP_URL}/freelancer/projects`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `Delivery approved — raise withdrawal request — Order #${projectId}`, filled, null, 'order_approved', projectId);
}

async function sendCreatorDisputeEmail({ creatorEmail, creatorName, freelancerName, disputeId, projectId, serviceTitle, disputeReason }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'creator/raisedispute.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    creator_username: creatorName,
    freelancer_username: freelancerName,
    order_id: String(projectId || disputeId),
    service_title: serviceTitle || 'your order',
    dispute_reason: disputeReason,
    dispute_time: formatDeliveryTime(new Date()),
    dispute_url: `${APP_URL}/creator/disputes`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(creatorEmail, `Dispute raised — Order #${projectId || disputeId}`, filled, null, 'creator_dispute_raised', projectId);
}

async function sendFreelancerDisputeEmail({ freelancerEmail, freelancerName, creatorName, disputeId, projectId, serviceTitle, disputeReason }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/disputeRaised.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    freelancer_username: freelancerName,
    creator_username: creatorName,
    order_id: String(projectId || disputeId),
    service_title: serviceTitle || 'your order',
    dispute_reason: disputeReason,
    dispute_url: `${APP_URL}/freelancer/disputes`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `Dispute raised against you — Order #${projectId || disputeId}`, filled, null, 'freelancer_dispute_raised', projectId);
}

async function sendPaymentConfirmedEmail({ creatorEmail, creatorName, freelancerName, projectId, serviceTitle, amount, deadline, paymentMethod }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'creator/paymentConfirmed.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    creator_username: creatorName,
    freelancer_username: freelancerName,
    order_id: String(projectId),
    service_title: serviceTitle || 'Your order',
    currency: CURRENCY,
    amount: amount != null ? Number(amount).toFixed(2) : '—',
    deadline: deadline || 'TBD',
    payment_method: paymentMethod || 'Razorpay',
    order_url: `${APP_URL}/creator/your-projects`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(creatorEmail, `Payment confirmed — Order #${projectId}`, filled, null, 'payment_confirmed', projectId);
}

async function sendOrderActivatedEmail({ freelancerEmail, freelancerName, creatorName, projectId, serviceTitle, amount, deadline }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/orderActivated.html'),
    'utf8'
  );
  // Calculate 80% freelancer earnings
  const freelancerEarnings = amount != null ? (Number(amount) * 0.8).toFixed(2) : '—';
  const filled = fillTemplate(html, {
    freelancer_username: freelancerName,
    creator_username: creatorName,
    order_id: String(projectId),
    service_title: serviceTitle || 'Your order',
    currency: CURRENCY,
    freelancer_earnings: freelancerEarnings,
    deadline: deadline || 'TBD',
    order_url: `${APP_URL}/freelancer/projects`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `New order activated — Order #${projectId}`, filled, null, 'order_activated', projectId);
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
  await sendMail(creatorEmail, `Deadline extension requested — Order #${projectId}`, filled, null, 'deadline_extension_request', projectId);
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
  await sendMail(freelancerEmail, `Extension request accepted — Order #${projectId}`, filled, null, 'deadline_extension_accepted', projectId);
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
  await sendMail(freelancerEmail, `Extension request declined — Order #${projectId}`, filled, null, 'deadline_extension_rejected', projectId);
}

async function sendDisputeResolvedCreatorEmail({ creatorEmail, creatorName, freelancerName, projectId, disputeId, serviceTitle, resolution, adminNote, amount }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'creator/disputeResolved.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    creator_username: creatorName,
    freelancer_username: freelancerName,
    order_id: String(projectId || disputeId),
    service_title: serviceTitle || 'your order',
    resolution: resolution || 'Dispute has been resolved',
    admin_note: adminNote || 'No additional notes',
    currency: CURRENCY,
    amount: amount != null ? Number(amount).toFixed(2) : '—',
    dispute_url: `${APP_URL}/creator/disputes`,
    order_url: `${APP_URL}/creator/your-projects`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(creatorEmail, `Dispute resolved — Order #${projectId || disputeId}`, filled, null, 'dispute_resolved_creator', projectId);
}

async function sendDisputeResolvedFreelancerEmail({ freelancerEmail, freelancerName, creatorName, projectId, disputeId, serviceTitle, resolution, adminNote, amount }) {
  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'freelancer/disputeResolved.html'),
    'utf8'
  );
  const filled = fillTemplate(html, {
    freelancer_username: freelancerName,
    creator_username: creatorName,
    order_id: String(projectId || disputeId),
    service_title: serviceTitle || 'your order',
    resolution: resolution || 'Dispute has been resolved',
    admin_note: adminNote || 'No additional notes',
    currency: CURRENCY,
    amount: amount != null ? Number(amount).toFixed(2) : '—',
    dispute_url: `${APP_URL}/freelancer/disputes`,
    order_url: `${APP_URL}/freelancer/projects`,
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });
  await sendMail(freelancerEmail, `Dispute resolved — Order #${projectId || disputeId}`, filled, null, 'dispute_resolved_freelancer', projectId);
}

module.exports = {
  sendDeliverySubmittedEmail,
  sendDeliveryReceivedEmail,
  sendCreatorRatingRequestEmail,
  sendFreelancerRatingRequestEmail,
  sendOrderApprovedEmail,
  sendCreatorDisputeEmail,
  sendFreelancerDisputeEmail,
  sendPaymentConfirmedEmail,
  sendOrderActivatedEmail,
  sendDeadlineExtensionRequestEmail,
  sendDeadlineExtensionAcceptedEmail,
  sendDeadlineExtensionRejectedEmail,
  sendDisputeResolvedCreatorEmail,
  sendDisputeResolvedFreelancerEmail,
};
