# Email Templates — URL Audit

> Base URL: `APP_URL` = `https://meetrub.com` (or `process.env.APP_URL`)
> Admin panel: `APP_ADMIN_URL` = `https://meetrub.com/admin` (or `process.env.APP_ADMIN_URL`)
>
> **Common footer URLs in every template (static, hardcoded):**
> | Purpose | URL |
> |---|---|
> | Help / Contact | `https://meetrub.com/contact-us` |
> | Privacy Policy | `https://meetrub.com/privacy-policy` |
> | Facebook | `https://www.facebook.com/people/Meetrub/61580564312674/?sk=reels_tab` |
> | Instagram | `https://www.instagram.com/meetrubofficial` |
> | YouTube | `https://www.youtube.com/@Meetrub` |

---

## Admin Templates

### 1. `admin/contactInquiry.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | User submits contact form |
| **Sender function** | `sendContactInquiryEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `mailto:{{sender_email}}` | User's submitted email address | CTA — "Reply to {name}" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New Contact Form Submission from {name}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{sender_name}}` | Submitter's name |
| `{{sender_email}}` | Submitter's email |
| `{{sender_contact}}` | Submitter's phone number |
| `{{message}}` | Message body |
| `{{submitted_time}}` | Current timestamp (IST) |

**Body copy:** "You have received a new inquiry through the website contact form." — followed by a data card showing Name, Email, Contact Number, and the message text.

---

### 2. `admin/disputeRaised.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | A dispute is raised on any order |
| **Sender function** | `sendAdminDisputeEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_dispute_url}}` | `https://meetrub.com/admin/disputes` | CTA — "Review Dispute" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New dispute raised — #{disputeId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{order_id}}` | `projectId` or `—` |
| `{{creator_username}}` | Creator's display name |
| `{{creator_email}}` | Creator's email |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{freelancer_email}}` | Freelancer's email |
| `{{service_title}}` | Service/package title |
| `{{currency}}` | `₹` |
| `{{amount}}` | Order amount (2 d.p.) |
| `{{dispute_reason}}` | Reason entered by the creator |
| `{{dispute_time}}` | Current timestamp (IST) |
| `{{admin_dispute_url}}` | `/admin/disputes` |

**Body copy:** Dispute summary card with both parties' details, order amount, reason, and timestamp. SLA note: "Resolve within 3 business days."

---

### 3. `admin/KYCSubmission.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | Freelancer submits KYC documents |
| **Sender function** | `sendAdminKYCSubmissionEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_kyc_url}}` | `https://meetrub.com/admin/freelancer-panel/kyc-requests` | CTA — "Review KYC" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `KYC submitted — {freelancerUsername}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{freelancer_email}}` | Freelancer's email |
| `{{admin_kyc_url}}` | `/admin/freelancer-panel/kyc-requests` |

**Body copy:** Notification to admin that a freelancer has submitted KYC documents for review.

---

### 4. `admin/newUser.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | New user signs up |
| **Sender function** | `sendAdminNewUserEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_user_url}}` | Creator: `/admin/creator-panel/all-creators` / Freelancer: `/admin/freelancer-panel/all-freelancers` | CTA — view user |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New {role} registered — {username}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{username}}` | User's display name |
| `{{user_email}}` | User's email |
| `{{user_type}}` | `creator` or `freelancer` |
| `{{signup_time}}` | Registration timestamp |
| `{{admin_user_url}}` | Role-based admin URL |

**Body copy:** Registration details card shown to admin — name, email, role, and signup time.

---

### 5. `admin/orderCreated.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | New order is created (payment confirmed) |
| **Sender function** | `sendAdminOrderCreatedEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_order_url}}` | `https://meetrub.com/admin/working-projects` | CTA — "View Order" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New order — #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{currency}}` | `₹` |
| `{{amount}}` | Order total (2 d.p.) |
| `{{platform_fee}}` | Platform fee (2 d.p.) |
| `{{deadline}}` | Order deadline |
| `{{admin_order_url}}` | `/admin/working-projects` |

**Body copy:** New order summary card with both parties, service title, amount, platform fee, and deadline.

---

