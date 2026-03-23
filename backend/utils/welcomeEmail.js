const fs = require('fs');
const path = require('path');
const { sendMail } = require('../config/email');

const TEMPLATES_DIR = path.join(__dirname, '../../Email-Templates');

const APP_URL       = process.env.APP_URL       || 'https://meetrub.com';
const LOGO_URL      = process.env.LOGO_URL      || `${APP_URL}/logo.png`;
const HELP_URL      = process.env.HELP_URL      || `${APP_URL}/help`;
const PRIVACY_URL   = process.env.PRIVACY_URL   || `${APP_URL}/privacy`;
const UNSUBSCRIBE_URL = process.env.UNSUBSCRIBE_URL || `${APP_URL}/unsubscribe`;

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
      unsubscribe_url:     UNSUBSCRIBE_URL,
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

module.exports = { sendWelcomeEmail };
