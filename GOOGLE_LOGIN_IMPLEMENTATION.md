# Google Login Implementation Plan

## Overview

This document describes every issue found and every change made to implement Google OAuth login and registration for the MeetRub platform.

---

## Audit Results

### Frontend — `meetrub/` ✅ Already Correct

| Component | File | Status |
|---|---|---|
| OAuth redirect initiator (login) | `src/app/(public)/login/page.js` | ✅ Correct |
| OAuth redirect initiator (signup) | `src/app/(public)/signup/page.js` | ✅ Correct |
| Server-side callback handler | `src/app/api/auth/google/callback/route.js` | ✅ Correct |
| `socialLogin()` in AuthContext | `src/context/AuthContext.js` | ✅ Correct |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` env var | `.env.local` | ✅ Present |
| `GOOGLE_CLIENT_SECRET` env var | `.env.local` | ✅ Present |
| `NEXT_PUBLIC_APP_URL` env var | `.env.local` | ❌ Missing — defaults to `localhost:3000` but app runs on port `3008` |

### Backend — `Meet-Rub/backend/` ❌ All Missing

| Item | Status | Detail |
|---|---|---|
| `POST /auth/social-login` route | ❌ Missing | Route not registered in `authRoutes.js` |
| `socialLogin.js` controller | ❌ Missing | Does not exist |
| `GOOGLE_CLIENT_ID` in `.env` | ❌ Missing | `process.env.GOOGLE_CLIENT_ID` is undefined at runtime |
| `auth_provider` column on `users` table | ❌ Missing | No way to distinguish Google vs local accounts |
| `user_password` nullable in `users` table | ❌ Missing | `NOT NULL` constraint prevents Google users (no password) |

### Existing `googleLogin.js` — Wrong Flow, Dead Code

`backend/src/controller/auth/login/googleLogin.js` exists but:
- Expects `{ credential }` (Google **ID token**) — the frontend sends `{ accessToken }` (OAuth **access token**) — incompatible flows
- Targets the `user_data` table — a completely different/legacy table, not the `users` table used everywhere else
- Is **not registered on any route** — it's dead code
- `google-auth-library` is **not in `package.json`** — would crash at runtime if called

**Decision:** Leave `googleLogin.js` untouched. Build the correct endpoint from scratch.

---

## Architecture

```
[Browser]
   |
   | 1. Click "Sign in with Google"
   ↓
[Google Accounts]  →  OAuth consent screen
   |
   | 2. Redirects back with ?code=...
   ↓
[Next.js /api/auth/google/callback]  (server-side route — SECRET safe here)
   |
   | 3. Exchange code → access_token  (Google API)
   | 4. Fetch user profile            (Google API)
   |
   | 5. POST /auth/social-login       (Our backend)
   |    Body: { provider, providerId, name, email, picture, accessToken }
   ↓
[Express Backend]
   |
   | 6. Verify access_token via Google tokeninfo API
   | 7. Lookup or create user in `users` table
   | 8. Create `freelancer` record for new users
   | 9. Generate JWT tokens
   | 10. Set HttpOnly cookies
   |
   | 11. Return { userInfo: { user_id, role, ... } }
   ↓
[Next.js callback]
   |
   | 12. Redirect → /login?social_login=success&role=...&userId=...
   ↓
[Login Page useEffect]
   |
   | 13. socialLogin() → sets localStorage, fetches profile
   | 14. Router.push → dashboard
```

---

## Database Migrations Required

Run these SQL statements against the PostgreSQL database **before** deploying:

```sql
-- 1. Make user_password nullable (Google users have no password)
ALTER TABLE public.users
  ALTER COLUMN user_password DROP NOT NULL;

-- 2. Add auth_provider column to distinguish Google vs local accounts
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT NULL;

-- 3. (Optional) Mark all existing accounts as 'local'
-- Run this ONLY if you want explicit labelling on existing rows:
UPDATE public.users
  SET auth_provider = 'local'
  WHERE auth_provider IS NULL AND user_password IS NOT NULL AND user_password != '';
