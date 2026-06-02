# Razorpay Route — Linked Account Webhook Events

Reference doc for all webhook events fired during linked account (freelancer) onboarding and operation.
Subscribe to these in the Razorpay Dashboard under **Accounts & Settings → Webhooks**.

---

## Account Lifecycle Events

### 1. `product.route.under_review`

Fired when the linked account has been submitted and is pending Razorpay's internal review.

**When it fires:** After `RequestProductConfiguration` API call is made with bank details.

**Payload:**
```json
{
  "entity": "event",
  "account_id": "acc_QTzbto7NlAgZU4",
  "event": "product.route.under_review",
  "contains": ["merchant_product"],
  "payload": {
    "merchant_product": {
      "entity": {
        "id": "acc_prd_QTzcNTia8qHzYG",
        "merchant_id": "acc_QTzbto7NlAgZU4",
        "activation_status": "under_review"
      },
      "data": []
    }
  },
  "created_at": 1747047572
}
```

**Key fields:**
| Field | Value | Notes |
|---|---|---|
| `event` | `product.route.under_review` | Event identifier |
| `payload.merchant_product.entity.merchant_id` | `acc_xxx` | Razorpay linked account ID — map to your `freelancers` table |
| `payload.merchant_product.entity.activation_status` | `under_review` | Store this in DB |

**What to do in code:**
```js
case 'product.route.under_review': {
  const { merchant_id } = event.payload.merchant_product.entity;
  await db.query(
    `UPDATE freelancers SET razorpay_status = 'under_review' WHERE razorpay_account_id = $1`,
    [merchant_id]
  );
  // Optionally notify freelancer: "Your account is under review"
  break;
}
```

---

### 2. `product.route.activated`

Fired when the linked account is fully verified and activated. The freelancer can now receive transfers.

**When it fires:** Bank details verified successfully. Usually within a minute of submission per Razorpay docs.

**Payload:**
```json
{
  "entity": "event",
  "account_id": "acc_QTzbto7NlAgZU4",
  "event": "product.route.activated",
  "contains": ["merchant_product"],
  "payload": {
    "merchant_product": {
      "entity": {
        "id": "acc_prd_QTzcNTia8qHzYG",
        "merchant_id": "acc_QTzbto7NlAgZU4",
        "activation_status": "activated"
      },
      "data": []
    }
  },
  "created_at": 1747047578
}
```

**Key fields:**
| Field | Value | Notes |
|---|---|---|
| `event` | `product.route.activated` | Event identifier |
| `payload.merchant_product.entity.merchant_id` | `acc_xxx` | Razorpay linked account ID |
| `payload.merchant_product.entity.activation_status` | `activated` | Mark freelancer as payout-ready |

**What to do in code:**
```js
case 'product.route.activated': {
  const { merchant_id } = event.payload.merchant_product.entity;
  await db.query(
    `UPDATE freelancers SET razorpay_status = 'activated', payout_enabled = true WHERE razorpay_account_id = $1`,
    [merchant_id]
  );
  // Notify freelancer: "Your account is ready to receive payments"
  break;
}
```

---

### 3. `product.route.needs_clarification`

Fired when bank account verification fails and re-submission is required. The `data.requirements` array tells you exactly which fields are invalid.

**When it fires:** Bank details failed penny drop or IFSC validation. Max retries exceeded.

