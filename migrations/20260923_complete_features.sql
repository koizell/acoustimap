-- AcoustiMap: completar el contrato de datos para participación y análisis.
-- Migración histórica: aplicar esta primero y luego
-- 20260925_privacy_and_retention.sql antes de publicar el frontend actual.
-- Ejecutar una vez en Supabase SQL Editor con un rol administrador.
-- Esta etapa histórica exigía client_id en escrituras nuevas; la migración
-- 20260925_privacy_and_retention.sql elimina ese requisito y los datos previos.

begin;

alter table public.noise_measurements
  add column if not exists client_id text;
alter table public.noise_sessions
  add column if not exists client_id text;

alter table public.noise_reports
  add column if not exists photo_path text;

alter table public.noise_reports
  alter column db_level drop not null;

alter table public.noise_confirmations
  add column if not exists measurement_id uuid references public.noise_measurements(id) on delete set null;
alter table public.noise_confirmations
  add column if not exists confirmation_key text;

create index if not exists idx_measurements_client_time
  on public.noise_measurements (client_id, created_at desc)
  where client_id is not null;

create index if not exists idx_measurements_zone_time
  on public.noise_measurements (latitude, longitude, created_at desc);

create index if not exists idx_sessions_client_end
  on public.noise_sessions (client_id, end_time desc)
  where client_id is not null;

create index if not exists idx_reports_photo_path
  on public.noise_reports (photo_path)
  where photo_path is not null;

create index if not exists idx_confirmations_zone_time
  on public.noise_confirmations (latitude, longitude, created_at desc);

-- Clave estable para evitar confirmaciones dobles desde clientes nuevos;
-- las filas previas quedan NULL y no requieren limpieza destructiva.
create unique index if not exists idx_confirmations_key
  on public.noise_confirmations (confirmation_key)
  where confirmation_key is not null;

alter table public.noise_measurements enable row level security;
alter table public.noise_sessions enable row level security;
alter table public.noise_reports enable row level security;
alter table public.noise_confirmations enable row level security;

-- Quita variantes anteriores que podrían dejar verificaciones más permisivas.
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
create policy acoustimap_public_read_measurements on public.noise_measurements
  for select to anon, authenticated using (true);
create policy acoustimap_insert_measurements on public.noise_measurements
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and db_level between 20 and 140
    and category in ('bajo', 'moderado', 'alto')
    and client_id is not null and char_length(client_id) between 8 and 64
  );
grant select, insert on public.noise_measurements to anon, authenticated;

drop policy if exists acoustimap_public_read_sessions on public.noise_sessions;
drop policy if exists acoustimap_insert_sessions on public.noise_sessions;
create policy acoustimap_public_read_sessions on public.noise_sessions
  for select to anon, authenticated using (true);
create policy acoustimap_insert_sessions on public.noise_sessions
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and avg_db between 20 and 140 and category in ('bajo', 'moderado', 'alto')
    and sample_count between 1 and 100000 and end_time > start_time
    and (client_id is null or char_length(client_id) between 8 and 64)
  );
grant select, insert on public.noise_sessions to anon, authenticated;

drop policy if exists acoustimap_public_read_reports on public.noise_reports;
drop policy if exists acoustimap_insert_reports on public.noise_reports;
create policy acoustimap_public_read_reports on public.noise_reports
  for select to anon, authenticated using (true);
create policy acoustimap_insert_reports on public.noise_reports
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and (db_level is null or db_level between 20 and 140)
    and char_length(note) between 1 and 280
    and char_length(client_id) between 8 and 64
    and (photo_path is null or char_length(photo_path) <= 240)
    and (photo_path is null or split_part(photo_path, '/', 1) = client_id)
  );
grant select, insert on public.noise_reports to anon, authenticated;

drop policy if exists acoustimap_public_read_confirmations on public.noise_confirmations;
drop policy if exists acoustimap_insert_confirmations on public.noise_confirmations;
create policy acoustimap_public_read_confirmations on public.noise_confirmations
  for select to anon, authenticated using (true);
create policy acoustimap_insert_confirmations on public.noise_confirmations
  for insert to anon, authenticated with check (
    latitude between -4.5 and 13.5 and longitude between -82 and -66
    and char_length(client_id) between 8 and 64
    and (confirmation_key is null or char_length(confirmation_key) between 24 and 180)
    and (measurement_time is null or measurement_time <= now())
  );
grant select, insert on public.noise_confirmations to anon, authenticated;

-- Reportes visibles públicamente en el mapa. Solo se permite subir formatos
-- raster comunes, con límite de 5 MB y bajo una carpeta por client_id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('noise-report-photos', 'noise-report-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists acoustimap_upload_report_photos on storage.objects;
drop policy if exists acoustimap_read_report_photos on storage.objects;
create policy acoustimap_upload_report_photos on storage.objects
  for insert to anon, authenticated with check (
    bucket_id = 'noise-report-photos'
    and (storage.foldername(name))[1] ~ '^[a-f0-9-]{36}$'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );
create policy acoustimap_read_report_photos on storage.objects
  for select to anon, authenticated using (bucket_id = 'noise-report-photos');

-- Retención uniforme: permite comparar dos periodos mensuales completos.
create or replace function public.cleanup_old_noise_data()
returns void language plpgsql security definer set search_path = public, extensions
as $$
begin
  delete from public.noise_measurements where created_at < now() - interval '90 days';
  delete from public.noise_sessions where end_time < now() - interval '90 days';
  delete from public.noise_reports where created_at < now() - interval '30 days';
  delete from public.noise_confirmations where created_at < now() - interval '24 hours';
end;
$$;

revoke all on function public.cleanup_old_noise_data() from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'cleanup-old-noise') then
      perform cron.unschedule('cleanup-old-noise');
    end if;
    perform cron.schedule('cleanup-old-noise', '0 * * * *',
      'select public.cleanup_old_noise_data();');
  end if;
end $$;

commit;
