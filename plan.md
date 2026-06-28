# Plan: Project Revision API

## Context
Creator needs to request revisions from freelancers after a deliverable has been submitted. The API must: reset project to IN_PROGRESS, extend the deadline, store the revision reason (supports multiple revisions), auto-send a chat message, and notify both parties via in-app notification and email. The freelancer re-submits via the existing `uploadDeliverable` API, which must replace (not append) the old deliverable.

---

## Blockers Found in DB Schema

1. **No `project_revisions` table** — revision messages have nowhere to live. Must create.
2. **`messages.message_type` CHECK constraint** — currently only allows: `text, image, file, video, audio, package, deadline_extension`. Must ALTER to add `revision`.

---

## DB Migration (`migrations/add_project_revisions.sql`)

```sql
-- 1. New table to store revision history
CREATE TABLE IF NOT EXISTS public.project_revisions (
    id SERIAL PRIMARY KEY,
    project_id  integer NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    creator_id  integer NOT NULL REFERENCES public.creators(creator_id),
    freelancer_id integer NOT NULL REFERENCES public.freelancer(freelancer_id),
    chat_room_id varchar(255) REFERENCES public.chat_rooms(room_id),
    revision_message text NOT NULL,
    days  integer NOT NULL DEFAULT 0,
    hours integer NOT NULL DEFAULT 0,
    new_end_date timestamp with time zone NOT NULL,
    requested_at timestamp with time zone DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_revisions_project_id ON public.project_revisions(project_id);

-- 2. Add 'revision' to messages type constraint
ALTER TABLE public.messages DROP CONSTRAINT messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type::text = ANY (ARRAY[
    'text','image','file','video','audio','package','deadline_extension','revision'
  ]::text[]));
```

---

## Files to Modify

### 1. `backend/src/controller/razor-pay-controllers/projectController.js`

**A) Implement `reviseProject` (currently a stub at line ~1651)**

Full logic:
1. Auth: creator must own the project (`creator_id = req.user.roleWiseId`)
2. Project must be in `SUBMITTED` status
3. DB transaction:
   - Calculate `new_end_date = GREATEST(end_date, NOW()) + days interval + hours interval`
   - Get/create chat room (`${smallerId}-${largerId}` from user_ids of creator + freelancer)
   - `INSERT INTO project_revisions` with all fields
   - `UPDATE projects SET status='IN_PROGRESS', end_date=new_end_date, updated_at=NOW()`
   - `INSERT INTO messages` with `message_type='revision'`, `message=revision_message`, sender=creator_user_id, recipient=freelancer_user_id
4. `Promise.allSettled` for side effects:
   - `sendNotification` → freelancer: `revision_requested`, redirects to project chat
   - `sendNotification` → creator: `revision_acknowledged`, redirects to project chat
   - `sendRevisionRequestedEmail` → freelancer
   - `sendRevisionAcknowledgedEmail` → creator
5. Return `{ revision_id, project_id, new_end_date, revision_message }`

Query for project data (join freelancer for user_id + email, join creators for creator email, join services for service_name):
```sql
SELECT p.id, p.status, p.end_date, p.freelancer_id, p.service_id,
       f.user_id AS freelancer_user_id, f.freelancer_email, f.freelancer_full_name,
       s.service_name,
       u_c.user_email AS creator_email, u_c.user_name AS creator_name
FROM projects p
JOIN freelancer f ON p.freelancer_id = f.freelancer_id
LEFT JOIN services s ON p.service_id = s.id
JOIN creators c ON p.creator_id = c.creator_id
JOIN users u_c ON c.user_id = u_c.id
WHERE p.id = $1 AND p.creator_id = $2
```

**B) Modify `uploadDeliverable` — handle re-submission after revision**

Inside the transaction, before the `INSERT INTO deliverables`, add:
```javascript
// Remove prior submission if this is a re-upload (revision flow)
await client.query(`DELETE FROM deliverables WHERE project_id = $1`, [project_id]);
```
No other logic changes needed — project is `IN_PROGRESS` again after revision, so the existing status check passes.

---

### 2. `backend/utils/deliveryEmails.js`

Add two new functions (following same pattern as `sendDeliverySubmittedEmail`):

```javascript
async function sendRevisionRequestedEmail({ freelancerEmail, freelancerName, creatorName, projectId, serviceTitle, revisionMessage, newEndDate })
// Template: Email-Templates/freelancer/revisionRequest.html
// Variables: freelancer_username, creator_name, order_id, service_title, revision_message, new_deadline

async function sendRevisionAcknowledgedEmail({ creatorEmail, creatorName, freelancerName, projectId, serviceTitle, revisionMessage, newEndDate })
// Template: Email-Templates/creator/revisionRequested.html
// Variables: creator_username, freelancer_name, order_id, service_title, revision_message, new_deadline
```

Export both from the module.

---

### 3. `Email-Templates/freelancer/revisionRequest.html`

New template. Inform the freelancer that a revision was requested:
- Who requested it (creator name)
- Order ID
- Reason for revision (`revision_message`)
- New deadline
- CTA button → open chat with creator

---

### 4. `Email-Templates/creator/revisionRequested.html`

New template. Confirm to the creator that the revision request was sent:
- Freelancer name
- Order ID
- Their revision reason
- New deadline
- CTA button → open chat with freelancer

---

### 5. `schema.md`

- Add `project_revisions` table definition (after `deadline_extension_requested`)
- Update `messages_message_type_check` constraint line to include `revision`

---

## Data Flow Summary

```
Creator → POST /:id/revision { revision_message, days, hours }
  ↓
project_revisions INSERT (stores reason + time + new_end_date)
projects UPDATE  (status: SUBMITTED → IN_PROGRESS, end_date extended)
messages INSERT  (type: 'revision', auto-generated in chat)
  ↓
Notifications (Promise.allSettled):
  freelancer ← revision_requested (link → project/chat)
  creator    ← revision_acknowledged (link → project/chat)
  freelancer ← revisionRequest email
  creator    ← revisionRequested email

Freelancer → POST /upload-deliverable { project_id, deliverable_url }
  ↓
DELETE FROM deliverables WHERE project_id = $1   ← NEW
INSERT INTO deliverables (new files)
projects UPDATE (status: IN_PROGRESS → SUBMITTED)
  ↓
[existing notifications/emails to both parties as before]
```

---

## Verification

1. Run migration SQL on the DB
2. `POST /:id/revision` with a `SUBMITTED` project → expect 200, project goes `IN_PROGRESS`, `end_date` extended, `project_revisions` row inserted, chat message of type `revision` created
3. Try `POST /:id/revision` on a non-`SUBMITTED` project → expect 400
4. Freelancer calls `uploadDeliverable` → old deliverable row deleted, new one inserted, project goes `SUBMITTED`
5. Check both parties received in-app notification and email
6. Check chat room has the auto-generated revision message visible
