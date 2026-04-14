# Pooled Earnings Payment Flow - Implementation Summary

## ✅ Changes Implemented

### 1. **Database Schema Updates**

#### Migration File Created
- **Location**: `backend/migrations/fix_payouts_pooled_earnings.sql`
- **Execution**: Run using `node run-migration.js` or psql directly

#### Freelancer Table
```sql
ALTER TABLE freelancer ADD COLUMN IF NOT EXISTS earnings_balance numeric(15,2) DEFAULT 0.00;
```
- **Purpose**: Accumulate earnings from multiple approved transactions
- **Updated by**: `approveProject` (increments), `requestPayout` (decrements)

#### Payouts Table
```sql
-- Make nullable to support pooled earnings (payout not tied to single transaction)
ALTER TABLE payouts ALTER COLUMN transaction_id DROP NOT NULL;
ALTER TABLE payouts ALTER COLUMN freelancer_account_id DROP NOT NULL;

-- Add tracking columns
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS requested_at timestamp with time zone;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS approved_by integer;

-- Update status constraint to include REQUESTED
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check 
  CHECK (status IN ('REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING', 'PROCESSED', 'REVERSED', 'FAILED', 'CANCELLED'));
```

### 2. **Schema.md Documentation Updated**
- ✅ Added `earnings_balance` column to freelancer table definition
- ✅ Made `transaction_id` nullable in payouts table
- ✅ Made `freelancer_account_id` nullable in payouts table
- ✅ Added `requested_at`, `approved_at`, `approved_by` columns
- ✅ Updated status constraint to include `REQUESTED`
- ✅ Added comments explaining pooled earnings model

---

## 💰 Complete Payment Flow

### Phase 1: Payment Capture
**API**: `POST /api/v1/payments/verify`

1. Creator pays for project
2. Payment verified via Razorpay
3. Transaction created: `status = INITIATED` → `HELD`
4. Funds held in escrow

**Transaction States**: `INITIATED` → `HELD`

---

### Phase 2: Delivery Approval
**API**: `POST /api/v1/projects/:id/approve`

1. Freelancer uploads deliverable (project: `status = COMPLETED`)
2. Creator approves delivery
3. Transaction: `HELD` → `APPROVED`
4. **Freelancer earnings_balance increased** by `transaction.freelancer_amount`

**Code**:
```javascript
// projectController.js - approveProject()
await client.query(
  `UPDATE freelancer SET earnings_balance = earnings_balance + $1 WHERE freelancer_id = $2`,
  [transaction.freelancer_amount, transaction.freelancer_id]
);

await client.query(
  `UPDATE transactions SET status = 'APPROVED', approved_at = NOW() WHERE id = $1`,
  [transaction.id]
);
```

**Transaction States**: `HELD` → `APPROVED` ✅  
**Freelancer Balance**: `+= freelancer_amount`

---

### Phase 3: Payout Request
**API**: `POST /api/v1/freelancer/payouts/request`

**Request Body**:
```json
{
  "amount": 5000
}
```

**Validations**:
- ✅ Minimum: ₹100
- ✅ Freelancer must be `VERIFIED`
- ✅ Only one active payout allowed (`status IN ('REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING')`)
- ✅ Amount ≤ `earnings_balance`

**Code**:
```javascript
// freelancerController.js - requestPayout()
// Deduct from balance
await client.query(
  `UPDATE freelancer SET earnings_balance = earnings_balance - $1 WHERE user_id = $2`,
  [requestedAmount, freelancerId]
);

// Create payout request (NO transaction_id - pooled from earnings)
await client.query(
  `INSERT INTO payouts (freelancer_id, amount, currency, status, requested_at)
   VALUES ($1, $2, $3, 'REQUESTED', NOW())`,
  [freelancerId, requestedAmount, 'INR']
);
```

**Payout States**: `REQUESTED` ✅  
**Freelancer Balance**: `-= amount`

---

### Phase 4: Admin Approval
**API**: `POST /api/v1/admin/payouts/:id/approve`

1. Admin reviews payout request
2. Validates freelancer is `VERIFIED`
3. Updates payout: `REQUESTED` → `QUEUED`
4. Triggers Razorpay payout (async)
5. **If `transaction_id` exists**: Transaction `APPROVED` → `RELEASED`

**Code**:
```javascript
// adminController.js - approvePayout()
await client.query(
  `UPDATE payouts SET status = 'QUEUED', approved_by = $1, approved_at = NOW() WHERE id = $2`,
  [adminId, payoutId]
);

// Update linked transaction to RELEASED if exists
if (payout.transaction_id) {
  await client.query(
    `UPDATE transactions SET status = 'RELEASED', released_by = $1, released_at = NOW() WHERE id = $2`,
    [adminId, payout.transaction_id]
  );
}

// Trigger Razorpay payout
payoutService.processPayout(payoutId);
```

**Payout States**: `REQUESTED` → `QUEUED` ✅  
**Transaction States**: `APPROVED` → `RELEASED` (only if linked)

---

### Phase 5: Payout Processing (Webhook)
**Webhook**: `POST /api/v1/webhooks/razorpay` (event: `payout.processed`)

1. Razorpay processes payout to freelancer's bank
2. Webhook received with UTR and status
3. Payout: `QUEUED` → `PROCESSED`
4. **If `transaction_id` exists**: Transaction `RELEASED` → `COMPLETED`

