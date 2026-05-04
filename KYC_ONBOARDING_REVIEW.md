# KYC Onboarding Review: Linked Account Creation vs Razorpay Docs

**Date**: 5 May 2026  
**Scope**: Freelancer onboarding flow — Linked Account → Stakeholder → Product Config → Settlement setup

---

## What Razorpay REQUIRES for KYC Activation (Individual)

When Razorpay returns the `requirements` array after requesting product config, these fields show as `status: "required"`:

| Requirement | Where to provide | Code sends it? |
|---|---|---|
| `kyc.pan` | Stakeholder API (Step 2) | ⚠️ Only if `pan_card_number` exists — **not enforced** |
| `settlements.account_number` | Update Product (Step 4) | ✅ |
| `settlements.ifsc_code` | Update Product (Step 4) | ✅ |
| `settlements.beneficiary_name` | Update Product (Step 4) | ✅ |
| `tnc_accepted` | Request Product (Step 3) + Update (Step 4) | ⚠️ Missing in Step 3 |

Without **PAN in the stakeholder** + **tnc_accepted in product request**, the account stays at `activation_status: "needs_clarification"` forever and transfers won't work.

---

## Step-by-Step Comparison

### Step 1: Create Linked Account (`POST /v2/accounts`)

| Field (Razorpay Docs) | Required? | Your Code | Status |
|---|---|---|---|
| `email` | **Mandatory** | `freelancer.freelancer_email` | ✅ |
| `phone` | **Mandatory** (8-15 digits) | `Number(phoneDigits)` | ✅ |
| `type` | **Mandatory** | `'route'` | ✅ |
| `legal_business_name` | **Mandatory** (min 4 chars) | `bank_account_holder_name \|\| freelancer_full_name` | ✅ |
| `business_type` | **Mandatory** | `'individual'` | ✅ |
| `contact_name` | Optional (min 4, max 255 chars) | ❌ **Missing** | ⚠️ Improves KYC |
| `reference_id` | Optional (max 512 chars) | ❌ **Missing** | ⚠️ Useful for dedup |
| `profile.category` | **Mandatory** | `'services'` | ✅ |
| `profile.subcategory` | **Mandatory** | `'professional_services'` | ✅ |
| `profile.addresses.registered.street1` | Required (max 100 chars) | `freelancer.street_address \|\| 'Not Provided'` | ⚠️ Fallback risky |
| `profile.addresses.registered.street2` | Required (max 100 chars) | `'Not Provided'` | ⚠️ Hardcoded |
| `profile.addresses.registered.city` | Required (max 100 chars) | `freelancer.city \|\| 'Mumbai'` | ⚠️ Fallback |
| `profile.addresses.registered.state` | Required (UPPERCASE, 2-32 chars) | `(freelancer.state \|\| 'MAHARASHTRA').toUpperCase()` | ✅ |
| `profile.addresses.registered.postal_code` | Required (integer, exactly 6 digits) | `Number(freelancer.postal_code) \|\| 400001` | ✅ |
| `profile.addresses.registered.country` | Required (2-64 chars) | `'IN'` | ✅ |
| `legal_info.pan` | Conditional (NOT for `individual`) | Not sent | ✅ Correct |

### Step 2: Create Stakeholder (`POST /v2/accounts/:id/stakeholders`)

