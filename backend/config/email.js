const nodemailer = require("nodemailer");
const { pool: db } = require('./dbConfig');
const { getLogger } = require('../utils/logger');
const logger = getLogger('email');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SERVER_HOST,
  port: process.env.EMAIL_SERVER_PORT,
  auth: {
    user: process.env.EMAIL_SERVER_USER,
    pass: process.env.SERVER_PASSWORD,
  },
});

const sendMail = async (to, subject, content, pdfAttachment = null, emailType = null, projectId = null) => {
  const mailOptions = {
    from: process.env.EMAIL_SERVER_USER,
    to,
    subject,
    html: content,
  };

  // Add PDF attachment if provided
  if (pdfAttachment) {
    mailOptions.attachments = [pdfAttachment];
  }

  try {
    await transporter.sendMail(mailOptions);
    
    // Log success to database if emailType provided
    if (emailType) {
      db.query(
        `INSERT INTO email_logs (email_type, recipient_email, project_id, status)
         VALUES ($1, $2, $3, 'sent')`,
        [emailType, to, projectId]
      ).catch(err => logger.error(`Failed to log email success to database: ${err.message}`));
    }
    
    logger.info(`Email sent successfully: type=${emailType || 'unknown'}, to=${to}, project_id=${projectId || 'N/A'}`);
  } catch (error) {
    // Log failure to database if emailType provided
    if (emailType) {
      db.query(
        `INSERT INTO email_logs (email_type, recipient_email, project_id, status, error_message)
         VALUES ($1, $2, $3, 'failed', $4)`,
        [emailType, to, projectId, error.message]
      ).catch(err => logger.error(`Failed to log email failure to database: ${err.message}`));
    }
    
    logger.error(`Email send failed: type=${emailType || 'unknown'}, to=${to}, error=${error.message}`);
    throw error;
  }
};





// const sendBatchMail = async (recipients, subject, html, options = {}) => {
//   const {
//     batchSize = 10,           // Number of emails to send per batch
//     delayBetweenBatches = 1000, // Delay in milliseconds between batches
//     pdfAttachment = null,     // Optional PDF attachment for all emails
//     personalizedFields = {},  // Object to personalize emails per recipient
//     onProgress = null,        // Callback function for progress updates
//     onError = null           // Callback function for error handling
//   } = options;

//   // Validate inputs
//   if (!Array.isArray(recipients) || recipients.length === 0) {
//     throw new Error('Recipients must be a non-empty array');
//   }

//   // Split recipients into batches
//   const batches = [];
//   for (let i = 0; i < recipients.length; i += batchSize) {
//     batches.push(recipients.slice(i, i + batchSize));
//   }

//   const results = {
//     success: true,
//     totalSent: 0,
//     totalFailed: 0,
//     results: [],
//     errors: []
//   };

//   logger.info(`Starting batch email send: ${recipients.length} recipients in ${batches.length} batches`);

//   // Process each batch
//   for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
//     const batch = batches[batchIndex];
//     logger.info(`Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} emails)`);

//     // Send emails in parallel within the batch
//     const batchPromises = batch.map(async (recipient) => {
//       try {
//         // Personalize content if personalizedFields provided
//         let personalizedHtml = html;
//         let personalizedSubject = subject;

//         if (personalizedFields[recipient.email] || recipient.personalData) {
//           const data = personalizedFields[recipient.email] || recipient.personalData || {};
//           personalizedHtml = personalizeContent(html, data);
//           // logger.info(personalizedHtml, 'personalizedHtml');
//           personalizedSubject = subject;
//         }
//         logger.info(personalizedHtml, 'personalizedHtml');
//         await sendMail(
//           recipient.email,
//           personalizedSubject,
//           personalizedHtml,
//           pdfAttachment
//         );

//         return {
//           email: recipient.email,
//           status: 'sent',
//           batchIndex: batchIndex + 1
//         };
//       } catch (error) {
//         const errorResult = {
//           email: recipient.email,
//           status: 'failed',
//           error: error.message,
//           batchIndex: batchIndex + 1
//         };

//         if (onError) {
//           onError(errorResult);
//           //  logger.info(errorResult, 'errorResult');
//         }

//         return errorResult;
//       }
//     });

//     // Wait for all emails in the batch to complete
//     const batchResults = await Promise.allSettled(batchPromises);

//     // Process batch results
//     batchResults.forEach((result) => {
//       if (result.status === 'fulfilled') {
//         const emailResult = result.value;
//         results.results.push(emailResult);

//         if (emailResult.status === 'sent') {
//           results.totalSent++;
//         } else {
//           results.totalFailed++;
//           results.errors.push(emailResult);
//         }
//       } else {
//         results.totalFailed++;
//         results.errors.push({
//           email: 'unknown',
//           status: 'failed',
//           error: result.reason?.message || 'Unknown error',
//           batchIndex: batchIndex + 1
//         });
//       }
//     });

//     // Progress callback
//     if (onProgress) {
//       onProgress({
//         batchIndex: batchIndex + 1,
//         totalBatches: batches.length,
//         batchSize: batch.length,
//         totalSent: results.totalSent,
//         totalFailed: results.totalFailed,
//         completed: ((batchIndex + 1) / batches.length) * 100
//       });
//     }

//     // Delay between batches (except for the last batch)
//     if (batchIndex < batches.length - 1 && delayBetweenBatches > 0) {
//       await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
//     }
//   }

//   // Set overall success based on results
//   results.success = results.totalFailed === 0;

//   logger.info(`Batch email send completed:`);
//   logger.info(`- Total sent: ${results.totalSent}`);
//   logger.info(`- Total failed: ${results.totalFailed}`);

//   return results;
// };



// // Helper function to personalize content
// const personalizeContent = (content, data) => {
//   let personalizedContent = content;
//   logger.info(content, data);
//   // Replace placeholders like {{name}}, {{company}}, etc.
//   Object.keys(data).forEach(key => {
//     const placeholder = new RegExp(`{${key}}`, 'g');
//     personalizedContent = personalizedContent.replace(placeholder, data[key] || '');
//   });

//   return personalizedContent;
// };

module.exports = { sendMail };
