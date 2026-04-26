# Razorpay Routes Migration Plan

## Current Flow (RazorpayX Payout)

```
Creator pays -> Money sits in YOUR Razorpay account (HELD) -> Freelancer requests payout
-> Admin approves -> RazorpayX sends money from YOUR bank to freelancer bank
```

**Problem**: Money in YOUR account. You hold it. Risk + compliance burden.

---

## New Flow (Razorpay Routes)

```
Creator pays -> Razorpay splits money automatically -> Freelancer share ON HOLD at Razorpay
-> Admin approves -> Razorpay releases hold -> Money settles to freelancer bank
```

**Benefit**: Razorpay holds money. Not you. Less risk. Automatic split.

---

## Razorpay Routes - How It Works (Meet-Rub Context)

### What is a Linked Account?
Each freelancer = Linked Account on Razorpay. Like a sub-merchant under your platform.

### What is a Transfer?
When creator pays Rs.1200 for a project:
- Rs.200 (commission + GST) stays with platform
- Rs.800 (freelancer_amount) transferred to freelancer's linked account
- Transfer created with `on_hold: 1` (money held by Razorpay, not released yet)

### What is Hold/Release?
- `on_hold: 1` = Razorpay holds freelancer's share. Not settled to their bank yet
- Admin approves = API call to modify transfer `on_hold: 0` = money released to freelancer bank
- `on_hold_until` = optional auto-release date (safety net)

### Transaction Lifecycle (Meet-Rub)

```
1. FREELANCER ONBOARDING (one-time)
   Freelancer signs up -> Create Linked Account on Razorpay -> Create Stakeholder
   -> Request Product Config -> Update with bank details -> KYC verified by Razorpay
   -> freelancer.razorpay_account_id = acc_xxxxx

2. CREATOR PAYS
   Creator clicks pay -> Create Razorpay Order WITH transfer instructions:
   {
     amount: 120000,  // Rs.1200 in paise
     transfers: [{
       account: "acc_xxxxx",        // freelancer linked account
       amount: 80000,               // Rs.800 freelancer share
       currency: "INR",
       on_hold: 1,                  // HOLD - dont release yet
       on_hold_until: 1735689600,   // auto-release safety: 30 days
       notes: { project_id, transaction_id }
     }]
   }
   -> Creator pays via Checkout
   -> Payment captured -> Transfer auto-created in HELD state

3. PROJECT IN PROGRESS
   - Transaction status: HELD
   - Transfer exists on Razorpay with on_hold: 1
   - Freelancer does work

4. PROJECT COMPLETED - ADMIN APPROVES
   - Freelancer submits work
   - Admin reviews + approves
   - API call: PATCH /transfers/{transfer_id} { on_hold: 0 }
   - Razorpay releases money to freelancer bank (T+2 settlement)
   - Transaction status: COMPLETED

5. DISPUTE - REFUND
   - Admin resolves dispute in creator favor
   - API call: POST /transfers/{transfer_id}/reversals { amount: 80000 }
   - Money reversed from freelancer linked account to platform
   - Then refund creator: POST /payments/{payment_id}/refund
   - Transaction status: REFUNDED

6. DISPUTE - RELEASE TO FREELANCER
   - Admin resolves in freelancer favor
   - Same as step 4: release hold
   - Transaction status: COMPLETED
```

---

## What Changes

### 1. Freelancer Onboarding (NEW)

**Files to change**:
- `backend/src/razor-pay-services/payoutService.js` -> rename/refactor to `linkedAccountService.js`
- `backend/src/controller/razor-pay-controllers/freelancerController.js`
- `backend/src/routes/freelancerRoutes.js`
- DB: `freelancer` table needs new columns

**New columns on `freelancer` table**:
```sql
ALTER TABLE freelancer ADD COLUMN razorpay_linked_account_id VARCHAR(50);  -- acc_xxxxx
ALTER TABLE freelancer ADD COLUMN razorpay_stakeholder_id VARCHAR(50);
ALTER TABLE freelancer ADD COLUMN razorpay_product_id VARCHAR(50);
ALTER TABLE freelancer ADD COLUMN razorpay_account_status VARCHAR(20);     -- created/activated/suspended
```

