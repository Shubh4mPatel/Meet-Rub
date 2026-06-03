const { pool: db } = require('../../config/dbConfig');

/**
 * Generates the next sequential invoice number atomically.
 * 
 * @param {object} client - PostgreSQL client (from pool.connect()) for transaction safety
 * @param {string} invoiceType - 'FREELANCER_SERVICE' or 'PLATFORM_COMMISSION'
 * @returns {string} Invoice number e.g. "MR-2026-00142" or "MR-PLT-2026-00142"
 */
const generateInvoiceNumber = async (client, invoiceType) => {
  const year = new Date().getFullYear();

  // Atomic upsert + increment
  const { rows } = await client.query(
    `INSERT INTO invoice_counters (year, invoice_type, last_number)
     VALUES ($1, $2, 1)
     ON CONFLICT (year, invoice_type)
     DO UPDATE SET last_number = invoice_counters.last_number + 1
     RETURNING last_number`,
    [year, invoiceType]
  );

  const sequenceNumber = rows[0].last_number;
  const paddedNumber = String(sequenceNumber).padStart(5, '0');

  if (invoiceType === 'PLATFORM_COMMISSION') {
    return `MR-PLT-${year}-${paddedNumber}`;
  }

  return `MR-${year}-${paddedNumber}`;
};

module.exports = { generateInvoiceNumber };
