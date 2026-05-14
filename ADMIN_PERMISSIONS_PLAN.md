# Admin Permission-Based Access Control

## Overview

Admins have granular module-level permissions stored as a JSONB object in the `admin` table.
Permissions are embedded in the JWT at login so no extra DB hit is needed on every request.
A "full-access" admin is simply an admin with all modules and all actions assigned.

---

## Master Permission Schema

```json
{
  "user_management": ["view", "update", "approve"],
  "payments":        ["view", "update", "approve"],
  "disputes":        ["view", "update"],
  "projects":        ["view", "create", "update"],
  "chat":            ["view", "create"],
  "admin_management":["create"]
}
```

### Action Semantics

| Action | Meaning |
|--------|---------|
| `view` | Read-only access — list, detail, stats |
| `create` | Create new records or initiate new actions |
| `update` | Modify state — suspend, edit, link accounts, set commission |
| `approve` | Approve or reject decisions — KYC, payouts, escrow releases |

---

## Route → Permission Mapping

### User Management

| Route | Method | Module | Action |
|-------|--------|--------|--------|
| /get-all-freelancers | GET | user_management | view |
| /get-freelancerby-id/:id | GET | user_management | view |
| /get-freelancers-for-suggestion | GET | user_management | view |
| /get-all-creators | GET | user_management | view |
| /get-creatorby-id/:id | GET | user_management | view |
| /freelancers-for-KYC-approval | GET | user_management | view |
| /suspend-freelancer | POST | user_management | update |
| /revoke-freelancer-suspension | POST | user_management | update |
| /suspend-creator | POST | user_management | update |
| /revoke-creator-suspension | POST | user_management | update |
| /featured-freelancers | POST | user_management | update |
| /featured-freelancers | DELETE | user_management | update |
| /approve-kyc/:freelancer_id | POST | user_management | approve |
| /reject-kyc | POST | user_management | approve |

### Payments

| Route | Method | Module | Action |
|-------|--------|--------|--------|
| /payouts | GET | payments | view |
| /payouts/:id | GET | payments | view |
| /transactions/escrow | GET | payments | view |
| /stats | GET | payments | view |
| /freelancer/:id/linked-account-status | GET | payments | view |
| /commission | PUT | payments | update |
| /freelancer/:id/create-linked-account | POST | payments | update |
| /freelancer/:id/reset-linked-account | DELETE | payments | update |
| /payouts/:id/approve | POST | payments | approve |
| /payouts/:id/reject | POST | payments | approve |
| /transactions/:id/release | POST | payments | approve |

### Disputes

| Route | Method | Module | Action |
|-------|--------|--------|--------|
| /disputes | GET | disputes | view |
| /disputes/:id | GET | disputes | view |
| /disputes/resolve/:id | PATCH | disputes | update |

### Projects

| Route | Method | Module | Action |
|-------|--------|--------|--------|
| /niches | GET | projects | view |
| /services-list | GET | projects | view |
| /add-niches | POST | projects | create |
| /assignfreelancer-to-request | POST | projects | create |
| /services/:id | PATCH | projects | update |
| /services/:id | DELETE | projects | update |

### Chat (Socket.IO)

| Event | Module | Action |
|-------|--------|--------|
| admin-join-support-chat | chat | view |
| admin-initiate-chat | chat | create |

### Admin Management

| Route | Method | Module | Action |
|-------|--------|--------|--------|
| /create-admin | POST | admin_management | create |

---

## Files Changed

| File | What Changed |
|------|-------------|
| `backend/config/permissions.js` | **NEW** — master permission schema + FULL_PERMISSIONS export |
| `backend/utils/helper.js` | `generateTokens()` now accepts `permissions` as 3rd param, adds it to JWT payload |
| `backend/src/controller/auth/login/login.js` | Admin login queries `SELECT id, permissions FROM admin`; passes permissions to `generateTokens()` |
| `backend/src/middleware/authMiddleware.js` | `refreshAccessToken` selects `a.permissions` and includes it in refreshed token; new `requirePermission(module, action)` middleware exported |
| `backend/src/routes/adminRoutes.js` | All routes now have `requirePermission(module, action)` alongside `requireRole(['admin'])` |
| `backend/src/controller/admin/adminContoller.js` | `createAdmin` validates incoming `permissions` object against master schema from `permissions.js` |
| `chat-server/controller/chat.js` | `admin-initiate-chat` checks `chat.create`; `admin-join-support-chat` checks `chat.view` |

---

## How `requirePermission` Works

```js
// Usage on a route:
router.post('/payouts/:id/approve', requireRole(['admin']), requirePermission('payments', 'approve'), approvePayout);

// Middleware logic:
const requirePermission = (module, action) => (req, res, next) => {
  const permissions = req.user?.permissions;
  if (!permissions || !permissions[module] || !permissions[module].includes(action)) {
    return res.status(403).json({
      status: 'failed',
      message: `Access denied: requires '${action}' permission on '${module}'`,
    });
  }
  next();
};
```

---

## Create Admin Request Body

```json
POST /api/admin/create-admin

{
  "full_name": "Jane Doe",
  "email": "jane@platform.com",
  "password": "SecurePass@123",
  "permissions": {
    "user_management": ["view", "update", "approve"],
    "payments": ["view", "update", "approve"],
    "disputes": ["view", "update"],
    "projects": ["view", "create", "update"],
    "chat": ["view", "create"],
    "admin_management": ["create"]
  }
}
```

A restricted admin (e.g. disputes only):
```json
{
  "full_name": "John Smith",
  "email": "john@platform.com",
  "password": "SecurePass@123",
  "permissions": {
    "disputes": ["view", "update"]
  }
}
```

---

## DB Column

```sql
-- Already applied on admin table:
ALTER TABLE public.admin
  ALTER COLUMN permissions TYPE JSONB USING to_jsonb(permissions);
ALTER TABLE public.admin
  ALTER COLUMN permissions SET DEFAULT '[]';
```
