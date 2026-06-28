-- Adds a column to store the Aadhar (govt ID) BACK image path.
-- The front image continues to use freelancer.gov_id_url.
-- Run once against the database.

ALTER TABLE public.freelancer
  ADD COLUMN IF NOT EXISTS gov_id_back_url text;
