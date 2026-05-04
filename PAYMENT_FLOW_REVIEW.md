# Code Review: Razorpay Escrow Payment Flow (Routes Model)

**Date**: 5 May 2026  
**Scope**: Full payment lifecycle — Linked Account onboarding → Order creation with transfer → Payment capture → Escrow hold → Release/Refund → Payout/Settlement

---

## Feature Mapped

| File | Function / Event / Query | Role |
|------|--------------------------|------|
| `backend/config/razorpay.js` | `razorpayInstance` | Razorpay SDK client (Orders, Payments, Transfers) |
| `backend/config/razorpayRoutes.js` | `razorpayRoutes` axios client | v2 API calls (Accounts, Stakeholders, Products) |
| `backend/config/razorpayX.js` | `razorpayX` axios client | RazorpayX Payouts API |
| `backend/src/razor-pay-services/linkedAccountService.js` | `createLinkedAccount()` | Step 1: POST /v2/accounts |
| `backend/src/razor-pay-services/linkedAccountService.js` | `createStakeholder()` | Step 2: POST /v2/accounts/:id/stakeholders |
| `backend/src/razor-pay-services/linkedAccountService.js` | `requestProductConfig()` | Step 3: POST /v2/accounts/:id/products |
| `backend/src/razor-pay-services/linkedAccountService.js` | `updateProductConfig()` | Step 4: PATCH /v2/accounts/:id/products/:pid |
| `backend/src/razor-pay-services/linkedAccountService.js` | `onboardFreelancer()` | Full onboarding orchestrator |
| `backend/src/razor-pay-services/paymentService.js` | `createServicePaymentOrder()` | Create order with transfer instructions (on_hold) |
| `backend/src/razor-pay-services/paymentService.js` | `processServicePayment()` | Verify signature + mark HELD |
| `backend/src/razor-pay-services/paymentService.js` | `releaseTransfer()` | Release on-hold transfer via `transfers.edit` |
| `backend/src/razor-pay-services/payoutService.js` | `createContact()` | RazorpayX Contact creation |
| `backend/src/razor-pay-services/payoutService.js` | `createFundAccount()` | RazorpayX Fund Account creation |
| `backend/src/razor-pay-services/payoutService.js` | `createPayout()` | RazorpayX Payout creation |
| `backend/src/razor-pay-services/payoutService.js` | `processPayout()` | Full payout orchestrator (Contact→Fund→Payout) |
| `backend/src/controller/razor-pay-controllers/paymentController.js` | `createPaymentOrder` | Route handler: POST /create-order |
| `backend/src/controller/razor-pay-controllers/paymentController.js` | `verifyPayment` | Route handler: POST /verify |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handlePaymentCaptured` | Webhook: payment.captured |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handlePaymentFailed` | Webhook: payment.failed |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handlePayoutProcessed` | Webhook: payout.processed |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handlePayoutFailed` | Webhook: payout.failed |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handleTransferProcessed` | Webhook: transfer.processed |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handleTransferFailed` | Webhook: transfer.failed |
| `backend/src/controller/razor-pay-controllers/webhookController.js` | `handleTransferReversed` | Webhook: transfer.reversed |
| `backend/src/controller/razor-pay-controllers/adminController.js` | `releaseTransfer` | Admin: release escrowed funds |
| `backend/src/controller/razor-pay-controllers/adminController.js` | `createFreelancerLinkedAccount` | Admin: trigger onboarding |
| `backend/src/controller/razor-pay-controllers/freelancerController.js` | `requestPayout` | Freelancer withdrawal request |
| `backend/src/controller/dispute/disputeController.js` | Dispute resolution | Release or refund via Routes |
| `backend/cron/transferReconciliation.js` | `reconcileTransfers()` | Periodic sync of held transfers |
| `backend/cron/payoutReconciliation.js` | `reconcilePayouts()` | Periodic sync of stuck payouts |
| `backend/src/server.js` | Webhook body-parsing setup | `express.raw()` for HMAC verification |

