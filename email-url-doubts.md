Ready for review
Select text to add comments on the plan
Plan: Creator "Request Changes" / Revision flow
Context
Today, when a freelancer uploads a deliverable the project goes to SUBMITTED and the creator has exactly two options:

Approve → approveProject sets COMPLETED (funds stay escrowed until admin release).
Reject → rejectProject sets DISPUTE and opens an admin dispute.
There is no lightweight "please fix this" path. This change adds a third option, Request Changes, that moves the project to a new IN_REVISION state, notifies the freelancer with a required message, lets the freelancer re-upload, and returns the project to SUBMITTED so the review cycle repeats — unlimited rounds.

Scope: backend only (API + DB). Frontend creator UI handled separately.

Target state machine
CREATED → IN_PROGRESS → SUBMITTED ─approve→ COMPLETED
                            │
                            ├─reject→ DISPUTE
                            │
                            └─request-changes→ IN_REVISION ─(re)upload-deliverable→ SUBMITTED → …(repeat)
Side-effect analysis (what IN_REVISION touches)
All project-status branches were audited in backend/src/controller/razor-pay-controllers/projectController.js and related files. The new status affects these — each is addressed in the plan:

Location	Current behavior	Impact / required change
uploadDeliverable [L822]	requires status === 'IN_PROGRESS'	Blocks resubmit. Must also allow IN_REVISION. (critical)
deadlineExtensionController.js [L47]	requires IN_PROGRESS	Freelancer reworking during revision can't request extension. Allow IN_REVISION.
getProject [L114]	viewOnlyForCreator = SUBMITTED only	Creator sees no preview during revision. Include IN_REVISION.
getMyProjects counts [L287]	total_active = ('CREATED','IN_PROGRESS','SUBMITTED')	Add IN_REVISION so it counts as active. (tab='current' already covers it via NOT IN (COMPLETED,CANCELLED))
getAllProjects counts [L286-288] + label CASE [L601-612] + admin filter map [L518-522,L535]	no IN_REVISION	Add to active count, add 'in_revision' label, add revision→IN_REVISION filter option.
updateProjectStatus validStatuses [L403]	('CREATED','IN_PROGRESS','COMPLETED')	Leave unchanged — revision is driven by the new endpoint, not this manual setter.
Verified NOT affected
approveProject / rejectProject — both require SUBMITTED; resubmit returns project to SUBMITTED, so they keep working with no change.
Escrow/transactions — request-changes never touches transactions; funds stay HELD; uploadDeliverable still enforces the HELD check.
Invoices — generated only on approve (COMPLETED); untouched.
deliverables table — each resubmit INSERTs a new row and getProject returns all rows → natural revision history, no schema change needed.
notifications — web_notifications.event_type is inserted as a free-form string (notificationServicer.js), so a new revision_requested event needs no enum change.
DB changes (no migration framework in repo — apply directly to the DB)
Add enum value to the project-status enum:

ALTER TYPE <project_status_enum> ADD VALUE IF NOT EXISTS 'IN_REVISION';
(Confirm the actual enum type name from the live DB; ADD VALUE runs outside a txn block.)

New table for revision history + required message (mirrors how rejectProject stores its reason in disputes):

CREATE TABLE project_revisions (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id),
  creator_id   INTEGER NOT NULL,
  freelancer_id INTEGER NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
Backend changes
1. New endpoint
backend/src/routes/projectRoutes.js — add next to approve/reject, and add requestChanges to the controller import:

router.post('/:id/request-changes', requireRole(['creator']), requestChanges);
2. New controller requestChanges
backend/src/controller/razor-pay-controllers/projectController.js — model on rejectProject ([L1516]):

Read req.user.roleWiseId (creator), req.params.id, and message from body; message required → 400 if missing.
BEGIN; SELECT … FOR UPDATE OF p joining freelancer/creators/services (needed for the email), WHERE p.id=$1 AND p.creator_id=$2 → 404 if none.
Require status === 'SUBMITTED' → else 400.
Mirror approveProject's active-dispute guard ([L1357-1366]) → 400 if an unresolved dispute exists.
UPDATE projects SET status='IN_REVISION', updated_at=NOW().
INSERT INTO project_revisions (project_id, creator_id, freelancer_id, message).
COMMIT.
Notify freelancer via sendNotification with eventType: 'revision_requested' (reuse notificationServicer); optional creator confirmation notification.
Email freelancer via new sendRevisionRequestedEmail (below), best-effort with Promise.allSettled like the other handlers.
Return 200 with { project_id, status: 'IN_REVISION' }.
Export requestChanges in module.exports ([L1651]).
3. Fix the audited side effects
uploadDeliverable [L822-823]: change guard to allow ['IN_PROGRESS','IN_REVISION'].includes(project.status); keep HELD check; success still sets SUBMITTED.
deadlineExtensionController.js [L47-48]: allow ['IN_PROGRESS','IN_REVISION'].
getProject [L114]: viewOnlyForCreator = isCreator && ['SUBMITTED','IN_REVISION'].includes(project.status).
getMyProjects [L287] and getAllProjects [L287-equivalent]: add 'IN_REVISION' to the total_active FILTER.
getAllProjects label CASE [L601-612]: add WHEN p.status='IN_REVISION' THEN 'in_revision'.
getAllProjects admin filter map [L518-522]: add revision: { db: 'IN_REVISION', table: 'project' } and update the allowed-values message [L535].
4. New email helper + template
backend/utils/deliveryEmails.js: add sendRevisionRequestedEmail({ freelancerEmail, freelancerName, creatorName, projectId, serviceTitle, message }) mirroring sendDeliverySubmittedEmail ([L32-50]); export it ([L365]).
New template Email-Templates/freelancer/revisionRequested.html (copy structure of freelancer/deliverySubmitted.html); placeholders: freelancer_username, creator_username, order_id, service_title, revision_message, order_url, asset_base, help_url, privacy_url.
Add the helper to the existing deliveryEmails require in projectController.js ([L6]).
Verification
Load check: node -e "require('./src/routes/projectRoutes'); require('./utils/deliveryEmails')" from backend/.
DB: confirm enum value present (SELECT enum_range(NULL::<enum>)) and project_revisions table created.
Happy path (end-to-end): create → pay (IN_PROGRESS) → upload (SUBMITTED) → POST /:id/request-changes with message (IN_REVISION, freelancer gets in-app + email, row in project_revisions) → re-upload (SUBMITTED) → approve (COMPLETED). Repeat request-changes once to confirm unlimited rounds.
Negative cases: request-changes on non-SUBMITTED → 400; missing message → 400; non-owner creator → 404; with active dispute → 400.
Listings: getMyProjects shows the project under "current" with total_active incremented; admin getAllProjects shows it counted active and labeled in_revision, and the revision filter returns it.
Deadline extension: confirm a freelancer can request an extension while IN_REVISION.