# MeetRub - Notification & Email Triggers

This document lists all in-app notifications and email notifications sent throughout the MeetRub platform.

---

## 📧 EMAIL NOTIFICATIONS

### **1. User Registration & Onboarding**

#### ✉️ Welcome Email - Freelancer
- **Trigger:** After freelancer completes OTP verification
- **File:** `backend/src/controller/auth/verify-otp/verifyOtp.js` (line 275)
- **Template:** `Email-Templates/freelancer/welcome.html`
- **Recipients:** Newly registered freelancer
- **Content:** Welcome message, setup profile link, platform introduction
- **In-App Notification:** ❌ No

#### ✉️ Welcome Email - Creator
- **Trigger:** After creator completes OTP verification
- **File:** `backend/src/controller/auth/verify-otp/verifyOtp.js` (line 362)
- **Template:** `Email-Templates/creator/welcome.html`
- **Recipients:** Newly registered creator
- **Content:** Welcome message, dashboard link, how it works guide
- **In-App Notification:** ❌ No

#### ✉️ Admin Notification - New User Registration
- **Trigger:** After any user (freelancer/creator) completes registration
- **File:** `backend/src/controller/auth/verify-otp/verifyOtp.js` (lines 278, 365)
- **Template:** `Email-Templates/admin/newUser.html`
- **Recipients:** All admin users
- **Content:** User details (username, email, role, signup time, IP address)
- **In-App Notification:** ❌ No

---

### **2. Chat & Package/Hire Offers**

#### ✉️ Offer Sent - Freelancer
- **Trigger:** When freelancer sends a custom package offer to creator via chat
- **File:** `chat-server/controller/chat.js` (line 636)
- **Template:** `Email-Templates/freelancer/offersent.html`
- **Recipients:** Freelancer who sent the offer
- **Content:** Confirmation of offer sent with package details (service, amount, delivery days)
- **In-App Notification:** ❌ No (only email confirmation to sender)

#### ✉️ Offer Received - Creator
- **Trigger:** When creator receives a custom package offer from freelancer
- **File:** `chat-server/controller/chat.js` (line 642)
- **Template:** `Email-Templates/creator/offerRecived.html`
- **Recipients:** Creator who received the offer
- **Content:** Notification of new offer with package details and accept/reject link
- **In-App Notification:** ✅ Yes - `package_sent`
  - **Title:** "New Package Offer"
  - **Body:** "{freelancer_name} has sent you a custom package offer."
  - **Action:** Link to chat room ID

#### ✉️ Hire Request Sent - Creator
- **Trigger:** When creator sends a hire request (custom package) to freelancer via chat
- **File:** `chat-server/controller/chat.js` (line 606)
- **Template:** `Email-Templates/creator/hireRequest.html`
- **Recipients:** Creator who sent the hire request
- **Content:** Confirmation that hire request was sent to freelancer
- **In-App Notification:** ❌ No (only email confirmation to sender)

#### ✉️ Hire Request Received - Freelancer
- **Trigger:** When freelancer receives a hire request from creator
- **File:** `chat-server/controller/chat.js` (line 613)
- **Template:** `Email-Templates/freelancer/hireRequestRecevied.html`
- **Recipients:** Freelancer who received the hire request
- **Content:** Notification of new hire request with project details
- **In-App Notification:** ✅ Yes - `hire_request`
  - **Title:** "New Hire Request"
  - **Body:** "{creator_name} has sent you a hire request."
  - **Action:** Link to chat room ID

- **In-App Notification:** ❌ No (freelancer is the one who submitted)

