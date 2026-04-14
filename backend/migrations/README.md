# Database Migration: Fix Payouts for Pooled Earnings Model

## What This Migration Does

This migration updates the `payouts` and `freelancer` tables to properly support the **pooled earnings model** where:
1. Freelancers accumulate earnings from multiple approved transactions into `earnings_balance`
2. Freelancers can request partial/full payouts from their balance
3. Payouts are not tied to specific transactions

## Changes Made

### Freelancer Table
- ✅ Add `earnings_balance` column (numeric(15,2), default 0.00)

### Payouts Table
- ✅ Make `transaction_id` NULLABLE (payouts come from pooled balance)
- ✅ Make `freelancer_account_id` NULLABLE (set during admin approval)
- ✅ Add `requested_at` column (timestamp when freelancer requested)
- ✅ Add `approved_at` column (timestamp when admin approved)
- ✅ Add `approved_by` column (admin user ID who approved)
- ✅ Update status constraint to include `'REQUESTED'` state

## How to Run

### Option 1: Using psql command line
```bash
cd /home/shubh4m/projects/Meet-Rub/backend
PGPASSWORD='webzgrowth#admin@123' psql -h 147.93.108.64 -U postgres -d MeetRub-Staging -f migrations/fix_payouts_pooled_earnings.sql
```

### Option 2: Using Node.js script
```bash
cd /home/shubh4m/projects/Meet-Rub/backend
node run-migration.js
```

### Option 3: Using psql interactive
```bash
PGPASSWORD='webzgrowth#admin@123' psql -h 147.93.108.64 -U postgres -d MeetRub-Staging

-- Then paste the contents of migrations/fix_payouts_pooled_earnings.sql
```

## Verify Migration

After running, verify the changes:

```sql
-- Check freelancer table has earnings_balance
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'freelancer' AND column_name = 'earnings_balance';

-- Check payouts table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payouts' 
AND column_name IN ('transaction_id', 'freelancer_account_id', 'requested_at', 'approved_at', 'approved_by')
ORDER BY ordinal_position;

-- Check status constraint includes REQUESTED
SELECT pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname = 'payouts_status_check';
```

## Expected Output

After migration:
- `freelancer.earnings_balance` should exist and be nullable (or default 0.00)
- `payouts.transaction_id` should be nullable (YES)
- `payouts.freelancer_account_id` should be nullable (YES)
- `payouts.requested_at` should exist
- `payouts.approved_at` should exist
- `payouts.approved_by` should exist
- Status constraint should include REQUESTED

## Rollback (if needed)

```sql
-- Make columns NOT NULL again (only if rollback needed)
ALTER TABLE payouts ALTER COLUMN transaction_id SET NOT NULL;
ALTER TABLE payouts ALTER COLUMN freelancer_account_id SET NOT NULL;

-- Remove added columns
ALTER TABLE payouts DROP COLUMN IF EXISTS requested_at;
ALTER TABLE payouts DROP COLUMN IF EXISTS approved_at;
ALTER TABLE payouts DROP COLUMN IF EXISTS approved_by;
ALTER TABLE freelancer DROP COLUMN IF EXISTS earnings_balance;

-- Restore old constraint
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check 
  CHECK (status::text = ANY (ARRAY['QUEUED', 'PENDING', 'PROCESSING', 'PROCESSED', 'REVERSED', 'FAILED', 'CANCELLED']::text[]));
```
