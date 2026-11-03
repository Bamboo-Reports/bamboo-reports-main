-- Account List Matches Migration
-- Keeps every uploaded name next to the account it was matched to, and how,
-- so the Account lists window can show "uploaded name -> matched account".
--
-- Each entry: { "input": text, "account": text | null, "via": text }
-- via is one of: exact, suffix, alias, close, manual, none.
--
-- Optional: the app reads and writes this column only when it exists, so it is
-- safe to deploy the code first. Lists saved before this column existed keep
-- an empty array and show their accounts only.

ALTER TABLE public.account_lists
  ADD COLUMN IF NOT EXISTS matches JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.account_lists
  DROP CONSTRAINT IF EXISTS account_lists_matches_is_array;

ALTER TABLE public.account_lists
  ADD CONSTRAINT account_lists_matches_is_array CHECK (jsonb_typeof(matches) = 'array');