### 6. `admin/WithdrawalRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | Freelancer requests a withdrawal |
| **Sender function** | `sendAdminWithdrawalRequestEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_withdrawal_url}}` | `https://meetrub.com/admin/payment-request` | CTA — "Process Withdrawal" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Withdrawal request — {freelancerUsername}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{freelancer_email}}` | Freelancer's email |
| `{{currency}}` | `₹` |
| `{{amount}}` | Requested withdrawal amount (2 d.p.) |
| `{{wallet_balance}}` | Current wallet balance (2 d.p.) |
| `{{bank_last4}}` | Last 4 digits of bank account |
| `{{kyc_status}}` | KYC status (default: `verified`) |
| `{{request_time}}` | Current timestamp (IST) |
| `{{admin_withdrawal_url}}` | `/admin/payment-request` |

**Body copy:** Withdrawal request details card — freelancer info, amount requested, wallet balance, linked bank account, and KYC status.

---

## Auth Templates

### 7. `auth/emailVerificationOtp.html`

| Field | Value |
|---|---|
| **Sent to** | Registering user |
| **Trigger** | User registers / requests email verification |
| **Sender function** | Auth controller (not in utils files) |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{help_url}}` | `https://meetrub.com/contact-us` | CTA + Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** *(set by auth controller — typically "Verify your Meetrub account")*

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{otp_code}}` | 6-digit OTP generated by auth controller |
| `{{help_url}}` | `https://meetrub.com/contact-us` |

**Body copy:** "Thank you for signing up with Meetrub! To complete your registration, please use the verification code below." — Displays OTP prominently. Security note: never share this code; Meetrub staff will never ask for it.

---

### 8. `auth/passwordResetOtp.html`

| Field | Value |
|---|---|
| **Sent to** | User requesting password reset |
| **Trigger** | Forgot password flow |
| **Sender function** | Auth controller (not in utils files) |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{help_url}}` | `https://meetrub.com/contact-us` | CTA + Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** *(set by auth controller — typically "Reset your Meetrub password")*

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{otp_code}}` | 6-digit OTP generated by auth controller |
| `{{help_url}}` | `https://meetrub.com/contact-us` |

**Body copy:** "We received a request to reset the password for your Meetrub account. Use the verification code below to proceed." — Displays OTP prominently. Security note: if you didn't request this, ignore the email; your password remains unchanged.

---

## Creator Templates

### 9. `creator/accountSuspended.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Admin suspends creator account |
| **Sender function** | `sendAccountSuspendedEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{help_url}}` | `https://meetrub.com/contact-us` | CTA — "Contact Admin" + Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your MeetRub creator account has been suspended`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{username}}` | Creator's display name |
| `{{email}}` | Creator's email |
| `{{reason_for_suspension}}` | Suspension reason text from admin |
| `{{help_url}}` | `https://meetrub.com/contact-us` |

**Body copy:** "Your Meetrub creator account has been temporarily suspended by our administrative team." — Lists what is blocked (login, orders, visibility) and steps to appeal. Includes a "Contact Admin" link (`help_url`) for assistance.

---

### 10. `creator/accountUnsuspended.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Admin restores suspended creator account |
| **Sender function** | `sendAccountRestoredEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dashboard_url}}` | `https://meetrub.com/creator/your-projects` | CTA — "Go to Dashboard" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your MeetRub creator account has been restored`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{username}}` | Creator's display name |
| `{{email}}` | Creator's email |
| `{{dashboard_url}}` | `/creator/your-projects` |

**Body copy:** "Great news! Your Meetrub creator account has been restored and you now have full access to all platform features." — Checkmark list: dashboard access, place orders, profile visibility, chat & manage projects.

---

