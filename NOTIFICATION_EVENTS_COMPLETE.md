# Complete Notification Events Reference

This document provides a comprehensive list of all **actually implemented** notification events in the Meet-Rub platform, verified from the codebase. Only events that exist in the code are documented here.

## Table of Contents
1. [Project & Delivery Events](#project--delivery-events)
2. [Payment Events](#payment-events)
3. [Rating & Review Events](#rating--review-events)
4. [Dispute Events](#dispute-events)
5. [Deadline Extension Events](#deadline-extension-events)
6. [Custom Package Events](#custom-package-events)
7. [User Account Events](#user-account-events)
8. [Summary Tables](#summary-tables)

## Implementation Notes
- **Verified**: All events below are confirmed to exist in the backend codebase
- **Location**: `backend/src/controller/` and `backend/utils/`
- **Last Verified**: 23 May 2026

---

## Project & Delivery Events

### 1. Deliverable Uploaded (Creator)

| Property | Value |
|----------|-------|
| **Event Name** | `deliverable_uploaded` |
| **Triggered When** | Freelancer uploads project deliverable |
| **Description** | Notifies creator that freelancer has submitted work for review |
| **In-App Notification** | ✅ **Creator** |
| **In-App Title** | "New Delivery Received" |
| **In-App Message** | "[Freelancer] has submitted the deliverable for Order #[ID]. Please review." |
| **Email Notification** | ✅ **Creator** |
| **Email Subject** | "New delivery received — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/controller/razor-pay-controllers/projectController.js` (line 763) |
| **Email Template** | `Email-Templates/creator/deliveryRecevied.html` |

---

### 1b. Deliverable Submitted (Freelancer)

| Property | Value |
|----------|-------|
| **Event Name** | `deliverable_submitted` |
| **Triggered When** | Freelancer uploads project deliverable |
| **Description** | Confirms to freelancer that deliverable was uploaded successfully |
| **In-App Notification** | ✅ **Freelancer** |
| **In-App Title** | "Deliverable Submitted Successfully" |
| **In-App Message** | "You have successfully uploaded your deliverable for Order #[ID]. Awaiting creator's review." |
| **Email Notification** | ✅ **Freelancer** |
| **Email Subject** | "Delivery submitted — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/controller/razor-pay-controllers/projectController.js` (line 772) |
| **Email Template** | `Email-Templates/freelancer/deliverySubmitted.html` |

---

### 2. Order Approved

| Property | Value |
|----------|-------|
| **Event Name** | `order_approved` |
| **Triggered When** | Creator approves freelancer's delivery |
| **Description** | Informs freelancer that their work has been accepted and they can request withdrawal |
| **In-App Notification** | ✅ **Freelancer** |
| **In-App Title** | "Delivery approved!" |
| **In-App Message** | "[Creator] has approved your delivery for Order #[ID]. Raise a withdrawal request for payment." |
| **Email Notification** | ✅ **Freelancer** |
| **Email Subject** | "Delivery approved — raise withdrawal request — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/controller/razor-pay-controllers/projectController.js` (line 1204) |
| **Email Template** | `Email-Templates/freelancer/orderApproved.html` |

**Additional Notifications Triggered:**
- See [Rating Request (Creator)](#5-rating-request-creator) - in-app + email (line 1184)
- See [Rating Request (Freelancer)](#6-rating-request-freelancer) - in-app + email (line 1194)
- ✅ **Creator** receives order completed email (inline implementation, line 1240-1262)
  - Subject: "Order completed — Order #[ID]"
  - Template: `Email-Templates/creator/orderCompleted.html`

---

## Payment Events

### 3. Payment Confirmed

| Property | Value |
|----------|-------|
| **Event Name** | `payment_confirmed` |
| **Triggered When** | Creator's payment is successfully verified and held in escrow |
| **Description** | Confirms to creator that payment was received and project is active |
| **In-App Notification** | ✅ **Creator** |
| **In-App Title** | "Payment confirmed" |
| **In-App Message** | "Your payment for [Service] has been received. [Freelancer] will now start working." |
| **Email Notification** | ✅ **Creator** |
| **Email Subject** | "Payment confirmed — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/razor-pay-services/paymentService.js` (line 493) |

**Email Details:**
- Shows order ID, service name, amount paid, deadline, payment method
- Includes "Track Your Order" CTA
- Template: `Email-Templates/creator/paymentConfirmed.html`

---

### 4. Order Activated

| Property | Value |
|----------|-------|
| **Event Name** | `order_activated` |
| **Triggered When** | Payment confirmed and project status moves to IN_PROGRESS |
| **Description** | Notifies freelancer that a new paid order is ready to work on |
| **In-App Notification** | ✅ **Freelancer** |
| **In-App Title** | "New order activated" |
| **In-App Message** | "[Creator] has paid for [Service]. Funds are secured in escrow." |
| **Email Notification** | ✅ **Freelancer** |
| **Email Subject** | "New order activated — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/razor-pay-services/paymentService.js` (line 503) |

**Email Details:**
- Shows earnings (80% of amount), deadline, creator name
- Includes "View Order & Deliver" CTA
- Template: `Email-Templates/freelancer/orderActivated.html`

---

## Rating & Review Events

### 5. Rating Request (Creator)

| Property | Value |
|----------|-------|
| **Event Name** | `rating_request` |
| **Triggered When** | Creator approves the project |
| **Description** | Asks creator to rate the freelancer's work |
| **In-App Notification** | ✅ **Creator** |
| **In-App Title** | "Rate your freelancer" |
| **In-App Message** | "Project completed! Please rate [Freelancer] for their work." |
| **Email Notification** | ✅ **Creator** |
| **Email Subject** | "Project completed — rate your freelancer — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/controller/razor-pay-controllers/projectController.js` (line 1184) |
| **Email Template** | `Email-Templates/creator/ratingRequest.html` |

---

### 6. Rating Request (Freelancer)

| Property | Value |
|----------|-------|
| **Event Name** | `rating_request` |
| **Triggered When** | Creator approves the project |
| **Description** | Asks freelancer to rate their experience with the creator |
| **In-App Notification** | ✅ **Freelancer** |
| **In-App Title** | "Rate your client" |
| **In-App Message** | "Project completed! Please rate [Creator] for their collaboration." |
| **Email Notification** | ✅ **Freelancer** |
| **Email Subject** | "Project completed — rate your client — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/controller/razor-pay-controllers/projectController.js` (line 1194) |
| **Email Template** | `Email-Templates/freelancer/ratingRequest.html` |

---

## Dispute Events

### 7. Dispute Raised Against You
**Party being disputed** (Creator or Freelancer) |
| **In-App Title** | "Dispute Raised" |
| **In-App Message** | "A dispute has been raised for Order #[ID]. Our team will review and resolve within 7 business days." |
| **Email Notification** | ✅ **Creator** / **Freelancer** |
| **Email Subject (Creator)** | "Dispute Raised — Order #[ID]" |
| **Email Subject (Freelancer)** | "Dispute Raised Against Y
|----------|-------|
| **Event Name** | `dispute_raised_against_you` |
| **Triggered When** | Other party raises a dispute or creator rejects deliverable |
| **Description** | Informs user that a dispute has been filed against them |
| **In-App Notification** | ✅ Party being disputed (creator or freelancer) |
| **Email Notification** | ✅ **Creator**: "Dispute raised — Order #[ID]"<br>✅ **Freelancer**: "Dispute raised against you — Order #[ID]" |
| **Action Route** | Dispute ID |

**Email Details:**
- Shows order details, dispute reason, review timeline
- Notes that funds remain in escrow

---

### 8. Dispute Raised By You**Disputing party** (Creator or Freelancer) |
| **In-App Title** | "Dispute Submitted" |
| **In-App Message** | "Your dispute for Order #[ID] has been submitted. Our team will review and resolve within 7 business days." |
| **Email Notification** | ✅ **Creator** / **Freelancer** |
| **Email Subject** | "Dispute Raised — Order #[ID]" |
| **Action Route** | Dispute ID |

**Additional Emails:**
- ✅ **Admin**: "New dispute raised — #[Dispute ID]"
  - Subject: "New Dispute Raised — Order #[ a dispute |
| **Description** | Confirms dispute submission to the user who raised it |
| **In-App Notification** | ✅ Disputing party (creator or freelancer) |
| **Email Notification** | ✅ **Creator**: "Dispute raised — Order #[ID]"<br>✅ **Freelancer**: "Dispute raised — Order #[ID]" |
| **Action Route** | Dispute ID |

**Additional Emails:**
- ✅ **Admin**: "New dispute raised — #[Dispute ID]"

---

## Deadline Extension Events

### 9. Deadline Extension Requested

| Property | Value |
|----------|-------|
| **Event Name** | `deadline_extension_requested` |
| **Triggered When** | Freelancer requests additional time to complete the project |
| **Description** | Notifies creator of extension request with proposed new deadline |
| **In-App Notification** | ✅ **Creator** |
| **In-App Title** | "Deadline Extension Requested" |
| **In-App Message** | "[Freelancer] has requested a deadline extension for Order #[ID]. Please accept or decline within 7 days." |
| **Email Notification** | ✅ **Creator** |
| **Email Subject** | "Deadline extension requested — Order #[ID]" |
| **Action Route** | Extension ID |
| **Code Location** | `backend/src/controller/deadline/deadlineExtensionController.js` (line 98) |
| **Email Template** | `Email-Templates/creator/deadlineExtensionRequest.html` |

**Email Details:**
- Shows extension time requested, current deadline, new deadline
- 7-day expiry notice
- "Accept Extension" and "Decline Extension" CTAs

---

### 10. Deadline Extension Accepted

| Property | Value |
|----------|-------|
| **Event Name** | `deadline_extension_accepted` |
| **Triggered When** | Creator accepts freelancer's deadline extension request |
| **Description** | Confirms to freelancer that extra time has been granted |
| **In-App Notification** | ✅ **Freelancer** |
| **In-App Title** | "Extension Request Accepted" |
| **In-App Message** | "Great news! [Creator] has accepted your deadline extension for Order #[ID]. New deadline: [Date]." |
| **Email Notification** | ✅ **Freelancer** |
| **Email Subject** | "Extension request accepted — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/controller/deadline/deadlineExtensionController.js` (line 223) |
| **Email Template** | `Email-Templates/freelancer/deadlineExtensionAccepted.html` |

**Email Details:**
- Shows extension granted, new deadline
- "View Order" CTA

---

### 11. Deadline Extension Rejected

| Property | Value |
|----------|-------|
| **Event Name** | `deadline_extension_rejected` |
| **Triggered When** | Creator declines freelancer's deadline extension request |
| **Description** | Informs freelancer that extension was not approved |
| **In-App Notification** | ✅ **Freelancer** |
| **In-App Title** | "Extension Request Declined" |
| **In-App Message** | "[Creator] has declined your deadline extension for Order #[ID]. Original deadline remains: [Date]." |
| **Email Notification** | ✅ **Freelancer** |
| **Email Subject** | "Extension request declined — Order #[ID]" |
| **Action Route** | Project ID |
| **Code Location** | `backend/src/controller/deadline/deadlineExtensionController.js` (line 277) |
| **Email Template** | `Email-Templates/freelancer/deadlineExtensionRejected.html` |

**Email Details:**
- Shows current deadline (unchanged)
- Warning about on-time delivery importance

---

## Custom Package Events

### 12. Hire Request

| Property | Value |
|----------|-------|
| **Event Name** | `hire_request` |
| **Triggered When** | Creator sends a custom hiring package to freelancer |
| **Description** | Notifies freelancer of new job offer with custom terms |
| **In-App Notification** | ✅ **Freelancer** |
| **In-App Title** | "New Hire Request" |
| **In-App Message** | "[Creator] has sent you a hire request." |
| **Email Notification** | ❌ **Not implemented** |
| **Action Route** | Chat room ID |
| **Code Location** | `backend/src/controller/razor-pay-controllers/projectController.js` (line 938) |

---

### 13. Package Sent

| Property | Value |
|----------|-------|
| **Event Name** | `package_sent` |
| **Triggered When** | Freelancer sends custom package offer to creator |
| **Description** | Notifies creator of new service package proposal |
| **In-App Notification** | ✅ **Creator** |
| **In-App Title** | "New Package Offer" |
| **In-App Message** | "[Freelancer] has sent you a custom package offer." |
| **Email Notification** | ❌ **Not implemented** |
| **Action Route** | Chat room ID |
| **Code Location** | `backend/src/controller/razor-pay-controllers/projectController.js` (line 936) |

---

## User Account Events

### 14. Welcome Email (Freelancer)

### 14. Welcome Email (Freelancer)

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | Freelancer completes OTP verification |
| **Description** | Welcome message and profile completion prompt |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **Freelancer** |
| **Email Subject** | "Welcome to Meetrub — complete your profile" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/verify-otp/verifyOtp.js` (line 348) |
| **Function** | `sendWelcomeEmail()` in `backend/utils/welcomeEmail.js` |
| **Template** | `Email-Templates/freelancer/welcome.html` |

**Additional Email Sent:**
- ✅ **All Admins**: "New freelancer registered — [Username]"

---

### 15. Welcome Email (Creator)

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | Creator completes OTP verification |
| **Description** | Welcome message and profile completion prompt |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **Creator** |
| **Email Subject** | "Welcome to Meetrub — start hiring freelancers" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/verify-otp/verifyOtp.js` (line 436) |
| **Function** | `sendWelcomeEmail()` in `backend/utils/welcomeEmail.js` |
| **Template** | `Email-Templates/creator/welcome.html` |

**Additional Email Sent:**
- ✅ **All Admins**: "New creator registered — [Username]"

---

### 16. OTP Verification Email

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | User requests OTP for email verification or password reset |
| **Description** | Sends 6-digit verification code |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **User** |
| **Email Subject** | "Your Meetrub Verification Code" (email-verification)<br>"Meetrub Password Reset Code" (password-reset) |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/send-otp/sendOtp.js` |
| **Templates** | `Email-Templates/auth/emailVerificationOtp.html`<br>`Email-Templates/auth/passwordResetOtp.html` |

---

### 17. Account Suspended

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | Admin suspends freelancer or creator account |
| **Description** | Notifies user of account suspension with reason |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **User** (Freelancer or Creator) |
| **Email Subject** | "Your MeetRub freelancer account has been suspended"<br>"Your MeetRub creator account has been suspended" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/razor-pay-controllers/adminController.js` |
| **Templates** | `Email-Templates/freelancer/accountSuspended.html`<br>`Email-Templates/creator/accountSuspended.html` |

---

### 18. Account Restored

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | Admin revokes suspension and restores account |
| **Description** | Notifies user that account access has been restored |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **User** (Freelancer or Creator) |
| **Email Subject** | "Your MeetRub freelancer account has been restored"<br>"Your MeetRub creator account has been restored" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/razor-pay-controllers/adminController.js` |
| **Templates** | `Email-Templates/freelancer/accountUnsuspended.html`<br>`Email-Templates/creator/accountUnsuspended.html` |

---

### 19. Account Blocked

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | User account is blocked (legacy block system) |
| **Description** | Notifies user of account block |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **User** |
| **Email Subject** | "Account Blocked" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/block-user/blockusercontroller.js` |

---

### 20. Account Unblocked

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | User account is unblocked (legacy block system) |
| **Description** | Notifies user that account access has been restored |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **User** |
| **Email Subject** | "Account Unblocked" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/unblock-user/unblockusercontroller.js` |

---

### 21. Account Deletion Request

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | User requests account deletion |
| **Description** | Confirms deletion request received |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **User** |
| **Email Subject** | "Delete Account Request Received" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/delete-user/deleteUserRequestController.js` |

---

### 22. Account Deleted

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | Admin executes account deletion |
| **Description** | Confirms account has been permanently deleted |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **User** |
| **Email Subject** | "User Account Deletion Confirmation" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/delete-user/deleteUserExecutionController.js` |

---

### 23. Admin New User Alert

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | New freelancer or creator completes OTP verification |
| **Description** | Notifies admins of new user registration |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **All Admins** |
| **Email Subject** | "New [Role] Registered — [Username]" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/auth/verify-otp/verifyOtp.js` |
| **Function** | `sendAdminNewUserEmail()` in `backend/utils/welcomeEmail.js` |

**Note:** This email is sent automatically as part of the [Welcome Email (Freelancer)](#14-welcome-email-freelancer) and [Welcome Email (Creator)](#15-welcome-email-creator) flows.

---

### 24. Contact Form Submission

| Property | Value |
|----------|-------|
| **Event Name** | N/A (Email Only) |
| **Triggered When** | User submits contact form |
| **Description** | Forwards contact inquiry to admin team |
| **In-App Notification** | ❌ None |
| **Email Notification** | ✅ **All Admins** |
| **Email Subject** | "Contact Form Submission from [Sender Name]" |
| **Action Route** | N/A |
| **Code Location** | `backend/src/controller/users/userProfileController.js` |
| **Function** | `sendContactEmailToAdmin()` |

---

## Summary Tables

### In-App Notifications Summary

| Event Type | Recipient(s) | Count |
|------------|-------------|-------|
| `deliverable_uploaded` | Creator | 1 |
| `deliverable_submitted` | Freelancer | 1 |
| `rating_request` | Creator, Freelancer | 2 |
| `order_approved` | Freelancer | 1 |
| `payment_confirmed` | Creator | 1 |
| `order_activated` | Freelancer | 1 |
| `dispute_raised_against_you` | Creator or Freelancer | 1 |
| `dispute_raised_by_you` | Creator or Freelancer | 1 |
| `deadline_extension_requested` | Creator | 1 |
| `deadline_extension_accepted` | Freelancer | 1 |
| `deadline_extension_rejected` | Freelancer | 1 |
| `hire_request` | Freelancer | 1 |
| `package_sent` | Creator | 1 |
| **Total In-App Events** | | **14** |

---

### Email Notifications Summary

| Category | Email Type | Recipient | Implemented | Count |
|----------|-----------|-----------|-------------|-------|
| **Project & Delivery** | Delivery submitted | Freelancer | ✅ | 1 |
| | Delivery received | Creator | ✅ | 1 |
| | Order approved | Freelancer | ✅ | 1 |
| | Order completed | Creator | ✅ | 1 |
| **Payment** | Payment confirmed | Creator | ✅ | 1 |
| | Order activated | Freelancer | ✅ | 1 |
| **Rating** | Rating request | Creator | ✅ | 1 |
| | Rating request | Freelancer | ✅ | 1 |
| **Dispute** | Dispute raised | Creator | ✅ | 1 |
| | Dispute raised against | Freelancer | ✅ | 1 |
| | Admin dispute alert | All Admins | ✅ | 1 |
| **Deadline** | Extension requested | Creator | ✅ | 1 |
| | Extension accepted | Freelancer | ✅ | 1 |
| | Extension rejected | Freelancer | ✅ | 1 |
| **Custom Package** | Hire request | - | ❌ | 0 |
| | Package offer | - | ❌ | 0 |
| **User Account** | Welcome (Freelancer) | Freelancer | ✅ | 1 |
| | Welcome (Creator) | Creator | ✅ | 1 |
| | OTP verification | User | ✅ | 2 |
| | Account suspended | User | ✅ | 2 |
| | Account restored | User | ✅ | 2 |
| | Account blocked | User | ✅ | 1 |
| | Account unblocked | User | ✅ | 1 |
| | Account deletion request | User | ✅ | 1 |
| | Account deleted | User | ✅ | 1 |
| | Admin new user alert | All Admins | ✅ | 1 |
| | Contact form submission | All Admins | ✅ | 1 |
| **Total Implemented Email Types** | | | | **26** |

---

## Event Flow Diagrams

### Project Lifecycle with Notifications

```
1. PAYMENT CONFIRMED
   ├─> In-App: payment_confirmed → Creator
   ├─> In-App: order_activated → Freelancer
   ├─> Email: Payment confirmed → Creator
   └─> Email: Order activated → Freelancer

2. DELIVERABLE UPLOADED
   ├─> In-App: deliverable_uploaded → Creator
   ├─> In-App: deliverable_submitted → Freelancer
   ├─> Email: Delivery submitted → Freelancer
   └─> Email: Delivery received → Creator

3a. CREATOR APPROVES (Happy Path)
    ├─> In-App: order_approved → Freelancer
    ├─> In-App: rating_request → Creator
    ├─> In-App: rating_request → Freelancer
    ├─> Email: Order approved → Freelancer
    ├─> Email: Rating request → Creator
    ├─> Email: Rating request → Freelancer
    └─> Email: Order completed → Creator

3b. CREATOR REJECTS (Dispute Path)
    ├─> In-App: dispute_raised_against_you → Freelancer
    ├─> In-App: dispute_raised_by_you → Creator
    ├─> Email: Dispute raised → Creator
    ├─> Email: Dispute raised against → Freelancer
    └─> Email: Admin dispute alert → All Admins
```

---

### Deadline Extension Flow

```
1. FREELANCER REQUESTS EXTENSION
   ├─> In-App: deadline_extension_requested → Creator
   └─> Email: Extension requested → Creator

2a. CREATOR ACCEPTS
    ├─> In-App: deadline_extension_accepted → Freelancer
    └─> Email: Extension accepted → Freelancer

2b. CREATOR REJECTS
    ├─> In-App: deadline_extension_rejected → Freelancer
    └─> Email: Extension rejected → Freelancer
```

---

## Implementation Details

### Notification Service
- **File**: `backend/src/controller/notification/notificationServicer.js`
- **Function**: `sendNotification()`
- **Storage**: `web_notifications` table (PostgreSQL)
- **Real-time**: Redis pub/sub channel: `notifications`

### Email Service
- **File**: `backend/config/email.js`
- **Function**: `sendMail()`
- **Library**: Nodemailer with SMTP
- **Templates**: `Email-Templates/` directory

### Email Utility Functions

**Delivery & Order Emails:**
- **File**: `backend/utils/deliveryEmails.js`
- Functions:
  - `sendDeliverySubmittedEmail()`
  - `sendDeliveryReceivedEmail()`
  - `sendCreatorRatingRequestEmail()`
  - `sendFreelancerRatingRequestEmail()`
  - `sendOrderApprovedEmail()`
  - `sendPaymentConfirmedEmail()`
  - `sendOrderActivatedEmail()`
  - `sendCreatorDisputeEmail()`
  - `sendFreelancerDisputeEmail()`
  - `sendDeadlineExtensionRequestEmail()`
  - `sendDeadlineExtensionAcceptedEmail()`
  - `sendDeadlineExtensionRejectedEmail()`

**User Account Emails:**
- **File**: `backend/utils/welcomeEmail.js`
- Functions:
  - `sendWelcomeEmail()`
  - `sendAdminNewUserEmail()`
  - `sendAdminDisputeEmail()`
  - `sendAccountSuspendedEmail()`
  - `sendAccountRestoredEmail()`

**Auth Emails:**
- **File**: `backend/src/controller/auth/send-otp/sendOtp.js`
- Inline implementation for OTP emails (email-verification, password-reset)

**Block/Unblock/Delete Emails:**
- **Files**: `backend/src/controller/auth/block-user/`, `unblock-user/`, `delete-user/`
- Inline implementations in respective controllers

### Non-Blocking Pattern
All notifications and emails use `Promise.allSettled()` to prevent blocking main operations if notifications fail.

**Example Pattern:**
```javascript
Promise.allSettled([
  sendNotification({...}),
  sendEmailFunction({...}),
]).then((results) => {
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      logger.error(`Notification failed: ${result.reason?.message}`);
    }
  });
});
```

---

## Configuration

### Environment Variables
```env
APP_URL=https://meetrub.com
CURRENCY=₹
REVIEW_DAYS=7
HELP_URL=https://meetrub.com/help
PRIVACY_URL=https://meetrub.com/privacy
LOGO_URL=[base64 encoded logo or URL]
```

---

## Template Variables

### Common Variables (All Templates)
- `{{logo_url}}` - Platform logo
- `{{help_url}}` - Help center link
- `{{privacy_url}}` - Privacy policy link
- `{{username}}` - User's display name (creator_username or freelancer_username)
- `{{email}}` - User's email address

### Project & Order Variables
- `{{creator_username}}` - Creator's name
- `{{freelancer_username}}` - Freelancer's name
- `{{order_id}}` - Project/Order ID
- `{{service_title}}` - Service name
- `{{currency}}` - Currency symbol (default: ₹)
- `{{amount}}` - Payment amount
- `{{freelancer_earnings}}` - 80% of amount (freelancer's share)
- `{{deadline}}` - Project deadline

### Dispute & Extension Variables
- `{{dispute_reason}}` - Reason for dispute
- `{{dispute_time}}` - When dispute was raised
- `{{extension_time}}` - Extension duration requested
- `{{current_deadline}}` - Current project deadline
- `{{new_deadline}}` - Proposed new deadline

### Account Management Variables
- `{{reason_for_suspension}}` - Reason for account suspension
- `{{otp_code}}` - 6-digit OTP for verification

---

## Verification Summary

**Last Verified:** 23 May 2026  
**Verification Method:** Direct code inspection of backend controllers and utility functions

### What's Documented
✅ **14 In-App Notification Events** - All confirmed in codebase  
✅ **26 Email Notification Types** - All confirmed with code locations  
✅ **Code Locations** - Line numbers provided where events are triggered  
✅ **Email Templates** - Template file paths verified  
✅ **Functions** - Utility functions documented with file locations

### What's NOT Implemented
❌ **Custom Package Emails** - Only in-app notifications exist, no emails sent  
❌ **Any other hypothetical events** - Only actual code-verified events documented

### Data Sources
- `backend/src/controller/razor-pay-controllers/projectController.js` - Project lifecycle events
- `backend/src/razor-pay-services/paymentService.js` - Payment events
- `backend/src/controller/deadline/deadlineExtensionController.js` - Deadline extension events
- `backend/src/controller/auth/` - Auth and user account events
- `backend/utils/deliveryEmails.js` - Delivery and order email functions
- `backend/utils/welcomeEmail.js` - User account email functions

---

Last Updated: 23 May 2026
