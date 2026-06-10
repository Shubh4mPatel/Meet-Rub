# Google Registration Flow

> Covers the full end-to-end path a new user takes when registering via **"Sign up with Google"**.
> Source: actual code in `meetrub/` (frontend) and `backend/` (backend). Schema references from `schema.md`.

---

## Overview

```
User (Browser)
  → GoogleSignupModal  (fill form + trigger Google popup)
  → Google OAuth popup (accounts.google.com)
  → Next.js callback route  (/api/auth/google/callback)
  → google-popup-callback page  (postMessage back to opener)
  → GoogleSignupModal  (build FormData → POST /auth/social-register)
  → Express backend  (validate → verify token → DB transaction → JWT)
  → setTokenCookies  (httpOnly cookies)
  → 201 response  → signup page redirect
```

---

## Step 1 — User Opens the Sign-Up Page

**File:** `meetrub/src/app/(public)/signup/page.js`

- The page renders a **"Sign up with Google"** button.
- Clicking it sets `showGoogleModal = true`, which mounts `<GoogleSignupModal>`.
- On mount the component fetches the list of valid Indian states from `GET /public/states` to populate the state dropdown (used by the freelancer address form).

---

## Step 2 — GoogleSignupModal: Form Collection

**File:** `meetrub/src/components/common/GoogleSignupModal/page.js`

The modal collects all registration data **before** touching Google OAuth so the file input (PAN card) is never lost to a page navigation.

### 2a. Role Selection

User picks **Freelancer** or **Creator** from a dropdown.  
Changing the role resets all form fields and clears file selection.

### 2b. Common Fields (both roles)

| Field | Validation |
|---|---|
| `userName` | Required; min 3 chars; debounced availability check (`GET /public/check-username?username=`) against Redis + DB |
| `phoneNo` | Required; must match `/^\+[1-9]\d{9,14}$/` (country code format, e.g. `+91XXXXXXXXXX`) |
| `niche` | Optional multiselect; values from `availableNiches` list |

### 2c. Creator-Only Fields

| Field | Notes |
|---|---|
| `instagramLink` | Optional URL |
| `youtubeLink` | Optional URL |

### 2d. Freelancer-Only Fields

| Field | Validation |
|---|---|
| `panCardNumber` | Required; regex `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/`; 4th character must be `'P'` |
| `pan_card_document` | Required file upload; max 5 MB; accepted: `.jpg .jpeg .png .gif .webp .pdf` |
| `streetAddress` | Required |
| `city` | Required |
| `state` | Required; must be a valid Indian state (from `/public/states`) |
| `postalCode` | Required; exactly 6 digits |

### 2e. Client-Side Validation Summary (on submit)

1. Role must be selected.
2. Username required and must not be taken.
3. Phone format checked.
4. Freelancer: PAN format, 4th-char rule, file present, all address fields present, postal code is 6 digits.

---

## Step 3 — Google OAuth Popup

**Function:** `getGoogleTokenViaPopup()` inside `GoogleSignupModal/page.js`

On submit (after validation passes), the modal calls `getGoogleTokenViaPopup()`.  
This is a `Promise`-based helper that:

1. Reads `NEXT_PUBLIC_GOOGLE_CLIENT_ID` from env.
2. Constructs the Google authorization URL:
   ```
   https://accounts.google.com/o/oauth2/v2/auth
     ?client_id=<GOOGLE_CLIENT_ID>
     &redirect_uri=<APP_URL>/api/auth/google/callback
     &response_type=code
     &scope=email%20profile
     &state=popup-register          ← marks this as a popup registration
     &prompt=select_account
   ```
3. Opens the URL in a small popup window (`520×620`).
4. Attaches a `window.addEventListener('message', ...)` listener to receive the result.
5. A `setInterval` polls every 500 ms to detect if the popup was closed without completing auth (cancelled scenario), with a 1-second grace period so the success `postMessage` can arrive first.

**Resolution:** The Promise resolves with `{ accessToken, email, name }` or rejects with an error message.

---

## Step 4 — Next.js OAuth Callback Route

**File:** `meetrub/src/app/api/auth/google/callback/route.js`

Google redirects the popup browser tab to `<APP_URL>/api/auth/google/callback?code=<code>&state=popup-register`.

The route handler:

1. Reads `code`, `error`, `state` from the URL.
2. Detects `state === 'popup-register'` → `isPopupRegister = true`.
3. **Error handling:** if Google returned an error (e.g. `access_denied`) or no code, redirects popup to `/google-popup-callback?error=<reason>`.
4. **Token exchange:** `POST https://oauth2.googleapis.com/token` with:
   - `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`, `code`
   - Returns `access_token` (and `id_token`, `refresh_token`).
5. **Profile fetch:** `GET https://www.googleapis.com/oauth2/v2/userinfo` with `Authorization: Bearer <access_token>`.
   - Returns `{ id, email, name, picture }`.
6. **Popup path** (since `isPopupRegister = true`): redirects the popup to:
   ```
   /google-popup-callback
     ?token=<access_token>
     &email=<profile.email>
     &name=<profile.name>
     &picture=<profile.picture>
     &providerId=<profile.id>
     &flow=register
   ```

> The full-page (non-popup) path also exists in this route and calls the backend `social-login` endpoint directly, but the registration flow always uses the popup path.

---

## Step 5 — Popup Callback Page

**File:** `meetrub/src/app/google-popup-callback/page.js`

This is a minimal client-rendered page that runs in the popup window:

1. Reads all URL params: `token`, `email`, `name`, `picture`, `providerId`, `flow`, `error`.
2. Calls `window.opener.postMessage(...)` targeted at `window.location.origin`:
   - **Success:** `{ type: 'GOOGLE_AUTH_SUCCESS', accessToken: token, email, name, picture, providerId, flow }`
   - **Error:** `{ type: 'GOOGLE_AUTH_ERROR', error: <reason> }`
3. Calls `window.close()` — the popup disappears.

---

## Step 6 — Modal Receives Token and Calls Backend

Back in `GoogleSignupModal`, the `getGoogleTokenViaPopup()` Promise resolves with `{ accessToken, email, name }`.

The modal builds a `FormData` object and calls `apiClient.upload('/auth/social-register', payload)`:

### Payload fields (all roles)

| Field | Value |
|---|---|
| `provider` | `"google"` |
| `accessToken` | Google access token received from popup |
| `email` | Email from Google profile |
| `name` | Name from Google profile (or `userName` as fallback) |
| `role` | `"freelancer"` or `"creator"` |
| `username` | Value from form |
| `phone_number` | Value from form |
| `niches` | JSON-stringified array of selected niches |

### Additional fields for Creator

| Field | Value |
|---|---|
| `socialLinks` | JSON-stringified `{ instagram?, youtube? }` (only if links were provided) |

### Additional fields for Freelancer

| Field | Value |
|---|---|
| `pan_card_number` | Uppercased, trimmed PAN |
| `street_address` | Value from form |
| `city` | Value from form |
| `state` | Value from form |
| `postal_code` | Value from form |
| `pan_card_document` | `File` object (multipart upload) |

---

## Step 7 — Express Route

**File:** `backend/src/routes/authRoutes.js`

```
POST /auth/social-register
  → upload.single('pan_card_document')   (multer, parses the multipart body)
  → googleRegisterUser                   (main controller)
  → setTokenCookies                      (attaches JWT cookies)
  → final handler                        (sends 201 JSON)
```

---

## Step 8 — `googleRegisterUser` Controller

**File:** `backend/src/controller/auth/register/googleRegister.js`

### 8a. Body Extraction

```js
const {
  provider, accessToken, email, name, role, username, phone_number,
  niches, pan_card_number, street_address, city, state, postal_code, socialLinks
} = req.body;
```

### 8b. Server-Side Validation

| Check | Error |
|---|---|
| `provider !== 'google'` | 400 Unsupported OAuth provider |
| Missing `accessToken` or `email` | 400 |
| `role` not in `['freelancer', 'creator']` | 400 |
| Missing `username` | 400 |
| Missing `phone_number` | 400 |
| Freelancer: missing `pan_card_number` | 400 |
| Freelancer: no file uploaded (`req.file`) | 400 |
| PAN does not match `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/` | 400 |
| PAN 4th char is not `'P'` | 400 |
| Freelancer: any address field missing | 400 |
| State not in `INDIAN_STATES` list | 400 |
| Postal code not exactly 6 digits | 400 |

### 8c. Google Token Verification (`verifyGoogleToken`)

Calls Google's tokeninfo endpoint:
```
GET https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=<token>
```