### 11. `creator/deadlineExtensionRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer requests a deadline extension |
| **Sender function** | `sendDeadlineExtensionRequestEmail` — `backend/utils/deliveryEmails.js` + `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{extension_url}}` | `https://meetrub.com/creator/your-projects` | CTA — "Manage Extension" |
| `{{chat_url}}` | `https://meetrub.com/creator/chatbot?userId={freelancerUserId}` | CTA — "Open Chat" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Deadline extension requested — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{extension_time}}` | Requested extension duration |
| `{{current_deadline}}` | Current deadline date |
| `{{new_deadline}}` | Proposed new deadline date |
| `{{extension_url}}` | `/creator/your-projects` |

**Body copy:** Freelancer has requested a deadline extension. Shows current vs. proposed deadline. Note: "Please review the request and respond within 7 days. Extension requests expire after 7 days."

---

### 12. `creator/deliveryRecevied.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer submits a delivery |
| **Sender function** | `sendDeliveryReceivedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{project_url}}` | `https://meetrub.com/creator/your-projects` | CTA — "Review Delivery" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New delivery received — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{delivery_time}}` | Formatted submission timestamp |
| `{{delivery_message}}` | Optional note from freelancer |

**Body copy:** Notifies creator that their freelancer has submitted a delivery for review. Includes the freelancer's delivery message if provided.

---

### 13. `creator/disputeResolved.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Admin resolves a dispute |
| **Sender function** | `sendDisputeResolvedCreatorEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/creator/disputes` | CTA — "View Dispute" |
| `{{order_url}}` | `https://meetrub.com/creator/your-projects` | CTA — "View Order" |
| `{{support_url}}` | `https://meetrub.com/contact-us` | CTA — "Contact Support" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Dispute resolved — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` or `disputeId` |
| `{{service_title}}` | Service/package title |
| `{{resolution}}` | Admin's resolution verdict |
| `{{admin_note}}` | Admin's additional note |
| `{{currency}}` | `₹` |
| `{{amount}}` | Order amount (2 d.p.) |
| `{{dispute_url}}` | `/creator/disputes` |
| `{{order_url}}` | `/creator/your-projects` |
| `{{support_url}}` | `HELP_URL` (`/contact-us`) |

**Body copy:** "The Meetrub admin team has reviewed your dispute and made a final decision." — Shows resolution outcome, admin note, and amount. Support link for questions.

---

### 14. `creator/hierAccepted.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer accepts a hire request — creator must now complete payment |
| **Sender function** | `sendHireAcceptedEmail` — `backend/utils/offerEmails.js` + `chat-server/utils/offerEmails.js` |
| **Trigger paths** | Socket: `accept-package` handler in `chat-server/controller/chat.js`; REST: `accept-hire-request` in `projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{payment_url}}` | `https://meetrub.com/creator/chatbot?userId=${freelancerUserId}` | CTA — "Pay Now" → opens chat with freelancer |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `{freelancerName} accepted your hire request`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | creator's display name |
| `{{freelancer_username}}` | freelancer's display name |
| `{{service_title}}` | package/service title |
| `{{currency}}` | `₹` (env `CURRENCY`) |
| `{{amount}}` | offer amount formatted to 2 d.p. |
| `{{deadline}}` | `{deliveryDays} days` |
| `{{payment_url}}` | `/creator/chatbot?userId={freelancerUserId}` |

**Body copy:** "Great news! **{freelancer}** has accepted your hire request on Meetrub. To activate the order, please complete your payment. Your funds are held securely in escrow and released only after you approve the delivery."

---

### 15. `creator/hireDeclined.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer declines a hire request |
| **Sender function** | `sendHireDeclinedEmail` — `backend/utils/offerEmails.js` + `chat-server/utils/offerEmails.js` |
| **Trigger paths** | Socket: `reject-package` handler (creator-sent path) in `chat-server/controller/chat.js`; REST: `reject-hire-request` in `projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{browse_url}}` | `https://meetrub.com/creator/chatbot?userId={freelancerUserId}` | CTA — "Open Chat" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `{freelancerName} declined your hire request`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | creator's display name |
| `{{freelancer_username}}` | freelancer's display name |
| `{{browse_url}}` | `/creator/chatbot?userId={freelancerUserId}` |

**Body copy:** "Unfortunately, **{freelancer}** was unable to accept your request at this time. Don't worry — there are many talented freelancers on Meetrub ready to help."

---

### 16. `creator/hireRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator sends a hire request to a freelancer (confirmation to creator) |
| **Sender function** | `sendHireRequestEmail` — `backend/utils/offerEmails.js` + `chat-server/utils/offerEmails.js` |
| **Trigger paths** | Socket: `custom-package` handler (creator role) in `chat-server/controller/chat.js`; REST: `/api/proxy/projects/hire-request` → `projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/creator/chatbot?userId=${freelancerUserId}` | CTA — "View Chat" → opens chat with freelancer |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your hire request was sent to {freelancerName}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | creator's display name |
| `{{freelancer_username}}` | freelancer's display name |
| `{{service_title}}` | package/service title |
| `{{currency}}` | `₹` (env `CURRENCY`) |
| `{{amount}}` | offer amount formatted to 2 d.p. |
| `{{deadline}}` | `{deliveryDays} days` |
| `{{chat_url}}` | `/creator/chatbot?userId={freelancerUserId}` |

**Body copy:** "Your hire request has been delivered to {freelancer}. You'll be notified as soon as they respond."

---

### 17. `creator/invoiceEmail.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Order is approved (delivery accepted) |
| **Sender function** | `generateAndSendInvoices` — `backend/src/controller/razor-pay-controllers/projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> No CTA button. PDF invoice is attached to the email.

**Subject:** *(set inline in projectController — typically "Invoice for Order #{projectId}")*

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_name}}` | Creator's display name |
| `{{order_id}}` | `projectId` |

**Body copy:** "Hi {creator_name}, your order [details]. This is an automated email. Please do not reply." — PDF invoice attached.

---

