# Dispute Refund Flow

## Overview

When admin resolves a dispute with `resolution_action: "refund"`, the system executes a 3-step atomic process to return the creator's money while pulling back the freelancer's transferred funds.

---

## Money Flow (Example: ₹20.72 total order)

```
Creator pays ₹20.72
       │
       ├─► Freelancer linked account: ₹16.00  (on_hold=1 initially)
       └─► Platform primary balance: ₹4.72   (commission ₹4 + GST ₹0.72)
```

**On dispute refund:**
```
Step 1: Reverse transfer  →  ₹16.00 returns to primary balance
Step 2: Refund payment    →  ₹20.72 sent back to creator
                              (₹16 from reversal + ₹4.72 from platform balance)
```

---

## Steps

### Step 0 — Balance Check (`GET /v1/balance`)

Checks that our Razorpay primary balance has enough to cover the **platform fees** (commission + GST):

```
platformFees = total_amount − freelancer_amount
```

- If balance < platformFees → HTTP **402**, no funds moved, safe to retry after topping up.
- The freelancer portion (₹16) comes back via the reversal in Step 1, so we only need the platform fees to be pre-funded.

---

### Step 1 — Transfer Reversal (`POST /v1/transfers/:transfer_id/reversals`)

```bash
curl -X POST "https://api.razorpay.com/v1/transfers/{trf_xxx}/reversals" \
  -u KEY:SECRET \
  -H "Content-Type: application/json" \
  -d '{}'
```

- Pulls freelancer's funds back from linked account → primary balance.
- If `razorpay_transfer_id` is null (transfer webhook never arrived) → **skips** this step and proceeds directly to Step 2.
- On failure → `dispute_refunds.state = reversal_failed`, DB ROLLBACK. **No funds moved — safe to retry.**

---

### Step 2 — Payment Refund (`POST /v1/payments/:payment_id/refund`)

```bash
curl -X POST "https://api.razorpay.com/v1/payments/{pay_xxx}/refund" \
  -u KEY:SECRET \
  -H "Content-Type: application/json" \
  -d '{"amount": <total_amount_in_paise>}'
```

- Refunds the full `total_amount` back to the creator.
- On failure after a successful reversal → `dispute_refunds.state = reversal_done_refund_failed`. **Manual refund required via Razorpay dashboard.**

---

## State Machine (`dispute_refunds.state`)

```
initiated
   │
   ├─► [balance check fails]          → HTTP 402, DB ROLLBACK, row deleted implicitly
   │
   ├─► reversal_failed                → DB ROLLBACK, no money moved, retry safe
   │
   ├─► reversal_skipped               (no transfer_id — skip to Step 2)
   │       │
   ├─► reversal_completed             (Step 1 done)
   │       │
   │       └─► completed              (Step 2 success, refund.status = 'processed')
   │       └─► refund_pending         (Step 2 success, refund.status = 'pending' — bank processing)
   │       └─► reversal_done_refund_failed  ⚠ MANUAL INTERVENTION REQUIRED
   │
   └─► refund_failed                  (no reversal path, Step 2 failed)
```

---

## Partial Failure Handling

| Scenario | State | Action Required |
|---|---|---|
| Balance too low | — (HTTP 402) | Top up Razorpay account, retry |
| Balance API unreachable | — (HTTP 502) | Check Razorpay API status, retry |
| Transfer reversal fails | `reversal_failed` | Check transfer status on Razorpay dashboard, retry |
| Reversal OK, refund fails | `reversal_done_refund_failed` | **Manually issue refund** via Razorpay dashboard. `razorpay_reversal_id` is stored in `error_payload` |
| Both succeed | `completed` or `refund_pending` | Nothing — done |

---

## Atomicity

- **DB transaction** (`BEGIN` / `ROLLBACK` / `COMMIT`) wraps all `projects` and `transactions` status updates.
- **`dispute_refunds` table** uses a separate pool connection (`db.query`, not `client.query`) so audit rows **survive a DB rollback** — giving a full paper trail even on partial failures.
- **Retry guard**: A second admin call for the same dispute returns HTTP 409 if a `dispute_refunds` row already exists.

---

## API Reference

| Call | Endpoint |
|---|---|
| Balance check | `GET /v1/balance` |
| Transfer reversal | `POST /v1/transfers/:transfer_id/reversals` |
| Payment refund | `POST /v1/payments/:payment_id/refund` |

All calls use the `razorpayRoutes` axios client (30 s timeout) with credentials from `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
