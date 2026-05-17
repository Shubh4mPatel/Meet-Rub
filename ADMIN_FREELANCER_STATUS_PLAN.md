# Admin Freelancer Detail — Razorpay Status Fix Plan

---

## Problem

`GET /admin/get-freelancerby-id/:freelancer_id` returns `razorpay_onboarding` but:

- `onboarding_failed` → error message and step **not included** — admin can't tell what went wrong
- `needs_clarification` → requirements **not fetched** — admin doesn't know what Razorpay needs
- `under_review` and `rejected` → `next_action` is **null** — admin sees nothing
- `activated_kyc_pending` → `next_action` is **null**
- `has_pan` not checked in detail endpoint

---

## What Changes

**One file only:** `backend/src/controller/users/userProfileController.js`

Three things fixed:
1. Add missing fields to the SELECT query
2. Fix `next_action` logic in both endpoints
3. Add `error` + `requirements` to the detail endpoint response

---

## Step 1 — Add Missing Fields to SELECT

**Endpoint:** `getFreeLancerByIdForAdmin` — line 3066

Add these to the DB query:

```sql
razorpay_onboarding_error,
razorpay_onboarding_error_step,
razorpay_onboarding_error_at,
razorpay_product_id,
pan_card_number
```

---

## Step 2 — Fix `next_action` Logic

Fix in **both** endpoints:
- `getFreeLancerByIdForAdmin` — line 3186
- `getFreelancerForKYCApproval` — line 2846

### New Priority Order

| Priority | Condition | `next_action` |
|---|---|---|
| 1 | missing bank OR address OR PAN | `missing_details` |
| 2 | `razorpay_onboarding_error` is set | `onboarding_failed` |
| 3 | no `razorpay_linked_account_id` | `create_linked_account` |
| 4 | status = `needs_clarification` | `check_razorpay_requirements` |
| 5 | status = `under_review` | `wait_for_razorpay` |
| 6 | status = `rejected` | `account_rejected` |
| 7 | status = `pending` or `created` | `check_razorpay_status` |
| 8 | status = `activated` or `activated_kyc_pending` | `approve_platform_kyc` |

---

## Step 3 — Add `error` + `requirements` to Response

**Detail endpoint only** (`getFreeLancerByIdForAdmin`).

### When `next_action = onboarding_failed`
Pull `error` straight from DB — no API call.

### When `next_action = check_razorpay_requirements`
Call `linkedAccountService.syncAccountStatus(freelancer_id)` → get `requirements` from Razorpay.
Wrap in try/catch — if Razorpay API fails → return `requirements: []` + `requirements_fetch_failed: true`.
Never crash the endpoint.

---

## Razorpay Requirements API — Real Field Structure

When status is `needs_clarification`, the product config GET returns a `requirements` object:

```json
{
  "requirements": {
    "due_by": 1690000000,
    "items": [
      {
        "field_reference": "settlements.account_number",
        "resolution_url": "/v2/accounts/acc_xxx/products/acc_prd_xxx",
        "status": "required",
        "reason_code": "field_mismatch",
        "description": "Bank account number does not match our records"
      }
    ]
  }
}
```

### All Possible `field_reference` Values for Route Product

| `field_reference` | Meaning | What freelancer must fix |
|---|---|---|
| `settlements.account_number` | Bank account number wrong or doesn't exist | Update bank account number |
| `settlements.ifsc_code` | IFSC code invalid or branch closed | Update IFSC code |
| `settlements.beneficiary_name` | Name doesn't match bank records | Update account holder name to exactly match bank records |
| `kyc.pan` | PAN verification failed | Update PAN number |

### All Possible `reason_code` Values

| `reason_code` | Meaning |
|---|---|
| `field_mismatch` | Data sent doesn't match what the bank/PAN records show |
| `needs_clarification` | Razorpay needs more info — generic |
| `not_legible` | Document image is unclear (not relevant for Route bank details) |
| `incorrect_details` | Details are wrong |

### `status` field
Always `"required"` — means this field must be fixed before activation.

### `due_by` field
Unix timestamp — deadline by which Razorpay needs the fix.
Can be `null` if no deadline set.

---

## Final API Response — All Possible States with Dummy Data

### State 1 — `missing_details`
```json
{
  "razorpay_onboarding": {
    "status": null,
    "account_id": null,
    "next_action": "missing_details",
    "can_approve_kyc": false,
    "error": null,
    "requirements": null
  }
}
```

### State 2 — `onboarding_failed` (Step 1 — create account)
```json
{
  "razorpay_onboarding": {
    "status": null,
    "account_id": null,
    "next_action": "onboarding_failed",
    "can_approve_kyc": false,
    "error": {
      "message": "Linked account creation failed: [BAD_REQUEST_ERROR] The email provided is already registered with another linked account",
      "step": "create_account",
      "at": "2026-05-10T08:23:11Z"
    },
    "requirements": null
  }
}
```

### State 3 — `onboarding_failed` (Step 2 — stakeholder)
```json
{
  "razorpay_onboarding": {
    "status": "created",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "onboarding_failed",
    "can_approve_kyc": false,
    "error": {
      "message": "Stakeholder creation failed: [BAD_REQUEST_ERROR] PAN ABCDE1234F is already linked to another account",
      "step": "create_stakeholder",
      "at": "2026-05-11T10:05:44Z"
    },
    "requirements": null
  }
}
```