### 18. `creator/offerRecived.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer sends a custom offer to creator |
| **Sender function** | `sendOfferReceivedEmail` — `backend/utils/offerEmails.js` + `chat-server/utils/offerEmails.js` |
| **Trigger paths** | Socket: `custom-package` handler (freelancer role) in `chat-server/controller/chat.js`; REST: `/api/proxy/projects/hire-request` (freelancer as initiator) → `projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{offer_url}}` | `https://meetrub.com/creator/chatbot?userId=${freelancerUserId}` | CTA — "Review Offer" → opens chat with freelancer |
| `{{chat_url}}` | `https://meetrub.com/creator/chatbot?userId=${freelancerUserId}` | CTA — "Open Chat" → same target |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New offer from {freelancerName}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | creator's display name |
| `{{freelancer_username}}` | freelancer's display name |
| `{{service_title}}` | package/service title |
| `{{currency}}` | `₹` (env `CURRENCY`) |
| `{{amount}}` | offer amount formatted to 2 d.p. |
| `{{delivery_days}}` | number of delivery days |
| `{{offer_url}}` | `/creator/chatbot?userId={freelancerUserId}` |
| `{{chat_url}}` | `/creator/chatbot?userId={freelancerUserId}` |

**Body copy:** "You have a new custom offer from **{freelancer}** in your Meetrub chat. Review the details and accept or decline."

---

### 19. `creator/orderCompleted.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator approves delivery (order marked complete) |
| **Sender function** | Inline in `approveProject` — `backend/src/controller/razor-pay-controllers/projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{review_url}}` | `https://meetrub.com/creator/your-projects` | CTA — "Leave a Review" |
| `{{hire_again_url}}` | `https://meetrub.com/creator/hire-freelancer` | CTA — "Hire Again" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** *(set inline in projectController)*

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{review_url}}` | `/creator/your-projects` |
| `{{hire_again_url}}` | `/creator/hire-freelancer` |

**Body copy:** "Your Meetrub order has been marked as complete and payment has been released to {freelancer}. Help the Meetrub community by leaving a review."

---

### 20. `creator/paymentConfirmed.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator's payment is confirmed (Razorpay success) |
| **Sender function** | `sendPaymentConfirmedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/creator/your-projects` | CTA — "View Order" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Payment confirmed — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{currency}}` | `₹` |
| `{{amount}}` | Amount paid (2 d.p.) |
| `{{deadline}}` | Order deadline or `TBD` |
| `{{payment_method}}` | `Razorpay` (default) |
| `{{order_url}}` | `/creator/your-projects` |

**Body copy:** "Your payment has been received and held securely in Meetrub escrow." — Escrow note: funds released only after creator approves delivery.

---

### 21. `creator/raisedispute.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator raises a dispute |
| **Sender function** | `sendCreatorDisputeEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/creator/disputes` | CTA — "Track Dispute" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Dispute raised — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` or `disputeId` |
| `{{service_title}}` | Service/package title |
| `{{dispute_reason}}` | Creator's stated dispute reason |
| `{{dispute_time}}` | Current timestamp (IST) |
| `{{dispute_url}}` | `/creator/disputes` |

**Body copy:** "We've received your dispute for Meetrub Order #{order_id}. Our admin team will review the chat history, files, and both parties' submissions. You'll be notified of the decision within [SLA]." — Escrow note: funds remain held during dispute.

---

### 22. `creator/ratingRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Order is completed, prompt for review |
| **Sender function** | `sendCreatorRatingRequestEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Project completed — rate your freelancer — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |

**Body copy:** "Great news! Your project with {freelancer} is now complete. Help the Meetrub community by sharing your experience. Your review helps other creators find the right freelancer."

---

### 23. `creator/welcome.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator signs up |
| **Sender function** | `sendWelcomeEmail(role='creator')` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dashboard_url}}` | `https://meetrub.com/creator/your-projects` | CTA — "Go to Dashboard" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Welcome to Meetrub — start hiring freelancers`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | Creator's display name |
| `{{dashboard_url}}` | `/creator/your-projects` |

**Body copy:** "You're all set to start hiring skilled freelancers on Meetrub. Our chat-first platform makes it easy to connect, align on scope, and hire — all in one place." — Steps: browse/post → chat → pay securely in escrow.

---

## Freelancer Templates

### 24. `freelancer/accountSuspended.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin suspends freelancer account |
| **Sender function** | `sendAccountSuspendedEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{help_url}}` | `https://meetrub.com/contact-us` | CTA — "Contact Support" + Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your MeetRub freelancer account has been suspended`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{username}}` | Freelancer's display name |
| `{{email}}` | Freelancer's email |
| `{{reason_for_suspension}}` | Suspension reason text from admin |
| `{{help_url}}` | `https://meetrub.com/contact-us` |

