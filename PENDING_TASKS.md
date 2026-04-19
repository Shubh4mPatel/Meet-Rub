# Pending Tasks

## Database

### 1. Fix disputes CHECK constraint
The existing `disputes` table has rows with old/free-text `reason_of_dispute` values that violate the new CHECK constraint.

**Steps:**
1. Audit existing values:
   ```sql
   SELECT DISTINCT reason_of_dispute FROM disputes;
   ```
2. Migrate old values to match allowed list or set them to `'Other'`:
   ```sql
   UPDATE disputes
   SET reason_of_dispute = 'Other'
   WHERE reason_of_dispute NOT IN (
     'Partial Work Done',
     'Report Abuse',
     'Work Not Submitted On Time',
     'Asking For Extra Charges',
     'The project was delivered, but more work is being requested',
     'The creator is requesting work outside my service scope',
     'Demanding Extra Revisions',
     'Other'
   );
   ```
3. Then apply the constraint:
   ```sql
   ALTER TABLE public.disputes
       ADD CONSTRAINT disputes_reason_check CHECK (reason_of_dispute = ANY (ARRAY[
           'Partial Work Done',
           'Report Abuse',
           'Work Not Submitted On Time',
           'Asking For Extra Charges',
           'The project was delivered, but more work is being requested',
           'The creator is requesting work outside my service scope',
           'Demanding Extra Revisions',
           'Other'
       ]));
   ```

---

### 2. Project deadline cron job + trigger
Projects in `IN_PROGRESS` with `end_date` passed have no automatic handler — they just sit forever.

**Two things needed:**

#### A. pg_cron job — auto-flag overdue projects
```sql
SELECT cron.schedule(
  'flag-overdue-projects',
  '0 * * * *',  -- every hour
  $$
    UPDATE projects
    SET status = 'OVERDUE', updated_at = NOW()
    WHERE status = 'IN_PROGRESS'
      AND end_date IS NOT NULL
      AND end_date < NOW();
  $$
);
```
> Note: `OVERDUE` status needs to be added to the projects CHECK constraint first:
> ```sql
> ALTER TABLE public.projects DROP CONSTRAINT projects_status_check;
> ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
>     CHECK (status = ANY (ARRAY[
>         'CREATED', 'IN_PROGRESS', 'SUBMITTED',
>         'COMPLETED', 'CANCELLED', 'DISPUTE', 'OVERDUE'
>     ]));
> ```

#### B. Decide business logic for OVERDUE projects
- Does the creator get auto-refunded?
- Does it go to DISPUTE automatically?
- Does the freelancer get a grace period?
- Who gets notified?

---

### 3. Fix dispute refund logic ordering
**File:** `disputeController.js` — `resolveDispute` refund action

Currently the Razorpay refund is called **inside** the DB transaction, which means:
- If Razorpay succeeds but DB commit fails → creator gets money back but transaction still shows `HELD`
- If Razorpay fails → whole DB transaction rolls back correctly

**Fix needed:** Restructure to:
1. Commit DB updates first (`REFUNDED` + `CANCELLED`)
2. Then call `razorpay.payments.refund()` outside the transaction
3. If Razorpay call fails after commit — need a retry mechanism or alert

---

### ~~4. Rename available_blance → available_balance~~ ✅ DONE

### ~~5. Fix stale transaction data~~ ✅ DONE
