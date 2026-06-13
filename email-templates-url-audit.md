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
| `mailto:{{sender_email}}` | User's submitted email address | Dynamic |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 2. `admin/disputeRaised.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | A dispute is raised on any order |
| **Sender function** | `sendAdminDisputeEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_dispute_url}}` | `https://meetrub.com/admin/disputes/:disputeId` | CTA — view dispute |
| `{{admin_chat_url}}` | `https://meetrub.com/admin/chat-view` | CTA — view chat |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 3. `admin/KYCSubmission.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | Freelancer submits KYC documents |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_kyc_url}}` | ❌ UNDEFINED — never passed | CTA — review KYC |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> Suggested URL: `https://meetrub.com/admin/freelancer-panel/kyc-requests`

---

### 4. `admin/newUser.html`

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | New user signs up |
| **Sender function** | `sendAdminNewUserEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_user_url}}` | `https://meetrub.com/admin/user-panel` | CTA — view user |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 5. `admin/orderCreated.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | New order is created |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_order_url}}` | ❌ UNDEFINED — never passed | CTA — view order |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> Suggested URL: `https://meetrub.com/admin/working-projects`

---

### 6. `admin/WithdrawalRequest.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Admin(s) |
| **Trigger** | Freelancer requests a withdrawal |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{admin_withdrawal_url}}` | ❌ UNDEFINED — never passed | CTA — view request |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> Suggested URL: `https://meetrub.com/admin/payment-request`

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
| `{{help_url}}` | `https://meetrub.com/contact-us` | CTA + Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 10. `creator/accountUnsuspended.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Admin restores suspended creator account |
| **Sender function** | `sendAccountRestoredEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dashboard_url}}` | `https://meetrub.com/creator/your-projects` | CTA — go to dashboard |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 11. `creator/deadlineExtensionRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer requests a deadline extension |
| **Sender function** | `sendDeadlineExtensionRequestEmail` — `backend/utils/deliveryEmails.js` + `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{extension_url}}` | `https://meetrub.com/creator/your-projects` | CTA — manage extension |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 12. `creator/deliveryRecevied.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer submits a delivery |
| **Sender function** | `sendDeliveryReceivedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> No CTA action URL in this template.

---

### 13. `creator/disputeResolved.html` ⚠️ PARTIAL

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Admin resolves a dispute |
| **Sender function** | `sendDisputeResolvedCreatorEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/creator/disputes` | CTA — view dispute |
| `{{order_url}}` | `https://meetrub.com/creator/your-projects` | CTA — view order |
| `{{support_url}}` | ❌ UNDEFINED — template has it, function never passes it | CTA — contact support |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> `{{support_url}}` renders as empty string. Suggested: `https://meetrub.com/contact-us`

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
| `{{browse_url}}` | `https://meetrub.com/creator/hire-freelancer` | CTA — "Browse Other Freelancers" |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

**Subject:** `{freelancerName} declined your hire request`

**Template placeholders:**

| Placeholder | Source / Value |
|---|---|
| `{{creator_username}}` | creator's display name |
| `{{freelancer_username}}` | freelancer's display name |
| `{{browse_url}}` | `/creator/hire-freelancer` |

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