#### ✉️ Delivery Received - Creator
- **Trigger:** When creator receives a deliverable from freelancer
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (line 742)
- **Template:** `Email-Templates/creator/deliveryRecevied.html`
- **Recipients:** Creator who received the delivery
- **Content:** Notification of new delivery with review/approve options
- **In-App Notification:** ✅ Yes - Two notifications sent:
  1. **Event:** `deliverable_uploaded`
     - **Title:** "New deliverable uploaded"
     - **Body:** "{freelancer_name} has uploaded a deliverable for {service_name}."
     - **Action:** Link to project ID
  2. **Event:** `rating_request`
     - **Title:** "Rate your experience"
     - **Body:** "Your project for {service_name} is complete. Please rate {freelancer_name} for their work."
     - **Action:** Link to project IDller.js` (line 735)
- **Template:** `Email-Templates/freelancer/deliverySubmitted.html`
- **Recipients:** Freelancer who submitted delivery
- **Content:** Confirmation of delivery submission, earning amount, review period notice

#### ✉️ Delivery Received - Creator
- **Trigger:** When creator receives a deliverable from freelancer
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (line 742)
- **Template:** `Email-Templates/creator/deliveryRecevied.html`
- **Recipients:** Creator who received the delivery
- **Content:** Notification of new delivery with review/approve options

---

- **In-App Notification:** ✅ Yes - Two notifications sent:
  1. **To Other Party:** `dispute_raised_against_you`
     - **Title:** "A dispute has been raised against you"
     - **Body:** "{raiser_name} has raised a dispute regarding project #{project_id}." (or service-specific)
     - **Action:** Link to dispute ID
  2. **To Raiser (Confirmation):** `dispute_raised_by_you`
     - **Title:** "Dispute raised successfully"
     - **Body:** "Your dispute has been successfully raised. Our team will review it."
     - **Action:** Link to dispute ID
### **4. Disputes**

#### ✉️ Admin Notification - Dispute Raised
- **Trigger:** When any user (freelancer/creator) raises a dispute
- **File:** 
  - `backend/src/controller/dispute/disputeController.js` (line 90+)
  - `backend/src/controller/razor-pay-controllers/projectController.js` (line 1226+)
- **Template:** `Email-Templates/admin/disputeRaised.html`
- **Recipients:** All admin users
- **Content:** Dispute details (order ID, parties involved, service, amount, reason, timestamps)

- **In-App Notification:** ❌ No (not implemented)

#### ✉️ KYC Approved - Freelancer
- **Template:** `Email-Templates/freelancer/KYCApproved.html`
- **Status:** ⚠️ Template exists, trigger not implemented in `adminController.approveKYCByAdmin`
- **Expected Recipients:** Freelancer whose KYC was approved
- **Expected Content:** Confirmation of KYC approval, ability to request withdrawals
- **In-App Notification:** ❌ No (not implemented)
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Admin users
- **Expected Content:** Notification when freelancer submits KYC documents

#### ✉️ KYC Approved - Freelancer
- **Template:** `Email-Templates/freelancer/KYCApproved.html`
- **Status:** ⚠️ Template exists, trigger not implemented in `adminController.approveKYCByAdmin`
- **Expected Recipients:** Freelancer whose KYC was approved
- **Expected Content:** Confirmation of KYC approval, ability to request withdrawals

---

### **6. Payouts & Withdrawals** (Templates exist but not yet implemented)

#### ✉️ Withdrawal Request - Admin Notification
- **Template:** `Email-Templates/admin/WithdrawalRequest.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Withdrawal Request Submitted - Freelancer
- **Template:** `Email-Templates/freelancer/withdrawalResquest.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Freelancer who requested withdrawal
- **Expected Content:** Confirmation that withdrawal request was received
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Withdrawal Approved - Freelancer
- **Template:** `Email-Templates/freelancer/withdrawalApproved.html`
- **Status:** ⚠️ Template exists, trigger not implemented in `adminController.approvePayout`
- **Expected Recipients:** Freelancer whose withdrawal was approved
- **Expected Content:** Confirmation of withdrawal approval, payment processing notice
- **In-App Notification:** ❌ No (not implemented)ayout`
- **Expected Recipients:** Freelancer whose withdrawal was approved
- **Expected Content:** Confirmation of withdrawal approval, payment processing notice

---

### **7. Payments & Orders** (Templates exist but not yet implemented)

