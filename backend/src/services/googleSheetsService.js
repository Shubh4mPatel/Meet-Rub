/**
 * Google Sheets integration for the freelancer roster.
 *
 * Auth uses a Google service account (JWT -> OAuth access token) and talks to
 * the Sheets REST API directly, so no extra npm dependency is required.
 *
 * Required env vars:
 *   GOOGLE_SHEETS_CLIENT_EMAIL     - service account email
 *   GOOGLE_SHEETS_PRIVATE_KEY      - service account private key (with \n escaped)
 *   GOOGLE_SHEETS_SPREADSHEET_ID   - the target spreadsheet ID (from its URL)
 *   GOOGLE_SHEETS_TAB              - (optional) freelancer tab name, defaults to "Freelancers"
 *   GOOGLE_SHEETS_CREATORS_TAB    - (optional) creator tab name, defaults to "Creators"
 *
 * If these are not set, every function no-ops with a warning so registration
 * (which fires these in the background) is never affected.
 */
const crypto = require('crypto');
const { logger } = require('../../utils/logger');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

// Column order for the freelancer sheet — keep header and row-builder in sync.
const HEADER = [
  'Freelancer ID',
  'Full Name',
  'Username',
  'Email',
  'Phone',
  'Niches',
  'PAN',
  'Verification Status',
  'Registered Via',
  'Signup Date',
];

// Column order for the creator sheet.
const CREATOR_HEADER = [
  'Creator ID',
  'Full Name',
  'Username',
  'Email',
  'Phone',
  'Niches',
  'Social Links',
  'Registered Via',
  'Signup Date',
];

const getConfig = () => ({
  clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
  // Support both real newlines and the common \n-escaped form used in .env files.
  privateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  tab: process.env.GOOGLE_SHEETS_TAB || 'Freelancers',
  creatorsTab: process.env.GOOGLE_SHEETS_CREATORS_TAB || 'Creators',
});

const isConfigured = () => {
  const { clientEmail, privateKey, spreadsheetId } = getConfig();
  return Boolean(clientEmail && privateKey && spreadsheetId);
};

// ── Auth ────────────────────────────────────────────────────────────────────
let cachedToken = null; // { token, expiresAt }

function buildSignedJwt(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(claim)}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const { clientEmail, privateKey } = getConfig();
  const assertion = buildSignedJwt(clientEmail, privateKey);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to obtain Google access token');
  }
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

// ── Sheets helpers ───────────────────────────────────────────────────────────
async function sheetsFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_API}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Sheets API error (${res.status})`);
  }
  return data;
}

// Map a freelancer record (from DB or registration) to a sheet row.
function buildFreelancerRow(f = {}) {
  const niches = Array.isArray(f.niche) ? f.niche.join(', ') : (f.niche || '');
  const signupDate = f.created_at ? new Date(f.created_at).toISOString().slice(0, 10) : '';
  return [
    f.freelancer_id ?? '',
    f.full_name || f.freelancer_full_name || '',
    f.user_name || '',
    f.email || f.freelancer_email || '',
    f.phone_number || '',
    niches,
    f.pan_card_number || '',
    f.verification_status || 'PENDING',
    f.registered_via || 'OTP',
    signupDate,
  ];
}

// Format a social_links value (JSON object or string) into "key: value" pairs.
function formatSocialLinks(social) {
  if (!social) return '';
  let obj = social;
  if (typeof social === 'string') {
    try { obj = JSON.parse(social); } catch { return social; }
  }
  if (Array.isArray(obj)) return obj.filter(Boolean).join(', ');
  if (obj && typeof obj === 'object') {
    return Object.entries(obj)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return String(obj);
}

// Map a creator record (from DB or registration) to a sheet row.
function buildCreatorRow(c = {}) {
  const niches = Array.isArray(c.niche) ? c.niche.join(', ') : (c.niche || '');
  const signupDate = c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '';
  return [
    c.creator_id ?? '',
    c.full_name || '',
    c.user_name || '',
    c.email || '',
    c.phone_number || '',
    niches,
    formatSocialLinks(c.social_links),
    c.registered_via || 'OTP',
    signupDate,
  ];
}

// Append one or more rows to the bottom of the given tab.
async function appendRows(rows, tab) {
  const { spreadsheetId } = getConfig();
  const range = encodeURIComponent(`${tab}!A1`);
  await sheetsFetch(
    `${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: rows }) }
  );
}

// Overwrite a whole tab with a header + the given rows (used for backfill).
async function replaceAll(rows, tab, header) {
  const { spreadsheetId } = getConfig();
  await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(tab)}:clear`, { method: 'POST', body: '{}' });
  const range = encodeURIComponent(`${tab}!A1`);
  await sheetsFetch(
    `${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values: [header, ...rows] }) }
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a single freelancer to the sheet. Safe to call fire-and-forget from
 * registration flows — it resolves quietly (logging) when Sheets isn't set up.
 */
async function appendFreelancerToSheet(freelancer) {
  if (!isConfigured()) {
    logger.warn('Google Sheets not configured — skipping freelancer sheet append');
    return;
  }
  await appendRows([buildFreelancerRow(freelancer)], getConfig().tab);
  logger.info(`Freelancer ${freelancer.freelancer_id} added to Google Sheet`);
}

/** Replace the freelancer tab with the full list of freelancers (backfill). */
async function syncAllFreelancers(freelancers) {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured. Set GOOGLE_SHEETS_* env vars first.');
  }
  const rows = freelancers.map(buildFreelancerRow);
  await replaceAll(rows, getConfig().tab, HEADER);
  logger.info(`Synced ${rows.length} freelancers to Google Sheet`);
  return rows.length;
}

/**
 * Append a single creator to the Creators tab. Safe to call fire-and-forget
 * from registration flows — resolves quietly when Sheets isn't set up.
 */
async function appendCreatorToSheet(creator) {
  if (!isConfigured()) {
    logger.warn('Google Sheets not configured — skipping creator sheet append');
    return;
  }
  await appendRows([buildCreatorRow(creator)], getConfig().creatorsTab);
  logger.info(`Creator ${creator.creator_id} added to Google Sheet`);
}

/** Replace the creator tab with the full list of creators (backfill). */
async function syncAllCreators(creators) {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured. Set GOOGLE_SHEETS_* env vars first.');
  }
  const rows = creators.map(buildCreatorRow);
  await replaceAll(rows, getConfig().creatorsTab, CREATOR_HEADER);
  logger.info(`Synced ${rows.length} creators to Google Sheet`);
  return rows.length;
}

module.exports = {
  HEADER,
  CREATOR_HEADER,
  isConfigured,
  buildFreelancerRow,
  buildCreatorRow,
  appendFreelancerToSheet,
  syncAllFreelancers,
  appendCreatorToSheet,
  syncAllCreators,
};
