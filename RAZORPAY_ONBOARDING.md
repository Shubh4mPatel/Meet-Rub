# Razorpay Freelancer Onboarding — Step by Step

---

## Before anything starts — Pre-validation

Before calling any Razorpay API, the code checks that all required fields exist and are correctly formatted.

### Required fields — if any are missing, onboarding won't even start

| Field | Where freelancer fills it |
|---|---|
| `freelancer_email` | Registration |
| `phone_number` | Basic info |
| `bank_account_no` | Bank details |
| `bank_ifsc_code` | Bank details |
| `bank_account_holder_name` | Bank details |
| `pan_card_number` | PAN card |
| `street_address` | Address |
| `city` | Address |
| `state` | Address |
| `postal_code` | Address |

**Error saved to:** `razorpay_onboarding_error_step = NULL` (never even starts)
**Error message example:** `Onboarding failed — missing required fields: bank_account_no, pan_card_number`

### Format rules — checked before API call

| Field | Rule | Wrong example | Right example |
|---|---|---|---|
| `street_address` | Min 10 characters | `MG Road` | `123 MG Road, Bandra` |
| `postal_code` | Exactly 6 digits | `4001` | `400001` |
| `phone_number` | 10 digits after removing +91 | `+91987654` | `+919876543210` |
| `bank_account_no` | 5 to 35 characters | `123` | `12345678901` |
| `bank_ifsc_code` | 4 letters + 0 + 6 alphanumeric | `HDFC001234` | `HDFC0001234` |
| `pan_card_number` | Format `AAAPANNNNC` | `ABC12345D` | `ABCDE1234F` |

**Fix:** Freelancer updates the wrong field via `POST /editProfile` → admin retries onboarding.

---

## Step 1 — Create Linked Account

**What it does:** Registers the freelancer as a sub-merchant on Razorpay. This is the moment the account is **created on Razorpay's side**.

**DB columns updated:**
- `razorpay_linked_account_id = acc_xxx`
- `razorpay_account_status = 'created'`

**Error saved to:** `razorpay_onboarding_error_step = 'create_account'`

**Data sent to Razorpay:**
```
email, phone, name, business_type (individual),
address (street, city, state, postal_code)
```

### Errors that can come

| Error | Cause | Fix |
|---|---|---|
| `Email already registered` | Freelancer's email is already tied to another Razorpay linked account | Freelancer uses a different email OR contact Razorpay support to release the old account |
| `Invalid phone number` | Not exactly 10 digits after stripping country code | Freelancer updates phone number |
| `Invalid state` | State sent as full name e.g. `Maharashtra` instead of code `MH` | Fix state value in DB to use 2-letter state code |
| `Invalid postal code` | Not exactly 6 digits | Freelancer updates postal code |
| `street_address too short` | Less than 10 characters | Freelancer updates address |

**Important:** If this step fails, **no Razorpay account exists yet**. Admin reset is safe here — just fix the data and retry onboarding.

---

## Step 2 — Create Stakeholder

**What it does:** Links the freelancer's PAN and personal identity to the account. This is how Razorpay knows who the account belongs to.

**DB column updated:** `razorpay_stakeholder_id = sth_xxx`

**Error saved to:** `razorpay_onboarding_error_step = 'create_stakeholder'`

**Data sent to Razorpay:**
```
name, phone, email, residential address, PAN number
```

### Errors that can come

| Error | Cause | Fix |
|---|---|---|
| `PAN already linked` | Same PAN used for another Razorpay linked account | Contact Razorpay support — PAN cannot be reused across accounts |
| `Invalid PAN format` | PAN doesn't match `AAAPANNNNC` pattern | Freelancer corrects PAN via `POST /editProfile` with `type: panCard` |
| `Name mismatch` | Name sent doesn't match what's on PAN records | Freelancer must use exact name as on PAN card |
| `Phone format invalid` | Not numeric 10 digits | Freelancer updates phone number |

**Important:** The Razorpay account from Step 1 **already exists**. Do NOT reset — just fix the data and retry. Onboarding automatically skips Step 1.

---

## Step 3 — Request Product Configuration

**What it does:** Tells Razorpay this account will use the **Route** product (to receive transfers from your platform).

**DB column updated:** `razorpay_product_id = acc_prd_xxx`

**Error saved to:** `razorpay_onboarding_error_step = 'request_product_config'`

**Data sent to Razorpay:**
```
product_name: "route", tnc_accepted: true
```

### Errors that can come

| Error | Cause | Fix |
|---|---|---|
| `Product already exists` | Route product was already requested for this account | Not a real error — onboarding handles this via idempotency, just retry |
| Razorpay API timeout | Razorpay server issue | Just retry — no data change needed |

**This step almost never fails due to data issues.** If it fails, just retry onboarding directly — no reset, no data change needed.

---

## Step 4 — Submit Bank Details (Penny Drop)

**What it does:** Sends the bank account number and IFSC to Razorpay. Razorpay then runs a **penny drop** — deposits ₹1 to verify the account exists and the beneficiary name matches.

**Error saved to:** `razorpay_onboarding_error_step = 'update_product_config'`

**Data sent to Razorpay:**
```
bank_account_no, bank_ifsc_code, bank_account_holder_name
```

### Errors that can come during the API call

| Error | Cause | Fix |
|---|---|---|
| `Invalid IFSC code` | IFSC doesn't exist or has wrong format | Freelancer updates IFSC via bank details edit |
| `Invalid account number` | Account number format wrong | Freelancer updates bank account number |
| `Beneficiary name too short` | Name under 4 characters | Freelancer updates account holder name |