---

## Findings

### Correctness vs. Razorpay Docs

**🟡 Medium — `on_hold: 1` vs `on_hold: true` in transfer instructions**
- **Location**: `backend/src/razor-pay-services/paymentService.js` (line ~200)
- **Evidence**: `on_hold: 1` is used in the order transfer options.
- **Risk**: The Razorpay docs show `on_hold: true` (boolean) for Node.js. While `1` is truthy and Razorpay may cast it, the docs explicitly use `true`. The Ruby example uses `1` but Node.js uses `true`. Current code works in practice but diverges from documented spec.
- **Suggestion**: Change `on_hold: 1` to `on_hold: true` to match the Node.js SDK.

---

**🟡 Medium — `requestProductConfig` missing `tnc_accepted: true`**
- **Location**: `backend/src/razor-pay-services/linkedAccountService.js` (line ~114)
- **Evidence**: `requestProductConfig` only sends `{ product_name: 'route' }`. Per the docs (`requestproductcondifg.md`), the request body should include `"tnc_accepted": true`.
- **Risk**: Razorpay may reject product configuration requests that don't acknowledge TnC at this stage. You do send `tnc_accepted: true` in `updateProductConfig`, but missing it in the initial request may cause Razorpay to return a `needs_clarification` status requiring a second call.
- **Suggestion**: Add `tnc_accepted: true` to the `requestProductConfig` payload.

---

**🟢 Low — Linked Account missing `contact_name` field**
- **Location**: `backend/src/razor-pay-services/linkedAccountService.js` (line ~17)
- **Evidence**: The Razorpay doc example includes `"contact_name": "Gaurav Kumar"` in the create account request. Your implementation omits it.
- **Risk**: Razorpay may still accept it (field is optional for `individual` type), but including `contact_name` improves KYC pass-rate.
- **Suggestion**: Add `contact_name: freelancer.freelancer_full_name` to the account creation payload.

---

### Correctness & Edge Cases

**🔴 Critical — `handleTransferProcessed` prematurely marks transaction COMPLETED**
- **Location**: `backend/src/controller/razor-pay-controllers/webhookController.js` (line ~350)
- **Evidence**: `transfer.processed` webhook marks the transaction COMPLETED and the project COMPLETED, but in your escrow model the transfer is created with `on_hold: true`. Per Razorpay docs, `transfer.processed` fires when the transfer is created/initiated, NOT when the hold is released. Funds are still on hold.
- **Risk**: Transaction and project move to COMPLETED even though funds haven't been released from escrow. This contradicts the entire escrow model — the admin hasn't approved yet, and funds are still held. Freelancer may see "COMPLETED" before they get paid.
- **Suggestion**: Remove or gate `handleTransferProcessed`. For on-hold transfers, the correct release mechanism is `transfers.edit(id, { on_hold: 0 })` → `transfer.settled` webhook. Do NOT use `transfer.processed` to mark completion for on-hold flows.

---

**🟠 High — Commission deducted BEFORE total sent to Razorpay creates split calculation mismatch**
- **Location**: `backend/src/razor-pay-services/paymentService.js` (line ~8)
- **Evidence**: `freelancerAmount = amountInPaise - commission` but `totalAmount = amountInPaise + gst`. The order is created for `totalAmount` (service + GST), but the transfer to the linked account is for `freelancerAmount` (service - commission). This means Razorpay collects `totalAmount` from customer, transfers `freelancerAmount` to linked account, and the remainder (`commission + gst`) stays in your main account.
- **Risk**: The math is actually correct for the escrow model — but GST is charged to the customer and stays with the platform. The issue is: **the freelancer's transfer amount excludes GST correctly, but also excludes the commission, which means Razorpay Route fees come out of YOUR commission share**, reducing your effective take-rate. This is intentional per marketplace routing, but you should validate that `amount - transfer_amount >= Razorpay routing fees` (currently 0.25% or ₹0.25 of the transfer amount).
- **Suggestion**: Add a guard to ensure `platformCommission >= expectedRoutingFees` to avoid negative margins on small orders.

