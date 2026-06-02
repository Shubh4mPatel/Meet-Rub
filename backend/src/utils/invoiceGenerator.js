const PDFDocument = require('pdfkit');

// Colors
const COLORS = {
  black: '#000000',
  darkGray: '#333333',
  gray: '#666666',
  lightGray: '#999999',
  borderGray: '#DDDDDD',
  purple: '#7C3AED',
  green: '#16A34A',
  orange: '#EA580C',
  white: '#FFFFFF',
  tableHeader: '#F9FAFB',
  footerBg: '#F97316',
};

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────────

function drawHorizontalLine(doc, y, startX, endX, color = COLORS.borderGray) {
  doc.strokeColor(color).lineWidth(0.5).moveTo(startX, y).lineTo(endX, y).stroke();
}

function formatCurrency(amount) {
  return `Rs. ${Number(amount).toFixed(2)}`;
}

// ─── FREELANCER → CREATOR INVOICE (Invoice 1) ──────────────────────────────────

/**
 * Generates the freelancer service invoice PDF
 * @param {object} data
 * @param {string} data.invoiceNumber
 * @param {Date} data.issuedAt
 * @param {number} data.projectId
 * @param {string} data.freelancerName
 * @param {string} data.freelancerUsername
 * @param {string} data.freelancerAddress - combined address string
 * @param {string|null} data.freelancerGst
 * @param {string} data.creatorName
 * @param {string} data.creatorUsername
 * @param {string|null} data.creatorAddress
 * @param {string|null} data.creatorGst
 * @param {string} data.serviceTitle
 * @param {number} data.freelancerAmount - the 80% amount (what freelancer earns)
 * @param {string|null} data.logoPath - path to logo image
 * @returns {Promise<Buffer>}
 */
function generateFreelancerInvoicePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const marginLeft = 50;
      const marginRight = pageWidth - 50;
      const contentWidth = marginRight - marginLeft;

      let y = 50;

      // ── HEADER ──
      doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.black).text('Invoice', marginLeft, y);

      // Logo placeholder (top-right)
      if (data.logoPath) {
        try {
          doc.image(data.logoPath, marginRight - 100, y, { width: 100 });
        } catch (e) {
          doc.fontSize(9).font('Helvetica').fillColor(COLORS.orange)
            .text('[ INSERT LOGO HERE ]', marginRight - 120, y + 10);
        }
      } else {
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.orange)
          .text('[ INSERT LOGO HERE ]', marginRight - 120, y + 10);
      }

      y += 50;

      // ── META INFO ──
      const metaLabelX = marginLeft;
      const metaValueX = marginLeft + 130;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray);
      doc.text('Invoice number', metaLabelX, y);
      doc.font('Helvetica').fillColor(COLORS.darkGray).text(data.invoiceNumber, metaValueX, y);
      y += 16;

      doc.font('Helvetica').fillColor(COLORS.gray).text('Date of issue', metaLabelX, y);
      doc.fillColor(COLORS.darkGray).text(formatDate(data.issuedAt), metaValueX, y);
      y += 16;

      doc.fillColor(COLORS.gray).text('Processed via', metaLabelX, y);
      doc.fillColor(COLORS.darkGray).text('Meetrub Platform', metaValueX, y);
      y += 16;

      doc.fillColor(COLORS.gray).text('Project ID', metaLabelX, y);
      doc.fillColor(COLORS.darkGray).text(String(data.projectId), metaValueX, y);
      y += 30;

      // ── FROM / BILL TO ──
      const halfWidth = contentWidth / 2;

      // From (Freelancer)
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.black)
        .text(data.freelancerName, marginLeft, y);
      y += 14;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.purple)
        .text(`@${data.freelancerUsername}`, marginLeft, y);

      // Bill to label (right side)
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray)
        .text('Bill to', marginLeft + halfWidth, y - 14);

      // Bill to: Creator
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.black)
        .text(data.creatorName, marginLeft + halfWidth, y - 14 + 14);

      const billToStartY = y;
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.purple)
        .text(`@${data.creatorUsername}`, marginLeft + halfWidth, billToStartY);

      y += 14;

      // Freelancer address
      if (data.freelancerAddress) {
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray)
          .text(data.freelancerAddress, marginLeft, y, { width: halfWidth - 20 });
        y += doc.heightOfString(data.freelancerAddress, { width: halfWidth - 20 });
      }

      doc.text('India', marginLeft, y);
      y += 14;

      if (data.freelancerGst) {
        doc.text(`IN GST ${data.freelancerGst} ( Freelancer GST)`, marginLeft, y);
        y += 14;
      }

      // Creator address (right side)
      let creatorY = billToStartY + 14;
      if (data.creatorAddress) {
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray)
          .text(data.creatorAddress, marginLeft + halfWidth, creatorY, { width: halfWidth - 20 });
        creatorY += doc.heightOfString(data.creatorAddress, { width: halfWidth - 20 });
      }

      if (data.creatorGst) {
        creatorY += 14;
        doc.text(`IN GST ${data.creatorGst} ( Creator GST)`, marginLeft + halfWidth, creatorY);
      } else {
        creatorY += 14;
        doc.text('IN GST Unregistered ( Creator GST)', marginLeft + halfWidth, creatorY);
      }

      y = Math.max(y, creatorY) + 30;

      // ── LINE ITEMS TABLE ──
      drawHorizontalLine(doc, y, marginLeft, marginRight);
      y += 8;

      // Table header
      const descX = marginLeft;
      const qtyX = marginRight - 180;
      const unitPriceX = marginRight - 120;
      const amountX = marginRight - 50;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.gray);
      doc.text('Description', descX, y);
      doc.text('Qty', qtyX, y);
      doc.text('Unit price', unitPriceX, y);
      doc.text('Amount', amountX, y);
      y += 16;

      drawHorizontalLine(doc, y, marginLeft, marginRight);
      y += 10;

      // Line item
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black)
        .text(data.serviceTitle, descX, y, { width: qtyX - descX - 10 });
      doc.font('Helvetica').fillColor(COLORS.darkGray)
        .text('1', qtyX, y)
        .text(formatCurrency(data.freelancerAmount), unitPriceX, y)
        .text(formatCurrency(data.freelancerAmount), amountX, y);

      y += 30;

      // ── DISCLAIMER + SUBTOTAL ──
      drawHorizontalLine(doc, y, marginLeft, marginRight);
      y += 15;

      // Disclaimer (left side)
      const disclaimerText = `This invoice is issued by the freelancer for services\nrendered.\nProcessed via Meetrub platform. Meetrub is not a party to\nthis transaction and bears no liability for this invoice.`;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
        .text(disclaimerText, marginLeft, y, { width: halfWidth - 20 });

      // Sub Total (right side)
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.black)
        .text('Sub Total', marginLeft + halfWidth + 40, y);
      doc.text(formatCurrency(data.freelancerAmount), amountX - 20, y, { align: 'right', width: 80 });

      y += 80;

      // ── FOOTER ──
      const footerY = doc.page.height - 80;
      drawHorizontalLine(doc, footerY, marginLeft, marginRight, COLORS.borderGray);

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray);
      const footerText = `This invoice is issued by ${data.freelancerName} (@${data.freelancerUsername}) for services rendered on the Meetrub platform.\nMeetrub is not a party to this transaction and bears no liability for payment or disputes arising from this invoice.   ·   © ${new Date().getFullYear()} Meetrub.`;
      doc.text(footerText, marginLeft, footerY + 10, { width: contentWidth, align: 'left' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── PLATFORM COMMISSION INVOICE (Invoice 2) ────────────────────────────────────

/**
 * Generates the Meetrub platform commission + GST invoice PDF
 * @param {object} data
 * @param {string} data.invoiceNumber
 * @param {Date} data.issuedAt
 * @param {number} data.projectId
 * @param {string} data.creatorName
 * @param {string} data.creatorUsername
 * @param {string|null} data.creatorAddress
 * @param {string|null} data.creatorState
 * @param {string|null} data.creatorGst
 * @param {string} data.freelancerName
 * @param {string} data.freelancerUsername
 * @param {string} data.serviceTitle
 * @param {number} data.totalServicePrice - full order amount (100%)
 * @param {number} data.platformCommission - 20% of total (the subtotal before GST)
 * @param {number} data.cgstAmount - 9% of commission
 * @param {number} data.sgstAmount - 9% of commission
 * @param {number} data.totalGst
 * @param {number} data.grandTotal - commission + GST
 * @param {string|null} data.logoPath
 * @param {object} data.platform - Platform/Bizkro details
 * @param {string} data.platform.companyName
 * @param {string} data.platform.address
 * @param {string} data.platform.gstin
 * @param {string} data.platform.state
 * @param {string} data.platform.sacCode
 * @param {string} data.platform.email
 * @param {string} data.platform.website
 * @param {string} data.deliveryDate
 * @returns {Promise<Buffer>}
 */
function generatePlatformInvoicePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const marginLeft = 50;
      const marginRight = pageWidth - 50;
      const contentWidth = marginRight - marginLeft;
      const halfWidth = contentWidth / 2;

      let y = 50;

      // ── HEADER ──
      doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.black).text('Invoice', marginLeft, y);

      // Logo placeholder
      if (data.logoPath) {
        try {
          doc.image(data.logoPath, marginRight - 100, y, { width: 100 });
        } catch (e) {
          doc.fontSize(9).font('Helvetica').fillColor(COLORS.orange)
            .text('[ INSERT LOGO HERE ]', marginRight - 120, y + 10);
        }
      } else {
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.orange)
          .text('[ INSERT LOGO HERE ]', marginRight - 120, y + 10);
      }

      y += 50;

      // ── META INFO ──
      const metaLabelX = marginLeft;
      const metaValueX = marginLeft + 130;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray);
      doc.text('Invoice number', metaLabelX, y);
      doc.font('Helvetica-Bold').fillColor(COLORS.darkGray).text(data.invoiceNumber, metaValueX, y);
      y += 16;

      doc.font('Helvetica').fillColor(COLORS.gray).text('Date of issue', metaLabelX, y);
      doc.fillColor(COLORS.darkGray).text(formatDate(data.issuedAt), metaValueX, y);
      y += 16;

      doc.fillColor(COLORS.gray).text('Project  ID', metaLabelX, y);
      doc.fillColor(COLORS.darkGray).text(String(data.projectId), metaValueX, y);
      y += 16;

      doc.fillColor(COLORS.gray).text('Invoice type', metaLabelX, y);
      doc.font('Helvetica-Bold').fillColor(COLORS.green).text('Platform Commission + GST', metaValueX, y);
      y += 16;

      doc.font('Helvetica').fillColor(COLORS.gray).text('GST issued by', metaLabelX, y);
      doc.font('Helvetica-Bold').fillColor(COLORS.green)
        .text(`${data.platform.companyName} (parent company of Meetrub)`, metaValueX, y);
      y += 16;

      doc.font('Helvetica').fillColor(COLORS.gray).text('Bizkro GSTIN:', metaLabelX, y);
      doc.fillColor(COLORS.darkGray).text(data.platform.gstin, metaValueX, y);
      y += 30;

      // ── FROM (Bizkro) / BILL TO (Creator) ──
      // Bizkro
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.black)
        .text(data.platform.companyName, marginLeft, y);
      y += 14;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray)
        .text(data.platform.address, marginLeft, y, { width: halfWidth - 20 });
      const addrHeight = doc.heightOfString(data.platform.address, { width: halfWidth - 20 });

      // Bill to header (right)
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray)
        .text('Bill to', marginLeft + halfWidth, y - 14);
      doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.black)
        .text(data.creatorName, marginLeft + halfWidth, y);

      let creatorY = y + 14;
      doc.fontSize(9).font('Helvetica').fillColor(COLORS.purple)
        .text(`@${data.creatorUsername}`, marginLeft + halfWidth, creatorY);
      creatorY += 14;

      if (data.creatorAddress) {
        doc.fillColor(COLORS.gray).text(data.creatorAddress, marginLeft + halfWidth, creatorY, { width: halfWidth - 20 });
        creatorY += doc.heightOfString(data.creatorAddress, { width: halfWidth - 20 });
      }

      if (data.creatorState) {
        doc.text(data.creatorState, marginLeft + halfWidth, creatorY);
        creatorY += 14;
      }

      doc.text('India', marginLeft + halfWidth, creatorY);
      creatorY += 14;

      if (data.creatorGst) {
        doc.text(`IN GST  ${data.creatorGst} ( Creator GST)`, marginLeft + halfWidth, creatorY);
      } else {
        doc.text('IN GST  Unregistered ( Creator GST)', marginLeft + halfWidth, creatorY);
      }
      creatorY += 14;

      y += addrHeight;
      doc.text('India', marginLeft, y);
      y += 14;
      doc.text(`IN GST  ${data.platform.gstin}`, marginLeft, y);
      y += 14;

      doc.text('GST issued by:', marginLeft, y);
      y += 14;
      doc.font('Helvetica-Bold').fillColor(COLORS.green).text(data.platform.companyName, marginLeft, y);
      y += 14;
      doc.font('Helvetica').fillColor(COLORS.gray).text('Parent company of Meetrub', marginLeft, y);
      y += 14;
      doc.font('Helvetica-Bold').fillColor(COLORS.darkGray)
        .text(`GSTIN: ${data.platform.gstin}`, marginLeft, y);

      y = Math.max(y, creatorY) + 30;

      // ── PROJECT & FREELANCER DETAILS TABLE ──
      drawHorizontalLine(doc, y, marginLeft, marginRight, COLORS.purple);
      y += 10;

      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.purple)
        .text('Project & Freelancer Details', marginLeft, y);
      y += 20;

      const detailLabelX = marginLeft + 10;
      const detailValueX = marginLeft + 160;

      const detailRows = [
        ['Service title', data.serviceTitle],
        ['Freelancer name', data.freelancerName],
        ['Freelancer handle', `@${data.freelancerUsername}`],
        ['Project ID', String(data.projectId)],
        ['Service price', `${formatCurrency(data.totalServicePrice)} (full order value)`],
        ['Delivery date', data.deliveryDate],
        ['Order status', 'Completed — Approved by creator'],
      ];

      for (const [label, value] of detailRows) {
        doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray).text(label, detailLabelX, y);
        doc.font('Helvetica-Bold').fillColor(COLORS.darkGray).text(value, detailValueX, y);
        y += 18;
      }

      y += 15;

      // ── GRAND TOTAL (large) ──
      doc.fontSize(22).font('Helvetica-Bold').fillColor(COLORS.black)
        .text(formatCurrency(data.grandTotal), marginLeft, y);
      y += 28;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.gray)
        .text(`Platform commission (20%) + GST — Meetrub facilitation fee on Order ${data.projectId}`, marginLeft, y);
      y += 25;

      // ── LINE ITEMS TABLE ──
      drawHorizontalLine(doc, y, marginLeft, marginRight);
      y += 8;

      const descX = marginLeft;
      const qtyX = marginRight - 180;
      const unitPriceX = marginRight - 120;
      const amountX = marginRight - 50;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.gray);
      doc.text('Description', descX, y);
      doc.text('Qty', qtyX, y);
      doc.text('Unit price', unitPriceX, y);
      doc.text('Amount', amountX, y);
      y += 16;

      drawHorizontalLine(doc, y, marginLeft, marginRight);
      y += 10;

      // Platform facilitation fee
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black)
        .text('Platform facilitation fee', descX, y);
      doc.font('Helvetica').fillColor(COLORS.darkGray)
        .text('1', qtyX, y)
        .text(formatCurrency(data.platformCommission), unitPriceX, y)
        .text(formatCurrency(data.platformCommission), amountX, y);
      y += 14;

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
        .text(`20% commission on service price of ${formatCurrency(data.totalServicePrice)}`, descX, y);
      y += 12;
      doc.text(`SAC ${data.platform.sacCode} — Online marketplace services`, descX, y);
      y += 20;

      // CGST
      drawHorizontalLine(doc, y, marginLeft, marginRight, COLORS.borderGray);
      y += 10;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black)
        .text('CGST @ 9%', descX, y);
      doc.font('Helvetica').fillColor(COLORS.darkGray)
        .text('1', qtyX, y)
        .text(formatCurrency(data.cgstAmount), unitPriceX, y)
        .text(formatCurrency(data.cgstAmount), amountX, y);
      y += 14;

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
        .text(`Central GST on platform commission of ${formatCurrency(data.platformCommission)}`, descX, y);
      y += 20;

      // SGST
      drawHorizontalLine(doc, y, marginLeft, marginRight, COLORS.borderGray);
      y += 10;

      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black)
        .text('SGST @ 9%', descX, y);
      doc.font('Helvetica').fillColor(COLORS.darkGray)
        .text('1', qtyX, y)
        .text(formatCurrency(data.sgstAmount), unitPriceX, y)
        .text(formatCurrency(data.sgstAmount), amountX, y);
      y += 14;

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
        .text(`State GST on platform commission of ${formatCurrency(data.platformCommission)}`, descX, y);
      y += 25;

      drawHorizontalLine(doc, y, marginLeft, marginRight);
      y += 15;

      // ── NOTE + TOTALS ──
      // Note (left)
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.orange).text('Note:', marginLeft, y);
      y += 14;

      const noteText = `GST is charged only on Meetrub's commission\n(20%), not on the full service price.\nFormula: ${formatCurrency(data.totalServicePrice)} × 20% × 18% = ${formatCurrency(data.totalGst)} GST\nCreator total: ${formatCurrency(data.totalServicePrice)} + ${formatCurrency(data.totalGst)} = ${formatCurrency(data.totalServicePrice + data.totalGst)}\n(${formatCurrency(data.totalServicePrice - data.platformCommission)} freelancer + ${formatCurrency(data.grandTotal)} Meetrub)`;

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray)
        .text(noteText, marginLeft, y, { width: halfWidth - 30 });

      // Totals (right side)
      const totalsX = marginLeft + halfWidth + 20;
      const totalsValX = marginRight - 60;
      let totalsY = y;

      doc.fontSize(9).font('Helvetica').fillColor(COLORS.darkGray)
        .text('Subtotal', totalsX, totalsY);
      doc.text(formatCurrency(data.platformCommission), totalsValX, totalsY, { width: 70, align: 'right' });
      totalsY += 18;

      doc.text('CGST @ 9%', totalsX, totalsY);
      doc.text(formatCurrency(data.cgstAmount), totalsValX, totalsY, { width: 70, align: 'right' });
      totalsY += 18;

      doc.text('SGST @ 9%', totalsX, totalsY);
      doc.text(formatCurrency(data.sgstAmount), totalsValX, totalsY, { width: 70, align: 'right' });
      totalsY += 18;

      doc.text('Total GST', totalsX, totalsY);
      doc.text(formatCurrency(data.totalGst), totalsValX, totalsY, { width: 70, align: 'right' });
      totalsY += 22;

      drawHorizontalLine(doc, totalsY, totalsX, marginRight);
      totalsY += 10;

      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.black)
        .text('Total', totalsX, totalsY);
      doc.text(formatCurrency(data.grandTotal), totalsValX, totalsY, { width: 70, align: 'right' });

      // ── FOOTER BAR ──
      const footerY = doc.page.height - 60;
      doc.rect(marginLeft - 10, footerY, contentWidth + 20, 1).fill(COLORS.orange);

      doc.fontSize(7).font('Helvetica').fillColor(COLORS.gray);
      const footerLine = `Meetrub  ·  ${data.platform.address}  ·  ${data.platform.email}  ·  ${data.platform.website}`;
      doc.text(footerLine, marginLeft, footerY + 8, { width: contentWidth, align: 'center' });

      doc.fontSize(7).text(
        `GSTIN: ${data.platform.gstin}  ·  Computer generated invoice  ·  © ${new Date().getFullYear()} Meetrub. All rights reserved.`,
        marginLeft, footerY + 20, { width: contentWidth, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── DATE FORMATTER ─────────────────────────────────────────────────────────────

function formatDate(date) {
  const d = new Date(date);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
}

module.exports = {
  generateFreelancerInvoicePDF,
  generatePlatformInvoicePDF,
};