**Payload:**
```json
{
  "entity": "event",
  "account_id": "acc_QTzf1oMb6lfvIL",
  "event": "product.route.needs_clarification",
  "contains": ["merchant_product"],
  "payload": {
    "merchant_product": {
      "entity": {
        "id": "acc_prd_QTzgAPhwEwsO9Z",
        "merchant_id": "acc_QTzf1oMb6lfvIL",
        "activation_status": "needs_clarification"
      },
      "data": {
        "requirements": [
          {
            "field_reference": "settlements.ifsc_code",
            "resolution_url": "/accounts/acc_QTzf1oMb6lfvIL/products/acc_prd_QTzgAPhwEwsO9Z",
            "reason_code": "needs_clarification",
            "description": "Max retry exceeded for bank account details.",
            "status": "required"
          },
          {
            "field_reference": "settlements.beneficiary_name",
            "resolution_url": "/accounts/acc_QTzf1oMb6lfvIL/products/acc_prd_QTzgAPhwEwsO9Z",
            "reason_code": "needs_clarification",
            "description": "Max retry exceeded for bank account details.",
            "status": "required"
          },
          {
            "field_reference": "settlements.account_number",
            "resolution_url": "/accounts/acc_QTzf1oMb6lfvIL/products/acc_prd_QTzgAPhwEwsO9Z",
            "reason_code": "needs_clarification",
            "description": "Max retry exceeded for bank account details.",
            "status": "required"
          }
        ]
      }
    }
  },
  "created_at": 1747047833
}
```

**Key fields:**
| Field | Value | Notes |
|---|---|---|
| `event` | `product.route.needs_clarification` | Event identifier |
| `payload.merchant_product.entity.merchant_id` | `acc_xxx` | Razorpay linked account ID |
| `payload.merchant_product.entity.activation_status` | `needs_clarification` | Mark account as failed |
| `payload.merchant_product.data.requirements` | Array | Each entry has `field_reference` telling which field is wrong |

**Possible `field_reference` values:**
- `settlements.ifsc_code` — IFSC code is invalid
- `settlements.account_number` — Bank account number is wrong
- `settlements.beneficiary_name` — Name doesn't match bank records

**What to do in code:**
```js
case 'product.route.needs_clarification': {
  const { merchant_id } = event.payload.merchant_product.entity;
  const requirements = event.payload.merchant_product.data?.requirements || [];
  const failedFields = requirements.map(r => r.field_reference);

  await db.query(
    `UPDATE freelancers
     SET razorpay_status = 'needs_clarification',
         razorpay_failed_fields = $2,
         payout_enabled = false
     WHERE razorpay_account_id = $1`,
    [merchant_id, JSON.stringify(failedFields)]
  );
  // Notify freelancer to re-submit bank details
  // failedFields tells you exactly what to highlight in the form
  break;
}
```

---

## Transfer Events

### 4. `transfer.processed`

Fired when a transfer to a linked account is successfully processed and funds are credited.

**When it fires:** After you initiate a payout/transfer and it completes.

**Payload:**
```json
{
  "entity": "event",
  "account_id": "acc_CJoeHMNpi0nC7k",
  "event": "transfer.processed",
  "contains": ["transfer"],
  "payload": {
    "transfer": {
      "entity": {
        "id": "trf_EB1gHgrzOZff6d",
        "entity": "transfer",
        "status": "processed",
        "source": "order_EB1gHfAfmr65cS",
        "recipient": "acc_CNo3jSI8OkFJJJ",
        "amount": 100,
        "currency": "INR",
        "amount_reversed": 0,
        "fees": 1,
        "tax": 0,
        "on_hold": false,
        "processed_at": 1580461335
      }
    }
  },
  "created_at": 1580461335
}
```

**Key fields:**
| Field | Notes |
|---|---|
| `payload.transfer.entity.id` | Transfer ID (`trf_xxx`) — store in your transactions table |
| `payload.transfer.entity.recipient` | Linked account ID that received funds |
| `payload.transfer.entity.amount` | Amount in paise (divide by 100 for ₹) |
| `payload.transfer.entity.status` | `processed` |
| `payload.transfer.entity.processed_at` | Unix timestamp of when funds were credited |

**What to do in code:**
```js
case 'transfer.processed': {
  const transfer = event.payload.transfer.entity;
  await db.query(
    `UPDATE payouts
     SET status = 'processed', processed_at = to_timestamp($2), razorpay_transfer_id = $3
     WHERE razorpay_account_id = $1 AND status = 'pending'`,
    [transfer.recipient, transfer.processed_at, transfer.id]
  );
  break;
}
```