**New functions needed**:
- `createLinkedAccount(freelancerId)` - POST /v2/accounts (Razorpay API)
- `createStakeholder(accountId, freelancerId)` - POST /v2/accounts/{id}/stakeholders
- `requestProductConfig(accountId)` - POST /v2/accounts/{id}/products
- `updateProductConfig(accountId, productId, bankDetails)` - PATCH /v2/accounts/{id}/products/{pid}
- `getLinkedAccountStatus(accountId)` - GET /v2/accounts/{id}

**When to trigger**: After freelancer completes KYC / bank details. Can be background job.

---

### 2. Payment Order Creation (MODIFY)

**Files to change**:
- `backend/src/razor-pay-services/paymentService.js` - `createServicePaymentOrder()`

**Current**: Creates plain Razorpay order
**New**: Creates order WITH transfer instructions

```js
// BEFORE
razorpay.orders.create({
  amount: totalAmount * 100,
  currency: 'INR',
  receipt: `project_${projectId}_${Date.now()}`
})

// AFTER
razorpay.orders.create({
  amount: totalAmount * 100,
  currency: 'INR',
  receipt: `project_${projectId}_${Date.now()}`,
  transfers: [{
    account: freelancer.razorpay_linked_account_id,
    amount: freelancerAmount * 100,
    currency: 'INR',
    on_hold: 1,
    on_hold_until: Math.floor(Date.now()/1000) + (30*24*60*60), // 30 days
    notes: {
      project_id: projectId,
      transaction_id: transactionId
    }
  }]
})
```

**Guard**: Check freelancer has `razorpay_linked_account_id` and `razorpay_account_status = 'activated'` before creating order.

---

### 3. Payment Verification (MODIFY)

**Files to change**:
- `backend/src/razor-pay-services/paymentService.js` - `processServicePayment()`

**Current**: Just marks transaction HELD
**New**: Also store `razorpay_transfer_id` from the auto-created transfer

```js
// After verifying payment, fetch transfer details
const payment = await razorpay.payments.fetch(paymentId);
// payment.transfers contains the auto-created transfer
const transfer = payment.transfers.items[0];

// Store transfer_id in transaction
UPDATE transactions SET
  razorpay_transfer_id = transfer.id,
  status = 'HELD'
WHERE id = transactionId
```

**New column on `transactions` table**:
```sql
ALTER TABLE transactions ADD COLUMN razorpay_transfer_id VARCHAR(50);
```

---

### 4. Admin Approval - Release Payment (REPLACE)

**Files to change**:
- `backend/src/controller/razor-pay-controllers/adminController.js`
- `backend/src/razor-pay-services/paymentService.js` (add `releaseTransfer()`)

**Current flow**: Admin approves payout -> RazorpayX creates contact -> fund account -> payout
**New flow**: Admin approves -> one API call to release hold

```js
// NEW function in paymentService.js
async releaseTransfer(transactionId, adminId) {
  const tx = await getTransaction(transactionId);
  
  // Release hold on Razorpay
  await razorpay.transfers.edit(tx.razorpay_transfer_id, {
    on_hold: 0
  });
  
  // Update transaction
  UPDATE transactions SET
    status = 'COMPLETED',
    released_by = adminId,
    released_at = NOW()
  WHERE id = transactionId
}
```

**New admin route**: `POST /api/v1/admin/transactions/:id/release`

---

### 5. Dispute Resolution (MODIFY)

**Files to change**:
- `backend/src/controller/dispute/disputeController.js` - `resolveDispute()`

**Current refund**: `razorpay.payments.refund(payment_id, amount)`
**New refund**: First reverse transfer, then refund