**Body copy:** "We regret to inform you that your Meetrub freelancer account has been temporarily suspended." — Lists what is blocked: dashboard access, new orders/bids, existing projects may be affected.

---

### 25. `freelancer/accountUnsuspended.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin restores suspended freelancer account |
| **Sender function** | `sendAccountRestoredEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dashboard_url}}` | `https://meetrub.com/freelancer` | CTA — "Go to Dashboard" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your MeetRub freelancer account has been restored`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{username}}` | Freelancer's display name |
| `{{email}}` | Freelancer's email |
| `{{dashboard_url}}` | `/freelancer` |

**Body copy:** "Great news! Your Meetrub freelancer account has been restored and you now have full access to all platform features. You can now resume all your freelancing activities on Meetrub."

---

### 26. `freelancer/deadlineExtensionAccepted.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator accepts deadline extension request |
| **Sender function** | `sendDeadlineExtensionAcceptedEmail` — `backend/utils/deliveryEmails.js` + `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/chatbot?userId={creatorUserId}` | CTA — "Open Chat" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Extension request accepted — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{creator_username}}` | Creator's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{extension_time}}` | Approved extension duration |
| `{{new_deadline}}` | New deadline date |
| `{{order_url}}` | `/freelancer/chatbot?userId={creatorUserId}` |

**Body copy:** "Good news! {creator} has accepted your deadline extension request." — Reminder: "Make sure to deliver by the new deadline to maintain your rating."

---

### 27. `freelancer/deadlineExtensionRejected.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator rejects deadline extension request |
| **Sender function** | `sendDeadlineExtensionRejectedEmail` — `backend/utils/deliveryEmails.js` + `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/chatbot?userId={creatorUserId}` | CTA — "Open Chat" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Extension request declined — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{creator_username}}` | Creator's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{current_deadline}}` | Original deadline date |
| `{{order_url}}` | `/freelancer/chatbot?userId={creatorUserId}` |

**Body copy:** Creator has declined the extension. Reminder: "Please ensure you deliver by the original deadline. Late deliveries may affect your rating and future opportunities."
![1781293593840](image/email-templates-url-audit/1781293593840.png)![1781293596524](image/email-templates-url-audit/1781293596524.png)![1781293615748](image/email-templates-url-audit/1781293615748.png)![1781293618528](image/email-templates-url-audit/1781293618528.png)![1781293630848](image/email-templates-url-audit/1781293630848.png)
---

### 28. `freelancer/deliverySubmitted.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Freelancer submits delivery |
| **Sender function** | `sendDeliverySubmittedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — "View Order" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Delivery submitted — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{order_id}}` | `projectId` |
| `{{delivery_time}}` | Formatted submission timestamp |
| `{{currency}}` | `₹` |
| `{{freelancer_earnings}}` | Earned amount (2 d.p.) |
| `{{review_days}}` | Creator review window (days) |
| `{{order_url}}` | `/freelancer/projects` |

**Body copy:** "Your delivery has been submitted and the creator has been notified on Meetrub. Your earnings will be released to your wallet once the creator approves."

---