> No CTA action URL. PDF invoice is attached.

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
| **Sender function** | Inline in `approveProject` — `backend/src/controller/razor-pay-controllers/projectController.js:1431` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{review_url}}` | `https://meetrub.com/creator/your-projects` | CTA — leave a review |
| `{{hire_again_url}}` | `https://meetrub.com/creator/hire-freelancer` | CTA — hire again |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 20. `creator/paymentConfirmed.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator's payment is confirmed (Razorpay success) |
| **Sender function** | `sendPaymentConfirmedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/creator/your-projects` | CTA — view order |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 21. `creator/raisedispute.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator raises a dispute |
| **Sender function** | `sendCreatorDisputeEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/creator/disputes` | CTA — track dispute |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 22. `creator/ratingRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Order is completed, prompt for review |
| **Sender function** | `sendCreatorRatingRequestEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{review_url}}` | `https://meetrub.com/creator/your-projects` | CTA — leave review |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 23. `creator/welcome.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator signs up |
| **Sender function** | `sendWelcomeEmail(role='creator')` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dashboard_url}}` | `https://meetrub.com/creator/your-projects` | CTA — go to dashboard |
| `{{how_it_works_url}}` | `https://meetrub.com/services` | CTA — how it works |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

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
| `{{help_url}}` | `https://meetrub.com/contact-us` | CTA + Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 25. `freelancer/accountUnsuspended.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin restores suspended freelancer account |
| **Sender function** | `sendAccountRestoredEmail` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dashboard_url}}` | `https://meetrub.com/freelancer` | CTA — go to dashboard |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 26. `freelancer/deadlineExtensionAccepted.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator accepts deadline extension request |
| **Sender function** | `sendDeadlineExtensionAcceptedEmail` — `backend/utils/deliveryEmails.js` + `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — view order |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 27. `freelancer/deadlineExtensionRejected.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator rejects deadline extension request |
| **Sender function** | `sendDeadlineExtensionRejectedEmail` — `backend/utils/deliveryEmails.js` + `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — view order |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |
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
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — view order |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 29. `freelancer/disputeRaised.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator raises a dispute against the freelancer |
| **Sender function** | `sendFreelancerDisputeEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/freelancer/disputes` | CTA — track dispute |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 30. `freelancer/disputeResolved.html` ⚠️ PARTIAL

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin resolves a dispute |
| **Sender function** | `sendDisputeResolvedFreelancerEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{dispute_url}}` | `https://meetrub.com/freelancer/disputes` | CTA — view dispute |
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — view order |
| `{{wallet_url}}` | ❌ UNDEFINED — template has it, function never passes it | CTA — view wallet |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> `{{wallet_url}}` renders as empty string. Suggested: `https://meetrub.com/freelancer/wallet`

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
| `{{action_url}}` | **Approved:** `https://meetrub.com/freelancer/projects` / **Rejected:** `https://meetrub.com/freelancer/govt-id` | CTA |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

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
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — view order |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 37. `freelancer/orderApproved.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator approves the delivery |
| **Sender function** | `sendOrderApprovedEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{order_url}}` | `https://meetrub.com/freelancer/projects` | CTA — view order |
| `{{withdraw_url}}` | `https://meetrub.com/freelancer/wallet` | CTA — raise withdrawal |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 38. `freelancer/paymentrealsed.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin releases payment to freelancer (expected) |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{wallet_url}}` | ❌ UNDEFINED — never passed | CTA — view wallet |
| `{{withdraw_url}}` | ❌ UNDEFINED — never passed | CTA — withdraw funds |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> Suggested URLs: `wallet_url` → `https://meetrub.com/freelancer/wallet` / `withdraw_url` → `https://meetrub.com/freelancer/wallet/withdrawal-funds`

---

### 39. `freelancer/ratingRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Order completed, prompt for review |
| **Sender function** | `sendFreelancerRatingRequestEmail` — `backend/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{review_url}}` | `https://meetrub.com/freelancer/projects` | CTA — leave review |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 40. `freelancer/welcome.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Freelancer signs up |
| **Sender function** | `sendWelcomeEmail(role='freelancer')` — `backend/utils/welcomeEmail.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{setup_url}}` | `https://meetrub.com/freelancer/govt-id` | CTA — complete profile |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 41. `freelancer/withdrawalApproved.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Admin approves withdrawal request (expected) |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{wallet_url}}` | ❌ UNDEFINED — never passed | CTA — view wallet |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> Suggested URL: `https://meetrub.com/freelancer/wallet`

---

### 42. `freelancer/withdrawalResquest.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Freelancer submits a withdrawal request (expected) |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{wallet_url}}` | ❌ UNDEFINED — never passed | CTA — view wallet |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> Suggested URL: `https://meetrub.com/freelancer/wallet`

---

## Summary of Issues

### Orphaned templates (HTML exists, no sender code)

| Template | Missing variable(s) | Suggested URL |
|---|---|---|
| `admin/KYCSubmission.html` | `admin_kyc_url` | `/admin/freelancer-panel/kyc-requests` |
| `admin/orderCreated.html` | `admin_order_url` | `/admin/working-projects` |
| `admin/WithdrawalRequest.html` | `admin_withdrawal_url` | `/admin/payment-request` |
| `freelancer/paymentrealsed.html` | `wallet_url`, `withdraw_url` | `/freelancer/wallet` |
| `freelancer/withdrawalApproved.html` | `wallet_url` | `/freelancer/wallet` |
| `freelancer/withdrawalResquest.html` | `wallet_url` | `/freelancer/wallet` |

> `creator/hierAccepted.html` and `creator/hireDeclined.html` are **no longer orphaned** — both are now wired to `sendHireAcceptedEmail` / `sendHireDeclinedEmail` in both `backend/utils/offerEmails.js` and `chat-server/utils/offerEmails.js`.

### Template variables missing from existing sender functions

| Template | Missing variable | Current value rendered | Suggested fix |
|---|---|---|---|
| `creator/disputeResolved.html` | `support_url` | empty string | Pass `HELP_URL` |
| `freelancer/disputeResolved.html` | `wallet_url` | empty string | Pass `${APP_URL}/freelancer/wallet` |

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