---

**🟠 High — Race condition: `releaseTransfer` credits freelancer balance but `transfer.settled` webhook may also trigger**
- **Location**: `backend/src/razor-pay-services/paymentService.js` (line ~556) and `webhookController.js` (line ~350)
- **Evidence**: `releaseTransfer()` does: `edit(transfer, {on_hold:0})` → marks transaction COMPLETED → credits `earnings_balance` + `available_balance`. But `transfer.processed` webhook ALSO marks transaction COMPLETED. If both fire in sequence, there's no double-credit guard on the freelancer balance.
- **Risk**: If the `transfer.processed` webhook fires and moves the transaction to COMPLETED first, then `releaseTransfer` also tries to run, the `FOR UPDATE` lock + status check prevents issues. However, if `releaseTransfer` succeeds first and THEN `handleTransferProcessed` fires, it won't update anything (`rowCount = 0`), so no double-credit. But if `handleTransferProcessed` is the one that triggers for initial on-hold creation (not release), it will prematurely COMPLETE the transaction as noted above.
- **Suggestion**: Fix `handleTransferProcessed` to only COMPLETE when `transfer.on_hold === false` (i.e., check the webhook payload).

---

**🟠 High — No idempotency key for Direct Transfers**
- **Location**: `backend/src/razor-pay-services/paymentService.js` (line ~194)
- **Evidence**: Transfer instructions are attached to the order, so Razorpay handles idempotency via the order. However, for the `releaseTransfer` path (`razorpay.transfers.edit`), there's no idempotency guard. If the admin clicks "release" twice quickly, the first `transfers.edit` succeeds and the second one is harmless (already released). But the `releaseTransfer` credits the freelancer balance. The `FOR UPDATE` + `tx.status !== 'HELD'` check provides protection.
- **Risk**: Actually protected by the `WHERE status = 'HELD'` + `FOR UPDATE` lock. Low actual risk.
- **Suggestion**: No change needed — current locking is sufficient.

---

**🟠 High — Webhook secret leaked in logs**
- **Location**: `backend/src/controller/razor-pay-controllers/webhookController.js` (line ~465)
- **Evidence**: `logger.info(\`[handleWebhook] Secret being used: ${process.env.RAZORPAY_WEBHOOK_SECRET}\`)` — this logs the actual webhook secret in plaintext.
- **Risk**: Anyone with log access can see the webhook secret, allowing them to forge webhook events and manipulate payment statuses.
- **Suggestion**: Remove this log line immediately. At most, log whether the secret exists (`!!secret`).

---

**🟡 Medium — `transferReconciliation.js` SQL injection via string interpolation**
- **Location**: `backend/cron/transferReconciliation.js` (line ~26)
- **Evidence**: `` `AND t.held_at < NOW() - INTERVAL '${MIN_AGE_MINUTES} minutes'` `` — `MIN_AGE_MINUTES` comes from `parseInt(process.env....)`. Since `parseInt` is applied, this is safe from injection, but it violates parameterized query best practice.
- **Risk**: Currently safe because `parseInt` guarantees a number. But if the parsing logic changes, this could become exploitable.
- **Suggestion**: Use `$N` parameter binding: `AND t.held_at < NOW() - $1::interval` with `[MIN_AGE_MINUTES + ' minutes']`.

---

**🟡 Medium — Same issue in `payoutReconciliation.js`**
- **Location**: `backend/cron/payoutReconciliation.js` (line ~27)
- **Evidence**: Same `INTERVAL '${MIN_AGE_MINUTES} minutes'` pattern.
- **Risk**: Same as above — currently safe but violates best practice.
- **Suggestion**: Same fix.