### 29. `freelancer/disputeRaised.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator raises a dispute against the freelancer |
| **Sender function** | `sendFreelancerDisputeEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/freelancer/disputes` | CTA — "Track Dispute" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Dispute raised against you — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{creator_username}}` | Creator's display name |
| `{{order_id}}` | `projectId` or `disputeId` |
| `{{service_title}}` | Service/package title |
| `{{dispute_reason}}` | Creator's stated dispute reason |
| `{{dispute_url}}` | `/freelancer/disputes` |

**Body copy:** "The admin team will review your chat history and submitted files. You'll be notified of the outcome. Meetrub dispute resolution typically takes 3 business days."

---

### 30. `freelancer/disputeResolved.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin resolves a dispute |
| **Sender function** | `sendDisputeResolvedFreelancerEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/freelancer/disputes` | CTA — "View Dispute" |
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — "View Order" |
| `{{wallet_url}}` | `https://meetrub.com/freelancer/wallet` | CTA — "View Wallet" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Dispute resolved — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{creator_username}}` | Creator's display name |
| `{{order_id}}` | `projectId` or `disputeId` |
| `{{service_title}}` | Service/package title |
| `{{resolution}}` | Admin's resolution verdict |
| `{{admin_note}}` | Admin's additional note |
| `{{currency}}` | `₹` |
| `{{amount}}` | Order amount (2 d.p.) |
| `{{dispute_url}}` | `/freelancer/disputes` |
| `{{order_url}}` | `/freelancer/projects` |
| `{{wallet_url}}` | `/freelancer/wallet` |

**Body copy:** "The Meetrub admin team has reached a decision on your dispute. Here's the outcome:" — Shows resolution, admin note, and amount.

---

### 31. `freelancer/hireRequestRecevied.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator sends a hire request to the freelancer |
| **Sender function** | `sendHireRequestReceivedEmail` — `backend/utils/offerEmails.js` + `chat-server/utils/offerEmails.js` |
| **Trigger paths** | Socket: `custom-package` handler (creator role) in `chat-server/controller/chat.js`; REST: `/api/proxy/projects/hire-request` → `projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/freelancer/chatbot?userId=${creatorUserId}` | CTA — "View Request" → opens chat with creator |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New hire request from {creatorName}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | freelancer's display name |
| `{{creator_username}}` | creator's display name |
| `{{service_title}}` | package/service title |
| `{{currency}}` | `₹` (env `CURRENCY`) |
| `{{amount}}` | offer amount formatted to 2 d.p. |
| `{{deadline}}` | `{deliveryDays} days` |
| `{{chat_url}}` | `/freelancer/chatbot?userId={creatorUserId}` |

---

### 32. `freelancer/KYCApproved.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin approves or rejects KYC documents |
| **Sender function** | `sendKYCStatusEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your KYC has been verified — Meetrub` (approved) / `KYC verification failed — action required` (rejected)

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{status}}` | `approved` or `rejected` |
| `{{header_subtitle}}` | `KYC verified — you're all set` or `KYC verification — not approved` |
| `{{body_message}}` | Approval/rejection explanation paragraph |
| `{{highlight_content}}` | **Approved:** "Status: Verified ✅ — your account is eligible for payouts" / **Rejected:** "Reason for rejection: {reason}" |

**Body copy (approved):** "Great news! Your KYC documents have been verified and your account is now fully activated. You can now receive payouts directly to your bank account."

**Body copy (rejected):** "Unfortunately, your KYC documents could not be verified. Please review the reason below and resubmit the correct documents."

---

### 33. `freelancer/offerAccepted.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator accepts the freelancer's custom offer — payment pending from creator |
| **Sender function** | `sendPackageAcceptedEmail` — `chat-server/utils/deliveryEmails.js` |
| **Trigger paths** | Socket: `accept-package` handler in `chat-server/controller/chat.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/freelancer/chatbot?userId=${creatorUserId}` | CTA — "Open Chat" → opens chat with creator |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your offer was accepted — payment pending`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | freelancer's display name |
| `{{creator_username}}` | creator's display name |
| `{{service_title}}` | package/service title |
| `{{currency}}` | `₹` (env `CURRENCY`) |
| `{{amount}}` | offer amount |
| `{{delivery_days}}` | number of delivery days |
| `{{chat_url}}` | `/freelancer/chatbot?userId={creatorUserId}` |

**Body copy:** "Great news! **{creator}** has accepted your custom package offer on Meetrub. They will complete the payment shortly to get your project started."

---

### 34. `freelancer/offerRejected.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator rejects the freelancer's custom offer |
| **Sender function** | `sendPackageRejectedEmail` — `chat-server/utils/deliveryEmails.js` |
| **Trigger paths** | Socket: `reject-package` handler (freelancer-sent path) in `chat-server/controller/chat.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/freelancer/chatbot?userId=${creatorUserId}` | CTA — "Open Chat" → opens chat with creator |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your offer was declined`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | freelancer's display name |
| `{{creator_username}}` | creator's display name |
| `{{service_title}}` | package/service title |
| `{{currency}}` | `₹` (env `CURRENCY`) |
| `{{amount}}` | offer amount |
| `{{delivery_days}}` | number of delivery days |
| `{{chat_url}}` | `/freelancer/chatbot?userId={creatorUserId}` |

**Body copy:** "Unfortunately, **{creator}** has declined your custom package offer. Don't be discouraged — you can reach out to discuss adjustments or explore other opportunities."

---

### 35. `freelancer/offersent.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Freelancer sends a custom offer to a creator (confirmation to freelancer) |
| **Sender function** | `sendOfferSentEmail` — `backend/utils/offerEmails.js` + `chat-server/utils/offerEmails.js` |
| **Trigger paths** | Socket: `custom-package` handler (freelancer role) in `chat-server/controller/chat.js`; REST: `/api/proxy/projects/hire-request` (freelancer as initiator) → `projectController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/freelancer/chatbot?userId=${creatorUserId}` | CTA — "Open Chat" → opens chat with creator |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Offer sent to {creatorName}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | freelancer's display name |
| `{{creator_username}}` | creator's display name |
| `{{service_title}}` | package/service title |
| `{{currency}}` | `₹` (env `CURRENCY`) |
| `{{amount}}` | offer amount formatted to 2 d.p. |
| `{{delivery_days}}` | number of delivery days |
| `{{chat_url}}` | `/freelancer/chatbot?userId={creatorUserId}` |