Checks performed:
1. No `error_description` in the response and `email` is present → token is valid.
2. `tokenInfo.aud === process.env.GOOGLE_CLIENT_ID` → token was issued for **this** app (prevents token substitution attacks).
3. `tokenInfo.email` (lowercased) matches the `email` field from the request body → email hasn't been tampered with.

Returns `{ email: verifiedEmail }` on success, throws `AppError 401` on any failure.

### 8d. Duplicate Email Check

```sql
SELECT id FROM users WHERE user_email = $1
```
If a row exists → `AppError 409` — account already exists.

### 8e. Username Uniqueness (Double-Checked)

1. `redisClient.sIsMember('usernames:set', normalizedUsername)` — fast in-memory check.
2. `SELECT id FROM users WHERE user_name = $1` — DB fallback.

Either hit → `AppError 400` username already taken.

### 8f. Name Splitting

```js
const nameParts = (name || normalizedUsername).trim().split(/\s+/);
const firstName = nameParts[0];
const lastName  = nameParts.slice(1).join(' ') || '';
const fullName  = (name || normalizedUsername).trim();
```

### 8g. Database Transaction

```
BEGIN
  INSERT INTO users (user_email, user_role, user_password=NULL, user_name, auth_provider='google', created_at)
  → returns user row

  IF role = 'freelancer':
    Upload PAN card file to MinIO:
      bucket: meet-rub-assets
      key:    kyc/pan/<user.id>_<timestamp>.<ext>
    INSERT INTO freelancer (user_id, phone_number, freelancer_full_name, freelancer_email,
                            niche, verification_status='PENDING', user_name, pan_card_number,
                            pan_card_image_url, street_address, city, state, postal_code,
                            first_name, last_name, created_at, updated_at)

  IF role = 'creator':
    INSERT INTO creators (user_id, full_name, first_name, last_name, niche, social_links,
                          phone_number, email, user_name, created_at, updated_at)

  Redis SADD usernames:set <username>
COMMIT
```

**On any error:**
```
ROLLBACK
Redis SREM usernames:set <username>   (undo username reservation)
MinIO removeObject <panObjectName>    (undo PAN card upload, if it happened)
```

### 8h. Post-Commit (Non-Blocking)

Both emails fire in the background — failures are logged but never bubble up to the response:

```js
sendWelcomeEmail(role, verifiedEmail, normalizedUsername)
sendAdminNewUserEmail(role, normalizedUsername, verifiedEmail, now, req.ip)
```

### 8i. JWT Token Generation

```js
generateTokens(user, roleWiseId)
```

**Access token payload:**
```json
{
  "user_id": <users.id>,
  "email":   <users.user_email>,
  "name":    <users.user_name>,
  "role":    "freelancer" | "creator",
  "roleWiseId": <freelancer_id | creator_id>,
  "permissions": null
}
```

**Refresh token payload:**
```json
{ "user_id": <users.id> }
```

Stored in `res.locals.accessToken` and `res.locals.refreshToken` for the next middleware.

---

## Step 9 — `setTokenCookies` Middleware

**File:** `backend/src/middleware/tokenCookieMiddleware.js`

| Cookie | Value | Flags |
|---|---|---|
| `AccessToken` | JWT access token | `httpOnly`, `path=/`, 365 days |
| `RefreshToken` | JWT refresh token | `httpOnly`, `path=/`, 365 days |

Environment-specific flags:
- **Production:** `secure: true`, `sameSite: 'strict'`
- **Development:** `secure: false`, `sameSite: 'Lax'` (allows HTTP / localhost)

---

## Step 10 — Success Response (201)

```json
{
  "message": "Registration successful",
  "userInfo": {
    "user_id":    123,
    "email":      "user@example.com",
    "name":       "chosen_username",
    "role":       "freelancer | creator",
    "roleWiseId": 456
  }
}
```

---

## Step 11 — Frontend Post-Registration

**Back in `signup/page.js`** — `handleGoogleSuccess(response)`:

1. Closes the `GoogleSignupModal`.
2. Shows `toast.success('Registration successful! Redirecting...')`.
3. Calls `updateUser({ email, loggedIn: true })` to update the `AuthContext`.
4. Reads role from JWT cookie via `getRoleFromToken()` (client-side JWT decode, no verification).
5. Stores role in `localStorage.setItem('userRole', userRole)`.
6. Stores `roleWiseId` in `localStorage`.
7. Calls `fetchUserProfile()` → `GET /user-profile/getProfile?type=basicInfo` to populate the profile in context.
8. Redirects to `window.location.href = '/'`.

