-- AcoustiMap - Extensiones para análisis y participación ciudadana
-- Ejecutar después de setup.sql en Supabase SQL Editor.

create table if not exists public.noise_reports (
  id uuid primary key default gen_random_uuid(),
  latitude double precision not null,
  longitude double precision not null,
  db_level integer not null,
  note text not null,
  client_id text not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.noise_confirmations (
  id uuid primary key default gen_random_uuid(),
  latitude double precision not null,
  longitude double precision not null,
  measurement_time timestamptz,
  client_id text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (client_id, latitude, longitude, measurement_time)
);

create index if not exists idx_noise_reports_created_at
  on public.noise_reports (created_at desc);
create index if not exists idx_noise_reports_location
  on public.noise_reports (latitude, longitude);
create index if not exists idx_noise_confirmations_created_at
  on public.noise_confirmations (created_at desc);

alter table public.noise_reports enable row level security;
alter table public.noise_confirmations enable row level security;

revoke all on public.noise_reports from anon, authenticated;
revoke all on public.noise_confirmations from anon, authenticated;
grant select, insert on public.noise_reports to anon, authenticated;
grant select, insert on public.noise_confirmations to anon, authenticated;

drop policy if exists "public_read_noise_reports" on public.noise_reports;
drop policy if exists "public_insert_noise_reports" on public.noise_reports;
drop policy if exists "public_read_noise_confirmations" on public.noise_confirmations;
drop policy if exists "public_insert_noise_confirmations" on public.noise_confirmations;

create policy "public_read_noise_reports"
  on public.noise_reports for select to anon, authenticated using (true);
create policy "public_insert_noise_reports"
  on public.noise_reports for insert to anon, authenticated
  with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and db_level between 20 and 140
    and char_length(note) between 1 and 280
    and char_length(client_id) between 16 and 128
  );
create policy "public_read_noise_confirmations"
  on public.noise_confirmations for select to anon, authenticated using (true);
create policy "public_insert_noise_confirmations"
  on public.noise_confirmations for insert to anon, authenticated
  with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and char_length(client_id) between 16 and 128
  );

-- Conserva datos suficientes para comparar el último mes con el anterior.
create or replace function cleanup_old_noise_measurements()
returns void
language plpgsql
as $$
begin
  delete from public.noise_measurements m
  where m.created_at < now() - interval '90 days'
    and not exists (
      select 1 from public.noise_measurements m2
      where m2.created_at >= now() - interval '90 days'
        and earth_distance(
          ll_to_earth(m.latitude, m.longitude),
          ll_to_earth(m2.latitude, m2.longitude)
        ) <= 30
    );

  delete from public.noise_sessions
  where end_time < now() - interval '90 days';
end;
$$;
