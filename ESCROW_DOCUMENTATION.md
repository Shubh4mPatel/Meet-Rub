# MeetRub Escrow System — Razorpay Routes Integration

**Date**: 3 May 2026  
**Status**: Implemented & Tested on Razorpay Test Mode

---

## Table of Contents

1. [Overview](#overview)
2. [Flow Diagram](#flow-diagram)
3. [Phase 1 — Freelancer Onboarding](#phase-1--freelancer-onboarding)
4. [Phase 2 — Payment with Escrow](#phase-2--payment-with-escrow)
5. [Phase 3 — Release / Dispute / Refund](#phase-3--release--dispute--refund)
6. [Phase 4 — Reconciliation Cron](#phase-4--reconciliation-cron)
7. [Webhook Events](#webhook-events)
8. [All API Endpoints](#all-api-endpoints)
9. [Razorpay APIs Used](#razorpay-apis-used)
10. [Database Schema (New Columns)](#database-schema-new-columns)
11. [Configuration (.env)](#configuration-env)
12. [Key Files](#key-files)
13. [Legacy vs Routes](#legacy-vs-routes)

---

## Overview

The escrow system uses **Razorpay Routes** to hold creator payments in escrow until the admin releases them to the freelancer. When a creator pays for a project, Razorpay automatically splits the payment — the freelancer's share is transferred to their linked account but **held** (`on_hold: 1`). The admin reviews the work and releases the hold. Razorpay then settles funds to the freelancer's bank account in T+2 days.

---

## Flow Diagram

```
┌──────────────────── ONBOARDING (One-time) ─────────────────────┐
│                                                                 │
│  Freelancer adds bank details                                   │
│       ↓                                                         │
│  Admin clicks "Create Linked Account" (Button 1)               │
│       ↓                                                         │
│  4 Razorpay API calls run sequentially:                         │
│    1. POST /v2/accounts           → Creates linked account      │
│    2. POST /v2/accounts/:id/stakeholders → KYC stakeholder      │
│    3. POST /v2/accounts/:id/products     → Request Route product│
│    4. PATCH /v2/accounts/:id/products/:pid → Submit bank details│
│       ↓                                                         │
│  Razorpay verifies → status = "activated"                       │
│       ↓                                                         │
│  Admin clicks "Approve KYC" (Button 2) → Platform KYC approved │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────── PAYMENT + ESCROW ───────────────────────────┐
│                                                                 │
│  Creator clicks "Pay"                                           │
│       ↓                                                         │
│  POST /api/v1/payment/create-order                              │
│    → Razorpay order WITH transfers[] (on_hold: 1)               │
│    → on_hold_until = 30 days (auto-release safety net)          │
│       ↓                                                         │
│  Creator completes payment on Razorpay checkout                 │
│       ↓                                                         │
│  POST /api/v1/payment/verify (or webhook: payment.captured)     │
│    → Transaction = HELD, stores razorpay_transfer_id            │
│    → Project = IN_PROGRESS                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────── RELEASE / DISPUTE ──────────────────────────┐
│                                                                 │
│  Option A: Admin releases funds                                 │
│    POST /api/v1/admin/transactions/:id/release                  │
│      → Razorpay: PATCH transfers/:id { on_hold: 0 }            │
│      → Transaction = COMPLETED, Project = COMPLETED             │
│      → Funds settle to freelancer bank in T+2                   │
│                                                                 │
│  Option B: Dispute raised → Admin resolves                      │
│    "release" → same as Option A                                 │
│    "refund"  → Reverse transfer + Refund payment to creator     │
│      → POST transfers/:id/reversals                             │
│      → POST payments/:id/refund                                 │
│      → Transaction = REFUNDED                                   │
│                                                                 │
│  Option C: Auto-release (safety net)                            │
│    If admin doesn't act for 30 days → Razorpay auto-releases    │
│    Reconciliation cron alerts 5 days before auto-release         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Freelancer Onboarding

### Pre-requisites
- Freelancer has added bank details (`bank_account_no`, `bank_ifsc_code`, `bank_account_holder_name`)
- Admin is logged in with admin role

### API: Create Linked Account (Admin Button 1)

```
POST /api/v1/admin/freelancer/:freelancer_id/create-linked-account
Auth: Admin JWT (cookie)
```

**4 sequential Razorpay API calls:**

| Step | Razorpay API | Purpose | Saved to DB |
|------|-------------|---------|-------------|
| 1 | `POST /v2/accounts` | Create linked account | `razorpay_linked_account_id` |
| 2 | `POST /v2/accounts/:id/stakeholders` | Add KYC stakeholder | `razorpay_stakeholder_id` |
| 3 | `POST /v2/accounts/:id/products` | Request Route product | `razorpay_product_id` |
| 4 | `PATCH /v2/accounts/:id/products/:pid` | Submit bank details | `razorpay_account_status` |

**Resumability**: Each step saves progress independently. If step 2 fails, retrying skips step 1 and resumes from step 2.

**Response Example:**
```json
{
  "status": "success",
  "message": "Linked account created. Status: activated.",
  "data": {
    "status": "activated",
    "accountId": "acc_SkpaOzr51XG715",
    "stakeholderId": "sth_SkpjYk1234abc",
    "productId": "acc_prd_Skpjeb9aYZ28ke",
    "activationStatus": "activated",
    "requirements": []
  }
}
```

**Possible statuses:**

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `activated` | Ready for payments | Admin can approve platform KYC |
| `needs_clarification` | Bad bank details etc. | Check `requirements[]`, reject KYC with reason, freelancer updates, admin re-triggers |
| `pending` / `under_review` | Razorpay reviewing | Wait and check status periodically |

### API: Check Linked Account Status

```
GET /api/v1/admin/freelancer/:freelancer_id/linked-account-status
Auth: Admin JWT (cookie)
```

Syncs latest status from Razorpay, updates DB, returns `requirements[]` if clarification needed.

### API: Approve Platform KYC (Admin Button 2)

```
POST /api/v1/admin/approve-kyc/:freelancer_id
Auth: Admin JWT (cookie)
```

**Guard**: Requires `razorpay_account_status = 'activated'` before allowing approval.

### API: Reject Platform KYC

```
POST /api/v1/admin/reject-kyc
Auth: Admin JWT (cookie)
Body: { "freelancer_id": 12, "reason_for_rejection": "Bank details incorrect..." }
```

### Correction Flow (wrong bank details)

1. Admin checks status → sees `needs_clarification` with `requirements[]`
2. Admin rejects platform KYC with the Razorpay reason
3. Freelancer updates bank details via `PUT /api/v1/freelancer/bank-account`
4. Admin re-triggers `POST /api/v1/admin/freelancer/:id/create-linked-account`
5. Steps 1-3 skipped; only step 4 re-runs with corrected bank details
6. Status should change to `activated`

---

## Phase 2 — Payment with Escrow

When a creator pays for a project, the system checks if the freelancer has an activated linked account. If yes, a Razorpay **order with transfers** is created.

### API: Create Payment Order

```
POST /api/v1/payment/create-order
Auth: Creator JWT (cookie)
Body: { "projectId": 5 }
```

**Internal logic** (`paymentService.createServicePaymentOrder`):

1. Fetches project with freelancer's `razorpay_linked_account_id` and `razorpay_account_status`
2. Calculates commission split:
   - `totalAmount` = serviceAmount + GST (18%)
   - `platformCommission` = 20% of serviceAmount
   - `freelancerAmount` = serviceAmount - commission
3. Creates Razorpay order:
   - If freelancer has `activated` linked account → adds `transfers[]` with `on_hold: 1`
   - If no linked account → order without transfers (legacy flow)

**Order payload sent to Razorpay (with transfers):**
```json
{
  "amount": 11800,
  "currency": "INR",
  "receipt": "project_5_1683100000000",
  "transfers": [{
    "account": "acc_SkpaOzr51XG715",
    "amount": 8000,
    "currency": "INR",
    "on_hold": 1,
    "on_hold_until": 1685692000,
    "notes": { "project_id": "5", "transaction_id": "42" }
  }]
}
```

### API: Verify Payment

```
POST /api/v1/payment/verify
Auth: Creator JWT (cookie)
Body: {
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "xxx"
}
```

**What happens:**
1. Verifies Razorpay signature (HMAC SHA256)
2. Updates transaction status → `HELD`
3. Fetches `razorpay_transfer_id` from payment and stores it
4. Updates project → `IN_PROGRESS`

**Transaction lifecycle:**
```
INITIATED → HELD → COMPLETED    (normal)
INITIATED → HELD → REFUNDED     (dispute refund)
INITIATED → FAILED              (payment failed)
```

---

## Phase 3 — Release / Dispute / Refund

### API: Release Transfer (Admin)

```
POST /api/v1/admin/transactions/:id/release
Auth: Admin JWT (cookie)
```

**What happens:**
1. Fetches transaction (must be `HELD` with `razorpay_transfer_id`)
2. Calls Razorpay: `PATCH /v1/transfers/:id { on_hold: 0 }`
3. Transaction → `COMPLETED`, Project → `COMPLETED`
4. Razorpay settles to freelancer bank in T+2 business days

**Response:**
```json
{
  "status": "success",
  "message": "Transfer released. Funds will settle to freelancer bank in T+2 days.",
  "data": {
    "transactionId": 42,
    "transferId": "trf_xxx",
    "status": "COMPLETED",
    "freelancerAmount": 80.00
  }
}
```

### Dispute Resolution

```
PATCH /api/v1/admin/disputes/resolve/:id
Auth: Admin JWT (cookie)
Body: { "action": "release" | "refund", "resolution_notes": "..." }
```

**Action "release"** (favor freelancer):
- Releases on-hold transfer → `razorpay.transfers.edit(id, { on_hold: 0 })`
- Transaction → `COMPLETED`

**Action "refund"** (favor creator):
1. Reverses transfer: `POST /v1/transfers/:id/reversals`
2. Refunds payment: `POST /v1/payments/:id/refund`
3. Transaction → `REFUNDED`

---

## Phase 4 — Reconciliation Cron

**File**: `backend/cron/transferReconciliation.js`  
**Runs**: Every 60 minutes (configurable)

**What it does:**
1. Queries all `HELD` transactions with `razorpay_transfer_id` older than 30 min
2. Fetches each transfer status from Razorpay
3. If already released/settled → syncs DB to `COMPLETED`
4. If still held and within 5 days of 30-day auto-release → logs warning alert

**Config (.env):**
```
TRANSFER_RECONCILIATION_INTERVAL_MINUTES=60
TRANSFER_RECONCILIATION_MIN_AGE_MINUTES=30
```

---

## Webhook Events

Register these in Razorpay Dashboard → Settings → Webhooks:

| Event | Handler | DB Action |
|-------|---------|-----------|
| `payment.captured` | `handlePaymentCaptured` | Transaction → HELD, stores transfer ID |
| `payment.failed` | `handlePaymentFailed` | Transaction → FAILED |
| `transfer.processed` | `handleTransferProcessed` | Transaction → COMPLETED, Project → COMPLETED |
| `transfer.failed` | `handleTransferFailed` | Transaction → FAILED |
| `transfer.reversed` | `handleTransferReversed` | Transaction → REFUNDED |
| `transfer.settled` | (logged only) | No action needed |

**Webhook endpoint:** `POST /api/v1/payment/webhook`  
**Signature verification:** `RAZORPAY_WEBHOOK_SECRET` for payment/transfer events, `RAZORPAY_X_WEBHOOK_SECRET` for payout events.

---

## All API Endpoints

### Admin Endpoints (`/api/v1/admin`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/freelancer/:freelancer_id/create-linked-account` | Onboard freelancer to Razorpay Routes |
| `GET` | `/freelancer/:freelancer_id/linked-account-status` | Check & sync Razorpay account status |
| `POST` | `/approve-kyc/:freelancer_id` | Approve platform KYC (requires Razorpay activated) |
| `POST` | `/reject-kyc` | Reject platform KYC with reason |
| `POST` | `/transactions/:id/release` | Release held transfer to freelancer |
| `PATCH` | `/disputes/resolve/:id` | Resolve dispute (release or refund) |

### Freelancer Endpoints (`/api/v1/freelancer`)

| Method | Path | Purpose |
|--------|------|---------|
| `PUT` | `/bank-account` | Add/update bank details |
| `GET` | `/bank-account` | Get bank details (masked) |
| `POST` | `/onboard-linked-account` | Self-service onboarding |
| `GET` | `/linked-account-status` | Check own linked account status |

### Payment Endpoints (`/api/v1/payment`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/create-order` | Create order (with transfers if linked account exists) |
| `POST` | `/verify` | Verify payment, store transfer ID, set HELD |
| `POST` | `/webhook` | Receive Razorpay webhook events |

---

## Razorpay APIs Used

### Routes API (v2) — Custom axios client (`config/razorpayRoutes.js`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/v2/accounts` | Create linked account |
| `POST` | `/v2/accounts/:id/stakeholders` | Create stakeholder |
| `POST` | `/v2/accounts/:id/products` | Request Route product config |
| `PATCH` | `/v2/accounts/:id/products/:pid` | Update product config (bank details) |
| `GET` | `/v2/accounts/:id` | Fetch linked account status |
| `GET` | `/v2/accounts/:id/products/:pid` | Fetch product config status |

### Standard API (v1) — Razorpay SDK (`config/razorpay.js`)

| Method | SDK Call | Purpose |
|--------|---------|---------|
| `POST` | `razorpay.orders.create()` | Create order with transfers |
| `GET` | `razorpay.payments.fetch()` | Fetch payment details (get transfer ID) |
| `PATCH` | `razorpay.transfers.edit()` | Release hold (`on_hold: 0`) |
| `GET` | `razorpay.transfers.fetch()` | Fetch transfer status (reconciliation) |
| `POST` | `razorpay.transfers.reverse()` | Reverse transfer (dispute refund) |
| `POST` | `razorpay.payments.refund()` | Refund payment to creator |

---

## Database Schema (New Columns)

### `freelancer` table

| Column | Type | Purpose |
|--------|------|---------|
| `razorpay_linked_account_id` | `VARCHAR(50)` | e.g. `acc_SkpaOzr51XG715` |
| `razorpay_stakeholder_id` | `VARCHAR(50)` | e.g. `sth_xxx` |
| `razorpay_product_id` | `VARCHAR(50)` | e.g. `acc_prd_xxx` |
| `razorpay_account_status` | `VARCHAR(30)` | `created` / `pending` / `activated` / `needs_clarification` / `suspended` |

### `transactions` table

| Column | Type | Purpose |
|--------|------|---------|
| `razorpay_transfer_id` | `VARCHAR(50)` | e.g. `trf_xxx` |
| `held_at` | `TIMESTAMP` | When payment was captured and held |
| `released_by` | `INTEGER` | Admin ID who released the transfer |
| `released_at` | `TIMESTAMP` | When the transfer was released |

---

## Configuration (.env)

```env
# Razorpay credentials
RAZORPAY_KEY_ID=rzp_test_SkSgV9AKekT03z
RAZORPAY_KEY_SECRET=WkHe1yVgeOAiL78PIBw4QQSN

# Webhook secrets
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
RAZORPAY_X_WEBHOOK_SECRET=your_x_webhook_secret

# Commission
PLATFORM_COMMISSION_PERCENTAGE=20

# Reconciliation cron
TRANSFER_RECONCILIATION_INTERVAL_MINUTES=60
TRANSFER_RECONCILIATION_MIN_AGE_MINUTES=30
```

---

## Key Files

| File | Purpose |
|------|---------|
| `config/razorpayRoutes.js` | Axios client for Razorpay v2 API (linked accounts) |
| `config/razorpay.js` | Razorpay SDK instance (orders, transfers, payments) |
| `src/razor-pay-services/linkedAccountService.js` | Linked account CRUD + onboarding orchestrator |
| `src/razor-pay-services/paymentService.js` | Order creation (with transfers), payment verify, transfer release |
| `src/controller/razor-pay-controllers/adminController.js` | Admin endpoints (create linked account, release transfer) |
| `src/controller/razor-pay-controllers/freelancerController.js` | Freelancer endpoints (bank details, self-service onboarding) |
| `src/controller/razor-pay-controllers/webhookController.js` | Webhook handlers (payment, transfer, payout events) |
| `src/controller/dispute/disputeController.js` | Dispute resolution (release or reverse+refund) |
| `cron/transferReconciliation.js` | Cron: sync held transfers, alert on near-expiry |
| `src/routes/adminRoutes.js` | Admin route definitions |
| `src/routes/freelancerRoutes.js` | Freelancer route definitions |

---

## Legacy vs Routes

The system supports **both flows in parallel**:

| Aspect | Legacy (RazorpayX Payouts) | Routes (Escrow) |
|--------|---------------------------|-----------------|
| Trigger | Freelancer requests payout | Automatic on payment |
| Funds held by | Platform balance | Razorpay (on_hold transfer) |
| Release | Admin approves payout → RazorpayX sends INR | Admin releases transfer → Razorpay settles |
| Condition | Freelancer has NO linked account | Freelancer has `activated` linked account |
| Refund | Manual balance adjustment | `transfers.reverse()` + `payments.refund()` |
| Determined at | Payout request time | Order creation time (automatic) |
