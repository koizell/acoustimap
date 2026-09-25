-- Apply after setup.sql and 20260923_complete_features.sql.
-- Historical coordinates are snapped in place; no measurement rows are deleted.
begin;

alter table public.noise_reports alter column client_id drop not null;
alter table public.noise_confirmations alter column client_id drop not null;
comment on column public.noise_measurements.db_level is 'Índice relativo sin calibración acústica; no representa dB SPL.';
comment on column public.noise_sessions.avg_db is 'Promedio del índice relativo sin calibración acústica; no representa dB SPL.';
comment on column public.noise_reports.db_level is 'Índice relativo sin calibración acústica; no representa dB SPL.';

-- The browser snaps latitude first, then computes the longitude cell from that
-- snapped latitude. This check prevents a direct API caller from submitting
-- exact coordinates despite bypassing the browser UI.
create or replace function public.is_noise_grid_cell(p_lat double precision, p_lng double precision)
returns boolean language sql immutable strict set search_path = pg_catalog as $$
  select abs(p_lat - ((floor(p_lat / (70.0 / 111000.0)) + 0.5) * (70.0 / 111000.0))) < 0.0000001
     and abs(p_lng - ((floor(p_lng / (70.0 / (111000.0 * cos(radians(p_lat))))) + 0.5)
        * (70.0 / (111000.0 * cos(radians(p_lat)))))) < 0.0000001;
$$;

-- Shared by the historical repair and insert triggers. RHS expressions in the
-- UPDATE below use the original coordinates.
create or replace function public.snap_noise_grid_lat(p_lat double precision)
returns double precision language sql immutable strict set search_path = pg_catalog as $$
  select (floor(p_lat / (70.0 / 111000.0)) + 0.5) * (70.0 / 111000.0);
$$;
create or replace function public.snap_noise_grid_lng(p_lat double precision, p_lng double precision)
returns double precision language sql immutable strict set search_path = pg_catalog as $$
  select (floor(p_lng / (70.0 / (111000.0 * cos(radians(public.snap_noise_grid_lat(p_lat))))) ) + 0.5)
    * (70.0 / (111000.0 * cos(radians(public.snap_noise_grid_lat(p_lat)))));
$$;
update public.noise_measurements
set latitude = public.snap_noise_grid_lat(latitude),
    longitude = public.snap_noise_grid_lng(latitude, longitude)
where not public.is_noise_grid_cell(latitude, longitude);
update public.noise_sessions
set latitude = public.snap_noise_grid_lat(latitude),
    longitude = public.snap_noise_grid_lng(latitude, longitude)
where not public.is_noise_grid_cell(latitude, longitude);
update public.noise_reports
set latitude = public.snap_noise_grid_lat(latitude),
    longitude = public.snap_noise_grid_lng(latitude, longitude)
where not public.is_noise_grid_cell(latitude, longitude);
update public.noise_confirmations
set latitude = public.snap_noise_grid_lat(latitude),
    longitude = public.snap_noise_grid_lng(latitude, longitude)
where not public.is_noise_grid_cell(latitude, longitude);

-- Stable browser identifiers are no longer needed by the application.
update public.noise_measurements set client_id = null where client_id is not null;
update public.noise_sessions set client_id = null where client_id is not null;
update public.noise_reports set client_id = null where client_id is not null;
update public.noise_confirmations set client_id = null where client_id is not null;
-- Legacy photo folders were named after client_id. Stop exposing those paths;
-- the Storage cleanup below removes the detached files.
update public.noise_reports set photo_path = null
where photo_path is not null and split_part(photo_path, '/', 1) <> id::text;

-- Older policies allowed caller-supplied timestamps. Normalize future rows
-- and let triggers own timestamps for all new rows, so retention cannot be
-- extended by sending a date years ahead.
update public.noise_measurements set created_at = now() where created_at > now();
update public.noise_reports set created_at = now() where created_at > now();
update public.noise_confirmations set created_at = now() where created_at > now();
update public.noise_sessions
set end_time = now(), start_time = least(start_time, now() - interval '1 second')
where end_time > now();

create or replace function public.noise_set_created_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  -- Accept still-open clients from the preceding release without retaining
  -- their stable ID or more precise legacy grid coordinates.
  new.longitude := public.snap_noise_grid_lng(new.latitude, new.longitude);
  new.latitude := public.snap_noise_grid_lat(new.latitude);
  new.client_id := null;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists noise_measurements_created_at on public.noise_measurements;
create trigger noise_measurements_created_at before insert on public.noise_measurements
  for each row execute function public.noise_set_created_at();