### After the API call — Razorpay runs penny drop asynchronously

Razorpay doesn't give the result immediately. The result arrives via **webhook** and updates `razorpay_account_status`:

| Status | Meaning | What to do |
|---|---|---|
| `activated` | Penny drop passed, bank verified ✅ | Nothing — proceed to approve KYC |
| `needs_clarification` | Penny drop failed or data mismatch | See section below |
| `under_review` | Razorpay is manually reviewing | Wait — webhook fires when done |
| `pending` | Verification still in progress | Wait — webhook fires when done |

---

## After Step 4 — What each status means

### `activated`
Everything passed. Freelancer's bank is verified.
- **Admin action:** Approve platform KYC via `POST /admin/approve-kyc/:freelancer_id`
- **No Razorpay action needed**

---

### `needs_clarification`
Razorpay could not verify something. Call `GET /admin/freelancer/:id/linked-account-status` to get the `requirements` array listing exactly what's wrong.

Common requirements:

| Requirement field | Meaning | Fix |
|---|---|---|
| `settlements.ifsc_code` | IFSC is wrong or bank branch closed | Freelancer updates IFSC |
| `settlements.account_number` | Account doesn't exist or is closed | Freelancer updates account number |
| `settlements.beneficiary_name` | Name doesn't match bank records | Freelancer updates account holder name to match exactly |
| `kyc.pan` | PAN verification failed | Freelancer provides correct PAN |

**Fix flow:**
1. Admin calls `GET /admin/freelancer/:id/linked-account-status` → reads `requirements`
2. Admin tells freelancer which field to fix
3. Freelancer updates via `POST /editProfile`
4. Admin retries onboarding via `POST /admin/freelancer/:id/create-linked-account`
5. **No reset needed** — Step 4 runs again with the updated data

---

### `under_review`
Razorpay's team is manually reviewing the account. Nothing is wrong yet.
- **Admin action:** Wait
- **Webhook fires:** `account.activated` or `account.needs_clarification` when review is done
- **Typical timeline:** 1–3 business days

---

### `rejected`
Razorpay manually reviewed and rejected the account. This is rare and means Razorpay found a compliance or fraud concern.
- **Cannot fix programmatically**
- **Admin action:** Contact Razorpay support with the `razorpay_linked_account_id`
- **Do NOT reset** — email and PAN are tied to this account on Razorpay's side. Creating a new account with the same email will fail

---

## When is admin reset safe?

| Scenario | Reset safe? | Reason |
|---|---|---|
| Step 1 failed (`create_account`) | ✅ Yes | No Razorpay account exists yet |
| Step 2 failed (`create_stakeholder`) | ❌ No | Account exists — just retry after fixing PAN/name |
| Step 3 failed (`request_product_config`) | ❌ No | Just retry — no data change needed |
| Step 4 failed (`update_product_config`) | ❌ No | Just retry after fixing bank details |
| Status is `needs_clarification` | ❌ No | Fix bank details and retry Step 4 only |
| Status is `under_review` | ❌ No | Wait for Razorpay webhook |
| Status is `rejected` | ❌ No | Reset won't help — email/PAN still tied to old account |

---

## Full flow diagram

```
Freelancer fills data
        ↓
Pre-validation (missing fields / format errors)
        ↓ fails → fix data → retry
Step 1: Create Linked Account
        ↓ fails → fix data → retry  (reset only if email conflict)
Step 2: Create Stakeholder (PAN + identity)
        ↓ fails → fix PAN/name → retry  (skips Step 1 automatically)
Step 3: Request Route product
        ↓ fails → just retry  (no data change needed)
Step 4: Submit bank details → Razorpay runs penny drop
        ↓
   activated ──────────────→ Admin approves platform KYC ✅
   needs_clarification ────→ Fix bank details → retry Step 4 only
   under_review ───────────→ Wait for webhook (1–3 business days)
   rejected ───────────────→ Contact Razorpay support
```

---

## Where admin sees errors

| What you want to know | Endpoint | Field to read |
|---|---|---|
| Did onboarding fail and at which step? | `GET /admin/freelancers-for-KYC-approval` | `razorpay_onboarding_error` + `razorpay_onboarding_error_step` |
| What does Razorpay need right now? | `GET /admin/freelancer/:id/linked-account-status` | `requirements` array |
| What should I do next for this freelancer? | `GET /admin/freelancers-for-KYC-approval` | `next_action` field |

### `next_action` values

| Value | Meaning |
|---|---|
| `missing_details` | Freelancer hasn't filled bank / address / PAN yet |
| `onboarding_failed` | A step threw an error — read `razorpay_onboarding_error` |
| `create_linked_account` | All data ready, onboarding not started yet |
| `check_razorpay_requirements` | Status is `needs_clarification` — call linked-account-status endpoint |
| `check_razorpay_status` | Status is `pending` or `created` — wait or sync |
| `approve_platform_kyc` | Razorpay activated — admin can approve KYC now |

---

## Webhook events that update account status

These fire automatically from Razorpay and update `razorpay_account_status` in your DB:

| Webhook event | Status set to |
|---|---|
| `account.activated` | `activated` |
| `account.instantly_activated` | `activated` |
| `account.activated_kyc_pending` | `activated_kyc_pending` |
| `account.needs_clarification` | `needs_clarification` |
| `account.under_review` | `under_review` |
| `account.rejected` | `rejected` |
| `product.route.activated` | `activated` |
| `product.route.needs_clarification` | `needs_clarification` |
| `product.route.under_review` | `under_review` |
| `product.route.rejected` | `rejected` |