**Body copy:** "Your custom offer has been delivered to **{creator}** on Meetrub. You'll be notified when they accept or decline."

---

### 36. `freelancer/orderActivated.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator's payment is confirmed, order activates |
| **Sender function** | `sendOrderActivatedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — "View Order" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New order activated — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{creator_username}}` | Creator's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{currency}}` | `₹` |
| `{{freelancer_earnings}}` | 80% of order amount (2 d.p.) |
| `{{deadline}}` | Delivery deadline |
| `{{order_url}}` | `/freelancer/projects` |

**Body copy:** "Great news! **{creator}** has confirmed their payment on Meetrub and your order is now active. Here are your order details — please deliver by the deadline to secure your earnings."

---

### 37. `freelancer/orderApproved.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator approves the delivery |
| **Sender function** | `sendOrderApprovedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — "View Order" |
| `{{withdraw_url}}` | `https://meetrub.com/freelancer/wallet` | CTA — "Raise Withdrawal Request" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Delivery approved — raise withdrawal request — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{creator_username}}` | Creator's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |
| `{{currency}}` | `₹` |
| `{{amount}}` | Order amount (2 d.p.) |
| `{{order_url}}` | `/freelancer/projects` |
| `{{withdraw_url}}` | `/freelancer/wallet` |

**Body copy:** "**{creator}** has approved your delivery on Meetrub. Your earnings are now available in your wallet. You can raise a withdrawal request to transfer funds to your bank account."

---

### 38. `freelancer/paymentrealsed.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin approves payout — Razorpay transfer released to freelancer bank |
| **Sender function** | `sendPaymentReleasedEmail` — `backend/utils/paymentEmails.js` |
| **Trigger path** | `approvePayout` — `backend/src/controller/razor-pay-controllers/adminController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{withdraw_url}}` | `https://meetrub.com/freelancer/wallet/withdrawal-history` | CTA — "View Withdrawal History" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Payment released to your wallet`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{currency}}` | `₹` |
| `{{freelancer_earnings}}` | 80% of order amount (2 d.p.) |
| `{{platform_fee}}` | 20% platform fee (2 d.p.) |
| `{{total_amount}}` | Gross order amount (2 d.p.) |
| `{{wallet_balance}}` | Updated wallet balance (2 d.p.) |
| `{{service_title}}` | Service/package title |
| `{{withdraw_url}}` | `/freelancer/wallet/withdrawal-history` |

**Body copy:** "The creator has approved your delivery and your earnings have been released to your Meetrub wallet!" — Shows earnings breakdown (gross, platform fee, net) and updated wallet balance.

---

### 39. `freelancer/ratingRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Order completed, prompt for review |
| **Sender function** | `sendFreelancerRatingRequestEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Project completed — rate your client — Order #{projectId}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{creator_username}}` | Creator's display name |
| `{{order_id}}` | `projectId` |
| `{{service_title}}` | Service/package title |

**Body copy:** "Your project with **{creator}** has been completed on Meetrub. Share your experience by leaving a rating — it helps build trust in the community."

---

### 40. `freelancer/welcome.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Freelancer signs up |
| **Sender function** | `sendWelcomeEmail(role='freelancer')` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{setup_url}}` | `https://meetrub.com/freelancer/govt-id` | CTA — "Complete Your Profile" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Welcome to Meetrub — complete your profile`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{setup_url}}` | `/freelancer/govt-id` |

**Body copy:** "Welcome to Meetrub! To start receiving orders and payouts, please complete your profile by uploading your KYC documents. Verified freelancers appear in search results and can accept client orders."

---