drop trigger if exists noise_reports_created_at on public.noise_reports;
create trigger noise_reports_created_at before insert on public.noise_reports
  for each row execute function public.noise_set_created_at();
drop trigger if exists noise_confirmations_created_at on public.noise_confirmations;
create trigger noise_confirmations_created_at before insert on public.noise_confirmations
  for each row execute function public.noise_set_created_at();

create or replace function public.noise_report_legacy_photo_path()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> new.id::text then
    new.photo_path := null;
  end if;
  return new;
end;
$$;
drop trigger if exists noise_reports_legacy_photo on public.noise_reports;
create trigger noise_reports_legacy_photo before insert on public.noise_reports
  for each row execute function public.noise_report_legacy_photo_path();

create or replace function public.noise_hash_legacy_confirmation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.confirmation_key is not null and new.confirmation_key !~ '^[a-f0-9]{64}$' then
    new.confirmation_key := encode(sha256(convert_to(new.confirmation_key, 'UTF8')), 'hex');
  end if;
  return new;
end;
$$;
drop trigger if exists noise_confirmations_legacy_key on public.noise_confirmations;
create trigger noise_confirmations_legacy_key before insert on public.noise_confirmations
  for each row execute function public.noise_hash_legacy_confirmation();

create or replace function public.noise_validate_session_time()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.longitude := public.snap_noise_grid_lng(new.latitude, new.longitude);
  new.latitude := public.snap_noise_grid_lat(new.latitude);
  new.client_id := null;
  if new.end_time > now() + interval '5 minutes' then
    raise exception 'Session end_time cannot be in the future';
  end if;
  return new;
end;
$$;
drop trigger if exists noise_sessions_time on public.noise_sessions;
create trigger noise_sessions_time before insert on public.noise_sessions
  for each row execute function public.noise_validate_session_time();

alter table public.noise_measurements drop constraint if exists noise_measurements_grid_check;
alter table public.noise_measurements add constraint noise_measurements_grid_check
  check (public.is_noise_grid_cell(latitude, longitude)) not valid;
alter table public.noise_sessions drop constraint if exists noise_sessions_grid_check;
alter table public.noise_sessions add constraint noise_sessions_grid_check
  check (public.is_noise_grid_cell(latitude, longitude)) not valid;
alter table public.noise_reports drop constraint if exists noise_reports_grid_check;
alter table public.noise_reports add constraint noise_reports_grid_check
  check (public.is_noise_grid_cell(latitude, longitude)) not valid;
alter table public.noise_confirmations drop constraint if exists noise_confirmations_grid_check;
alter table public.noise_confirmations add constraint noise_confirmations_grid_check
  check (public.is_noise_grid_cell(latitude, longitude)) not valid;
-- Table constraints remain effective even if a custom permissive RLS policy
-- exists in the project.
alter table public.noise_measurements drop constraint if exists noise_measurements_no_client_check;
alter table public.noise_measurements add constraint noise_measurements_no_client_check
  check (client_id is null) not valid;
alter table public.noise_sessions drop constraint if exists noise_sessions_no_client_check;
alter table public.noise_sessions add constraint noise_sessions_no_client_check
  check (client_id is null) not valid;
alter table public.noise_reports drop constraint if exists noise_reports_no_client_check;
alter table public.noise_reports add constraint noise_reports_no_client_check
  check (client_id is null) not valid;
alter table public.noise_confirmations drop constraint if exists noise_confirmations_no_client_check;
alter table public.noise_confirmations add constraint noise_confirmations_no_client_check
  check (client_id is null) not valid;
alter table public.noise_reports drop constraint if exists noise_reports_photo_path_check;
alter table public.noise_reports add constraint noise_reports_photo_path_check
  check (photo_path is null or split_part(photo_path, '/', 1) = id::text) not valid;
alter table public.noise_confirmations drop constraint if exists noise_confirmations_key_check;
alter table public.noise_confirmations add constraint noise_confirmations_key_check
  check (confirmation_key is not null and confirmation_key ~ '^[a-f0-9]{64}$') not valid;
alter table public.noise_measurements validate constraint noise_measurements_grid_check;
alter table public.noise_sessions validate constraint noise_sessions_grid_check;
alter table public.noise_reports validate constraint noise_reports_grid_check;
alter table public.noise_confirmations validate constraint noise_confirmations_grid_check;
alter table public.noise_measurements validate constraint noise_measurements_no_client_check;
alter table public.noise_sessions validate constraint noise_sessions_no_client_check;
alter table public.noise_reports validate constraint noise_reports_no_client_check;
alter table public.noise_confirmations validate constraint noise_confirmations_no_client_check;
alter table public.noise_reports validate constraint noise_reports_photo_path_check;

