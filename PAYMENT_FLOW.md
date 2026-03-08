# Meet-Rub: Payment & Project Flow

## Overview

Meet-Rub is a platform where **Creators** (clients) hire **Freelancers** for services. Payments flow through an **escrow system** — the creator pays upfront, funds are held by the platform, and released to the freelancer only after the project is completed and approved by an admin.

---

## Actors

| Actor | Role |
|-------|------|
| **Creator** | Hires freelancers, pays for projects |
| **Freelancer** | Delivers work, receives payment after completion |
| **Admin** | Reviews completed projects and releases held funds |
| **Platform** | Deducts a commission (default 10%) before paying the freelancer |

---

## End-to-End Project & Payment Flow

```
Creator                    Platform / Escrow              Freelancer
   |                              |                             |
   |--- 1. Browse & select ------>|                             |
   |      freelancer + service    |                             |
   |                              |                             |
   |--- 2. Create Project ------->|                             |
   |   (service_id, freelancer,   |  project.status = CREATED   |
   |    units, amount, end_date)  |                             |
   |                              |                             |
   |--- 3. Pay (wallet/Razorpay)->|                             |
   |                              |  funds HELD in escrow       |
   |                              |  transaction.status = HELD  |
   |                              |  project.status = IN_PROGRESS (implicit) |
   |                              |                             |
   |                              |<--- 4. Freelancer works ----|
   |                              |      uploads deliverables   |
   |                              |                             |
   |                              |<--- 5. Freelancer marks ----|
   |                              |     project COMPLETED       |
   |                              |                             |
   |<-- 6. Admin reviews -------->|                             |
   |                              |                             |
   |                              |--- 7. Admin releases ------>|
   |                              |    payment (minus commission)|
   |                              |    transaction.status=RELEASED |
   |                              |    payout initiated via     |
   |                              |    Razorpay Payout API      |
```

---

## Step-by-Step Breakdown

### Step 1 — Creator Browses Services

The creator explores freelancer profiles and their offered services.

---

### Step 2 — Creator Creates a Project

**Who:** Creator
**API:** `POST /project/create`

The creator initiates the project by providing:

| Field | Description |
|-------|-------------|
| `freelancer_id` | The freelancer being hired |
| `service_id` | The specific service being purchased |
| `number_of_units` | How many units of the service |
| `amount` | Agreed total amount (INR) |
| `project_end_date` | Expected completion date |

**Result:** A project record is created with `status = CREATED`.

> The platform verifies that the freelancer is approved (`approval_status = 'approved'`) before allowing project creation.

---

### Step 3 — Creator Pays (Escrow)

This is the most critical step. The creator **pays the full amount upfront**. Funds are **held in escrow** — neither the platform nor the freelancer can spend them yet.

There are two payment methods:

#### Option A — Pay via Wallet

**Who:** Creator
**Prerequisite:** Creator must have sufficient wallet balance.

1. Creator loads wallet via Razorpay (`POST /wallet/load-order` → `POST /wallet/verify-load`)
2. Creator pays for the project from wallet (`POST /payment/pay-from-wallet`)

**What happens internally:**
- Creator's wallet is **debited** (full project amount)
- A `transactions` record is created with `status = HELD`, `payment_source = WALLET`
- `held_at` timestamp is set

#### Option B — Pay via Razorpay (Direct)

**Who:** Creator
**Flow:**

1. **Create order:** `POST /payment/create-order`
   - Platform creates a Razorpay order for the full amount
   - A `transactions` record is created with `status = INITIATED`
   - Returns Razorpay order ID + key to the frontend

2. **Frontend processes payment** via Razorpay checkout

3. **Verify payment:** `POST /payment/verify`
   - Platform verifies the Razorpay signature (HMAC-SHA256)
   - Transaction status updated to `HELD`
   - `razorpay_payment_id` + `held_at` saved

**Result (both methods):** Funds are in escrow. Transaction `status = HELD`.

#### Commission Breakdown at Payment Time

| Component | Value |
|-----------|-------|
| Total paid by creator | `amount` |
| Platform commission | `amount × 10%` (configurable) |
| Freelancer will receive | `amount × 90%` |

These are **calculated and recorded** at payment time in the `transactions` table (`platform_commission`, `freelancer_amount`).

---

### Step 4 — Freelancer Works & Uploads Deliverables