---

## Database Tables Written

### `users` (schema.md line 1011)

| Column | Value |
|---|---|
| `user_email` | Verified Google email (lowercased) |
| `user_role` | `'freelancer'` or `'creator'` |
| `user_password` | `NULL` — Google accounts have no local password |
| `user_name` | Chosen username |
| `auth_provider` | `'google'` |
| `created_at` | Current timestamp |

> `auth_provider` is referenced in code but is a post-schema-export migration column.  
> The `socialLogin` controller checks `user.auth_provider !== 'google'` to block local accounts from using the Google login endpoint.

### `freelancer` (schema.md line 374)

Key columns set at registration:

| Column | Value |
|---|---|
| `user_id` | FK → `users.id` |
| `freelancer_full_name` | Full name from Google |
| `freelancer_email` | Verified email |
| `first_name` / `last_name` | Split from name |
| `phone_number` | From form |
| `niche` | Array |
| `user_name` | Chosen username |
| `pan_card_number` | Validated PAN string |
| `pan_card_image_url` | MinIO path: `meet-rub-assets/kyc/pan/<id>_<ts>.<ext>` |
| `street_address`, `city`, `state`, `postal_code` | Address fields |
| `verification_status` | `'PENDING'` — admin must verify before freelancer can transact |

### `creators` (schema.md line 130)

Key columns set at registration:

| Column | Value |
|---|---|
| `user_id` | FK → `users.id` |
| `full_name` | From Google |
| `first_name` / `last_name` | Split from name |
| `email` | Verified email |
| `phone_number` | From form |
| `niche` | Array |
| `social_links` | JSONB `{ instagram?, youtube? }` |
| `user_name` | Chosen username |

---

## Error Scenarios

| Scenario | Where caught | Response |
|---|---|---|
| Popup blocked by browser | Frontend (`getGoogleTokenViaPopup`) | `toast.error` — popup blocked message |
| User closes popup without completing OAuth | Frontend poll (`setInterval`) | Promise rejects after 1-second grace → `toast.error` |
| Google returns `access_denied` (user declined consent) | Next.js callback route | Redirects popup to `/google-popup-callback?error=google_cancelled` |
| Code exchange with Google fails | Next.js callback route | Redirects popup with error detail |
| Google token invalid / expired | Backend `verifyGoogleToken` | `401 Invalid or expired Google access token` |
| Token audience mismatch (`aud` ≠ `GOOGLE_CLIENT_ID`) | Backend `verifyGoogleToken` | `401 Google token audience mismatch` |
| Email mismatch between token and body | Backend `verifyGoogleToken` | `401 Google token email mismatch` |
| Email already registered | Backend duplicate check | `409 An account with this email already exists` |
| Username already taken | Backend username check | `400 Username already taken` |
| Invalid PAN format (server-side) | Backend validation | `400` with specific message |
| DB / MinIO error | Backend transaction catch | ROLLBACK + MinIO cleanup + `500` |
| Account suspended (on login, not registration) | `socialLogin` controller | `403 Your account has been suspended` |

---

## Security Design

| Mechanism | Purpose |
|---|---|
| Server-side token verification via `tokeninfo` endpoint | Prevents forged registration requests where an attacker sends a fake `accessToken` + arbitrary `email` |
| `aud` claim validation against `GOOGLE_CLIENT_ID` | Prevents a token issued for another Google app being used here |
| Email cross-check (token vs. body) | Prevents an attacker using a valid token for `attacker@gmail.com` to register as `victim@gmail.com` |
| `httpOnly` cookies for JWT | Access and refresh tokens are not accessible via `document.cookie` in JavaScript |
| DB transaction + rollback | Ensures no half-written records if any step fails |
| MinIO cleanup on rollback | Prevents orphaned PAN card files if the DB insert fails after the upload |
| Redis username deduplication + DB double-check | Prevents race conditions in username reservation |
| PAN 4th-character rule enforced on both client and server | Ensures valid individual PAN (4th char `'P'` = Person) |
| `user_password = NULL` for Google accounts | Prevents password login for Google-registered accounts; `login.js` explicitly detects `allGoogleAccounts` and returns `401` with a redirect message |