#### ✉️ Payment Confirmed - Creator
- **Template:** `Email-Templates/creator/paymentConfirmed.html`
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Order Activated - Freelancer
- **Template:** `Email-Templates/freelancer/orderActivated.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Freelancer whose project was paid/activated
- **Expected Content:** Notification that project is active and work can begin
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Order Completed - Creator
- **Template:** `Email-Templates/creator/orderCompleted.html`
- **Status:** ⚠️ Template exists, trigger not implemented in `projectController.approveProject`
- **Expected Recipients:** Creator when project completes
- **Expected Content:** Project completion confirmation
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Payment Released - Freelancer
- **Template:** `Email-Templates/freelancer/paymentrealsed.html`
- **Status:** ⚠️ Template exists, trigger not implemented in `projectController.approveProject`
- **Expected Recipients:** Freelancer when earnings are released
- **Expected Content:** Notification of earnings credit to balance, withdrawal link
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Admin Notification - Order Created
- **Template:** `Email-Templates/admin/orderCreated.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Admin users
- **Expected Content:** Notification when new order/project is created
- **In-App Notification:** ❌ No (not implemented)
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Admin users
- **Expected Content:** Notification when new order/project is created

---
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Dispute Resolved - Creator
- **Template:** `Email-Templates/creator/disputeResolved.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Creator involved in dispute
- **Expected Content:** Dispute resolution outcome
- **In-App Notification:** ❌ No (not implemented)

#### ✉️ Dispute Raised Confirmation - Creator
- **Template:** `Email-Templates/creator/raisedispute.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Creator who raised dispute
- **Expected Content:** Confirmation that dispute was raised
- **In-App Notification:** ✅ Already covered by `dispute_raised_by_you` event (see section 4)

#### ✉️ Dispute Raised Notification - Freelancer
- **Template:** `Email-Templates/freelancer/disputeRaised.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Freelancer against whom dispute was raised
- **Expected Content:** Notification of dispute filed against them
- **In-App Notification:** ✅ Already covered by `dispute_raised_against_you` event (see section 4)
- **Expected Recipients:** Creator who raised dispute
- **Expected Content:** Confirmation that dispute was raised

#### ✉️ Dispute Raised Notification - Freelancer
- **Template:** `Email-Templates/freelancer/disputeRaised.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Freelancer against whom dispute was raised
- **Expected Content:** Notification of dispute filed against them

---

### **9. Hire Accept/Decline** (Templates exist but not yet implemented)

#### ✉️ Hire Request Accepted - Creator
- **In-App Notification:** ✅ Yes - `package_accepted`
  - **Title:** "Package Accepted"
  - **Body:** "{acceptor_name} has accepted your package offer."
  - **Action:** Link to chat room ID
  - **Note:** Implemented but email is missing