```js
// REFUND flow (creator wins dispute)
// Step 1: Reverse transfer
await razorpay.transfers.reverse(tx.razorpay_transfer_id, {
  amount: tx.freelancer_amount * 100
});

// Step 2: Refund creator (only platform amount if needed, or full)
await razorpay.payments.refund(tx.razorpay_payment_id, {
  amount: tx.total_amount * 100
});
```

**RELEASE flow (freelancer wins)**: Same as admin release - `on_hold: 0`

---

### 6. Webhook Updates (MODIFY)

**Files to change**:
- `backend/src/controller/razor-pay-controllers/webhookController.js`

**New webhook events to handle**:
- `transfer.processed` - transfer settled to linked account
- `transfer.failed` - transfer failed
- `transfer.reversed` - reversal completed

**Remove/deprecate**:
- `payout.processed` - no more RazorpayX payouts
- `payout.failed`
- `payout.reversed`

---

### 7. Remove/Deprecate RazorpayX Flow

**Files to deprecate/remove**:
- `backend/config/razorpayX.js` - no longer needed
- `backend/src/razor-pay-services/payoutService.js` - replace with `linkedAccountService.js`
- `backend/cron/payoutReconciliation.js` - replace with transfer reconciliation
- `payouts` table - phase out (keep for old data)
- Freelancer payout request flow - no longer needed (admin releases directly)

**Big shift**: Freelancer no longer "requests payout". Admin releases when project done. Freelancer gets money automatically via Razorpay settlement (T+2 days after release).

---

### 8. Frontend Changes

- Remove freelancer payout request UI
- Remove freelancer available_balance / earnings_balance display (Razorpay handles)
- Admin panel: "Release Payment" button instead of "Approve Payout"
- Freelancer onboarding: collect KYC info needed for Linked Account creation
- Show transfer status instead of payout status

---

## Summary: File Change Map

| File | Action | What |
|------|--------|------|
| `paymentService.js` | MODIFY | Add transfers to order, store transfer_id, add releaseTransfer() |
| `adminController.js` | MODIFY | Replace approvePayout with releaseTransfer |
| `freelancerController.js` | MODIFY | Add linked account onboarding, remove payout request |
| `disputeController.js` | MODIFY | Use transfer reversal before refund |
| `webhookController.js` | MODIFY | Handle transfer events, remove payout events |
| `payoutService.js` | REPLACE | New linkedAccountService.js for onboarding |
| `payoutReconciliation.js` | REPLACE | New transfer reconciliation cron |
| `razorpayX.js` | DELETE | Not needed |
| `freelancerRoutes.js` | MODIFY | New onboarding routes, remove payout routes |
| `adminRoutes.js` | MODIFY | New release route, remove payout approve/reject |
| `paymentRoutes.js` | MINOR | Guard for linked account status |

**DB migrations**:
- Add columns to `freelancer`: linked account IDs
- Add column to `transactions`: razorpay_transfer_id
- Keep `payouts` table for historical data

---

## Questions

1. **Freelancer onboarding timing**: Create linked account when freelancer registers? Or when first project assigned? (affects UX)

2. **Auto-release safety**: If admin forgets to release, `on_hold_until` auto-releases after X days. What should X be? 30 days? 60 days?

3. **Partial release**: If dispute resolves with partial refund (e.g., 50% to each), do we support this? Routes supports partial reversal.

4. **Existing freelancers**: Migration plan for freelancers already on platform? Batch create linked accounts?

5. **Commission handling**: Currently commission deducted from freelancer_amount. With Routes, platform keeps (total - transfer_amount). Same math, just confirm: platform gets commission + GST, freelancer gets rest. Correct?

6. **Freelancer dashboard**: Since money goes directly to their bank via Razorpay settlement, do we still show balance? Or just show transfer/settlement history?

7. **KYC for linked accounts**: Razorpay requires KYC for linked accounts (PAN, bank details). Current KYC flow collects these? Any gaps?

8. **Refund + reversal order**: For disputes, must reverse transfer first, then refund payment. If reversal fails (insufficient balance in linked account), what's the fallback?
