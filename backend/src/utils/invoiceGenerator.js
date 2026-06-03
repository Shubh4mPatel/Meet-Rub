const PDFDocument = require('pdfkit');
const path = require('path');

// Colors - black only as requested
const COLORS = {
  black: '#000000',
  gray: '#555555',
  lightGray: '#888888',
  borderGray: '#CCCCCC',
};

function drawLine(doc, y, startX, endX) {
  doc.strokeColor(COLORS.borderGray).lineWidth(0.5).moveTo(startX, y).lineTo(endX, y).stroke();
}

function formatCurrency(amount) {
  return `Rs. ${Number(amount).toFixed(2)}`;
}

function formatDate(date) {
  const d = new Date(date);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`;
}

// ─── FREELANCER → CREATOR INVOICE ───────────────────────────────────────────────

function generateFreelancerInvoicePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      // Prevent auto page additions
      doc.on('pageAdded', () => { /* no-op, we control pages */ });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const ML = 50; // margin left
      const MR = doc.page.width - 50; // margin right
      const CW = MR - ML; // content width
      const HW = CW / 2;

      let y = 50;

      // ── HEADER ──
      doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.black);
      doc.text('Invoice', ML, y, { lineBreak: false });

      if (data.logoPath) {
        try { doc.image(data.logoPath, MR - 80, y, { width: 80 }); }
        catch (e) { doc.fontSize(9).text('Meetrub', MR - 55, y + 8, { lineBreak: false }); }
      } else {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black);
        doc.text('Meetrub', MR - 55, y + 8, { lineBreak: false });
      }

      y += 40;

      // ── META ──
      const VX = ML + 120; // value x
      const meta = [
        ['Invoice number', data.invoiceNumber],
        ['Date of issue', formatDate(data.issuedAt)],
        ['Processed via', 'Meetrub Platform'],
        ['Project ID', String(data.projectId)],
      ];
      doc.fontSize(8).font('Helvetica');
      for (const [label, val] of meta) {
        doc.fillColor(COLORS.gray).text(label, ML, y, { lineBreak: false });
        doc.fillColor(COLORS.black).text(val, VX, y, { lineBreak: false });
        y += 14;
      }
      y += 10;

      // ── FROM / BILL TO ──
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text(data.freelancerName, ML, y, { lineBreak: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray);
      doc.text('Bill to', ML + HW, y, { lineBreak: false });
      y += 13;

      doc.fillColor(COLORS.black).text(`@${data.freelancerUsername}`, ML, y, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.black);
      doc.text(data.creatorName, ML + HW, y, { lineBreak: false });
      y += 13;

      doc.fontSize(8).font('Helvetica').fillColor(COLORS.black);
      doc.text(`@${data.creatorUsername}`, ML + HW, y, { lineBreak: false });

      if (data.freelancerAddress) {
        doc.fillColor(COLORS.gray).text(data.freelancerAddress, ML, y, { lineBreak: false });
      }
      y += 12;

      doc.fillColor(COLORS.gray).text('India', ML, y, { lineBreak: false });
      if (data.creatorAddress) {
        doc.text(data.creatorAddress, ML + HW, y, { lineBreak: false });
      }
      y += 12;

      if (data.freelancerGst) {
        doc.text(`IN GST ${data.freelancerGst} (Freelancer GST)`, ML, y, { lineBreak: false });
      }
      const creatorGstText = data.creatorGst
        ? `IN GST ${data.creatorGst} (Creator GST)`
        : 'IN GST Unregistered (Creator GST)';
      doc.text(creatorGstText, ML + HW, y, { lineBreak: false });
      y += 25;

      // ── TABLE ──
      drawLine(doc, y, ML, MR);
      y += 8;

      const QX = MR - 150;
      const UX = MR - 100;
      const AX = MR - 45;

      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.gray);
      doc.text('Description', ML, y, { lineBreak: false });
      doc.text('Qty', QX, y, { lineBreak: false });
      doc.text('Unit price', UX, y, { lineBreak: false });
      doc.text('Amount', AX, y, { lineBreak: false });
      y += 14;
      drawLine(doc, y, ML, MR);
      y += 10;

      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text(data.serviceTitle, ML, y, { lineBreak: false });
      doc.font('Helvetica');
      doc.text('1', QX, y, { lineBreak: false });
      doc.text(formatCurrency(data.freelancerAmount), UX, y, { lineBreak: false });
      doc.text(formatCurrency(data.freelancerAmount), AX, y, { lineBreak: false });
      y += 25;

      drawLine(doc, y, ML, MR);
      y += 12;

      // Disclaimer + Sub Total
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.gray);
      doc.text('This invoice is issued by the freelancer for services', ML, y, { lineBreak: false });
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text('Sub Total', ML + HW + 30, y, { lineBreak: false });
      doc.text(formatCurrency(data.freelancerAmount), AX - 5, y, { lineBreak: false });
      y += 11;

      doc.fontSize(7).font('Helvetica').fillColor(COLORS.gray);
      doc.text('rendered.', ML, y, { lineBreak: false });
      y += 11;
      doc.text('Processed via Meetrub platform. Meetrub is not a party to', ML, y, { lineBreak: false });
      y += 11;
      doc.text('this transaction and bears no liability for this invoice.', ML, y, { lineBreak: false });

      // ── FOOTER ──
      const FY = 740;
      drawLine(doc, FY, ML, MR);
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.gray);
      doc.text(`This invoice is issued by ${data.freelancerName} (@${data.freelancerUsername}) for services rendered on the Meetrub platform.`, ML, FY + 8, { lineBreak: false });
      doc.text(`Meetrub is not a party to this transaction and bears no liability for payment or disputes arising from this invoice.   ·   © ${new Date().getFullYear()} Meetrub.`, ML, FY + 19, { lineBreak: false });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── PLATFORM COMMISSION INVOICE ─────────────────────────────────────────────────

function generatePlatformInvoicePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
      doc.on('pageAdded', () => { /* no-op */ });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const ML = 50;
      const MR = doc.page.width - 50;
      const CW = MR - ML;
      const HW = CW / 2;

      let y = 50;

      // ── HEADER ──
      doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.black);
      doc.text('Invoice', ML, y, { lineBreak: false });

      if (data.logoPath) {
        try { doc.image(data.logoPath, MR - 80, y, { width: 80 }); }
        catch (e) { doc.fontSize(9).text('Meetrub', MR - 55, y + 8, { lineBreak: false }); }
      } else {
        doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black);
        doc.text('Meetrub', MR - 55, y + 8, { lineBreak: false });
      }

      y += 38;

      // ── META ──
      const VX = ML + 120;
      const metaRows = [
        ['Invoice number', data.invoiceNumber],
        ['Date of issue', formatDate(data.issuedAt)],
        ['Project ID', String(data.projectId)],
        ['Invoice type', 'Platform Commission + GST'],
        ['GST issued by', `${data.platform.companyName} (parent company of Meetrub)`],
        ['Bizkro GSTIN:', data.platform.gstin],
      ];
      doc.fontSize(8).font('Helvetica');
      for (const [label, val] of metaRows) {
        doc.fillColor(COLORS.gray).text(label, ML, y, { lineBreak: false });
        doc.font('Helvetica-Bold').fillColor(COLORS.black).text(val, VX, y, { lineBreak: false });
        doc.font('Helvetica');
        y += 13;
      }
      y += 10;

      // ── FROM / BILL TO ──
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text(data.platform.companyName, ML, y, { lineBreak: false });
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray);
      doc.text('Bill to', ML + HW, y, { lineBreak: false });
      y += 12;

      // Bizkro address (left) - use explicit lines to avoid auto-wrap
      const addrLines = data.platform.address.split(',').map(s => s.trim());
      doc.fontSize(7).fillColor(COLORS.gray);
      for (let i = 0; i < Math.min(addrLines.length, 3); i++) {
        doc.text(addrLines.slice(i * 2, i * 2 + 2).join(', '), ML, y, { lineBreak: false });
        y += 10;
      }
      // Reset y for the left side continuation
      let leftY = y;
      doc.text('India', ML, leftY, { lineBreak: false });
      leftY += 10;
      doc.text(`IN GST ${data.platform.gstin}`, ML, leftY, { lineBreak: false });
      leftY += 10;
      doc.font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text(`GSTIN: ${data.platform.gstin}`, ML, leftY, { lineBreak: false });

      // Creator (right side)
      let rY = y - 30; // align with start of address
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text(data.creatorName, ML + HW, rY, { lineBreak: false });
      rY += 12;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.black);
      doc.text(`@${data.creatorUsername}`, ML + HW, rY, { lineBreak: false });
      rY += 11;
      if (data.creatorAddress) {
        doc.fillColor(COLORS.gray).text(data.creatorAddress, ML + HW, rY, { lineBreak: false });
        rY += 11;
      }
      if (data.creatorState) {
        doc.text(data.creatorState, ML + HW, rY, { lineBreak: false });
        rY += 11;
      }
      doc.text('India', ML + HW, rY, { lineBreak: false });
      rY += 11;
      const cGst = data.creatorGst ? `IN GST ${data.creatorGst} (Creator GST)` : 'IN GST Unregistered (Creator GST)';
      doc.text(cGst, ML + HW, rY, { lineBreak: false });

      y = Math.max(leftY, rY) + 20;

      // ── PROJECT & FREELANCER DETAILS ──
      drawLine(doc, y, ML, MR);
      y += 7;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text('Project & Freelancer Details', ML, y, { lineBreak: false });
      y += 15;

      const DVX = ML + 140;
      const details = [
        ['Service title', data.serviceTitle],
        ['Freelancer name', data.freelancerName],
        ['Freelancer handle', `@${data.freelancerUsername}`],
        ['Project ID', String(data.projectId)],
        ['Service price', `${formatCurrency(data.totalServicePrice)} (full order value)`],
        ['Delivery date', data.deliveryDate],
        ['Order status', 'Completed — Approved by creator'],
      ];
      doc.fontSize(8).font('Helvetica');
      for (const [label, val] of details) {
        doc.fillColor(COLORS.gray).text(label, ML + 5, y, { lineBreak: false });
        doc.font('Helvetica-Bold').fillColor(COLORS.black).text(val, DVX, y, { lineBreak: false });
        doc.font('Helvetica');
        y += 13;
      }
      y += 8;

      // ── GRAND TOTAL ──
      doc.fontSize(18).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text(formatCurrency(data.grandTotal), ML, y, { lineBreak: false });
      y += 22;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.gray);
      doc.text(`Platform commission (20%) + GST — Meetrub facilitation fee on Order ${data.projectId}`, ML, y, { lineBreak: false });
      y += 16;

      // ── LINE ITEMS ──
      drawLine(doc, y, ML, MR);
      y += 6;
      const QX = MR - 150;
      const UX = MR - 100;
      const AX = MR - 45;

      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.gray);
      doc.text('Description', ML, y, { lineBreak: false });
      doc.text('Qty', QX, y, { lineBreak: false });
      doc.text('Unit price', UX, y, { lineBreak: false });
      doc.text('Amount', AX, y, { lineBreak: false });
      y += 12;
      drawLine(doc, y, ML, MR);
      y += 8;

      // Platform fee
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text('Platform facilitation fee', ML, y, { lineBreak: false });
      doc.font('Helvetica');
      doc.text('1', QX, y, { lineBreak: false });
      doc.text(formatCurrency(data.platformCommission), UX, y, { lineBreak: false });
      doc.text(formatCurrency(data.platformCommission), AX, y, { lineBreak: false });
      y += 11;
      doc.fontSize(7).fillColor(COLORS.gray);
      doc.text(`20% commission on service price of ${formatCurrency(data.totalServicePrice)}`, ML, y, { lineBreak: false });
      y += 9;
      doc.text(`SAC ${data.platform.sacCode} — Online marketplace services`, ML, y, { lineBreak: false });
      y += 13;

      // CGST
      drawLine(doc, y, ML, MR);
      y += 7;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text('CGST @ 9%', ML, y, { lineBreak: false });
      doc.font('Helvetica');
      doc.text('1', QX, y, { lineBreak: false });
      doc.text(formatCurrency(data.cgstAmount), UX, y, { lineBreak: false });
      doc.text(formatCurrency(data.cgstAmount), AX, y, { lineBreak: false });
      y += 11;
      doc.fontSize(7).fillColor(COLORS.gray);
      doc.text(`Central GST on platform commission of ${formatCurrency(data.platformCommission)}`, ML, y, { lineBreak: false });
      y += 13;

      // SGST
      drawLine(doc, y, ML, MR);
      y += 7;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text('SGST @ 9%', ML, y, { lineBreak: false });
      doc.font('Helvetica');
      doc.text('1', QX, y, { lineBreak: false });
      doc.text(formatCurrency(data.sgstAmount), UX, y, { lineBreak: false });
      doc.text(formatCurrency(data.sgstAmount), AX, y, { lineBreak: false });
      y += 11;
      doc.fontSize(7).fillColor(COLORS.gray);
      doc.text(`State GST on platform commission of ${formatCurrency(data.platformCommission)}`, ML, y, { lineBreak: false });
      y += 14;

      drawLine(doc, y, ML, MR);
      y += 10;

      // ── NOTE + TOTALS ──
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.black);
      doc.text('Note:', ML, y, { lineBreak: false });

      // Totals (right)
      const TX = ML + HW + 30;
      let tY = y;
      doc.fontSize(8).font('Helvetica').fillColor(COLORS.black);
      doc.text('Subtotal', TX, tY, { lineBreak: false });
      doc.text(formatCurrency(data.platformCommission), AX - 5, tY, { lineBreak: false });
      tY += 13;
      doc.text('CGST @ 9%', TX, tY, { lineBreak: false });
      doc.text(formatCurrency(data.cgstAmount), AX - 5, tY, { lineBreak: false });
      tY += 13;
      doc.text('SGST @ 9%', TX, tY, { lineBreak: false });
      doc.text(formatCurrency(data.sgstAmount), AX - 5, tY, { lineBreak: false });
      tY += 13;
      doc.text('Total GST', TX, tY, { lineBreak: false });
      doc.text(formatCurrency(data.totalGst), AX - 5, tY, { lineBreak: false });
      tY += 15;
      drawLine(doc, tY, TX, MR);
      tY += 8;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Total', TX, tY, { lineBreak: false });
      doc.text(formatCurrency(data.grandTotal), AX - 5, tY, { lineBreak: false });

      // Note text (left)
      y += 12;
      doc.fontSize(7).font('Helvetica').fillColor(COLORS.gray);
      doc.text(`GST is charged only on Meetrub's commission`, ML, y, { lineBreak: false });
      y += 10;
      doc.text('(20%), not on the full service price.', ML, y, { lineBreak: false });
      y += 10;
      doc.text(`Formula: ${formatCurrency(data.totalServicePrice)} x 20% x 18% = ${formatCurrency(data.totalGst)} GST`, ML, y, { lineBreak: false });
      y += 10;
      doc.text(`Creator total: ${formatCurrency(data.totalServicePrice)} + ${formatCurrency(data.totalGst)} = ${formatCurrency(data.totalServicePrice + data.totalGst)}`, ML, y, { lineBreak: false });
      y += 10;
      doc.text(`(${formatCurrency(data.totalServicePrice - data.platformCommission)} freelancer + ${formatCurrency(data.grandTotal)} Meetrub)`, ML, y, { lineBreak: false });

      // ── FOOTER ──
      const FY = 740;
      doc.rect(ML, FY, CW, 1).fill(COLORS.black);
      doc.fontSize(6).font('Helvetica').fillColor(COLORS.gray);
      doc.text(`Meetrub  ·  ${data.platform.address}  ·  ${data.platform.email}  ·  ${data.platform.website}`, ML, FY + 5, { lineBreak: false });
      doc.text(`GSTIN: ${data.platform.gstin}  ·  Computer generated invoice  ·  © ${new Date().getFullYear()} Meetrub. All rights reserved.`, ML, FY + 14, { lineBreak: false });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateFreelancerInvoicePDF,
  generatePlatformInvoicePDF,
};
