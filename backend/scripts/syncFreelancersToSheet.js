/**
 * One-time backfill: push every existing freelancer into the Google Sheet.
 *
 * Usage (from the backend/backend directory, so it reads the same .env):
 *   node scripts/syncFreelancersToSheet.js
 *
 * Requires the GOOGLE_SHEETS_* env vars to be set (see services/googleSheetsService.js).
 * This REPLACES the sheet contents with a fresh header + all freelancers.
 */
require('dotenv').config();

const { query, pool } = require('../config/dbConfig');
const { syncAllFreelancers, isConfigured } = require('../src/services/googleSheetsService');

(async () => {
  try {
    if (!isConfigured()) {
      console.error('❌ Google Sheets is not configured. Set GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY and GOOGLE_SHEETS_SPREADSHEET_ID first.');
      process.exit(1);
    }

    const { rows } = await query(
      `SELECT f.freelancer_id, f.freelancer_full_name, f.user_name, f.freelancer_email,
              f.phone_number, f.niche, f.pan_card_number, f.verification_status, f.created_at,
              u.auth_provider
       FROM freelancer f
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at ASC NULLS LAST`
    );

    const freelancers = rows.map((f) => ({
      freelancer_id: f.freelancer_id,
      full_name: f.freelancer_full_name,
      user_name: f.user_name,
      email: f.freelancer_email,
      phone_number: f.phone_number,
      niche: f.niche,
      pan_card_number: f.pan_card_number,
      verification_status: f.verification_status,
      registered_via: f.auth_provider === 'google' ? 'Google' : 'OTP',
      created_at: f.created_at,
    }));

    const count = await syncAllFreelancers(freelancers);
    console.log(`✅ Synced ${count} freelancers to the Google Sheet.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to sync freelancers to Google Sheet:', err.message);
    process.exit(1);
  } finally {
    try { await pool.end(); } catch (_) { /* ignore */ }
  }
})();