**Code**:
```javascript
// payoutService.js - updatePayoutStatus()
await client.query(
  `UPDATE payouts SET status = 'PROCESSED', utr = $1, processed_at = NOW() 
   WHERE razorpay_payout_id = $2`,
  [utr, razorpayPayoutId]
);

// Update linked transaction to COMPLETED (only if transaction_id exists)
if (status === 'processed') {
  await client.query(
    `UPDATE transactions 
     SET status = 'COMPLETED', payout_status = 'PROCESSED', payout_utr = $1
     FROM payouts p
     WHERE transactions.id = p.transaction_id AND p.razorpay_payout_id = $2`,
    [utr, razorpayPayoutId]
  );
}
```

**Payout States**: `QUEUED` → `PROCESSED` ✅  
**Transaction States**: `RELEASED` → `COMPLETED` (only if linked)

---

## 🔄 Transaction Lifecycle

### Current Model: Pooled Earnings

```
INITIATED  →  HELD  →  APPROVED  →  (stays APPROVED)
    ↓          ↓          ↓
  Payment   Captured   Creator     Freelancer can request
  Created             Approved    payout from pooled balance
```

**Key Points**:
- ✅ Transaction reaches `APPROVED` when creator approves delivery
- ✅ Freelancer's `earnings_balance` is incremented
- ✅ Transaction **stays at APPROVED** status forever
- ✅ Payout is created **without** `transaction_id` (pooled from multiple transactions)
- ✅ When payout is processed, transactions are NOT updated to `COMPLETED`

**This is by design** - pooled earnings means:
- One payout may include funds from 10 different approved transactions
- Transactions don't need to reach `COMPLETED` - `APPROVED` means "paid to freelancer balance"

---

## 📊 Status Flow Diagrams

### Transaction Flow
```
INITIATED ──payment verified──> HELD ──creator approves──> APPROVED
                                                              ↓
                                                    earnings_balance += amount
                                                              ↓
                                                      (stays APPROVED)
```

### Payout Flow
```
REQUESTED ──admin approves──> QUEUED ──razorpay processes──> PROCESSED
    ↓                           ↓                               ↓
freelancer                 razorpay                        bank transfer
requests                   payout API                       complete (UTR)
```

---

## 🔧 Additional Transaction States (Not Used in Pooled Model)

These states exist in schema but are **not reached** in pooled earnings:

- `RELEASED`: Only used if payout has `transaction_id` (not in pooled model)
- `COMPLETED`: Only used if payout has `transaction_id` (not in pooled model)

**Why?** Because payouts are from pooled balance, not tied to specific transactions.

---

## ✅ Validation Rules Implemented

### Freelancer Payout Request
1. ✅ `amount >= 100` (minimum ₹100)
2. ✅ `freelancer.verification_status = 'VERIFIED'`
3. ✅ `amount <= earnings_balance`
4. ✅ No active payout exists (`status IN ('REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING')`)

### Admin Payout Approval
1. ✅ `payout.status = 'REQUESTED'` (can only approve REQUESTED payouts)
2. ✅ `freelancer.verification_status = 'VERIFIED'`

### Creator Project Approval
1. ✅ `project.status = 'COMPLETED'` (deliverable uploaded)
2. ✅ Transaction exists with `status = 'HELD'`
3. ✅ Creator owns the project

---

## 🎯 API Endpoints

### Freelancer APIs
- `GET /api/v1/freelancer/earnings/balance` - Get current earnings balance
- `GET /api/v1/freelancer/earnings` - Get earnings summary
- `POST /api/v1/freelancer/payouts/request` - Request payout
- `GET /api/v1/freelancer/payouts` - Get payout history

### Creator APIs
- `POST /api/v1/projects/:id/approve` - Approve delivery (credits earnings)

### Admin APIs
- `GET /api/v1/admin/payouts?status=REQUESTED` - View payout requests
- `POST /api/v1/admin/payouts/:id/approve` - Approve payout
- `GET /api/v1/admin/escrow?status=HELD` - View escrow transactions

---

## 📝 Next Steps

### To Execute Migration
```bash
cd /home/shubh4m/projects/Meet-Rub/backend
node run-migration.js
```

### To Verify Migration
```sql
-- Check earnings_balance column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'freelancer' AND column_name = 'earnings_balance';

-- Check payouts constraints updated
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payouts' 
AND column_name IN ('transaction_id', 'freelancer_account_id', 'requested_at', 'approved_at');
```

---

## ⚠️ Important Notes

1. **Transactions don't reach COMPLETED** in pooled model - this is correct!
2. **Payout `transaction_id` is NULL** - this is by design (pooled from multiple)
3. **`earnings_balance` is the source of truth** for freelancer available funds
4. **Migration is idempotent** - safe to run multiple times

---

## 🔍 Monitoring Queries

```sql
-- Check freelancer balances
SELECT f.freelancer_id, f.freelancer_full_name, f.earnings_balance,
       COUNT(t.id) as approved_transactions
FROM freelancer f
LEFT JOIN transactions t ON t.freelancer_id = f.user_id AND t.status = 'APPROVED'
GROUP BY f.freelancer_id;

-- Check pending payout requests
SELECT p.id, p.freelancer_id, p.amount, p.status, p.requested_at,
       f.freelancer_full_name, f.earnings_balance
FROM payouts p
JOIN users u ON p.freelancer_id = u.id
JOIN freelancer f ON f.user_id = u.id
WHERE p.status IN ('REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING')
ORDER BY p.requested_at DESC;

-- Check escrow transactions
SELECT t.id, t.project_id, t.status, t.freelancer_amount, t.created_at,
       f.freelancer_full_name
FROM transactions t
JOIN freelancer f ON t.freelancer_id = f.user_id
WHERE t.status IN ('HELD', 'APPROVED')
ORDER BY t.created_at DESC;
```
