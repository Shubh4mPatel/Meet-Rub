const { pool: db } = require('../../config/dbConfig');
const { minioClient } = require('../../config/minio');
const { sendMail } = require('../../config/email');
const { generateInvoiceNumber } = require('./invoiceNumberGenerator');
const { generateFreelancerInvoicePDF, generatePlatformInvoicePDF } = require('./invoiceGenerator');
const { getLogger } = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const logger = getLogger('invoice-service');

const INVOICE_BUCKET = process.env.INVOICE_MINIO_BUCKET || 'invoices';
const TEMPLATES_DIR = path.join(__dirname, '../../../Email-Templates');

// Platform details from env
const PLATFORM_CONFIG = {
  companyName: process.env.BIZKRO_COMPANY_NAME || 'Bizkro',
  address: process.env.BIZKRO_ADDRESS || 'Soho Building, E-328, Industrial Area, Sector 75, Sahibzada Ajit Singh Nagar, Mohali, Punjab 140307',
  gstin: process.env.BIZKRO_GSTIN || '03ERDPK4252C2ZA',
  state: process.env.BIZKRO_STATE || 'Punjab',
  sacCode: process.env.MEETRUB_SAC_CODE || '998314',
  email: process.env.MEETRUB_BILLING_EMAIL || 'billing@meetrub.com',
  website: process.env.MEETRUB_WEBSITE || 'www.meetrub.com',
};

const LOGO_PATH = process.env.MEETRUB_LOGO_PATH || path.join(__dirname, '../../../assets/logo-large.png');

/**
 * Ensures the invoice MinIO bucket exists
 */
async function ensureInvoiceBucket() {
  try {
    const exists = await minioClient.bucketExists(INVOICE_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(INVOICE_BUCKET);
      logger.info(`Invoice bucket '${INVOICE_BUCKET}' created`);
    }
  } catch (err) {
    logger.error(`Failed to ensure invoice bucket: ${err.message}`);
    throw err;
  }
}

/**
 * Upload a PDF buffer to MinIO
 * @returns {string} object key
 */
async function uploadPDFToMinio(buffer, invoiceNumber) {
  await ensureInvoiceBucket();

  const year = new Date().getFullYear();
  const objectKey = `${year}/${invoiceNumber}.pdf`;

  await minioClient.putObject(INVOICE_BUCKET, objectKey, buffer, buffer.length, {
    'Content-Type': 'application/pdf',
  });

  logger.info(`Uploaded invoice PDF: ${objectKey}`);
  return objectKey;
}

/**
 * Build freelancer address string from row data
 */