### State 4 — `onboarding_failed` (Step 4 — bank details)
```json
{
  "razorpay_onboarding": {
    "status": "created",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "onboarding_failed",
    "can_approve_kyc": false,
    "error": {
      "message": "Product config update failed: [BAD_REQUEST_ERROR] Invalid IFSC code (field: settlements.ifsc_code)",
      "step": "update_product_config",
      "at": "2026-05-12T14:30:00Z"
    },
    "requirements": null
  }
}
```

### State 5 — `create_linked_account` (ready, not started)
```json
{
  "razorpay_onboarding": {
    "status": null,
    "account_id": null,
    "next_action": "create_linked_account",
    "can_approve_kyc": false,
    "error": null,
    "requirements": null
  }
}
```

### State 6 — `check_razorpay_requirements` (needs_clarification — bank issue)
```json
{
  "razorpay_onboarding": {
    "status": "needs_clarification",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "check_razorpay_requirements",
    "can_approve_kyc": false,
    "error": null,
    "requirements": {
      "due_by": 1720000000,
      "items": [
        {
          "field_reference": "settlements.account_number",
          "resolution_url": "/v2/accounts/acc_PBkMSHkd7bGSMI/products/acc_prd_K1eopFF8G21tux",
          "status": "required",
          "reason_code": "field_mismatch",
          "description": "Bank account number does not match our records"
        },
        {
          "field_reference": "settlements.ifsc_code",
          "resolution_url": "/v2/accounts/acc_PBkMSHkd7bGSMI/products/acc_prd_K1eopFF8G21tux",
          "status": "required",
          "reason_code": "incorrect_details",
          "description": "IFSC code is invalid or the branch has been closed"
        }
      ]
    }
  }
}
```

### State 7 — `check_razorpay_requirements` (needs_clarification — name mismatch)
```json
{
  "razorpay_onboarding": {
    "status": "needs_clarification",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "check_razorpay_requirements",
    "can_approve_kyc": false,
    "error": null,
    "requirements": {
      "due_by": null,
      "items": [
        {
          "field_reference": "settlements.beneficiary_name",
          "resolution_url": "/v2/accounts/acc_PBkMSHkd7bGSMI/products/acc_prd_K1eopFF8G21tux",
          "status": "required",
          "reason_code": "field_mismatch",
          "description": "Beneficiary name does not match the name registered with the bank"
        }
      ]
    }
  }
}
```

### State 8 — `check_razorpay_requirements` (Razorpay API failed to fetch)
```json
{
  "razorpay_onboarding": {
    "status": "needs_clarification",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "check_razorpay_requirements",
    "can_approve_kyc": false,
    "error": null,
    "requirements": [],
    "requirements_fetch_failed": true
  }
}
```

### State 9 — `wait_for_razorpay` (under_review)
```json
{
  "razorpay_onboarding": {
    "status": "under_review",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "wait_for_razorpay",
    "can_approve_kyc": false,
    "error": null,
    "requirements": null
  }
}
```

### State 10 — `account_rejected`
```json
{
  "razorpay_onboarding": {
    "status": "rejected",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "account_rejected",
    "can_approve_kyc": false,
    "error": null,
    "requirements": null
  }
}
```

### State 11 — `check_razorpay_status` (pending / created)
```json
{
  "razorpay_onboarding": {
    "status": "pending",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "check_razorpay_status",
    "can_approve_kyc": false,
    "error": null,
    "requirements": null
  }
}
```

### State 12 — `approve_platform_kyc` (activated)
```json
{
  "razorpay_onboarding": {
    "status": "activated",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "approve_platform_kyc",
    "can_approve_kyc": true,
    "error": null,
    "requirements": null
  }
}
```

### State 13 — `approve_platform_kyc` (activated_kyc_pending)
```json
{
  "razorpay_onboarding": {
    "status": "activated_kyc_pending",
    "account_id": "acc_PBkMSHkd7bGSMI",
    "next_action": "approve_platform_kyc",
    "can_approve_kyc": true,
    "error": null,
    "requirements": null
  }
}
```

---

## Summary of All `next_action` Values for Frontend

| `next_action` | What admin sees / does |
|---|---|
| `missing_details` | Tell freelancer to complete bank / address / PAN |
| `onboarding_failed` | Read `error.step` + `error.message` → tell freelancer what to fix |
| `create_linked_account` | Click "Start Onboarding" button |
| `check_razorpay_requirements` | Read `requirements.items` → tell freelancer which fields to fix |
| `wait_for_razorpay` | No action — wait 1-3 business days |
| `account_rejected` | Tell freelancer to create a new account with different credentials |
| `check_razorpay_status` | Penny drop in progress — wait for webhook |
| `approve_platform_kyc` | Click "Approve KYC" button |

---

## Sources

- [Update a Product Configuration - Razorpay Docs](https://razorpay.com/docs/api/payments/route/linked-account-onboarding/update-product-config/)
- [Sample Payloads When Status is Needs Clarification - Razorpay Docs](https://razorpay.com/docs/webhooks/partners/needs-clarification/)
- [Product Configuration APIs - Razorpay Docs](https://razorpay.com/docs/api/partners/product-configuration/)
- [Linked Accounts API - Razorpay Docs](https://razorpay.com/docs/api/payments/route/linked-account-onboarding/)
