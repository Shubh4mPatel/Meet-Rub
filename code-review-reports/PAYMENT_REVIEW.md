# Payment Flow — Code Review Report

**Date**: April 10, 2026
**Reviewer**: Code Reviewer Agent
**Scope**: Full payment feature — wallet load, service payment (Razorpay + wallet), escrow, payout, webhook

---

## Feature Mapped

| File | Function / Event / Query | Role |
|------|--------------------------|------|
| `backend/src/routes/paymentRoutes.js` | Route definitions | Entry points: create-order, verify, pay-wallet, transactions |
| `backend/src/routes/walletRoutes.js` | Route definitions | Wallet load, balance, transaction routes |
| `backend/src/routes/webhookRoutes.js` | Route definitions | Razorpay webhook receiver (no auth) |
| `backend/src/routes/projectRoutes.js` | `/:id/approve`, `/:id/reject` | Escrow release / dispute creation |
| `backend/src/routes/index.js:L21` | Router mount | `authenticateUser` applied to payments and wallet; webhook has NO auth |
| `backend/src/middleware/authMiddleware.js` | `authenticateUser`, `requireRole` | JWT cookie auth and role guard |
| `backend/src/controller/razor-pay-controllers/paymentController.js` | `payFromWallet`, `createPaymentOrder`, `verifyPayment`, `getTransaction`, `getMyTransactions` | Orchestrates all creator payment actions |
| `backend/src/controller/razor-pay-controllers/walletController.js` | `getBalance`, `createLoadOrder`, `verifyLoadPayment`, `getTransactions`, `getTransaction` | Wallet load and balance endpoints |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handleWebhook` | HMAC verification + event dispatch |
| `backend/src/controller/razor-pay-controllers/projectController.js:L1044` | `approveProject`, `rejectProject` | Escrow release to freelancer earnings / dispute creation |
| `backend/src/controller/razor-pay-controllers/adminController.js` | `approvePayout`, `getAllPayouts`, `getEscrowTransactions`, `getPlatformStats` | Admin escrow visibility and payout approval |
| `backend/src/controller/razor-pay-controllers/freelancerController.js` | `requestPayout`, `getEarningsBalance`, `getEarningsSummary` | Freelancer withdrawal requests |
| `backend/src/razor-pay-services/paymentService.js` | `createWalletPayment`, `createServicePaymentOrder`, `processServicePayment`, `processWalletLoad` | All transactional DB + Razorpay logic |
| `backend/src/razor-pay-services/walletService.js` | `credit`, `debit`, `getWalletByUserId` | Atomic wallet balance mutations |
| `backend/src/razor-pay-services/payoutService.js` | `processPayout`, `updatePayoutStatus` | Razorpay fund creation + payout dispatch |
| `backend/src/controller/notification/notificationServicer.js` | `sendNotification` | DB save + Redis publish on payment events |
| `backend/config/razorpay.js` | Razorpay SDK init | Uses `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` |

---

## Findings

---

### 🔴 Critical — Double-payment: `verifyPayment` has no idempotency guard on the transaction row

- **Location**: `backend/src/razor-pay-services/paymentService.js` — `processServicePayment`
- **Evidence**: The function does `SELECT * FROM razorpay_orders … FOR UPDATE` and checks that the order row exists, but never checks whether the linked `transactions` row is already `HELD`. A client who retries `POST /payments/verify` with the same `razorpay_payment_id` before the first call commits will execute `UPDATE transactions SET status='HELD'` a second time with no rejection.
- **Risk**: Under race conditions or client retry, a transaction could be set to `HELD` twice and counted twice in escrow reporting.
- **Suggestion**: Add `AND status = 'INITIATED'` to the `UPDATE transactions` statement so subsequent calls become no-ops, and return early with a 409 if the order is already `PAID`.

---

### 🔴 Critical — `processWalletLoad` does NOT guard against concurrent double-credit

- **Location**: `backend/src/razor-pay-services/paymentService.js` — `processWalletLoad`
- **Evidence**: The code checks `if (order.status === 'PAID') throw new Error('Order already processed')` — but this check happens *after* `verifyPaymentSignature`. If two concurrent requests reach this point simultaneously with the same valid signature, both will see status `CREATED`, pass the check, and both call `walletService.credit()` before either commits, doubling the wallet credit.
- **Risk**: A user could load their wallet twice for a single Razorpay payment by sending concurrent requests.
- **Suggestion**: Move the `status === 'PAID'` check and `UPDATE razorpay_orders SET status='PAID'` to occur *before* calling `walletService.credit`, ensuring the status gate and the credit happen atomically within the same transaction. The `FOR UPDATE` lock is already in place.

---

### 🔴 Critical — Webhook HMAC verification is broken: computes signature on re-serialized JSON, not raw bytes

- **Location**: `backend/src/controller/razor-pay-controllers/webhookController.js:L8`
- **Evidence**: `verifyWebhookSignature` calls `JSON.stringify(body)` on the already-parsed `req.body`. `JSON.stringify` re-serialization is not guaranteed to produce the same bytes Razorpay signed — key ordering, whitespace, and number precision can differ.
- **Risk**: Signature verification may silently fail for valid payloads, or pass for a tampered payload. A tampered webhook could credit a wallet or release escrow.
- **Suggestion**: Apply `express.raw({ type: 'application/json' })` as body parser specifically on the `/webhooks/razorpay` route and compute HMAC on the raw `req.body` Buffer directly.

---

### 🔴 Critical — `getTransaction` authorization: admin bypass never works due to wrong field name

- **Location**: `backend/src/controller/razor-pay-controllers/paymentController.js:L106`
- **Evidence**: `req.user.user_type !== 'ADMIN'` — the JWT payload sets `role`, not `user_type`. `req.user.user_type` is always `undefined`, so every admin call receives `403 Access denied`.
- **Risk**: Admins cannot view any transaction details via this endpoint.
- **Suggestion**: Change `req.user.user_type !== 'ADMIN'` to `req.user.role !== 'admin'`.

---

### 🔴 Critical — All wallet endpoints broken: `walletController` uses `req.user.id` but JWT sets `user_id`

- **Location**: `backend/src/controller/razor-pay-controllers/walletController.js` — all functions
- **Evidence**: `const userId = req.user.id` — the JWT payload has `user_id`, not `id`. `req.user.id` is always `undefined`, so every query executes with `$1 = undefined`, returning no rows or throwing a DB type error.
- **Risk**: Every wallet endpoint (`/wallet/balance`, `/wallet/load/create-order`, `/wallet/load/verify`, `/wallet/transactions`) silently fails for every authenticated user. Wallet load orders are inserted with `user_id = NULL`.
- **Suggestion**: Replace all `req.user.id` in `walletController.js` with `req.user.user_id`.

---

### 🟠 High — `createWalletPayment` looks up wallet by `creator_id` column but wallets are indexed by `user_id`

- **Location**: `backend/src/razor-pay-services/paymentService.js:L147`
- **Evidence**: `SELECT id, balance FROM wallets WHERE creator_id = $1 FOR UPDATE` — `walletService.createWallet` inserts using `user_id`. `creator_id` is a different value from `users.id`.
- **Risk**: Wallet is never found, so every `POST /payments/pay-wallet` call returns `Wallet not found`.
- **Suggestion**: Join through the `creators` table to resolve `user_id` from `creator_id`, or change the lookup column to match how wallets are created.

---

### 🟠 High — `approvePayout` fires `processPayout()` fully async — failures are silent to the admin

- **Location**: `backend/src/controller/razor-pay-controllers/adminController.js:L84`
- **Evidence**: `payoutService.processPayout(payoutId).catch((err) => { console.error(...) })` — admin receives `200 OK` regardless of Razorpay outcome. Payout is already set to `QUEUED` in DB.
- **Risk**: Razorpay rejects the payout; freelancer's `earnings_balance` has already been decremented; admin has no notification of failure; payout stuck in `FAILED` silently.
- **Suggestion**: Implement a retry/dead-letter queue for failed payouts, or emit an admin notification when `processPayout` rejects.

---

### 🟠 High — `requestPayout` mixes `roleWiseId` and `user_id` for the same payout record

- **Location**: `backend/src/controller/razor-pay-controllers/freelancerController.js:L200`
- **Evidence**: Balance deduction uses `freelancerId` (`roleWiseId`), payout INSERT uses `freelancerUserId` (`user_id`), and the active-payout deduplication guard also queries by `freelancerUserId`. Mixed IDs mean the guard could fail to detect an in-progress payout if IDs are inconsistent across code paths.
- **Risk**: A freelancer could submit multiple concurrent payout requests, bypassing the single-active-payout guard, resulting in over-withdrawal from `earnings_balance`.
- **Suggestion**: Standardise on `users.id` for `payouts.freelancer_id` and verify all insert/select statements use the same value.

---

### 🟡 Medium — `handlePaymentCaptured` webhook does not activate escrow — leaves transactions in `INITIATED` forever

- **Location**: `backend/src/controller/razor-pay-controllers/webhookController.js:L17`
- **Evidence**: `handlePaymentCaptured` only updates `razorpay_orders.status = 'PAID'`. The `transactions` row stays `INITIATED` if the client never calls `POST /payments/verify` (browser closed, app killed, network dropout).
- **Risk**: Money is captured by Razorpay but never moved to escrow. The freelancer is never paid and the creator's funds are untracked.
- **Suggestion**: `handlePaymentCaptured` should mirror `processServicePayment` — mark `transactions.status = 'HELD'` if not already `HELD`.

---

### 🟡 Medium — Commission calculation uses floating-point arithmetic with no precision library

- **Location**: `backend/src/razor-pay-services/paymentService.js` — `calculateCommission`
- **Evidence**: All amounts use `parseFloat()`, plain multiplication/division, with `toFixed(2)` applied inconsistently. `freelancerAmount = amountNum - commission` has no rounding.
- **Risk**: Floating-point drift accumulates across transactions; `platform_commission + freelancer_amount` may not sum exactly to `service_amount`, causing reconciliation discrepancies.
- **Suggestion**: Use integer arithmetic in paise (multiply by 100 on ingestion, divide only for display) or a fixed-precision library like `decimal.js`.

---

### 🟡 Medium — `getMyTransactions` and `getEscrowTransactions` return unbounded result sets

- **Location**: `paymentController.js:L126` and `paymentService.js` — `getEscrowTransactions`
- **Evidence**: No `LIMIT` or `OFFSET` on either query.
- **Risk**: Memory and latency degradation at scale; potential Node.js OOM.
- **Suggestion**: Add `LIMIT`/`OFFSET` pagination parameters mirroring the pattern in `walletController.getTransactions`.

---

### 🟡 Medium — `createFundAccount` creates duplicate Razorpay contacts on retry

- **Location**: `backend/src/razor-pay-services/payoutService.js:L10`
- **Evidence**: No lookup for an existing Razorpay contact before creating one. If `processPayout` fails after contact creation but before updating `freelancer_accounts.razorpay_account_id`, the next retry creates a duplicate contact.
- **Risk**: Duplicate contacts accumulate on Razorpay, causing compliance and deduplication issues.
- **Suggestion**: Use Razorpay's `reference_id` field (already set to `freelancer_${account.user_id}`) to query for an existing contact before creating a new one.

---

### 🟡 Medium — `approveProject` has no guard against concurrent double-approval crediting freelancer twice

- **Location**: `backend/src/controller/razor-pay-controllers/projectController.js:L1066`
- **Evidence**: Two concurrent approve requests can both pass the `status !== 'COMPLETED'` check before either commits. `FOR UPDATE` is only on the `transactions` row, not the `projects` row.
- **Risk**: Both calls execute `UPDATE freelancer SET earnings_balance = earnings_balance + $1`, doubling the freelancer's credit.
- **Suggestion**: Add `AND status = 'HELD'` to the `UPDATE transactions` statement so the second call becomes a no-op, and take `FOR UPDATE` on the `projects` row in the same query.

---

### 🟢 Low — `createProject` route is missing `requireRole(['creator'])` guard

- **Location**: `backend/src/routes/projectRoutes.js:L7`
- **Evidence**: `router.post('/create-project', createProject)` — no role check; any authenticated user including a freelancer can create a project.
- **Suggestion**: Add `requireRole(['creator'])` to this route.

---

### 🟢 Low — `updatePayoutStatus` builds UPDATE query by string concatenation

- **Location**: `backend/src/razor-pay-services/payoutService.js:L158`
- **Evidence**: `setClause += `, utr = $${paramIdx++}`` — fragile and maintenance-prone, though parameterised so not a SQL injection risk.
- **Suggestion**: Refactor to a fixed query using `COALESCE($2, utr)` to handle nullable fields without dynamic string construction.

---

### 🟢 Low — Razorpay Key ID returned in API response per-request

- **Location**: `backend/src/controller/razor-pay-controllers/paymentController.js:L57`
- **Evidence**: `key: process.env.RAZORPAY_KEY_ID` is returned in both `create-order` and wallet `createLoadOrder` responses.
- **Suggestion**: Have the frontend read the Key ID from a build-time environment variable rather than receiving it per-request from the backend.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 5 |
| 🟠 High | 3 |
| 🟡 Medium | 5 |
| 🟢 Low | 3 |

**Overall assessment**: The payment flow is **not production-ready** — it has two double-payment vulnerabilities (wallet load and Razorpay verify), a broken HMAC webhook verification that can be circumvented by JSON re-serialization differences, and a field naming mismatch (`req.user.id` vs `req.user.user_id`) that silently breaks all wallet endpoints for every user.

---

## Coverage Gaps

- **Dispute resolution escrow release** (`disputeController.js:L427`) — the admin flow for resolving disputes and releasing/refunding funds was not fully traced.
- **Frontend retry behaviour** — whether the client retries `POST /payments/verify` on timeout (which would widen the double-payment window) is not visible from the backend.
- **Razorpay dashboard webhook configuration** — whether `payment.authorized` vs `payment.captured` are both enabled affects the `handlePaymentCaptured` recovery gap analysis.
- **`worker/` service** — the standalone worker container's role in payment processing was not reviewed.
