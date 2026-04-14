-- Migration: Fix payouts table to support pooled earnings model
-- Date: 2026-04-15
-- Description: Make transaction_id and freelancer_account_id nullable, add requested_at/approved_at columns, update status constraint

-- Step 1: Add earnings_balance to freelancer table if missing
ALTER TABLE IF EXISTS freelancer ADD COLUMN IF NOT EXISTS earnings_balance numeric(15,2) DEFAULT 0.00;

-- Step 2: Make transaction_id nullable (allow payouts from pooled earnings)
ALTER TABLE IF EXISTS payouts ALTER COLUMN transaction_id DROP NOT NULL;

-- Step 3: Make freelancer_account_id nullable (set during admin approval)
ALTER TABLE IF EXISTS payouts ALTER COLUMN freelancer_account_id DROP NOT NULL;

-- Step 4: Add requested_at column if it doesn't exist (ignore error if exists)
ALTER TABLE IF EXISTS payouts ADD COLUMN IF NOT EXISTS requested_at timestamp with time zone;

-- Step 5: Add approved_at column if it doesn't exist (ignore error if exists)
ALTER TABLE IF EXISTS payouts ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Step 6: Add approved_by column if it doesn't exist (ignore error if exists) 
ALTER TABLE IF EXISTS payouts ADD COLUMN IF NOT EXISTS approved_by integer;

-- Step 7: Drop old status constraint
ALTER TABLE IF EXISTS payouts DROP CONSTRAINT IF EXISTS payouts_status_check;

-- Step 8: Add updated status constraint with REQUESTED
ALTER TABLE IF EXISTS payouts ADD CONSTRAINT payouts_status_check CHECK (status::text = ANY (ARRAY['REQUESTED'::character varying, 'QUEUED'::character varying, 'PENDING'::character varying, 'PROCESSING'::character varying, 'PROCESSED'::character varying, 'REVERSED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying]::text[]));
