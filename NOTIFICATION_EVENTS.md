# Notification Events Documentation

This document lists all notification events (in-app and email) triggered in the Meet-Rub platform.

## Table of Contents
1. [In-App Notifications](#in-app-notifications)
2. [Email Notifications](#email-notifications)
3. [Event Trigger Points](#event-trigger-points)

---

## In-App Notifications

All in-app notifications are sent via `sendNotification()` function and stored in `web_notifications` table.

### 1. Deliverable Uploaded
- **Event Type:** `deliverable_uploaded`
- **Trigger:** When freelancer uploads project deliverable
- **Recipient:** Creator
- **Sender:** Freelancer
- **Title:** "New deliverable uploaded"
- **Body:** "[Freelancer Name] has uploaded a deliverable for [Service Name]."
- **Action:** Link to project details
- **File:** `projectController.js` → `uploadDeliverable()`

### 2. Rating Request
- **Event Type:** `rating_request`
- **Trigger:** When freelancer submits deliverable (alongside deliverable uploaded notification)
- **Recipient:** Creator
- **Sender:** Freelancer
- **Title:** "Rate your experience"
- **Body:** "Your project for [Service Name] is complete. Please rate [Freelancer Name] for their work."
- **Action:** Link to project details
- **File:** `projectController.js` → `uploadDeliverable()`

### 3. Hire Request
- **Event Type:** `hire_request`
- **Trigger:** When creator sends hire request (custom package) to freelancer
- **Recipient:** Freelancer
- **Sender:** Creator
- **Title:** "New Hire Request"
- **Body:** "[Creator Name] has sent you a hire request."
- **Action:** Link to chat room
- **File:** `projectController.js` → `sendHireRequest()`

### 4. Package Sent
- **Event Type:** `package_sent`
- **Trigger:** When freelancer sends custom package offer to creator
- **Recipient:** Creator
- **Sender:** Freelancer
- **Title:** "New Package Offer"
- **Body:** "[Freelancer Name] has sent you a custom package offer."
- **Action:** Link to chat room
- **File:** `projectController.js` → `sendHireRequest()`

### 5. Dispute Raised Against You
- **Event Type:** `dispute_raised_against_you`
- **Trigger:** When dispute is raised by the other party
- **Recipient:** Party being disputed (creator or freelancer)
- **Sender:** Disputing party
- **Title:** "A dispute has been raised against you"
- **Body:** "[Party Name] has raised a dispute regarding project #[Project ID]."
- **Action:** Link to dispute details
- **Files:**
  - `projectController.js` → `rejectProject()` (when creator rejects project)
  - `disputeController.js` → `raiseDispute()` (when freelancer raises dispute)

### 6. Dispute Raised By You
- **Event Type:** `dispute_raised_by_you`
- **Trigger:** When user raises a dispute
- **Recipient:** Self (disputing party)
- **Sender:** Self
- **Title:** "Dispute raised successfully"
- **Body:** "Your dispute for project #[Project ID] has been submitted. Our team will review it."
- **Action:** Link to dispute details
- **Files:**
  - `projectController.js` → `rejectProject()`
  - `disputeController.js` → `raiseDispute()`

### 7. New Rating (Commented Out)
- **Event Type:** `new_rating`
- **Status:** Currently disabled in code
- **Trigger:** When user receives a rating
- **Files:**
  - `projectController.js` → `rateFreelancer()` (lines 1017-1026)
  - `projectController.js` → `rateCreator()` (lines 1091-1099)

---

## Email Notifications

All emails are sent via `sendMail()` function from `config/email.js`.

### User Onboarding

#### 1. Welcome Email - Freelancer
- **Trigger:** Freelancer completes OTP verification
- **Recipient:** Freelancer
- **Subject:** "Welcome to Meetrub — complete your profile"
- **Template:** `Email-Templates/freelancer/welcome-incomplete-profile.html`
- **CTA:** Complete profile to start getting hired
- **File:** `verifyOtp.js` → `verifyOtp()` (line 348)

#### 2. Welcome Email - Creator
- **Trigger:** Creator completes OTP verification
- **Recipient:** Creator
- **Subject:** "Welcome to Meetrub — start hiring freelancers"
- **Template:** `Email-Templates/creator/welcome-incomplete-profile.html`
- **CTA:** Complete profile to start hiring
- **File:** `verifyOtp.js` → `verifyOtp()` (line 436)

#### 3. Admin New User Notification - Freelancer
- **Trigger:** New freelancer signs up
- **Recipient:** All admins
- **Subject:** "New freelancer registered — [Username]"
- **Template:** `Email-Templates/admin/new-user.html`
- **File:** `verifyOtp.js` → `verifyOtp()` (line 351)

#### 4. Admin New User Notification - Creator
- **Trigger:** New creator signs up
- **Recipient:** All admins
- **Subject:** "New creator registered — [Username]"
- **Template:** `Email-Templates/admin/new-user.html`
- **File:** `verifyOtp.js` → `verifyOtp()` (line 439)

### Authentication

#### 5. OTP Email
- **Trigger:** User requests OTP for login/signup
- **Recipient:** User (pending verification)
- **Subject:** "Your Meetrub verification code"
- **Content:** Contains 6-digit OTP code
- **File:** `sendOtp.js` → `sendOtp()` (line 73)

### Project & Delivery

#### 6. Delivery Submitted Confirmation
- **Trigger:** Freelancer uploads deliverable
- **Recipient:** Freelancer
- **Subject:** "Delivery submitted — Order #[Project ID]"
- **Template:** `Email-Templates/freelancer/delivery-submitted.html`
- **Content:** Confirmation that deliverable was submitted successfully
- **File:** `projectController.js` → `uploadDeliverable()` (line 781)

#### 7. Delivery Received Notification
- **Trigger:** Freelancer uploads deliverable
- **Recipient:** Creator
- **Subject:** "New delivery received — Order #[Project ID]"
- **Template:** `Email-Templates/creator/delivery-received.html`
- **Content:** Notification that freelancer submitted work, prompts review
- **File:** `projectController.js` → `uploadDeliverable()` (line 787)

### Disputes

#### 8. Admin Dispute Alert - From Creator Rejection
- **Trigger:** Creator rejects project (auto-creates dispute)
- **Recipient:** All admins
- **Subject:** "New dispute raised — #[Dispute ID]"
- **Template:** `Email-Templates/admin/new-dispute.html`
- **Content:** Dispute details, project info, parties involved
- **File:** `projectController.js` → `rejectProject()` (line 1245)

#### 9. Admin Dispute Alert - From Manual Raise
- **Trigger:** User manually raises dispute
- **Recipient:** All admins
- **Subject:** "New dispute raised — #[Dispute ID]"
- **Template:** `Email-Templates/admin/new-dispute.html`
- **Content:** Dispute details, project info, parties involved
- **File:** `disputeController.js` → `raiseDispute()` (line 137)

### Account Management

#### 10. Account Deletion Request Confirmation
- **Trigger:** User requests account deletion
- **Recipient:** User
- **Subject:** "Account deletion request received"
- **Content:** Confirmation that deletion request was received
- **File:** `deleteUserRequestController.js` (line 51)

#### 11. Account Deletion Confirmation
- **Trigger:** Admin executes account deletion
- **Recipient:** User (via deleted email)
- **Subject:** "Your account has been deleted"
- **Content:** Confirmation that account was permanently deleted
- **File:** `deleteUserExecutionController.js` (line 40)

#### 12. Account Blocked Notification
- **Trigger:** Admin blocks user account
- **Recipient:** Blocked user
- **Subject:** "Your account has been blocked"
- **Content:** Notification of account suspension
- **File:** `blockusercontroller.js` (line 78)

#### 13. Account Unblocked Notification
- **Trigger:** Admin unblocks user account
- **Recipient:** Unblocked user
- **Subject:** "Your account has been unblocked"
- **Content:** Notification that account access has been restored
- **File:** `unblockusercontroller.js` (line 66)

### Contact & Support

#### 14. Contact Form Submission to Admin
- **Trigger:** User submits contact form
- **Recipient:** All admins
- **Subject:** "New contact form submission — [Sender Name]"
- **Content:** Contact form details (name, email, phone, message)
- **File:** `userProfileController.js` → `sendContactEmailToAdmin()` (line 4167)

---

## Event Trigger Points

### Project Lifecycle

```
1. Project Created (CREATED)
   └─> No notifications

2. Payment Made → Project Status: IN_PROGRESS
   └─> No notifications

3. Deliverable Uploaded → Status: SUBMITTED
   ├─> In-App: deliverable_uploaded → Creator
   ├─> In-App: rating_request → Creator
   ├─> Email: Delivery Submitted → Freelancer
   └─> Email: Delivery Received → Creator

4a. Creator Approves → Status: COMPLETED
    └─> No notifications (funds stay HELD until admin releases)

4b. Creator Rejects → Status: DISPUTE
    ├─> Dispute auto-created with status='rejected'
    ├─> In-App: dispute_raised_against_you → Freelancer
    ├─> In-App: dispute_raised_by_you → Creator
    └─> Email: Admin Dispute Alert → All Admins

5. Manual Dispute Raised (by freelancer) → Status: DISPUTE
   ├─> In-App: dispute_raised_against_you → Creator
   ├─> In-App: dispute_raised_by_you → Freelancer
   └─> Email: Admin Dispute Alert → All Admins
```

### Custom Package Flow

```
1. Creator sends hire request
   ├─> In-App: hire_request → Freelancer
   └─> Custom package saved with status='pending'

2. Freelancer sends package offer
   ├─> In-App: package_sent → Creator
   └─> Custom package saved with status='pending'
```

### User Account Lifecycle

```
1. User Signs Up
   └─> Email: OTP → User

2. User Verifies OTP
   ├─> Email: Welcome Email → User (creator or freelancer)
   └─> Email: Admin New User → All Admins

3. User Submits Contact Form
   └─> Email: Contact Form → All Admins

4. Admin Blocks Account
   └─> Email: Account Blocked → User

5. Admin Unblocks Account
   └─> Email: Account Unblocked → User

6. User Requests Deletion
   └─> Email: Deletion Request → User

7. Admin Executes Deletion
   └─> Email: Account Deleted → User
```

---

## Summary Statistics

### In-App Notifications
- **Active:** 6 event types
- **Disabled:** 1 event type (new_rating)

### Email Notifications
- **User-facing:** 10 types
- **Admin-facing:** 4 types
- **Total:** 14 email types

### Total Notification Events
- **In-App + Email:** 20+ notification scenarios

---

## Implementation Notes

1. **Notification Service:** All in-app notifications use `sendNotification()` which:
   - Saves to `web_notifications` table in PostgreSQL
   - Publishes to Redis `notifications` channel for real-time delivery

2. **Email Service:** All emails use `sendMail()` from `config/email.js`:
   - Uses Nodemailer with SMTP
   - Templates stored in `Email-Templates/` directory

3. **Error Handling:** Most notification/email calls use `.catch()` to log errors without blocking main flow

4. **Async Pattern:** Notifications and emails are typically fired asynchronously using `Promise.allSettled()` or background `.catch()`

5. **Admin Emails:** Admin notifications query `users` table for `user_role='admin'` and send to all admins

---

Last Updated: 23 May 2026
