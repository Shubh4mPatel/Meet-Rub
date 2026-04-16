# Meet-Rub — Complete System Flow Reference

## Platform Overview

Meet-Rub is a **freelance marketplace** with an escrow-based payment system. Three types of users interact on the platform:
- **Creators** — clients who hire freelancers (influencers, brands)
- **Freelancers** — service providers
- **Admins** — platform operators who approve, manage, and release payments

**Stack:** Node.js + Express + PostgreSQL + Razorpay + MinIO + Socket.IO + Redis + RabbitMQ

---

## Table of Contents

1. [Entities & What They Do](#entities)
2. [Entity Relationship Summary](#er-summary)
3. [Flow 1 — Registration & Auth](#flow-1)
4. [Flow 2 — Freelancer Profile Setup](#flow-2)
5. [Flow 3 — Creator Hires a Freelancer](#flow-3)
6. [Flow 4 — Payment & Escrow](#flow-4)
7. [Flow 5 — Project Execution & Delivery](#flow-5)
8. [Flow 6 — Admin Releases Escrow Payment](#flow-6)
9. [Flow 7 — Dispute Resolution](#flow-7)
10. [Flow 8 — Real-time Chat](#flow-8)
11. [Flow 9 — Notifications](#flow-9)
12. [Key Actors Summary](#actors)
13. [API Routes Quick Reference](#api-routes)

---

## Entities & What They Do <a name="entities"></a>

---

### 1. `users` — Core Identity Table

Every person on the platform is a `user` first.

| Field | Description |
|---|---|
| `id` | Primary key |
| `user_email` | Unique email |
| `user_name` | Unique username |
| `user_password` | bcrypt hashed |
| `user_role` | `'freelancer'` \| `'creator'` \| `'admin'` |
| `approval_status` | `'pending'` \| `'approved'` \| `'rejected'` |

**Role:** Authentication anchor. JWT tokens are issued against this entity. All profile tables (`freelancer`, `creators`, `admin`) link back here via `user_id`.

---

### 2. `freelancer` — Service Provider Profile

Linked 1:1 to `users` where `role = 'freelancer'`.

| Field | Description |
|---|---|
| `freelancer_id` | Primary key |
| `user_id` | FK → users |
| `freelancer_full_name`, `first_name`, `last_name` | Name fields |
| `freelancer_email`, `phone_number`, `date_of_birth` | Contact info |
| `profile_title` | Professional headline |
| `profile_image_url`, `freelancer_thumbnail_image` | MinIO references |
| `about_me` | Bio |
| `bank_account_no`, `bank_ifsc_code`, `bank_name`, `bank_branch_name` | Bank details for payouts |
| `kyc_status` | `'pending'` \| `'approved'` \| `'rejected'` |

**Role:** Public-facing and financial identity. KYC must be approved before payouts can be released.

---

### 3. `creators` — Client Profile

Linked 1:1 to `users` where `role = 'creator'`.

| Field | Description |
|---|---|
| `creator_id` | Primary key |
| `user_id` | FK → users |
| `full_name`, `first_name`, `last_name` | Name fields |
| `email`, `phone_number` | Contact info |
| `profile_image_url` | MinIO reference |
| `niche` | Industry category (FK → niche) |
| `about_me` | Bio |
| `social_platform_type`, `social_links` | Social media info |
| `bank_account_no`, `bank_ifsc_code`, etc. | Bank details (for refunds) |

**Role:** Represents a client who browses freelancers, requests services, and pays for projects.

---

### 4. `admin` — Platform Operator

Linked 1:1 to `users` where `role = 'admin'`. Minimal profile.

**Role:** Approves users, manages KYC, assigns freelancers to requests, resolves disputes, and manually releases escrow payments.

---

### 5. `services` — What Freelancers Offer

Created by freelancers. Their product listings.

| Field | Description |
|---|---|
| `id` | Primary key |
| `freelancer_id` | FK → freelancer |
| `service_name` | Name of offering |
| `service_description` | Detailed description |
| `price` | Cost in INR |
| `delivery_time` | Days to deliver |
| `gallery_urls` | Array of MinIO image references |

**Role:** Creators browse these and initiate hire requests/projects.

---

### 6. `service_options` — Platform Service Catalog

Admin-managed list of allowed service types (e.g., "Video Editing", "Thumbnail Design"). Freelancers pick from this list when creating their services.

---

### 7. `niche` — Industry Categories

Admin-created categories (e.g., "Fashion", "Gaming", "Fitness").

| Field | Description |
|---|---|
| `niche_name` | Primary key |
| `created_by` | Admin ID |

**Role:** Creators belong to a niche; freelancers can be filtered/discovered by niche.

---

### 8. `service_requests` — Creator's Hire Intent

Created by creators when they want a service done.

| Field | Description |
|---|---|
| `request_id` | Primary key |
| `creator_id` | FK → creators |
| `service_id` | FK → services |
| `request_description` | What they need |
| `number_of_units` | Quantity |
| `status` | `'PENDING'` \| `'ACCEPTED'` \| `'REJECTED'` |

**Role:** Creator expresses intent → Admin reviews → Admin assigns a freelancer → Project created.

---

### 9. `projects` — The Work Agreement

The core operational entity. Created when a creator hires a freelancer.

| Field | Description |
|---|---|
| `id` | Primary key |
| `creator_id` | FK → creators |
| `freelancer_id` | FK → freelancer |
| `service_id` | FK → services |
| `number_of_units` | Quantity ordered |
| `amount` | Total price in INR |
| `end_date` | Project deadline |
| `status` | `'CREATED'` → `'IN_PROGRESS'` → `'COMPLETED'` \| `'CANCELLED'` \| `'DISPUTE'` |
| `completed_at` | Timestamp when freelancer marks done |

**Role:** Tracks the entire lifecycle of a job from creation → payment → delivery → payout.

---

### 10. `transactions` — Escrow & Payment Records

Created when payment is initiated. This is the financial state machine.

| Field | Description |
|---|---|
| `id` | Primary key |
| `creator_id`, `freelancer_id`, `project_id` | Participants |
| `amount` | Total paid |
| `platform_commission` | 10% platform cut |
| `freelancer_amount` | 90% goes to freelancer |
| `payment_method` | `'WALLET'` \| `'RAZORPAY'` |
| `status` | `'INITIATED'` → `'HELD'` → `'RELEASED'` → `'COMPLETED'` \| `'REFUNDED'` \| `'FAILED'` |
| `razorpay_order_id`, `razorpay_payment_id` | Payment gateway references |
| `payout_id`, `payout_utr` | Payout references |
| `held_at` | When funds entered escrow |
| `released_by`, `released_at` | Which admin released & when |

**Role:** The escrow ledger. Money sits in `HELD` status until an admin manually releases it after verifying project completion.

---

### 11. `wallets` — User Fund Storage

Each user gets one wallet on registration.

| Field | Description |
|---|---|
| `id` | Primary key |
| `user_id` | FK → users |
| `balance` | Current amount in INR |
| `currency` | Default: INR |
| `status` | `'ACTIVE'` \| `'FROZEN'` |

**Role:** Creators can preload money via Razorpay and pay for projects from the wallet balance, avoiding a new Razorpay checkout each time.

---

### 12. `wallet_transactions` — Wallet Audit Log

Every credit/debit to a wallet is logged here.

| Field | Description |
|---|---|
| `id` | Primary key |
| `wallet_id` | FK → wallets |
| `amount` | Transaction amount |
| `direction` | `'CREDIT'` \| `'DEBIT'` |
| `reference_type` | `'LOAD'` \| `'PAYMENT'` \| `'WITHDRAWAL'` \| `'COMMISSION'` \| `'REFUND'` |
| `reference_id` | FK to transaction/payout |

**Role:** Full immutable audit trail of all wallet movements.

---

### 13. `portfolio` — Freelancer's Work Samples

| Field | Description |
|---|---|
| `portfolio_id` | Primary key |
| `freelancer_id` | FK → freelancer |
| `portfolio_name`, `portfolio_description` | Details |
| `file_urls` | Array of MinIO file references |

**Role:** Shown to creators during browsing/hiring to demonstrate past work quality.

---

### 14. `impact` — Before/After Showcase

| Field | Description |
|---|---|
| `id` | Primary key |
| `freelancer_id` | FK → freelancer |
| `service_type` | What service is demonstrated |
| `before_service_url` | MinIO reference |
| `after_service_url` | MinIO reference |

**Role:** Visual proof of what a freelancer can achieve. Displayed prominently on their public profile.

---

### 15. `disputes` — Conflict Resolution

Raised by either creator or freelancer when something goes wrong.

| Field | Description |
|---|---|
| `id` | Primary key |
| `creator_id`, `freelancer_id` | Parties involved |
| `project_id` | Optional FK → projects |
| `reason_of_dispute`, `description` | The complaint |
| `raised_by` | `'creator'` \| `'freelancer'` |
| `status` | `'OPEN'` \| `'RESOLVED'` |
| `resolution` | Admin's decision |
| `resolved_by` | Admin ID |
| `resolved_at` | Resolution timestamp |

**Role:** Admin investigates and decides to REFUND the creator or RELEASE funds to the freelancer.

---

### 16. `wishlist` — Creator's Saved Freelancers

Simple join: `creator_id` + `freelancer_id`

**Role:** Creators bookmark freelancers they like for future hiring.

---

### 17. `web_notifications` — In-App Notification Log

| Field | Description |
|---|---|
| `id` | Primary key |
| `sender_id`, `recipient_id` | FK → users |
| `event_type` | payment, dispute, project, etc. |
| `title`, `body` | Notification content |
| `action_type`, `action_route` | Where to navigate on click |
| `is_read`, `read_at` | Read state |

**Role:** Every important platform event creates a record here. Users see these in their notification center.

---

## Entity Relationship Summary <a name="er-summary"></a>

```
users (core identity)
 ├── 1:1 → freelancer          (if role='freelancer')
 ├── 1:1 → creators            (if role='creator')
 ├── 1:1 → admin               (if role='admin')
 ├── 1:1 → wallets
 └── 1:M → web_notifications   (as sender AND recipient)

freelancer
 ├── 1:M → services
 ├── 1:M → projects            (as hired party)
 ├── 1:M → portfolio
 ├── 1:M → impact              (before/after showcase)
 └── 1:M → disputes

creators
 ├── 1:M → service_requests
 ├── 1:M → projects            (as hiring party)
 ├── 1:M → wishlist
 └── 1:M → disputes

projects
 ├── 1:M → transactions
 ├── 1:M → deliverables        (uploaded proof-of-work files)
 └── 1:M → disputes            (optional link)

services
 ├── 1:M → projects
 └── 1:M → service_requests

wallets
 └── 1:M → wallet_transactions

transactions
 └── Referenced by → wallet_transactions (for wallet payments)
```

---

## Flow 1 — Registration & Auth <a name="flow-1"></a>

```
[New User — Mobile or Web]
        │
        ▼
POST /auth/send-otp  { email }
        │  OTP generated & emailed via Nodemailer
        │  OTP stored in Redis with expiry
        ▼
POST /auth/verify-otp  { otp, role, file? }
        │  OTP matched from Redis
        │  INSERT into users          (user_role, approval_status='pending')
        │  INSERT into creators       (if role='creator')
        │     OR freelancer           (if role='freelancer')
        │  Wallet created for user
        │  JWT access token (15min) + refresh token issued as HTTP-only cookies
        ▼
[User is logged in — approval_status still 'pending']

        --- Admin approves ---
        ▼
POST /admin/userApproval  { user_id, status: 'approved' }
        │  approval_status = 'approved' in users table
        ▼
[User can now fully access the platform]

        --- Subsequent logins ---
        ▼
POST /auth/login  { email/username, password }
        │  bcrypt.compare password
        │  JWT access + refresh tokens issued
        ▼
[Authenticated — tokens stored in HTTP-only cookies]

        --- Token refresh ---
        ▼
POST /auth/refresh
        │  Refresh token validated
        │  New access token issued
```

---

## Flow 2 — Freelancer Profile Setup <a name="flow-2"></a>

```
[Freelancer — after approval]
        │
        ├─ Add services they offer
        │   POST /freelancer/add-service
        │       { service_name, description, price, delivery_time, gallery images }
        │       → gallery images uploaded to MinIO
        │       → services record created
        │
        ├─ Upload portfolio (past work samples)
        │   POST /freelancer/portfolio/add-portfolio
        │       { name, description, files[] }
        │       → files uploaded to MinIO
        │       → portfolio record created
        │
        ├─ Upload before/after showcase
        │   POST /freelancer/portfolio/upload-after-before
        │       { service_type, before_file, after_file }
        │       → both images uploaded to MinIO
        │       → impact record created
        │
        └─ Submit bank details + KYC documents
            POST /editProfile  { bank details, govt ID file }
                → kyc_status = 'pending'

        --- Admin KYC review ---
        ▼
POST /admin/approve-kyc/:id   → kyc_status = 'approved'
   OR
POST /admin/reject-kyc        → kyc_status = 'rejected'  (with reason)

[Freelancer is now fully set up and discoverable]
```

---

## Flow 3 — Creator Hires a Freelancer <a name="flow-3"></a>

```
[Creator — after approval]
        │
        ├─ Browse freelancers
        │   GET /creator/all-freelancers         (with niche/filters)
        │   GET /creator/get-freelancer-by-id/:id
        │   GET /freelancers/:id/portfolio
        │   GET /freelancers/:id/impact
        │   GET /freelancers/:id/overview        (stats, completed jobs)
        │
        ├─ Save for later (optional)
        │   POST /creator/wishlist  { freelancer_id }
        │       → wishlist record created
        │
        ├─ Path A: Service Request (admin-mediated)
        │   POST /creator/service-request
        │       { service_id, description, number_of_units }
        │       → service_requests record: status='PENDING'
        │       → Admin reviews all requests: GET /admin/service-requests
        │       → Admin assigns freelancer:
        │           POST /admin/assignfreelancer-to-request
        │               → service_requests.status = 'ACCEPTED'
        │       → Project created
        │
        └─ Path B: Direct Hire
            POST /projects/create-project
                { freelancer_id, service_id, number_of_units, amount, end_date }
                → projects record: status='CREATED'
                → Proceeds to payment flow
```

---

## Flow 4 — Payment & Escrow <a name="flow-4"></a>

```
[Creator pays for project]
        │
        ├─ Option A: Pay from Wallet
        │       │
        │       ├─ (Load wallet first if needed)
        │       │   POST /wallet/load/create-order  { amount }
        │       │       → Razorpay order created for wallet top-up
        │       │       → Frontend opens Razorpay checkout
        │       │   POST /wallet/load/verify  { razorpay_order_id, payment_id, signature }
        │       │       → HMAC-SHA256 signature verified
        │       │       → wallets.balance += amount
        │       │       → wallet_transactions: direction=CREDIT, type=LOAD
        │       │
        │       └─ POST /payments/pay-wallet  { project_id }
        │               → wallets.balance -= project.amount
        │               → wallet_transactions: direction=DEBIT, type=PAYMENT
        │               → transactions record: status=HELD, payment_method=WALLET
        │               → Notification sent to freelancer
        │
        └─ Option B: Direct Razorpay Checkout
                POST /payments/create-order  { project_id }
                    → platform_commission = amount × 10%
                    → freelancer_amount = amount × 90%
                    → transactions record: status=INITIATED
                    → Razorpay order created
                    → Returns order_id + keys to frontend
                    → Frontend opens Razorpay checkout modal

                POST /payments/verify  { razorpay_order_id, payment_id, signature }
                    → HMAC-SHA256 signature verified against Razorpay secret
                    → transactions.status = HELD
                    → razorpay_payment_id saved
                    → Notification sent to freelancer

        ════════════════════════════════════════════
        [FUNDS ARE NOW IN ESCROW — status = HELD]
        [Neither creator nor freelancer can access]
        ════════════════════════════════════════════
```

**Transaction Status Machine:**
```
INITIATED → HELD → RELEASED → COMPLETED
                 ↘ REFUNDED
         ↘ FAILED
```

---

## Flow 5 — Project Execution & Delivery <a name="flow-5"></a>

```
[Freelancer — notified of new project]
        │
        ├─ View project details
        │   GET /projects/get-project/:id
        │       → Returns project info + creator name/avatar + service name
        │
        ├─ Upload deliverables (proof of work)
        │   POST /projects/upload-deliverable
        │       { project_id, files[] }
        │       → Files uploaded to MinIO
        │       → deliverables record linked to project
        │
        └─ Mark project as completed
            PUT /projects/:id/status  { status: 'COMPLETED' }
                → projects.status = 'SUBMITTED'
                → projects.completed_at = NOW()
                → Notification sent to creator & admin

[Creator reviews deliverables]
[Admin sees project is COMPLETED and payment is HELD → triggers release flow]
```

---

## Flow 6 — Admin Releases Escrow Payment <a name="flow-6"></a>

```
[Admin — reviews completed projects]
        │
        ├─ GET /admin/escrow
        │       → Lists all transactions with status=HELD
        │       → Shows linked project status, freelancer details, amounts
        │
        └─ POST /admin/escrow/:id/release
                │
                │  System checks:
                │    ✓ transaction.status = HELD
                │    ✓ project.status = COMPLETED
                │    ✓ freelancer KYC approved (has bank details)
                │
                │  Initiates Razorpay Payout:
                │    → freelancer_amount = amount - platform_commission
                │    → Razorpay Payout API called with freelancer's bank/UPI
                │
                │  Updates:
                │    → transactions.status = RELEASED
                │    → transactions.released_by = admin_id
                │    → transactions.released_at = NOW()
                │    → transactions.payout_id saved
                │    → transactions.payout_utr saved
                │
                │  When Razorpay confirms payout:
                │    → transactions.status = COMPLETED
                │
                ▼
        [Freelancer receives funds in bank/UPI account]
        [Notification sent to freelancer: "Payment sent"]
```

---

## Flow 7 — Dispute Resolution <a name="flow-7"></a>

```
[Creator or Freelancer — has an issue]
        │
        ├─ POST /creator/dispute-raise
        │      OR /freelancer/dispute-raise
        │       { other_party_id, reason_of_dispute, description, project_id? }
        │       → disputes record: status='OPEN', raised_by identified
        │       → Admin receives email notification
        │
        ├─ GET /admin/disputes
        │       → Admin reviews all open disputes
        │       → Sees both parties' info, project details, transaction status
        │
        └─ PATCH /admin/disputes/resolve/:id
                { resolution: 'REFUND' | 'RELEASE', notes }
                │
                ├─ If REFUND:
                │   → creator's wallet credited with project amount
                │   → wallet_transactions: direction=CREDIT, type=REFUND
                │   → transactions.status = REFUNDED
                │   → Notification to creator: "Refund processed"
                │
                └─ If RELEASE:
                    → Normal payout flow initiated to freelancer
                    → transactions.status = RELEASED → COMPLETED
                    → Notification to freelancer: "Payment released"

        [disputes.status = RESOLVED]
        [disputes.resolved_by = admin_id]
        [disputes.resolved_at = NOW()]
```

---

## Flow 8 — Real-time Chat <a name="flow-8"></a>

```
[User opens chat — connects to chat-server:7001]
        │
        ├─ WebSocket connection established
        │   → socketAuth middleware validates JWT token
        │   → User authenticated for socket session
        │
        ├─ User joins room (by project_id or conversation_id)
        │
        ├─ User sends message
        │   → Socket event handler receives it
        │   → Message stored in Redis cache
        │   → Broadcast to all room members instantly
        │
        └─ Other user receives message in real-time via socket event

Note: Chat server runs on port 7001 (separate from REST API on 7000)
```

---

## Flow 9 — Notifications <a name="flow-9"></a>

```
[Any platform action occurs]
        │
        └─ INSERT into web_notifications
                { sender_id, recipient_id, event_type, title, body, action_route }

[Frontend fetches notifications]
        │
        ├─ GET /notifications?page=1&limit=20&unreadOnly=true
        │       → Returns paginated notifications
        │       → Resolves sender avatar presigned URLs from MinIO
        │
        ├─ POST /notifications/:id/read
        │       → is_read = true, read_at = NOW()
        │
        └─ POST /notifications/read-all
                → All recipient's notifications marked as read

Events that trigger notifications:
  • Payment received (freelancer notified)
  • Project marked complete (creator + admin notified)
  • Dispute raised (admin notified via email)
  • Payout released (freelancer notified)
  • Profile approved/rejected (user notified)
  • KYC approved/rejected (freelancer notified)
```

---

## Key Actors Summary <a name="actors"></a>

| Actor | What They Can Do |
|---|---|
| **Creator** | Register, browse freelancers, save wishlist, create service requests, create projects, pay via wallet or Razorpay, view deliverables, raise disputes, view notifications |
| **Freelancer** | Register, set up profile, add services, upload portfolio & before/after, receive projects, upload deliverables, mark projects complete, raise disputes, view payouts & earnings |
| **Admin** | Approve/reject users & KYC, add niches & service options, assign freelancers to requests, view all escrow, release payments via Razorpay payout, resolve disputes, view platform stats, update commission % |
| **System** | Hold funds in escrow (`transactions`), store files (`MinIO`), send notifications (`web_notifications`), process payments (`Razorpay`), cache sessions (`Redis`), real-time messaging (`Socket.IO`) |

---

## API Routes Quick Reference <a name="api-routes"></a>

### Auth — `/api/v1/auth`
| Method | Route | Action |
|---|---|---|
| POST | `/send-otp` | Send OTP to email |
| POST | `/verify-otp` | Verify OTP & register user |
| POST | `/login` | Password login |
| POST | `/refresh` | Refresh access token |
| GET | `/logout` | Clear auth cookies |
| PUT | `/change-password` | Change password |

### Admin — `/api/v1/admin` *(Admin only)*
| Method | Route | Action |
|---|---|---|
| POST | `/userApproval` | Approve/reject creator or freelancer |
| GET | `/get-all-creators` | List all creators |
| GET | `/get-all-freelancers` | List all freelancers |
| GET | `/freelancers-for-KYC-approval` | Pending KYC list |
| POST | `/approve-kyc/:id` | Approve freelancer KYC |
| POST | `/reject-kyc` | Reject freelancer KYC |
| POST | `/suspend-freelancer` | Suspend freelancer |
| GET | `/escrow` | List all HELD transactions |
| POST | `/escrow/:id/release` | Release payment to freelancer |
| GET | `/disputes` | List all disputes |
| PATCH | `/disputes/resolve/:id` | Resolve dispute (REFUND or RELEASE) |
| GET | `/stats` | Platform KPIs |
| PUT | `/commission` | Update platform commission % |
| POST | `/add-niches` | Add niche categories |
| POST | `/assignfreelancer-to-request` | Assign freelancer to service request |
| GET | `/service-requests` | All service requests |

### Freelancer — `/api/v1/freelancer`
| Method | Route | Action |
|---|---|---|
| POST | `/add-service` | Create service offering |
| GET | `/get-services` | Get own services |
| PUT | `/update-service` | Update service |
| DELETE | `/delete-services` | Delete service |
| POST | `/portfolio/add-portfolio` | Upload portfolio items |
| POST | `/portfolio/upload-after-before` | Upload before/after |
| GET | `/portfolio/get-protfolio` | Get portfolio |
| GET | `/portfolio/get-after-before` | Get before/after |
| GET | `/profile-progress` | Profile completion % |
| GET | `/earnings` | Earnings summary |
| GET | `/payouts` | Payout history |
| POST | `/dispute-raise` | Raise dispute |

### Creator — `/api/v1/creator`
| Method | Route | Action |
|---|---|---|
| POST | `/service-request` | Create service request |
| GET | `/service-requests` | Own service requests |
| POST | `/wishlist` | Add to wishlist |
| GET | `/wishlist` | Get wishlist |
| GET | `/all-freelancers` | Browse freelancers |
| GET | `/get-freelancer-by-id/:id` | View freelancer profile |
| POST | `/dispute-raise` | Raise dispute |

### Projects — `/api/v1/projects`
| Method | Route | Action |
|---|---|---|
| POST | `/create-project` | Create project (creator) |
| GET | `/get-my-projects` | Get own projects |
| GET | `/get-project/:id` | Get project details + deliverables |
| PUT | `/update-project-status/:id/status` | Mark project COMPLETED (freelancer) |
| POST | `/upload-deliverable` | Upload proof of work (freelancer) |
| DELETE | `/delete-project/:id` | Delete project (no transactions) |

### Payments — `/api/v1/payments` *(Creator only)*
| Method | Route | Action |
|---|---|---|
| POST | `/create-order` | Create Razorpay order for project |
| POST | `/verify` | Verify payment signature → funds HELD |
| POST | `/pay-wallet` | Pay from wallet balance |
| GET | `/my-transactions` | Own transaction history |

### Wallet — `/api/v1/wallet`
| Method | Route | Action |
|---|---|---|
| GET | `/balance` | Get wallet balance |
| POST | `/load/create-order` | Create Razorpay order to load wallet |
| POST | `/load/verify` | Verify load payment → wallet credited |
| GET | `/transactions` | Wallet transaction history |

### Notifications — `/api/v1/notifications`
| Method | Route | Action |
|---|---|---|
| GET | `/` | Get notifications (paginated, filterable) |
| POST | `/:id/read` | Mark notification as read |
| POST | `/read-all` | Mark all as read |

### Public — `/api/v1/public`
| Method | Route | Action |
|---|---|---|
| GET | `/check-username` | Check username availability |
| POST | `/get-upload-urls` | Get MinIO presigned upload URLs |
| GET | `/home-services` | Featured services for homepage |
| POST | `/contact` | Contact form → admin email |

---

## Payment Transaction Status Machine

```
                    [Creator initiates payment]
                             │
                             ▼
                         INITIATED
                        (Razorpay order created)
                             │
                    [Payment completed in checkout]
                             │
                             ▼
                           HELD  ◄─── [Funds in escrow]
                          /    \
          [Admin: REFUND]        [Admin: RELEASE]
                /                        \
               ▼                          ▼
          REFUNDED                    RELEASED
      (wallet credited            (Razorpay payout
       to creator)                 initiated to freelancer)
                                         │
                                [Payout confirmed]
                                         │
                                         ▼
                                     COMPLETED
```

---

## Project Status Machine

```
CREATED → IN_PROGRESS → COMPLETED
                    ↘ CANCELLED
                    ↘ DISPUTE
```

---

## File Storage (MinIO) Path Reference

| Content | MinIO Path |
|---|---|
| Freelancer profile image | `freelancer/{freelancer_id}/profile/` |
| Freelancer portfolio | `freelancer/{freelancer_id}/portfolio/` |
| Before/after impact | `freelancer/Impact/{user_id}/{before\|after}/` |
| Service gallery | `services/{service_id}/gallery/` |
| Project deliverables | `deliverables/{project_id}/` |

All files are accessed via **presigned URLs** (4-hour expiry) generated on-demand.

---

*Last updated: 2026-03-26*