#### ✉️ Hire Request Declined - Creator
- **Template:** `Email-Templates/creator/hireDeclined.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Creator when freelancer declines hire request
- **Expected Content:** Notification that freelancer declined the hire
- **In-App Notification:** ✅ Yes - `package_rejected`
  - **Title:** "Package Rejected"
  - **Body:** "{rejector_name} has rejected your package offer."
  - **Action:** Link to chat room ID
  - **Note:** Implemented but email is missing
- **Template:** `Email-Templates/creator/hireDeclined.html`
- **Status:** ⚠️ Template exists, trigger not implemented
- **Expected Recipients:** Creator when freelancer declines hire request
- **Expected Content:** Notification that freelancer declined the hire
**Notification Data Structure:**
```javascript
{
  recipientId: Number,      // User ID of recipient
  senderId: Number,         // User ID of sender
  eventType: String,        // Event identifier (e.g., 'deliverable_uploaded')
  title: String,            // Notification title
  body: String,             // Notification message body
  actionType: String,       // 'link' | 'none'
  actionRoute: String       // Link destination (project_id, chat_room_id, dispute_id)
}
```

---

### **1. Project & Delivery Notifications**

#### 🔔 Deliverable Uploaded
- **Event Type:** `deliverable_uploaded`
- **Trigger:** Freelancer uploads deliverable
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (line 724)
- **Recipient:** Creator (project owner)
- **Sender:** Freelancer (uploader)
- **Payload:**
  - **Title:** "New deliverable uploaded"
  - **Body:** "{freelancer_name} has uploaded a deliverable for {service_name}."
  - **Action Type:** `link`
  - **Action Route:** Project ID (string)
- **Has Email:** ✅ Yes - "Delivery Received" email sent to creator

#### 🔔 Rating Request
- **Event Type:** `rating_request`
- **Trigger:** After freelancer uploads deliverable (sent simultaneously with deliverable_uploaded)
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (line 733)
- **Recipient:** Creator (project owner)
- **Sender:** Freelancer (uploader)
- **Payload:**
  - Event Type:** `dispute_raised_against_you`
- **Trigger:** Someone raises a dispute against you
- **File:** 
  - `backend/src/controller/dispute/disputeController.js` (line 123)
  - `backend/src/controller/razor-pay-controllers/projectController.js` (line 1216)
- **Recipient:** Other party in dispute (freelancer or creator)
- **Sender:** Dispute raiser (freelancer or creator)
- **Payload:**
  - **Title:** "A dispute has been raised against you"
  - **Body:** "{raiser_name} has raised a dispute regarding project #{project_id}." (or service-specific if no project)
  - **Action Type:** `link`
  - **Action Route:** Dispute ID (number)
- **Has Email:** ✅ Yes - Admin email notification sent

#### 🔔 Dispute Raised By You (Confirmation)
- **Event Type:** `dispute_raised_by_you`
- **Trigger:** You successfully raise a dispute
- **File:** 
  - `backend/src/controller/dispute/disputeController.js` (line 133)
  - `backend/src/controller/razor-pay-controllers/projectController.js` (line 1225)
- **Recipient:** Dispute raiser
- **Sender:** Self (dispute raiser)
- **Payload:**
  - **Title:** "Dispute raised successfully"
  - **Body:** "Your dispute has been successfully raised. Our team will review it and keep you informed."
  - **Action Type:** `link`
  - **Action Route:** Dispute ID (number)
- **Has Email:** ❌ No (just confirmation notification)path - different from WebSocket hire request)
- **Trigger:** After freelancer uploads deliverable
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (line 733)
- **Recipient:** Creator
- **Title:** "Rate your experience"
- **Body:** "Your project for {service_name} is complete. Please rate {freelancer_name} for their work."
- **Action:** Link to project ID
Event Type:** `new_message`
- **Trigger:** User sends a chat message
- **File:** `chat-server/controller/chat.js` (line 951)
- **Recipient:** Message recipient
- **Sender:** Message sender
- **Payload:**
  - **Title:** Sender's username
  - **Body:** Message content (actual message text)
  - **Action Type:** `link`
  - **Action Route:** Chat room ID (string format: "userId1-userId2")
- **Special Logic:** Only sent if recipient is NOT currently active in that chat room (checked via Redis)
- **Has Email:** ❌ No

#### 🔔 Hire Request (via Chat WebSocket)
- **Event Type:** `hire_request`
- **Trigger:** Creator sends hire request via WebSocket chat
- **File:** `chat-server/controller/chat.js` (line 597)
- **Recipient:** Freelancer
- **Sender:** Creator
- **Payload:**
  - **Title:** "New Hire Request"
  - **Body:** "{creator_name} has sent you a hire request."
  - **Action Type:** `link`
  - **Action Route:** Chat room ID (string)
- **Has Email:** ✅ Yes - Both "Hire Request Sent" and "Hire Request Received" emails

#### 🔔 Package Sent (Offer)
- **Event Type:** `package_sent`
- **Trigger:** Freelancer sends custom package offer via WebSocket chat
- **File:** `chat-server/controller/chat.js` (line 627)
- **Recipient:** Creator
- **Sender:** Freelancer
- **Payload:**
  - **Title:** "New Package Offer"
  - **Body:** "{freelancer_name} has sent you a custom package offer."
  - **Action Type:** `link`
  - **Action Route:** Chat room ID (string)
- **Has Email:** ✅ Yes - Both "Offer Sent" and "Offer Received" emails

#### 🔔 Package Accepted
- **Event Type:** `package_accepted`
- **Trigger:** One party accepts a custom package (hire/offer)
- **File:** `chat-server/controller/chat.js` (line 706)
- **Recipient:** Package sender (freelancer or creator)
- **Sender:** Package acceptor (creator or freelancer)
- **Event Type:** `deadline_extension`
- **Trigger:** Freelancer requests deadline extension for a project
- **File:** `chat-server/controller/chat.js` (line 831)
- **Recipient:** Creator (project owner)
- **Sender:** Freelancer
- **Payload:**
  - **Title:** "Deadline Extension Request"
  - **Body:** "{freelancer_name} has requested a deadline extension on project #{project_id}."
  - **Action Type:** `link`
  - **Action Route:** Chat room ID (string)
- **Has Email:** ❌ No

#### 🔔 Deadline Extension Accepted
- **Event Type:** `deadline_extension_accepted`
- **Trigger:** Creator accepts deadline extension request
- **File:** `chat-server/controller/chat.js` (line 869)
- **Recipient:** Freelancer (requester)
- **Sender:** Creator
- **Payload:**
  - **Title:** "Deadline Extension Accepted"
  - **Body:** "{creator_name} has accepted your deadline extension request."
  - **Action Type:** `link`
  - **Action Route:** Chat room ID (string)
- **Has Email:** ❌ No

#### 🔔 Deadline Extension Rejected
- **Event Type:** `deadline_extension_rejected`
- **Trigger:** Creator rejects deadline extension request
- **File:** `chat-server/controller/chat.js` (line 901)
- **Recipient:** Freelancer (requester)
- **Sender:** Creator
- **Payload:**
  - **Title:** "Deadline Extension Rejected"
  - **Body:** "{creator_name} has rejected your deadline extension request."
  - **Action Type:** `link`
  - **Action Route:** Chat room ID (string)
- **Has Email:** ❌ No
- **Body:** Message content
- **Action:** Link to chat room
- **Note:** Only sent if recipient is NOT currently in the chat room

#### 🔔 Hire Request (via Chat)
- **Trigger:** Creator sends hire request via WebSocket chat
- **File:** `chat-server/controller/chat.js` (line 597)
- **Recipient:** Freelancer
- **Title:** "New Hire Request"
- **Body:** "{creator_name} has sent you a hire request."
- **Action:** Link to chat room

#### 🔔 Package Sent (Offer)
- **Trigger:** Freelancer sends custom package offer via WebSocket chat
- **File:** `chat-server/controller/chat.js` (line 627)
- **Recipient:** Creator
- **Title:** "New Package Offer"
- **Body:** "{freelancer_name} has sent you a custom package offer."
- **Action:** Link to chat room
Event Type:** `support_request`
- **Trigger:** User contacts support (load-balanced assignment to admin)
- **File:** `chat-server/controller/chat.js` (line 175)
- **Recipient:** Assigned admin (load-balanced)
- **Sender:** User requesting support
- **Payload:**
  - **Title:** "New Support Request"
  - **Body:** "{username} needs support assistance."
  - **Action Type:** `link`
  - **Action Route:** Support chat room ID (string)
- **Has Email:** ❌ No
- **Note:** Only sent on NEW assignment, not when user reopens existing support chat

#### 🔔 Admin Contact (Admin → User)
- **Event Type:** `admin_contact`
- **Trigger:** Admin proactively initiates chat with user
- **File:** `chat-server/controller/chat.js` (line 328)
- **Recipient:** Target user
- **Sender:** Admin
- **Payload:**
  - **Title:** "Support Reaching Out"
  - **Body:** "{admin_name} from support wants to chat with you."
  - **Action Type:** `link`
  - **Action Route:** Support chat room ID (string)
- **Has Email:** ❌ No
- **Body:** "{rejector_name} has rejected your package offer."
- **Action:** Link to chat room

---

### Event Type:** `new_rating`
- **Status:** ⚠️ Commented out in code
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (lines 978-987)
- **Expected Recipient:** Freelancer being rated
- **Expected Sender:** Creator (rater)
- **Expected Payload:**
  - **Title:** "You received a new rating"
  - **Body:** "{creator_name} rated your work {rating}/5."
  - **Action Type:** `link`
  - **Action Route:** Project ID (string)
- **Has Email:** ❌ No

#### 🔔 New Rating Received - Creator
- **Event Type:** `new_rating`
- **Status:** ⚠️ Commented out in code
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (lines 1052-1061)
- **Expected Recipient:** Creator being rated
- **Expected Sender:** Freelancer (rater)
- **Expected Payload:**
  - **Title:** "You received a new rating"
  - **Body:** "{freelancer_name} rated their experience {rating}/5."
  - **Action Type:** `link`
  - **Action Route:** Project ID (string)
- **Has Email:** ❌ No
- **File:** `chat-server/controller/chat.js` (line 869)
- **Recipient:** Freelancer
- **Title:** "Deadline Extension Accepted"
- **Body:** "{creator_name} has accepted your deadline extension request."
- **Action:** Link to chat room

#### 🔔 Deadline Extension Rejected
- **Trigger:** Creator rejects deadline extension request
- **File:** `chat-server/controller/chat.js` (line 901)
- **Recipient:** Freelancer
- **Title:** "Deadline Extension Rejected"
- **Body:** "{creator_name} has rejected your deadline extension request."
- **Action:** Link to chat room

---

### **5. Support Chat Notifications**

#### 🔔 Support Request (User → Admin)
- **Trigger:** User contacts support
- **File:** `chat-server/controller/chat.js` (line 175)
- **Recipient:** Assigned admin
- **Title:** "New Support Request"
- **Body:** "{username} needs support assistance."
- **Action:** Link to support chat room

#### 🔔 Admin Contact (Admin → User)
- **Trigger:** Admin proactively initiates chat with user
- **File:** `chat-server/controller/chat.js` (line 328)
- **Recipient:** Target user
- **Title:** "Support Reaching Out"
- **Body:** "{admin_name} from support wants to chat with you."
- **Action:** Link to support chat room

---

### **6. Rating Notifications (COMMENTED OUT - Not Currently Active)**

#### 🔔 New Rating Received - Freelancer
- **Status:** ⚠️ Commented out in code
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (lines 978-987)
- **Expected Recipient:** Freelancer being rated
- **Expected Title:** "You received a new rating"
- **Expected Body:** "{creator_name} rated your work {rating}/5."

#### 🔔 New Rating Received - Creator
- **Status:** ⚠️ Commented out in code
- **File:** `backend/src/controller/razor-pay-controllers/projectController.js` (lines 1052-1061)
- **Expected Recipient:** Creator being rated
- **Expected Title:** "You received a new rating"
- **Expected Body:** "{freelancer_name} rated their experience {rating}/5."

---

## 📊 NOTIFICATION INFRASTRUCTURE

### Email System
- **Service:** Nodemailer with SMTP
- **Config:** `backend/config/email.js`
- **Function:** `sendMail(to, subject, htmlContent)`
- **Template Engine:** Basic string replacement with `fillTemplate()`

### In-App Notification System
- **Database:** PostgreSQL table `web_notifications`
- **Real-time:** Redis Pub/Sub + WebSocket (Socket.IO)
- **Backend Service:** `backend/src/controller/notification/notificationServicer.js`
- **Chat Service:** `chat-server/controller/chat.js`
- **Storage:** Notifications persist in DB for history

### RabbitMQ Producer (Async Email Queue)
- **File:** `backend/producer/notificationProducer.js`
- **Status:** ⚠️ Infrastructure exists but not actively used
- **Exchanges:** NOTIFICATIONS, NOTIFICATIONS_TOPIC, NOTIFICATIONS_FANOUT
- **Functions:** 
  - `sendEmailNotification()` - Direct email routing
  - `sendSMSNotification()` - SMS routing (not implemented)
  - `sendPushNotification()` - Push notifications (not implemented)

---

## ✅ IMPLEMENTATION STATUS SUMMARY

### ✅ **Fully Implemented** (Email + In-App)
- User registration welcome emails
- Admin new user notifications
- Chat hire requests & package offers
- Delivery submission & receipt
- Dispute notifications (admin + parties)
� SUMMARY STATISTICS

### Email Notifications
- **Total Email Templates:** 21
- **Implemented & Triggered:** 9 (43%)
- **Templates Exist, Not Triggered:** 12 (57%)

### In-App Notifications
- **Total Event Types:** 17
- **Active Events:** 15 (88%)
- **Commented Out:** 2 (12%)

### Combined Coverage
- **Events with BOTH Email + In-App:** 5
- **Events with In-App Only:** 10
- **Events with Email Only:** 0
- **Events with Neither:** 2 (rating notifications - commented out)

---

## 📝 NOTES

### Technical Details
- All in-app notification event types are stored in `web_notifications.event_type` column
- Email templates support variable substitution using `{{variable_name}}` syntax
- Presigned URLs are generated for profile images in notifications (24-hour expiry)
- Chat-based notifications check if recipient is in the same room to avoid duplicate notifications
- Support chat uses load balancing to distribute admin assignments evenly via Redis counters
- Notification history is permanently stored in database for audit trail

### Notification Flow
1. **Backend (REST API)** - Uses `notificationServicer.sendNotification()` → Saves to DB + publishes to Redis
2. **Chat Server (WebSocket)** - Uses `emitWebNotification()` → Saves to DB via chat model + emits via Socket.IO
3. **Real-time Delivery** - Redis Pub/Sub notifies Socket.IO to push to connected clients
4. **Persistence** - All notifications stored in `web_notifications` table regardless of online status

### Action Types
- **`link`** - Notification is clickable and routes to specific resource (most common)
- **`none`** - Notification is informational only, no action available

### Common Event Type Patterns
- `{action}_request` - Initial request notifications (hire_request, support_request)
- `{action}_accepted` / `{action}_rejected` - Response notifications
- `{entity}_{action}` - Entity-based events (deliverable_uploaded, package_sent)
- `{action}_by_you` / `{action}_against_you` - Self vs. other party notifications

---

## 🔍 QUICK REFERENCE - NOTIFICATION STATUS

| Event Type | In-App | Email | Combined |
|------------|--------|-------|----------|
| User Registration | ❌ | ✅ | 🟡 Email Only |
| Hire Request (Chat) | ✅ | ✅ | ✅ Complete |
| Package Offer (Chat) | ✅ | ✅ | ✅ Complete |
| Package Accept/Reject | ✅ | ❌ | 🟡 In-App Only |
| Deliverable Upload | ✅ | ✅ | ✅ Complete |
| Rating Request | ✅ | ❌ | 🟡 In-App Only |
| Dispute Raised | ✅ | ✅ | ✅ Complete |
| Deadline Extension | ✅ | ❌ | 🟡 In-App Only |
| Support Chat | ✅ | ❌ | 🟡 In-App Only |
| New Message | ✅ | ❌ | 🟡 In-App Only |
| KYC Approval | ❌ | ❌ | ❌ Missing |
| Payout/Withdrawal | ❌ | ❌ | ❌ Missing |
| Payment Confirm | ❌ | ❌ | ❌ Missing |
| Order Activation | ❌ | ❌ | ❌ Missing |
| Payment Released | ❌ | ❌ | ❌ Missing |

---

**Last Updated:** April 22, 2026  
**Documentation Version:** 2.0  
**Includes:** In-app notification status, payload details, and comprehensive coverage analysis
- Dispute resolution emails
- Hire accept/decline emails

---

## 🔧 RECOMMENDED IMPLEMENTATIONS

### High Priority
1. **Payout/Withdrawal Emails** - Implement in `adminController.approvePayout`, `adminController.rejectPayout`
2. **KYC Approval Email** - Add to `adminController.approveKYCByAdmin`
3. **Payment Confirmation** - Add to `paymentController.verifyPayment`
4. **Order Activation** - Add after successful payment verification
5. **Payment Released** - Add to `projectController.approveProject`

### Medium Priority
6. **Dispute Resolution** - Add when admin resolves disputes
7. **Hire Accept/Decline** - Add to package acceptance/rejection handlers
8. **Order Created Admin Notification** - Add to project creation

### Low Priority
9. **Rating Notifications** - Uncomment and enable rating notification code
10. **RabbitMQ Integration** - Use async queue for non-critical emails

---

## 📝 NOTES

- All notification event types are stored in `web_notifications.event_type` column
- Email templates support variable substitution using `{{variable_name}}` syntax
- Presigned URLs are generated for profile images in notifications (24-hour expiry)
- Chat-based notifications check if recipient is in the same room to avoid duplicate notifications
- Support chat uses load balancing to distribute admin assignments evenly
- Notification history is permanently stored in database for audit trail

---

**Last Updated:** April 22, 2026  
**Documentation Version:** 1.0