---

### 5. `transfer.failed`

Fired when a transfer to a linked account fails. Check `error` object for the reason.

**When it fires:** Insufficient balance, invalid account, or other transfer error.

**Payload:**
```json
{
  "entity": "event",
  "account_id": "acc_CJoeHMNpi0nC7k",
  "event": "transfer.failed",
  "contains": ["transfer"],
  "payload": {
    "transfer": {
      "entity": {
        "id": "trf_EB1gHgrzOZff6d",
        "entity": "transfer",
        "status": "failed",
        "source": "order_EB1gHfAfmr65cS",
        "recipient": "acc_CNo3jSI8OkFJJJ",
        "amount": 100,
        "currency": "INR",
        "processed_at": null,
        "error": {
          "code": "BAD_REQUEST_TRANSFER_INSUFFICIENT_BALANCE",
          "description": "Transfer failed due to insufficient balance",
          "source": "transfer",
          "step": "balance_check",
          "reason": "insufficient_balance"
        }
      }
    }
  },
  "created_at": 1580461335
}
```

**Key fields:**
| Field | Notes |
|---|---|
| `payload.transfer.entity.error.code` | Machine-readable error code |
| `payload.transfer.entity.error.description` | Human-readable reason |
| `payload.transfer.entity.error.reason` | Short reason string (e.g. `insufficient_balance`) |

**What to do in code:**
```js
case 'transfer.failed': {
  const transfer = event.payload.transfer.entity;
  await db.query(
    `UPDATE payouts
     SET status = 'failed', failure_reason = $2
     WHERE razorpay_transfer_id = $1`,
    [transfer.id, transfer.error?.description]
  );
  // Alert admin / retry logic
  break;
}
```

---

### 6. `settlement.processed`

Fired when funds settle from the parent merchant account to a linked account. This is the final settlement step.

> **Note:** `settlement.processed` fires when **Razorpay settles** to the linked account — it is different from `transfer.processed` which fires when you initiate the transfer.

**Payload:**
```json
{
  "entity": "event",
  "account_id": "acc_PR7UDve9UNcOxW",
  "event": "settlement.processed",
  "contains": ["settlement"],
  "payload": {
    "settlement": {
      "entity": {
        "id": "setl_Rf8uva1MU98B4l",
        "entity": "settlement",
        "amount": 1524,
        "status": "processed",
        "fees": 0,
        "tax": 0,
        "utr": "AXISCN1153863727",
        "created_at": 1763019089
      }
    }
  },
  "created_at": 1763021990
}
```

**Key fields:**
| Field | Notes |
|---|---|
| `payload.settlement.entity.id` | Settlement ID (`setl_xxx`) |
| `payload.settlement.entity.amount` | Amount settled in paise |
| `payload.settlement.entity.utr` | Bank UTR number — useful for reconciliation |
| `payload.settlement.entity.status` | `processed` |

**What to do in code:**
```js
case 'settlement.processed': {
  const settlement = event.payload.settlement.entity;
  await db.query(
    `INSERT INTO settlements (razorpay_settlement_id, amount, utr, settled_at)
     VALUES ($1, $2, $3, to_timestamp($4))
     ON CONFLICT (razorpay_settlement_id) DO NOTHING`,
    [settlement.id, settlement.amount / 100, settlement.utr, settlement.created_at]
  );
  break;
}
```

---

## Complete Webhook Handler