-- Remove both historical policy families. Permissive policies combine with OR,
-- so leaving an older INSERT policy would bypass the stricter checks below.
drop policy if exists public_read_access on public.noise_measurements;
drop policy if exists public_insert_access on public.noise_measurements;
drop policy if exists public_read_sessions on public.noise_sessions;
drop policy if exists public_insert_sessions on public.noise_sessions;
drop policy if exists "Permitir lectura pública de sesiones históricas" on public.noise_sessions;
drop policy if exists "Permitir inserción pública de sesiones históricas" on public.noise_sessions;
drop policy if exists public_read_reports on public.noise_reports;
drop policy if exists public_insert_reports on public.noise_reports;
drop policy if exists public_read_noise_reports on public.noise_reports;
drop policy if exists public_insert_noise_reports on public.noise_reports;
drop policy if exists public_read_confirmations on public.noise_confirmations;
drop policy if exists public_insert_confirmations on public.noise_confirmations;
drop policy if exists public_read_noise_confirmations on public.noise_confirmations;
drop policy if exists public_insert_noise_confirmations on public.noise_confirmations;
drop policy if exists acoustimap_public_read_measurements on public.noise_measurements;
drop policy if exists acoustimap_insert_measurements on public.noise_measurements;
drop policy if exists acoustimap_public_read_sessions on public.noise_sessions;
drop policy if exists acoustimap_insert_sessions on public.noise_sessions;
drop policy if exists acoustimap_public_read_reports on public.noise_reports;
drop policy if exists acoustimap_insert_reports on public.noise_reports;
drop policy if exists acoustimap_public_read_confirmations on public.noise_confirmations;
drop policy if exists acoustimap_insert_confirmations on public.noise_confirmations;

alter table public.noise_measurements enable row level security;
alter table public.noise_sessions enable row level security;
alter table public.noise_reports enable row level security;
alter table public.noise_confirmations enable row level security;

revoke all on public.noise_measurements, public.noise_sessions,
  public.noise_reports, public.noise_confirmations from anon, authenticated;
grant select (id, latitude, longitude, db_level, category, created_at)
  on public.noise_measurements to anon, authenticated;
grant select (id, latitude, longitude, avg_db, category, sample_count, start_time, end_time)
  on public.noise_sessions to anon, authenticated;
grant select (id, latitude, longitude, db_level, note, photo_path, created_at)
  on public.noise_reports to anon, authenticated;
grant select (id, latitude, longitude, measurement_time, created_at)
  on public.noise_confirmations to anon, authenticated;
grant insert on public.noise_measurements, public.noise_sessions,
  public.noise_reports, public.noise_confirmations to anon, authenticated;

create policy acoustimap_public_read_measurements on public.noise_measurements
  for select to anon, authenticated using (true);
create policy acoustimap_insert_measurements on public.noise_measurements
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and public.is_noise_grid_cell(latitude, longitude)
    and db_level between 20 and 140
    and category in ('bajo', 'moderado', 'alto')
    and client_id is null
  );
create policy acoustimap_public_read_sessions on public.noise_sessions
  for select to anon, authenticated using (true);
create policy acoustimap_insert_sessions on public.noise_sessions
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and public.is_noise_grid_cell(latitude, longitude)
    and avg_db between 20 and 140 and category in ('bajo', 'moderado', 'alto')
    and sample_count between 1 and 100000 and end_time > start_time
    and end_time <= now() + interval '5 minutes'
    and client_id is null
  );
create policy acoustimap_public_read_reports on public.noise_reports
  for select to anon, authenticated using (true);
create policy acoustimap_insert_reports on public.noise_reports
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and public.is_noise_grid_cell(latitude, longitude)
    and (db_level is null or db_level between 20 and 140)
    and char_length(note) between 1 and 280 and client_id is null
    and (photo_path is null or (
      char_length(photo_path) <= 240 and split_part(photo_path, '/', 1) = id::text
    ))
  );
create policy acoustimap_public_read_confirmations on public.noise_confirmations
  for select to anon, authenticated using (true);
create policy acoustimap_insert_confirmations on public.noise_confirmations
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and public.is_noise_grid_cell(latitude, longitude)
    and client_id is null and confirmation_key ~ '^[a-f0-9]{64}$'
    and (measurement_time is null or measurement_time <= now())
  );

