const fs = require('fs');
const path = require('path');
const { sendMail } = require('../config/email');
const { query } = require('../config/dbConfig');

const TEMPLATES_DIR = path.join(__dirname, '../../Email-Templates');

const APP_URL       = process.env.APP_URL       || 'https://meetrub.com';
const LOGO_URL      = process.env.LOGO_URL      || `${APP_URL}/logo.png`;
const HELP_URL      = process.env.HELP_URL      || `${APP_URL}/help`;
const PRIVACY_URL   = process.env.PRIVACY_URL   || `${APP_URL}/privacy`;

function fillTemplate(html, vars) {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value ?? ''),
    html
  );
}

async function sendWelcomeEmail(role, email, username) {
  if (role === 'freelancer') {
    const html = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'freelancer/welcom.html'),
      'utf8'
    );
    const filled = fillTemplate(html, {
      freelancer_username: username,
      setup_url:           `${APP_URL}/freelancer/setup`,
      logo_url:            LOGO_URL,
      help_url:            HELP_URL,
      privacy_url:         PRIVACY_URL,
      });
    await sendMail(email, 'Welcome to Meetrub — complete your profile', filled);

  } else if (role === 'creator') {
    const html = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'creator/welcome.html'),
      'utf8'
    );
    const filled = fillTemplate(html, {
      creator_username:   username,
      dashboard_url:      `${APP_URL}/creator/dashboard`,
      how_it_works_url:   `${APP_URL}/how-it-works`,
      logo_url:           LOGO_URL,
      help_url:           HELP_URL,
      privacy_url:        PRIVACY_URL,
      unsubscribe_url:    UNSUBSCRIBE_URL,
    });
    await sendMail(email, 'Welcome to Meetrub — start hiring freelancers', filled);
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
    user_email:     userEmail,
    user_type:      role,
    signup_time:    signupTime,
    ip_address:     ipAddress || '—',
    admin_user_url: `${APP_ADMIN_URL}/users`,
    logo_url:       LOGO_URL,
    help_url:       HELP_URL,
    privacy_url:    PRIVACY_URL,
    unsubscribe_url: UNSUBSCRIBE_URL,
  });

  await Promise.all(
    adminRes.rows.map((admin) =>
      sendMail(admin.user_email, `New ${role} registered — ${username}`, filled)
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
    order_id:            projectId ? String(projectId) : '—',
    creator_username:    creatorName,
    creator_email:       creatorEmail,
    freelancer_username: freelancerName,
    freelancer_email:    freelancerEmail,
    service_title:       serviceTitle || '—',
    currency:            process.env.CURRENCY || '₹',
    amount:              amount != null ? Number(amount).toFixed(2) : '—',
    dispute_reason:      disputeReason,
    dispute_time:        new Intl.DateTimeFormat('en-IN', {
                           dateStyle: 'medium',
                           timeStyle: 'short',
                           timeZone: 'Asia/Kolkata',
                         }).format(new Date()),
    admin_dispute_url:   `${APP_ADMIN_URL}/disputes/${disputeId}`,
    admin_chat_url:      `${APP_ADMIN_URL}/disputes/${disputeId}/chat`,
    logo_url:            LOGO_URL,
    help_url:            HELP_URL,
    privacy_url:         PRIVACY_URL,
  });

  await Promise.all(
    adminRes.rows.map((admin) =>
      sendMail(admin.user_email, `New dispute raised — #${disputeId}`, filled)
    )
  );
}

module.exports = { sendWelcomeEmail, sendAdminNewUserEmail, sendAdminDisputeEmail };
