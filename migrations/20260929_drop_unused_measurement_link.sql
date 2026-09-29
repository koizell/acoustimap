-- Apply after 20260928_schema_hygiene.sql.
-- Drop a column left over from the pre-privacy confirmation model.
--
-- 20260923_complete_features.sql added noise_confirmations.measurement_id so a
-- confirmation could point at the measurement it confirmed. The privacy
-- migration replaced that model: confirmations are now identified by a SHA-256
-- hash of browser, cell and hour, and the stable client_id they used to be
-- tied to was removed. Nothing has referenced this column since:
--
--   - js/ never sends measurement_id, in buildConfirmation() or anywhere else
--   - the edge function never reads it
--   - the audit of the live project on 2026-09-29 found 0 rows using it
--
-- It also carried an unindexed foreign key, the only remaining
-- unindexed_foreign_keys finding from the Supabase advisor. Dropping the
-- column removes the relationship entirely, which is consistent with the rest
-- of the schema: no confirmation is linkable to a specific measurement row.

begin;

alter table public.noise_confirmations
  drop column if exists measurement_id;

commit;

-- ============================================================
-- POST-CHECK (run after applying)
-- ============================================================

-- The column and its constraint must be gone. Expect 0 rows.
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='noise_confirmations'
--    and column_name = 'measurement_id';

-- select conname from pg_constraint where conname like '%measurement_id%';

-- Every remaining noise_ constraint must still be validated. Expect 0 rows.
-- select conname, convalidated from pg_constraint
--  where conname like 'noise_%' and not convalidated;

-- Confirmations still accept writes with the client payload from features.js.
-- Expect 1 row.
-- select count(*) from public.noise_confirmations;