---

**🟡 Medium — `createServicePaymentOrder`: No validation that project is in valid state**
- **Location**: `backend/src/razor-pay-services/paymentService.js` (line ~132)
- **Evidence**: The query joins `projects p` → `freelancer f` by `p.freelancer_id = f.freelancer_id`. This is correct for reading. But there's no validation that the project `amount` > 0 or that the project is in a valid state (e.g., could be 'CANCELLED').
- **Risk**: A creator could create an order for a project that's already cancelled or completed.
- **Suggestion**: Add `WHERE p.status = 'CREATED'` to the project lookup query.

---

**🟡 Medium — `releaseTransfer` credits balance but doesn't verify Razorpay API success**
- **Location**: `backend/src/razor-pay-services/paymentService.js` (line ~546)
- **Evidence**: `razorpay.transfers.edit()` is called, then the DB is updated. If the Razorpay call returns 200, the edit is awaited and will throw on failure (since the Razorpay SDK throws on non-2xx). The flow correctly rolls back on error.
- **Risk**: Low — error handling is correct. But no timeout is set on the Razorpay SDK call.
- **Suggestion**: Consider setting a timeout on the SDK client to avoid indefinite hangs.

---

**🟡 Medium — Dispute refund doesn't use `reverse_all` parameter**
- **Location**: `backend/src/controller/dispute/disputeController.js` (line ~523)
- **Evidence**: Separate `razorpay.transfers.reverse()` call followed by `razorpay.payments.refund()`. Per Razorpay docs (`Refund Payments And Reverse Transfer.md`), you can use `reverse_all: true` in the refund call to automatically reverse all transfers. Your implementation manually reverses then refunds.
- **Risk**: The manual approach works correctly and gives more control (partial reversals). However, if the reversal succeeds but the refund fails, you have an inconsistent state: freelancer transfer reversed but customer not refunded.
- **Suggestion**: Wrap both operations in sequence and handle the case where reversal succeeds but refund fails (re-transfer the reversed amount back to the linked account, or flag for manual intervention).

---

### Scalability

**🟡 Medium — `reconcileTransfers` fetches 50 records but no pagination for larger backlogs**
- **Location**: `backend/cron/transferReconciliation.js` (line ~28)
- **Evidence**: `LIMIT 50` with no cursor/offset. If backlog grows > 50, old transactions may never be reconciled.
- **Risk**: In high-volume scenarios, oldest transfers starve. The `ORDER BY t.held_at ASC` helps somewhat.
- **Suggestion**: Run multiple iterations per cron cycle or implement cursor-based pagination.

---

**🟢 Low — Presigned URL generation in `getAllPayouts` loop**
- **Location**: `backend/src/controller/razor-pay-controllers/adminController.js` (line ~155)
- **Evidence**: `Promise.all(payouts.map(async (payout) => { ... createPresignedUrl ... }))` — presigned URLs generated per-payout sequentially via `map`.
- **Risk**: With many payouts, this adds latency. But since it's using `Promise.all`, it's parallelized. Acceptable.
- **Suggestion**: No immediate change needed.

---

### Security

**🔴 Critical — Database credentials in migration file committed to repo**
- **Location**: `backend/run-migration.js` (line ~6)
- **Evidence**: `host: '147.93.108.64', password: 'webzgrowth#admin@123'` — hardcoded production database credentials.
- **Risk**: Anyone with repo access has direct database access. Full data breach risk.
- **Suggestion**: Remove credentials immediately, rotate the password, and use environment variables.

---

**🟠 High — Webhook signature logging exposes secret**
- **Location**: `backend/src/controller/razor-pay-controllers/webhookController.js` (line ~465)
- **Evidence**: `logger.info(\`[handleWebhook] Secret being used: ${process.env.RAZORPAY_WEBHOOK_SECRET}\`)`
- **Risk**: Webhook secret in logs enables forged webhooks.
- **Suggestion**: Remove this log line.