```js
// routes/webhooks.js

router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  // CRITICAL: validate using raw body (NOT parsed JSON)
  const isValid = Razorpay.validateWebhookSignature(
    req.body.toString(),
    signature,
    process.env.RAZORPAY_WEBHOOK_SECRET
  );

  if (!isValid) {
    logger.warn('[webhook] Invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(req.body);
  logger.info(`[webhook] Received event: ${event.event}`);

  try {
    switch (event.event) {

      // --- Account Lifecycle ---

      case 'product.route.under_review': {
        const { merchant_id } = event.payload.merchant_product.entity;
        await db.query(
          `UPDATE freelancers SET razorpay_status = 'under_review' WHERE razorpay_account_id = $1`,
          [merchant_id]
        );
        break;
      }

      case 'product.route.activated': {
        const { merchant_id } = event.payload.merchant_product.entity;
        await db.query(
          `UPDATE freelancers SET razorpay_status = 'activated', payout_enabled = true WHERE razorpay_account_id = $1`,
          [merchant_id]
        );
        break;
      }

      case 'product.route.needs_clarification': {
        const { merchant_id } = event.payload.merchant_product.entity;
        const requirements = event.payload.merchant_product.data?.requirements || [];
        const failedFields = requirements.map(r => r.field_reference);
        await db.query(
          `UPDATE freelancers
           SET razorpay_status = 'needs_clarification',
               razorpay_failed_fields = $2,
               payout_enabled = false
           WHERE razorpay_account_id = $1`,
          [merchant_id, JSON.stringify(failedFields)]
        );
        break;
      }

      // --- Transfer Events ---

      case 'transfer.processed': {
        const transfer = event.payload.transfer.entity;
        await db.query(
          `UPDATE payouts
           SET status = 'processed', processed_at = to_timestamp($2), razorpay_transfer_id = $3
           WHERE razorpay_account_id = $1 AND status = 'pending'`,
          [transfer.recipient, transfer.processed_at, transfer.id]
        );
        break;
      }

      case 'transfer.failed': {
        const transfer = event.payload.transfer.entity;
        await db.query(
          `UPDATE payouts SET status = 'failed', failure_reason = $2 WHERE razorpay_transfer_id = $1`,
          [transfer.id, transfer.error?.description]
        );
        break;
      }

      case 'settlement.processed': {
        const settlement = event.payload.settlement.entity;
        await db.query(
          `INSERT INTO settlements (razorpay_settlement_id, amount, utr, settled_at)
           VALUES ($1, $2, $3, to_timestamp($4))
           ON CONFLICT (razorpay_settlement_id) DO NOTHING`,
          [settlement.id, settlement.amount / 100, settlement.utr, settlement.created_at]
        );
        break;
      }

      default:
        logger.info(`[webhook] Unhandled event type: ${event.event}`);
    }

    res.json({ status: 'ok' });

  } catch (err) {
    logger.error(`[webhook] Handler error for ${event.event}:`, err);
    res.status(500).json({ error: 'Internal error' });
  }
});
```

---

## Quick Reference

| Event | Trigger | `activation_status` / `status` | Action |
|---|---|---|---|
| `product.route.under_review` | Bank details submitted | `under_review` | Update DB status |
| `product.route.activated` | Verification passed | `activated` | Enable payouts |
| `product.route.needs_clarification` | Verification failed | `needs_clarification` | Ask freelancer to re-submit bank details |
| `transfer.processed` | Transfer credited | `processed` | Mark payout as done |
| `transfer.failed` | Transfer failed | `failed` | Alert admin, retry |
| `settlement.processed` | Funds settled to linked account | `processed` | Record UTR for reconciliation |

---

## Important Notes

- **Raw body validation** — always pass `req.body.toString()` (raw), never `JSON.stringify(parsedBody)` to `validateWebhookSignature`. Parsing first breaks the signature.
- **Idempotency** — Razorpay can retry webhooks. Use `ON CONFLICT DO NOTHING` or check before updating to avoid duplicate processing.
- **Webhook secret rotation** — if you rotate the secret, use the old secret for retrying older in-flight requests.
- **Port requirement** — webhook URLs must use port `80` or `443` only.
- **`merchant_id` vs `account_id`** — in account lifecycle events, `merchant_id` inside the payload is the linked account's Razorpay ID (`acc_xxx`). The top-level `account_id` is your parent merchant ID.