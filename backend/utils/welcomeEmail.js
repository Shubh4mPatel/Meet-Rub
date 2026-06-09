const fs = require('fs');
const path = require('path');
const { sendMail } = require('../config/email');
const { query } = require('../config/dbConfig');

const TEMPLATES_DIR = path.join(__dirname, '../../Email-Templates');

const APP_URL = process.env.APP_URL || 'https://meetrub.com';
const LOGO_SVG_PATH = path.join(__dirname, '../../Email-Templates/assets/logo-large.svg');
const LOGO_URL = process.env.LOGO_URL ||
  `data:image/svg+xml;base64,${fs.readFileSync(LOGO_SVG_PATH).toString('base64')}`;
const HELP_URL = process.env.HELP_URL || `${APP_URL}/help`;
const PRIVACY_URL = process.env.PRIVACY_URL || `${APP_URL}/privacy`;

function fillTemplate(html, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ''),
    html
  );
}

async function sendWelcomeEmail(role, email, username) {
  if (role === 'freelancer') {
    const html = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'freelancer/welcome.html'),
      'utf8'
    );
    const filled = fillTemplate(html, {
      freelancer_username: username,
      setup_url: `${APP_URL}/freelancer/setup`,
      logo_url: LOGO_URL,
      help_url: HELP_URL,
      privacy_url: PRIVACY_URL,
    });
    await sendMail(email, 'Welcome to Meetrub — complete your profile', filled, null, 'welcome_freelancer', null);

  } else if (role === 'creator') {
    const html = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'creator/welcome.html'),
      'utf8'
    );
    const filled = fillTemplate(html, {
      creator_username: username,
      dashboard_url: `${APP_URL}/creator/dashboard`,
      how_it_works_url: `${APP_URL}/how-it-works`,
      logo_url: LOGO_URL,
      help_url: HELP_URL,
      privacy_url: PRIVACY_URL,
    });
    await sendMail(email, 'Welcome to Meetrub — start hiring freelancers', filled, null, 'welcome_creator', null);
  }
}

async function sendAdminNewUserEmail(role, username, userEmail, signupTime, ipAddress) {
  const adminRes = await query("SELECT user_email FROM users WHERE user_role = 'admin'");
  if (adminRes.rows.length === 0) return;

  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'admin/newUser.html'),
    'utf8'
  );

  const APP_ADMIN_URL = process.env.APP_ADMIN_URL || `${APP_URL}/admin`;

  const filled = fillTemplate(html, {
    username,
    user_email: userEmail,
    user_type: role,
    signup_time: signupTime,
    ip_address: ipAddress || '—',
    admin_user_url: `${APP_ADMIN_URL}/users`,
    logo_url: LOGO_URL,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });

  await Promise.all(
    adminRes.rows.map((admin) =>
      sendMail(admin.user_email, `New ${role} registered — ${username}`, filled, null, 'admin_new_user', null)
    )
  );
}

async function sendAdminDisputeEmail({
  disputeId,
  projectId,
  creatorName,
  creatorEmail,
  freelancerName,
  freelancerEmail,
  serviceTitle,
  amount,
  disputeReason,
}) {
  const adminRes = await query("SELECT user_email FROM users WHERE user_role = 'admin'");
  if (adminRes.rows.length === 0) return;

  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'admin/disputeRaised.html'),
    'utf8'
  );

  const APP_ADMIN_URL = process.env.APP_ADMIN_URL || `${APP_URL}/admin`;

  const filled = fillTemplate(html, {
    order_id: projectId ? String(projectId) : '—',
    creator_username: creatorName,
    creator_email: creatorEmail,
    freelancer_username: freelancerName,
    freelancer_email: freelancerEmail,
    service_title: serviceTitle || '—',
    currency: process.env.CURRENCY || '₹',
    amount: amount != null ? Number(amount).toFixed(2) : '—',
    dispute_reason: disputeReason,
    dispute_time: new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
    admin_dispute_url: `${APP_ADMIN_URL}/disputes/${disputeId}`,
    admin_chat_url: `${APP_ADMIN_URL}/disputes/${disputeId}/chat`,
    logo_url: LOGO_URL,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });

  await Promise.all(
    adminRes.rows.map((admin) =>
      sendMail(admin.user_email, `New dispute raised — #${disputeId}`, filled, null, 'admin_dispute_raised', projectId)
    )
  );
}

async function sendContactInquiryEmail({ name, email, contactNo, message }, recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) return;

  const html = fs.readFileSync(
    path.join(TEMPLATES_DIR, 'admin/contactInquiry.html'),
    'utf8'
  );

  // Email clients (Gmail especially) strip data: URIs and don't render SVG,
  // so the logo and social icons are referenced as hosted PNGs under
  // {asset_base}/email/. Defaults to the public site.
  const ASSET_BASE = process.env.EMAIL_ASSET_BASE_URL || APP_URL;

  const filled = fillTemplate(html, {
    sender_name: name,
    sender_email: email,
    sender_contact: contactNo || '—',
    message: message || '—',
    submitted_time: new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
    asset_base: ASSET_BASE,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });

  await Promise.all(
    recipients.map((to) =>
      sendMail(to, `New Contact Form Submission from ${name}`, filled, null, 'admin_contact_inquiry', null)
    )
  );
}

async function sendAccountSuspendedEmail(role, { email, username, reason }) {
  const templatePath = role === 'freelancer'
    ? path.join(TEMPLATES_DIR, 'freelancer/accountSuspended.html')
    : path.join(TEMPLATES_DIR, 'creator/accountSuspended.html');

  const html = fs.readFileSync(templatePath, 'utf8');

  const filled = fillTemplate(html, {
    username,
    email,
    reason_for_suspension: reason,
    logo_url: LOGO_URL,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });

  const subject = role === 'freelancer'
    ? 'Your MeetRub freelancer account has been suspended'
    : 'Your MeetRub creator account has been suspended';

  await sendMail(email, subject, filled, null, 'account_suspended', null);
}

async function sendAccountRestoredEmail(role, { email, username }) {
  const templatePath = role === 'freelancer'
    ? path.join(TEMPLATES_DIR, 'freelancer/accountUnsuspended.html')
    : path.join(TEMPLATES_DIR, 'creator/accountUnsuspended.html');

  const html = fs.readFileSync(templatePath, 'utf8');

  const filled = fillTemplate(html, {
    username,
    email,
    logo_url: LOGO_URL,
    help_url: HELP_URL,
    privacy_url: PRIVACY_URL,
  });

  const subject = role === 'freelancer'
    ? 'Your MeetRub freelancer account has been restored'
    : 'Your MeetRub creator account has been restored';

  await sendMail(email, subject, filled, null, 'account_restored', null);
}

module.exports = {
  sendWelcomeEmail,
  sendAdminNewUserEmail,
  sendAdminDisputeEmail,
  sendContactInquiryEmail,
  sendAccountSuspendedEmail,
  sendAccountRestoredEmail
};