| Field (Razorpay Docs) | Required? | Your Code | Status |
|---|---|---|---|
| `name` | **Mandatory** (as per PAN, max 255) | `bank_account_holder_name \|\| freelancer_full_name` | ✅ |
| `email` | **Mandatory** (max 132 chars) | `freelancer.freelancer_email` | ✅ |
| `phone.primary` | Optional (8-11 digits integer) | `Number(phoneDigits)` | ✅ |
| `addresses.residential.street` | Optional (min 10, max 255 chars) | `freelancer.street_address` | ✅ |
| `addresses.residential.city` | Optional (2-32 chars) | `freelancer.city \|\| 'Mumbai'` | ✅ |
| `addresses.residential.state` | Optional (2-32 chars) | `freelancer.state \|\| 'Maharashtra'` | ⚠️ Not uppercased |
| `addresses.residential.postal_code` | Optional (string, 2-10 chars) | `String(freelancer.postal_code)` | ✅ |
| `addresses.residential.country` | Optional (2-64 chars) | `'IN'` | ✅ |
| `kyc.pan` | **Required for KYC** (4th char must be 'P') | `freelancer.pan_card_number` (if exists) | ⚠️ Not enforced |
| `relationship` | Optional | ❌ Not sent | ℹ️ OK |
| `percentage_ownership` | Optional | ❌ Not sent | ℹ️ OK |

### Step 3: Request Product Configuration (`POST /v2/accounts/:id/products`)

| Field (Razorpay Docs) | Required? | Your Code | Status |
|---|---|---|---|
| `product_name` | **Mandatory** | `'route'` | ✅ |
| `tnc_accepted` | Optional (but needed for activation) | ❌ **Missing** | ⚠️ Causes `needs_clarification` |

### Step 4: Update Product Configuration (`PATCH /v2/accounts/:id/products/:pid`)

| Field (Razorpay Docs) | Required? | Your Code | Status |
|---|---|---|---|
| `settlements.account_number` | Required for KYC | `freelancer.bank_account_no` | ✅ |
| `settlements.ifsc_code` | Required for KYC | `freelancer.bank_ifsc_code` | ✅ |
| `settlements.beneficiary_name` | Required for KYC | `bank_account_holder_name \|\| freelancer_full_name` | ✅ |
| `tnc_accepted` | Required | `true` | ✅ |

---

## Issues Found

### 🔴 Critical — PAN not enforced before onboarding

- **Location**: `linkedAccountService.js` → `onboardFreelancer()` validation section
- **Evidence**: Current code only validates PAN format IF it exists: `if (freelancer.pan_card_number && freelancer.pan_card_number.charAt(3) !== 'P')`
- **Risk**: Without PAN in stakeholder, Razorpay returns `activation_status: "needs_clarification"` with `"field_reference": "kyc.pan"`. The linked account will never activate, and transfers will fail.
- **Fix**: Make PAN mandatory before allowing onboarding. Add full regex validation `/^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/i`.

### 🟠 High — `requestProductConfig` missing `tnc_accepted: true`

- **Location**: `linkedAccountService.js` → `requestProductConfig()`
- **Evidence**: Only sends `{ product_name: 'route' }`. Docs show `tnc_accepted: true` should be included.
- **Risk**: Without TnC acceptance at product request stage, activation may require an extra round-trip or manual intervention.
- **Fix**: Add `tnc_accepted: true` to the payload.

### 🟠 High — No `contact_name` in linked account creation

- **Location**: `linkedAccountService.js` → `createLinkedAccount()`
- **Evidence**: Razorpay docs list `contact_name` (min 4, max 255 chars). Not sent.
- **Risk**: For individuals, `contact_name` helps Razorpay match identity during KYC. Without it, some accounts may get stuck in `under_review`.
- **Fix**: Add `contact_name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name`.

### 🟡 Medium — `street2: 'Not Provided'` hardcoded

- **Location**: `linkedAccountService.js` → `createLinkedAccount()` line ~38
- **Evidence**: `street2: 'Not Provided'` is always sent.
- **Risk**: Razorpay may flag during manual KYC review. "Not Provided" isn't a real address.
- **Fix**: Change to empty string `''` or omit the field.

### 🟡 Medium — State not uppercased in stakeholder

- **Location**: `linkedAccountService.js` → `createStakeholder()` line ~88
- **Evidence**: Step 1 uppercases state: `(freelancer.state || 'MAHARASHTRA').toUpperCase()`. Step 2 does NOT: `state: (freelancer.state || 'Maharashtra')`.
- **Risk**: Inconsistency. Razorpay stakeholder API accepts mixed case, but inconsistency between account and stakeholder addresses could delay KYC.
- **Fix**: Add `.toUpperCase()` or keep consistent format.