---

**🟡 Medium — No webhook event deduplication**
- **Location**: `backend/src/controller/razor-pay-controllers/webhookController.js` (line ~479)
- **Evidence**: Webhook events are logged to `webhook_logs` but there's no duplicate check using `razorpay_event_id` before processing. If Razorpay retries a webhook, the same event may be processed twice.
- **Risk**: Most handlers have idempotency guards (e.g., `WHERE status = 'INITIATED'`), but `handlePayoutFailed` credits `available_balance` — if processed twice, double credit occurs.
- **Suggestion**: Add `SELECT id FROM webhook_logs WHERE razorpay_event_id = $1 AND processed = TRUE` check at the start of `handleWebhook` to skip already-processed events.

---

### Reliability

**🟠 High — No timeout on external Razorpay API calls**
- **Location**: `backend/config/razorpayRoutes.js`, `backend/config/razorpayX.js`
- **Evidence**: Axios clients are created without `timeout` configuration.
- **Risk**: If Razorpay is slow/unresponsive, requests hang indefinitely, holding database connections (especially in `processPayout` which holds a transaction).
- **Suggestion**: Add `timeout: 30000` (30s) to both axios instances.

---

**🟡 Medium — `processPayout` holds DB transaction across three external API calls**
- **Location**: `backend/src/razor-pay-services/payoutService.js` (line ~100)
- **Evidence**: `BEGIN` → `UPDATE payouts SET PENDING` → `COMMIT` → then external calls. Actually, looking closely, the transaction is committed before the external calls. But the `client` is still held in the `finally` block. If `createContact` or `createFundAccount` takes long, the connection is tied up.
- **Risk**: Connection pool exhaustion under load when Razorpay is slow.
- **Suggestion**: The current pattern (commit early, then external calls) is correct. No change needed.

---

**🟡 Medium — `onboardFreelancer` has no transaction wrapping — partial state on failure**
- **Location**: `backend/src/razor-pay-services/linkedAccountService.js` (line ~196)
- **Evidence**: Steps 1-4 each independently update the DB. If step 3 fails after step 2 has written `razorpay_stakeholder_id`, the freelancer is in a partial state.
- **Risk**: This is intentionally designed for resumability (comment says "so progress is preserved"). On retry, completed steps are skipped. This is actually a good pattern for multi-step external API flows.
- **Suggestion**: No change needed — this is correct for the use case.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟠 High | 4 |
| 🟡 Medium | 8 |
| 🟢 Low | 2 |

**Overall assessment**: The Razorpay Routes escrow implementation is architecturally sound — the flow from linked account creation through order-with-transfer to on-hold escrow and admin-triggered release is correct. However, there are two critical issues: (1) hardcoded database credentials in a committed file, and (2) the `transfer.processed` webhook handler prematurely marks escrowed transactions as COMPLETED, bypassing the admin release step. The webhook secret being logged is also a high-severity security gap. After fixing these, the flow is production-viable.

---

## Coverage Gaps

- **Schema migrations**: The `razorpay_transfer_id`, `razorpay_linked_account_id`, `razorpay_stakeholder_id`, `razorpay_product_id`, `razorpay_account_status`, `gst`, `street_address`, `city`, `state`, `postal_code` columns are not in `schema.md` — they are presumed to exist via migrations. Could not verify column existence.
- **Frontend**: No frontend code reviewed — cannot verify the Razorpay Checkout integration (key exposure, callback handling).
- **Environment variables**: Cannot verify that `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_X_WEBHOOK_SECRET`, and `PLATFORM_COMMISSION_PERCENTAGE` are correctly set in production.
- **Razorpay Dashboard config**: Cannot verify that webhook URLs, auto-capture settings, and Route product activation match the code expectations.
- **Rate limits**: Cannot tell if Razorpay rate limits (200 req/s) are being hit by the reconciliation crons under high volume.