**Who:** Freelancer

The freelancer works on the project and uploads deliverables (files stored in MinIO). Deliverables are linked to `service_id`, `creator_id`, and `freelancer_id`.

The creator can view deliverables via `GET /project/:id`.

---

### Step 5 — Freelancer Marks Project as Completed

**Who:** Freelancer
**API:** `PUT /project/:id/status` with `{ "status": "COMPLETED" }`

> Only the freelancer can mark the project as `COMPLETED`. The platform enforces this permission check.

**Result:** `project.status = COMPLETED`, `completed_at` timestamp is set.

---

### Step 6 — Admin Reviews

**Who:** Admin
**API:** `GET /admin/escrow-transactions` (filter by `status=HELD`)

The admin can see all projects with funds held in escrow, along with the project status. The admin verifies that the project is genuinely completed before releasing payment.

> Payment **cannot** be released unless `project.status = COMPLETED`.

---

### Step 7 — Admin Releases Payment to Freelancer

**Who:** Admin
**API:** `POST /admin/release-payment/:transactionId`

**What happens internally:**
1. Platform verifies `transaction.status = HELD` and `project.status = COMPLETED`
2. A **Razorpay Payout** is initiated to the freelancer's bank account/UPI
3. `transactions` record updated:
   - `status = RELEASED`
   - `released_at` timestamp set
   - `released_by` (admin ID) recorded
   - `payout_id`, `payout_status`, `payout_utr` saved

**The freelancer receives:** `freelancer_amount` (total minus platform commission)

---

## Project Status Lifecycle

```
CREATED  →  IN_PROGRESS  →  COMPLETED  →  (payment RELEASED)
                ↓
            CANCELLED  (only by creator, only if no transactions exist)
                ↓
            DISPUTE    (escalated)
```

| Status | Who Sets It | Meaning |
|--------|------------|---------|
| `CREATED` | Creator (on project creation) | Project created, not yet paid |
| `IN_PROGRESS` | System (after payment) | Funds held, freelancer working |
| `COMPLETED` | Freelancer | Work done, ready for payout |
| `CANCELLED` | Creator | Only possible if no payment made |
| `DISPUTE` | Admin | Conflict between parties |

---

## Transaction Status Lifecycle

```
INITIATED → PENDING → HELD → RELEASED → COMPLETED
                ↓
             FAILED
                ↓
            REFUNDED
```

| Status | Trigger |
|--------|---------|
| `INITIATED` | Razorpay order created (before payment) |
| `PENDING` | Payment in progress |
| `HELD` | Payment confirmed, funds in escrow |
| `RELEASED` | Admin approved, payout initiated |
| `COMPLETED` | Payout successfully delivered to freelancer |
| `FAILED` | Payment or payout failed |
| `REFUNDED` | Creator refunded (e.g. dispute resolution) |

---

## Wallet System

Every user has a wallet (`wallets` table). The wallet is used for:

| Operation | `wallet_transactions.reference_type` | Direction |
|-----------|--------------------------------------|-----------|
| Load wallet (via Razorpay) | `LOAD` | CREDIT |
| Pay for a project | `PAYMENT` | DEBIT |
| Receive commission (platform) | `COMMISSION` | CREDIT |
| Freelancer payout | `WITHDRAWAL` | DEBIT |
| Refund to creator | `REFUND` | CREDIT |

---

## Key Rules & Constraints

- A project **cannot be deleted** if any transaction is associated with it.
- Payment **cannot be released** unless `project.status = COMPLETED`.
- Only the **freelancer** can mark a project as `COMPLETED`.
- Only the **creator** can cancel a project (and only if unpaid).
- The **platform commission** is locked in at payment time and cannot be changed retroactively.
- Wallet load minimum: `MIN_WALLET_LOAD` env var (default ₹100), maximum: `MAX_WALLET_LOAD` (default ₹1,00,000).

---

## Database Tables Involved

| Table | Purpose |
|-------|---------|
| `projects` | Core project record linking creator, freelancer, service, amount, status |
| `transactions` | Payment record — escrow tracking, commission split, Razorpay IDs, payout info |
| `wallets` | Each user's wallet balance |
| `wallet_transactions` | Audit log of every credit/debit to a wallet |
| `deliverables` | Files uploaded by freelancer as proof of work |
| `services` | Service catalog offered by freelancers |