### 🟡 Medium — Fallback values for address (`'Mumbai'`, `400001`)

- **Location**: `linkedAccountService.js` → `createLinkedAccount()` lines ~40-42
- **Evidence**: `city: freelancer.city || 'Mumbai'`, `postal_code: ... || 400001`
- **Risk**: The `onboardFreelancer()` validation requires all address fields, so these fallbacks shouldn't trigger. But if `createLinkedAccount` is called directly (outside orchestrator), fake data goes to Razorpay.
- **Fix**: Remove fallbacks since validation gate already exists in `onboardFreelancer`.

---

## DB Fields Assessment

| Field | Purpose | In DB? | Required for KYC? |
|---|---|---|---|
| `pan_card_number` | Stakeholder KYC | ✅ Yes | **YES — mandatory** |
| `street_address` | Registered + Residential address | ✅ Yes | YES |
| `city` | Address | ✅ Yes | YES |
| `state` | Address | ✅ Yes | YES |
| `postal_code` | Address (6 digits) | ✅ Yes | YES |
| `bank_account_no` | Settlement account | ✅ Yes | YES |
| `bank_ifsc_code` | Settlement IFSC | ✅ Yes | YES |
| `bank_account_holder_name` | Beneficiary name | ✅ Yes | YES |
| `phone_number` | Account + Stakeholder phone | ✅ Yes | YES |
| `freelancer_email` | Account + Stakeholder email | ✅ Yes | YES |
| `freelancer_full_name` | Fallback for names | ✅ Yes | YES |
| `date_of_birth` | Not sent to Razorpay currently | ✅ Yes | No (not needed) |
| `street_address_2` (address line 2) | Linked account `street2` | ❌ Missing | No (optional) |

### Verdict: No new DB columns needed ✅

All required fields for KYC activation already exist in the `freelancer` table. The only missing optional field is `street_address_2` which is not required.

---

## Required Fixes (Priority Order)

| # | Fix | Severity | File | Line |
|---|---|---|---|---|
| 1 | Make PAN mandatory in `onboardFreelancer` validation | 🔴 Critical | `linkedAccountService.js` | ~244 |
| 2 | Add full PAN regex validation `/^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/i` | 🔴 Critical | `linkedAccountService.js` | ~244 |
| 3 | Add `tnc_accepted: true` to `requestProductConfig` payload | 🟠 High | `linkedAccountService.js` | ~115 |
| 4 | Add `contact_name` to `createLinkedAccount` payload | 🟠 High | `linkedAccountService.js` | ~20 |
| 5 | Change `street2: 'Not Provided'` to `street2: ''` | 🟡 Medium | `linkedAccountService.js` | ~38 |
| 6 | Uppercase state in `createStakeholder` | 🟡 Medium | `linkedAccountService.js` | ~88 |
| 7 | Remove unnecessary fallbacks (Mumbai, 400001) | 🟡 Medium | `linkedAccountService.js` | ~40 |

---

## What Happens Without These Fixes

```
┌─────────────────────────────┐
│ Freelancer without PAN      │
│ starts onboarding           │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ Step 1: Linked Account ✅    │
│ Step 2: Stakeholder ✅       │
│   (but kyc.pan is null)     │
│ Step 3: Product Config ✅    │
│   (but tnc_accepted missing)│
│ Step 4: Update Product ✅    │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ Razorpay returns:           │
│ activation_status:          │
│   "needs_clarification"     │
│                             │
│ requirements: [             │
│   { field: "kyc.pan" }      │
│ ]                           │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ Account NEVER activates     │
│ Transfers FAIL at payment   │
│ Creator can't pay freelancer│
└─────────────────────────────┘
```

With the fixes applied, PAN is enforced upfront and TnC is accepted in both steps → account activates immediately or goes to `under_review` (auto-approved for most cases).