### 41. `freelancer/withdrawalApproved.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin approves withdrawal request |
| **Sender function** | `sendWithdrawalApprovedEmail` — `backend/utils/paymentEmails.js` |
| **Trigger path** | `approveWithdrawal` — `backend/src/controller/razor-pay-controllers/adminController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{wallet_url}}` | `https://meetrub.com/freelancer/wallet` | CTA — "View Wallet" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `Your withdrawal request has been approved`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{currency}}` | `₹` |
| `{{amount}}` | Withdrawal amount |
| `{{arrival_date}}` | Expected bank arrival date |
| `{{bank_last4}}` | Last 4 digits of registered bank account |
| `{{txn_id}}` | Transaction / reference ID |
| `{{wallet_url}}` | `/freelancer/wallet` |

**Body copy:** Your withdrawal request has been approved and processed. The funds are on their way to your registered bank account ending in {bank_last4} and should arrive by {arrival_date}.

---

### 42. `freelancer/withdrawalResquest.html`

| Field | Value |
|---|---|
| **Sent to** | **Admin** (all users with `user_role = 'admin'`) |
| **Trigger** | Freelancer submits a withdrawal request |
| **Sender function** | `sendWithdrawalRequestEmail` — `backend/utils/paymentEmails.js` |
| **Trigger path** | `requestWithdrawal` — `backend/src/controller/razor-pay-controllers/freelancerController.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{wallet_url}}` | `https://meetrub.com/admin/payment-request` | CTA — "Review Request" (admin payment request panel) |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `New withdrawal request — {freelancerName}`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{freelancer_username}}` | Freelancer's display name |
| `{{currency}}` | `₹` |
| `{{amount}}` | Withdrawal amount requested |
| `{{bank_last4}}` | Last 4 digits of registered bank account |
| `{{request_time}}` | Formatted request submission timestamp |
| `{{wallet_url}}` | `/admin/payment-request` |

**Body copy:** A freelancer has submitted a withdrawal request. Admin action required to review and approve/reject the request.

---

## Summary of Issues

### Orphaned templates (HTML exists, no sender code)

None — all templates are wired to sender functions as of v2.

> Previously flagged as orphaned: `freelancer/paymentrealsed.html`, `freelancer/withdrawalApproved.html`, and `freelancer/withdrawalResquest.html`. All three have full sender functions in `backend/utils/paymentEmails.js` — the original audit was wrong. See entries 38, 41, 42.

> `admin/KYCSubmission.html`, `admin/orderCreated.html`, and `admin/WithdrawalRequest.html` are **not orphaned** — all three have full sender functions in `backend/utils/welcomeEmail.js` and their URLs are correctly resolved.

> `creator/hierAccepted.html` and `creator/hireDeclined.html` are **not orphaned** — both are wired to `sendHireAcceptedEmail` / `sendHireDeclinedEmail` in `backend/utils/offerEmails.js` and `chat-server/utils/offerEmails.js`.

### Template variables missing from existing sender functions

No missing variables currently — all template placeholders are passed by their sender functions.

> Previously flagged as missing: `creator/disputeResolved.html → support_url` and `freelancer/disputeResolved.html → wallet_url`. Both are correctly passed in `backend/utils/deliveryEmails.js` (`support_url: HELP_URL` and `wallet_url: ${APP_URL}/freelancer/wallet`).

### HTML templates referenced in code but files don't exist

| Missing file | Used by function |
|---|---|
| `creator/paymentSuccess.html` | `sendPaymentSuccessEmailToCreator` — `backend/utils/paymentEmails.js` |
| `freelancer/workStart.html` | `sendWorkStartEmailToFreelancer` — `backend/utils/paymentEmails.js` |

### Chat URL standard (RESOLVED)

All chat CTAs across offer/hire/delivery emails now use the `chatbot?userId=` pattern. The old `/chat/:chatRoomId` and `/messages/:chatRoomId` routes have been replaced everywhere.

**Rule:**
- Email sent **to creator** → `https://meetrub.com/creator/chatbot?userId={freelancerUserId}`
- Email sent **to freelancer** → `https://meetrub.com/freelancer/chatbot?userId={creatorUserId}`

The `userId` parameter is always the **other party's** `users.id` (i.e., who you are chatting with).

### Dual-path notification: offer and hire flows

Both the socket path (`chat-server`) and REST API path (`backend`) send **two emails and two in-app notifications** per event — one to each party. `Promise.allSettled` is used so a failure in one email does not suppress the other.

| Event | Creator gets | Freelancer gets |
|---|---|---|
| Creator sends hire request | `sendHireRequestEmail` (confirmation) + `hire_request_sent` in-app | `sendHireRequestReceivedEmail` + `hire_request` in-app |
| Freelancer sends offer | `sendOfferReceivedEmail` + `package_sent` in-app | `sendOfferSentEmail` (confirmation) + `package_sent` in-app |
| Creator accepts offer | `sendHireAcceptedEmail` (via `sendPackageAcceptedEmail` for freelancer) | `sendPackageAcceptedEmail` + `package_accepted` in-app |
