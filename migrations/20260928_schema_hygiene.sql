-- Apply after 20260925_privacy_and_retention.sql.
-- Repairs found by auditing the live project on 2026-09-28. No data rows are
-- deleted or rewritten: this only validates a constraint, drops indexes that
-- can no longer match anything, and removes two functions that are not part of
-- the repository.
--
-- Run the pre-flight queries at the end of this file first. The audit found
-- 0 rows violating noise_confirmations_key_check and no cron job referencing
-- the removed functions, so both are safe as written.

begin;

-- 1. 20260925_privacy_and_retention.sql declared this constraint NOT VALID but
--    its list of validate statements omitted it. A NOT VALID check still
--    enforces new rows, so writes were never at risk; existing rows were simply
--    never verified and convalidated stayed false, which misreports the schema
--    to every later audit.
alter table public.noise_confirmations
  validate constraint noise_confirmations_key_check;

-- 2. Duplicates created by hand outside the repository. Each pair below is
--    byte-identical, so the repository-named index is kept.
--    idx_noise_reports_location is also undocumented and never queried: the
--    reports panel selects by created_at and loads photos by photo_path.
drop index if exists public.idx_noise_confirmations_created_at;
drop index if exists public.idx_noise_reports_created_at;
drop index if exists public.idx_noise_reports_location;

-- 3. Unusable after the privacy migration. noise_*_no_client_check forces
--    client_id to NULL on every row, so these index predicates are always
--    empty and their maintenance cost is pure overhead.
drop index if exists public.idx_measurements_client_time;
drop index if exists public.idx_sessions_client_end;
drop index if exists public.idx_confirmations_client;

-- 4. Pre-privacy deduplication constraint. It led with client_id, which is now
--    always NULL, and NULLs are distinct inside a UNIQUE index, so it could
--    never reject a duplicate. idx_confirmations_key is the real guard and
--    stays. The name is Postgres' own 63-character truncation; quote it.
alter table public.noise_confirmations
  drop constraint if exists noise_confirmations_client_id_latitude_longitude_measuremen_key;

-- 5. Two functions that exist only in the live database. Neither is referenced
--    by cron.job, by the edge function, or by any file in this repository.
--
--    aggregate_old_noise_data was the dangerous one: it grouped measurements
--    older than two hours with round(latitude::numeric, 4) and then deleted
--    them. That rounding does not land on the 70 m privacy grid, so its insert
--    into noise_sessions would violate noise_sessions_grid_check and abort the
--    function before the delete. It was only ever safe because that constraint
--    stopped it. Scheduling it again, or relaxing the grid check, would have
--    destroyed measurement data and contradicted the 90-day retention policy.
drop function if exists public.aggregate_old_noise_data();
drop function if exists public.cleanup_old_noise_measurements();

-- Not touched here on purpose:
--   idx_reports_photo_path      still useful: expired_noise_photo_candidates
--                                joins storage.objects to noise_reports on it.
--   cube / earthdistance / pg_net  extensions in public; reported by the
--                                security advisor, but earthdistance is only
--                                referenced by the function dropped above, so
--                                review their removal separately.

commit;

-- ============================================================
-- PRE-FLIGHT (run before applying; both returned 0 on 2026-09-28)
-- ============================================================

-- 1. Rows that would make step 1 fail. Expect 0.
-- select count(*) from noise_confirmations
--  where confirmation_key is null or confirmation_key !~ '^[a-f0-9]{64}$';

-- 2. Cron jobs calling the functions removed in step 5. Expect 0 rows.
-- select jobname, command from cron.job
--  where command ilike '%aggregate_old_noise_data%'
--     or command ilike '%cleanup_old_noise_measurements%';

-- ============================================================
-- POST-CHECK (run after applying)
-- ============================================================

-- Every noise_ constraint must now report convalidated = true. Expect 0 rows.
-- select conrelid::regclass::text, conname, convalidated from pg_constraint
--  where conname like 'noise_%' and convalidated = false;

-- No duplicate index definitions may remain.
-- select indexdef, count(*) from pg_indexes
--  where schemaname = 'public' group by indexdef having count(*) > 1;

-- The removed functions must be gone. Expect 0 rows.
-- select proname from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('aggregate_old_noise_data','cleanup_old_noise_measurements');

-- 4. Unrelated to this migration, but it failed in production on 2026-09-28 and
--    nothing detected it: the hourly photo cleanup answered 401 on every call
--    because the Vault token and the function secret never matched, while
--    cron.job_run_details kept reporting "succeeded". Expect only 200 here.
-- select status_code, count(*), max(created) from net._http_response
--  group by 1 order by 2 desc;
