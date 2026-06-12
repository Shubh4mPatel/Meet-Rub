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

### 14. `creator/hierAccepted.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer accepts a hire request (expected) |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{payment_url}}` | ❌ UNDEFINED — never passed | CTA — proceed to pay |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

---

### 15. `creator/hireDeclined.html` ⚠️ ORPHANED

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Freelancer declines a hire request (expected) |
| **Sender function** | **None — no code sends this template** |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{browse_url}}` | ❌ UNDEFINED — never passed | CTA — browse other freelancers |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> Suggested URL: `https://meetrub.com/creator/hire-freelancer`

---

### 16. `creator/hireRequest.html`

| Field | Value |
|---|---|
| **Sent to** | Creator |
| **Trigger** | Creator sends a hire request to a freelancer |
| **Sender function** | `sendHireRequestEmail` — `backend/utils/offerEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/creator/chat/:chatRoomId` | CTA — view chat |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> ⚠️ Chat route may not exist in frontend — see `email-url-doubts.md` §1.

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
| **Sender function** | `sendOfferReceivedEmail` — `backend/utils/offerEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{offer_url}}` | `https://meetrub.com/creator/chat/:chatRoomId` | CTA — view offer |
| `{{chat_url}}` | `https://meetrub.com/creator/chat/:chatRoomId` | CTA — open chat |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> ⚠️ Chat route may not exist in frontend — see `email-url-doubts.md` §1.

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
| **Sender function** | `sendHireRequestReceivedEmail` — `backend/utils/offerEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/freelancer/chat/:chatRoomId` | CTA — view chat |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> ⚠️ Chat route may not exist in frontend — see `email-url-doubts.md` §1.

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
| **Trigger** | Creator accepts the freelancer's custom offer |
| **Sender function** | `sendPackageAcceptedEmail` — `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/messages/:chatRoomId` | CTA — open chat |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> ⚠️ Uses `/messages/:chatRoomId` (chat-server path) — differs from backend which uses `/freelancer/chat/:chatRoomId`. See `email-url-doubts.md` §1.

---

### 34. `freelancer/offerRejected.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Creator rejects the freelancer's custom offer |
| **Sender function** | `sendPackageRejectedEmail` — `chat-server/utils/deliveryEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/messages/:chatRoomId` | CTA — open chat |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> ⚠️ Uses `/messages/:chatRoomId` (chat-server path) — differs from backend. See `email-url-doubts.md` §1.

---

### 35. `freelancer/offersent.html`

| Field | Value |
|---|---|
| **Sent to** | Freelancer |
| **Trigger** | Freelancer sends a custom offer to a creator |
| **Sender function** | `sendOfferSentEmail` — `backend/utils/offerEmails.js` |

| URL Variable | Resolved URL | Type |
|---|---|---|
| `{{chat_url}}` | `https://meetrub.com/freelancer/chat/:chatRoomId` | CTA — view chat |
| `help_url` | `https://meetrub.com/contact-us` | Footer |
| `privacy_url` | `https://meetrub.com/privacy-policy` | Footer |

> ⚠️ Chat route may not exist in frontend — see `email-url-doubts.md` §1.

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
| `creator/hierAccepted.html` | `payment_url` | TBD — project detail or checkout |
| `creator/hireDeclined.html` | `browse_url` | `/creator/hire-freelancer` |
| `freelancer/paymentrealsed.html` | `wallet_url`, `withdraw_url` | `/freelancer/wallet` |
| `freelancer/withdrawalApproved.html` | `wallet_url` | `/freelancer/wallet` |
| `freelancer/withdrawalResquest.html` | `wallet_url` | `/freelancer/wallet` |

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

### Inconsistent chat URL between backend and chat-server

| File | Chat URL used |
|---|---|
| `backend/utils/offerEmails.js` | `https://meetrub.com/freelancer/chat/:chatRoomId` or `/creator/chat/:chatRoomId` |
| `chat-server/utils/deliveryEmails.js` | `https://meetrub.com/messages/:chatRoomId` |

See `email-url-doubts.md` for the open question on the correct frontend route.