```

> **Safety:** These are all backward-compatible. Existing login flow is unaffected — `loginUser` controller does not read `auth_provider`.

---

## Files Changed

### 1. `backend/src/controller/auth/login/socialLogin.js` — CREATED

New controller that:
- Validates required fields
- Verifies the Google `access_token` via `https://www.googleapis.com/oauth2/v3/tokeninfo` (security: prevents forged tokens)
- Confirms token `aud` matches `GOOGLE_CLIENT_ID` (prevents token theft attacks)
- Confirms token email matches the claimed email
- Looks up user by email in the `users` table
- **If user exists with `auth_provider != 'google'`**: returns 409 — "use email/password login"
- **If user is new**: creates `users` row + `freelancer` row (Google users default to `freelancer` role)
- Fetches `roleWiseId` from `freelancer`/`creators` table
- Sets `res.locals.accessToken`, `res.locals.refreshToken`, `res.locals.user`
- Calls `next()` → passes to `setTokenCookies` middleware

### 2. `backend/src/routes/authRoutes.js` — MODIFIED

Added:
```js
router.post('/social-login', socialLoginUser, setTokenCookies, (req, res) => {
  res.status(200).json({ message: 'Login successful', userInfo: res.locals.user });
});
```

### 3. `backend/src/controller/index.js` — MODIFIED

Added export of `socialLoginUser`.

### 4. `backend/.env` — MODIFIED

Added `GOOGLE_CLIENT_ID=588557065443-8ip0m0ggv37ggmk3ashh8a9j4dus0n33.apps.googleusercontent.com`

### 5. `meetrub/.env.local` — MODIFIED

Added `NEXT_PUBLIC_APP_URL=http://localhost:3008` to fix post-OAuth redirect going to wrong port.

---

## Security Measures

| Threat | Mitigation |
|---|---|
| Forged social login (attacker invents a token) | Google access token verified server-side via `tokeninfo` API |
| Token theft / audience substitution | `tokenInfo.aud` validated against `GOOGLE_CLIENT_ID` |
| Email spoofing | Token email validated against the `email` field in the request body |
| Account takeover via Google (user has password account) | 409 returned if `auth_provider != 'google'` — cannot hijack existing local accounts |
| Client secret exposure | `GOOGLE_CLIENT_SECRET` is server-side only (not prefixed with `NEXT_PUBLIC_`) |
| CSRF on OAuth redirect | Google's `state` parameter can be added as a future enhancement |

---

## New User Registration Flow (Google)

When a user registers via Google for the first time:

1. A new row is inserted into `users` with:
   - `user_role = 'freelancer'` (default for social registrations)
   - `user_password = NULL`
   - `auth_provider = 'google'`
   - `user_name` generated from Google display name (sanitized, unique)

2. A new row is inserted into `freelancer` with:
   - `user_id` = new user's id
   - `freelancer_email` = Google email

3. JWT tokens are generated and set as HttpOnly cookies

4. Response: `{ userInfo: { user_id, email, name, role: 'freelancer', roleWiseId } }`

---

## Testing Checklist

- [ ] Run SQL migrations on the DB
- [ ] Restart backend with new `GOOGLE_CLIENT_ID` in `.env`
- [ ] POST `http://localhost:7000/api/v1/auth/social-login` with a valid Google access token → 200 + cookies set
- [ ] Click Google button on login page → full OAuth flow → redirected to freelancer dashboard
- [ ] Click Google button again with same email → no duplicate user, login succeeds
- [ ] Existing email/password login still works (regression)
- [ ] Try Google login with an email that exists as a local account → 409 error shown

---

## Environment Variables Reference

### `meetrub/.env.local`

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=588557065443-...   # Public — used in browser redirect
GOOGLE_CLIENT_SECRET=GOCSPX-...                 # Private — used server-side in callback
NEXT_PUBLIC_APP_URL=http://localhost:3008        # Where to redirect after OAuth
BACKEND_API_URL=https://staging.meetrub.com/api/v1  # Backend the callback calls
```

> **Local dev note:** For local backend testing, change `BACKEND_API_URL` to `http://localhost:7000/api/v1`

### `Meet-Rub/backend/.env`

```
GOOGLE_CLIENT_ID=588557065443-...   # Used to verify token audience
```