function buildFreelancerAddress(row) {
  const parts = [];
  if (row.street_address) parts.push(row.street_address);
  if (row.city) parts.push(row.city);
  if (row.freelancer_state) parts.push(row.freelancer_state);
  if (row.postal_code) parts.push(row.postal_code);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Format date for display
 */
function formatDisplayDate(date) {
  const d = new Date(date);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
}

/**
 * Main function: Generate both invoices, store in MinIO, save to DB, and email to creator
 * 
 * @param {number} projectId - The project/order ID
 */
async function generateAndSendInvoices(projectId) {
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Fetch all required data
    const { rows: dataRows } = await client.query(
      `SELECT p.id AS project_id, p.amount, p.status, p.created_at AS project_created_at,
              t.id AS transaction_id, t.total_amount, t.platform_commission, t.freelancer_amount,
              f.freelancer_id, f.freelancer_full_name, f.user_name AS freelancer_username,
              f.freelancer_email, f.street_address, f.city, f.state AS freelancer_state,
              f.postal_code, f.pan_card_number,
              c.creator_id, c.full_name AS creator_name, c.email AS creator_email,
              c.user_name AS creator_username,
              s.service_name
       FROM projects p
       JOIN transactions t ON t.project_id = p.id AND t.status = 'HELD'
       JOIN freelancer f ON p.freelancer_id = f.freelancer_id
       JOIN creators c ON p.creator_id = c.creator_id
       LEFT JOIN services s ON p.service_id = s.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (dataRows.length === 0) {
      throw new Error(`No valid project/transaction data found for project ${projectId}`);
    }

    const row = dataRows[0];
    const issuedAt = new Date();
    const totalAmount = Number(row.total_amount);
    const platformCommission = totalAmount * 0.20;
    const freelancerAmount = totalAmount - platformCommission;
    const cgstAmount = Number((platformCommission * 0.09).toFixed(2));
    const sgstAmount = Number((platformCommission * 0.09).toFixed(2));
    const totalGst = cgstAmount + sgstAmount;
    const grandTotal = Number((platformCommission + totalGst).toFixed(2));

    // ── Generate invoice numbers ──
    const freelancerInvoiceNumber = await generateInvoiceNumber(client, 'FREELANCER_SERVICE');
    const platformInvoiceNumber = await generateInvoiceNumber(client, 'PLATFORM_COMMISSION');

    const serviceTitle = row.service_name || 'Service';

    // ── Generate PDFs ──
    const freelancerPdfBuffer = await generateFreelancerInvoicePDF({
      invoiceNumber: freelancerInvoiceNumber,
      issuedAt,
      projectId,
      freelancerName: row.freelancer_full_name,
      freelancerUsername: row.freelancer_username,
      freelancerAddress: buildFreelancerAddress(row),
      freelancerGst: null, // GST field not in current schema
      creatorName: row.creator_name,
      creatorUsername: row.creator_username,
      creatorAddress: null,
      creatorGst: null, // GST field not in current schema
      serviceTitle,
      freelancerAmount,
      logoPath: LOGO_PATH,
    });

    const platformPdfBuffer = await generatePlatformInvoicePDF({
      invoiceNumber: platformInvoiceNumber,
      issuedAt,
      projectId,
      creatorName: row.creator_name,
      creatorUsername: row.creator_username,
      creatorAddress: null,
      creatorState: null,
      creatorGst: null,
      freelancerName: row.freelancer_full_name,
      freelancerUsername: row.freelancer_username,
      serviceTitle,
      totalServicePrice: totalAmount,
      platformCommission,
      cgstAmount,
      sgstAmount,
      totalGst,
      grandTotal,
      logoPath: LOGO_PATH,
      platform: PLATFORM_CONFIG,
      deliveryDate: formatDisplayDate(issuedAt),
    });

    // ── Upload to MinIO ──
    const freelancerPdfKey = await uploadPDFToMinio(freelancerPdfBuffer, freelancerInvoiceNumber);
    const platformPdfKey = await uploadPDFToMinio(platformPdfBuffer, platformInvoiceNumber);

    // ── Insert invoice records ──
    await client.query(
      `INSERT INTO invoices (invoice_number, invoice_type, project_id, transaction_id, creator_id, freelancer_id, subtotal, cgst_amount, sgst_amount, total_amount, pdf_storage_path, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [freelancerInvoiceNumber, 'FREELANCER_SERVICE', projectId, row.transaction_id, row.creator_id, row.freelancer_id, freelancerAmount, 0, 0, freelancerAmount, freelancerPdfKey, issuedAt]
    );

    await client.query(
      `INSERT INTO invoices (invoice_number, invoice_type, project_id, transaction_id, creator_id, freelancer_id, subtotal, cgst_amount, sgst_amount, total_amount, pdf_storage_path, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [platformInvoiceNumber, 'PLATFORM_COMMISSION', projectId, row.transaction_id, row.creator_id, row.freelancer_id, platformCommission, cgstAmount, sgstAmount, grandTotal, platformPdfKey, issuedAt]
    );

    await client.query('COMMIT');

    // ── Send TWO separate emails ──
    // Email 1: Freelancer invoice (from freelancer context)
    await sendFreelancerInvoiceEmail({
      creatorEmail: row.creator_email,
      creatorName: row.creator_name,
      freelancerName: row.freelancer_full_name,
      serviceTitle,
      projectId,
      freelancerPdfBuffer,
      freelancerInvoiceNumber,
    });

    // Email 2: Platform invoice (from Meetrub)
    await sendPlatformInvoiceEmail({
      creatorEmail: row.creator_email,
      creatorName: row.creator_name,
      freelancerName: row.freelancer_full_name,
      serviceTitle,
      projectId,
      platformPdfBuffer,
      platformInvoiceNumber,
    });

    logger.info(`Invoices generated and sent for project ${projectId}: ${freelancerInvoiceNumber}, ${platformInvoiceNumber}`);

    return {
      freelancerInvoiceNumber,
      platformInvoiceNumber,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error(`Invoice generation failed for project ${projectId}: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Send the freelancer service invoice email to the creator
 */
async function sendFreelancerInvoiceEmail({ creatorEmail, creatorName, freelancerName, serviceTitle, projectId, freelancerPdfBuffer, freelancerInvoiceNumber }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2>Service Invoice — From ${freelancerName}</h2>
      <p>Hi ${creatorName},</p>
      <p>Please find attached the service invoice from <strong>${freelancerName}</strong> for the work completed on order <strong>#${projectId}</strong> (${serviceTitle}).</p>
      <p>This invoice covers the freelancer's service fee (80% of order value).</p>
      <p>This invoice is for your records. No further action is required.</p>
      <br>
      <p>Thank you for using Meetrub!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #999;">This is an automated email sent on behalf of ${freelancerName} via Meetrub. Please do not reply.</p>
    </body>
    </html>
  `;

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: process.env.EMAIL_SERVER_PORT,
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.SERVER_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"${freelancerName} via Meetrub" <${process.env.EMAIL_SERVER_USER}>`,
    to: creatorEmail,
    subject: `Service Invoice from ${freelancerName} — Order #${projectId}`,
    html,
    attachments: [
      {
        filename: `${freelancerInvoiceNumber}.pdf`,
        content: freelancerPdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  db.query(
    `INSERT INTO email_logs (email_type, recipient_email, project_id, status) VALUES ($1, $2, $3, 'sent')`,
    ['freelancer_invoice', creatorEmail, projectId]
  ).catch(err => logger.error(`Failed to log freelancer invoice email: ${err.message}`));
}

/**
 * Send the platform commission invoice email to the creator (from Meetrub)
 */
async function sendPlatformInvoiceEmail({ creatorEmail, creatorName, freelancerName, serviceTitle, projectId, platformPdfBuffer, platformInvoiceNumber }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2>Platform Invoice — From Meetrub</h2>
      <p>Hi ${creatorName},</p>
      <p>Please find attached the platform facilitation fee invoice from <strong>Meetrub (Bizkro)</strong> for order <strong>#${projectId}</strong> (${serviceTitle}).</p>
      <p>This invoice covers the 20% platform commission + GST (CGST 9% + SGST 9%).</p>
      <p>This invoice is for your records. No further action is required.</p>
      <br>
      <p>Thank you for using Meetrub!</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #999;">This is an automated email from Meetrub. Please do not reply.</p>
    </body>
    </html>
  `;

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: process.env.EMAIL_SERVER_PORT,
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.SERVER_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `"Meetrub Billing" <${process.env.MEETRUB_BILLING_EMAIL || process.env.EMAIL_SERVER_USER}>`,
    to: creatorEmail,
    subject: `Platform Invoice from Meetrub — Order #${projectId}`,
    html,
    attachments: [
      {
        filename: `${platformInvoiceNumber}.pdf`,
        content: platformPdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  db.query(
    `INSERT INTO email_logs (email_type, recipient_email, project_id, status) VALUES ($1, $2, $3, 'sent')`,
    ['platform_invoice', creatorEmail, projectId]
  ).catch(err => logger.error(`Failed to log platform invoice email: ${err.message}`));
}

module.exports = { generateAndSendInvoices };