-- Aggregate the visible 24h/90d window in PostgreSQL. The browser receives
-- one row per display cell instead of downloading every raw measurement.
-- Time-of-day filters use Colombia's civil time for every viewer.
create or replace function public.noise_map_cells(
  p_since timestamptz, p_until timestamptz,
  p_south double precision, p_north double precision,
  p_west double precision, p_east double precision,
  p_time_filter text
)
returns table (
  latitude double precision, longitude double precision,
  db_level integer, category text, created_at timestamptz,
  sample_count bigint
)
language sql stable security invoker set search_path = '' as $$
  with grouped as (
    select
      round(m.latitude / 0.0014::double precision) * 0.0014::double precision as cell_lat,
      round(m.longitude / 0.0014::double precision) * 0.0014::double precision as cell_lng,
      round(avg(m.db_level))::integer as avg_index,
      max(m.created_at) as last_at,
      count(*) as samples
    from public.noise_measurements m
    where m.created_at >= greatest(p_since, now() - interval '90 days')
      and m.created_at < least(p_until, now())
      and m.latitude between least(p_south, p_north) and greatest(p_south, p_north)
      and m.longitude between least(p_west, p_east) and greatest(p_west, p_east)
      and (
        p_time_filter = 'all'
        or (p_time_filter = 'morning' and extract(hour from m.created_at at time zone 'America/Bogota') between 6 and 11)
        or (p_time_filter = 'afternoon' and extract(hour from m.created_at at time zone 'America/Bogota') between 12 and 17)
        or (p_time_filter = 'night' and (
          extract(hour from m.created_at at time zone 'America/Bogota') >= 18
          or extract(hour from m.created_at at time zone 'America/Bogota') < 6
        ))
      )
    group by 1, 2
  )
  select g.cell_lat, g.cell_lng, g.avg_index,
    case when g.avg_index < 55 then 'bajo'
         when g.avg_index <= 70 then 'moderado'
         else 'alto' end,
    g.last_at, g.samples
  from grouped g
  order by g.last_at desc, g.cell_lat, g.cell_lng;
$$;
revoke all on function public.noise_map_cells(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.noise_map_cells(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  to anon, authenticated;

-- A random report UUID is the only folder name. No stable browser ID is sent.
drop policy if exists acoustimap_upload_report_photos on storage.objects;
drop policy if exists acoustimap_read_report_photos on storage.objects;
drop policy if exists acoustimap_upload_metadata on storage.objects;
create policy acoustimap_upload_report_photos on storage.objects
  for insert to anon, authenticated with check (
    bucket_id = 'noise-report-photos'
    and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$'
    and split_part(name, '/', 1) = split_part(split_part(name, '/', 2), '.', 1)
  );
-- Storage may SELECT the inserted row to return upload metadata. Restrict that
-- SELECT to upload requests; the public bucket serves known URLs without it.
create policy acoustimap_upload_metadata on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'noise-report-photos'
    and storage.allow_only_operation('object.upload')
    and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$'
    and split_part(name, '/', 1) = split_part(split_part(name, '/', 2), '.', 1)
  );

-- Keep rows with photos until the Edge Function removes the physical object.
-- SQL deletion of storage.objects would orphan the underlying file.
create or replace function public.cleanup_old_noise_data()
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.noise_measurements where created_at < now() - interval '90 days';
  delete from public.noise_sessions where end_time < now() - interval '90 days';
  delete from public.noise_reports where created_at < now() - interval '30 days' and photo_path is null;
  delete from public.noise_confirmations where created_at < now() - interval '24 hours';
end;
$$;
revoke all on function public.cleanup_old_noise_data() from public, anon, authenticated;

-- Read-only storage metadata query for the scheduled cleanup function.
create or replace function public.expired_noise_photo_candidates()
returns table(path text, report_id uuid)
language sql security definer set search_path = '' as $$
  select candidates.path, candidates.report_id
  from (
    select o.name::text as path, r.id as report_id, o.created_at as ordered_at
    from storage.objects o
    left join public.noise_reports r on r.photo_path = o.name
    where o.bucket_id = 'noise-report-photos'
      and ((r.id is null and (
        o.created_at < now() - interval '1 day'
        or split_part(o.name, '/', 1) <> split_part(split_part(o.name, '/', 2), '.', 1)
      ))
        or (r.created_at < now() - interval '30 days'))
    union all
    select null::text, r.id, r.created_at
    from public.noise_reports r
    where r.photo_path is not null and r.created_at < now() - interval '30 days'
      and not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'noise-report-photos' and o.name = r.photo_path
      )
  ) candidates
  order by candidates.ordered_at
  limit 1000;
$$;
revoke all on function public.expired_noise_photo_candidates() from public, anon, authenticated;
grant execute on function public.expired_noise_photo_candidates() to service_role;

commit;
