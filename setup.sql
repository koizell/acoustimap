-- ============================================================================
-- AcoustiMap - Configuración completa de base de datos
-- ============================================================================
-- Este script configura TODA la base de datos necesaria para AcoustiMap:
--   1. Extensiones (geoespacial + cron)
--   2. Tablas (measurements, sessions, reports, confirmations)
--   3. Seguridad RLS con validaciones estrictas
--   4. Índices para rendimiento
--   5. Cron job de limpieza automática
--
-- Es IDEMPOTENTE: puedes ejecutarlo múltiples veces sin errores.
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONES NECESARIAS
-- ============================================================================
create extension if not exists cube;
create extension if not exists earthdistance;
create extension if not exists pg_cron;


-- ============================================================================
-- 2. TABLAS
-- ============================================================================
-- Nota: las tablas ya existen. Se mantienen con "if not exists" por seguridad.

create table if not exists public.noise_measurements (
  id          uuid primary key default gen_random_uuid(),
  latitude    double precision not null,
  longitude   double precision not null,
  db_level    integer not null,
  category    text not null,
  created_at  timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.noise_sessions (
  id            uuid primary key default gen_random_uuid(),
  latitude      double precision not null,
  longitude     double precision not null,
  avg_db        integer not null,
  category      text not null,
  sample_count  integer not null,
  start_time    timestamp with time zone not null,
  end_time      timestamp with time zone not null
);

create table if not exists public.noise_reports (
  id          uuid primary key default gen_random_uuid(),
  latitude    double precision not null,
  longitude   double precision not null,
  db_level    integer not null,
  note        text not null,
  client_id   text not null,
  created_at  timestamp with time zone not null default timezone('utc'::text, now())
);

create table if not exists public.noise_confirmations (
  id                uuid primary key default gen_random_uuid(),
  latitude          double precision not null,
  longitude         double precision not null,
  measurement_time  timestamp with time zone,
  client_id         text not null,
  created_at        timestamp with time zone not null default timezone('utc'::text, now())
);


-- ============================================================================
-- 3. SEGURIDAD: RLS + PERMISOS
-- ============================================================================
alter table public.noise_measurements  enable row level security;
alter table public.noise_sessions      enable row level security;
alter table public.noise_reports       enable row level security;
alter table public.noise_confirmations enable row level security;

revoke all on public.noise_measurements  from anon, authenticated;
revoke all on public.noise_sessions      from anon, authenticated;
revoke all on public.noise_reports       from anon, authenticated;
revoke all on public.noise_confirmations from anon, authenticated;

grant select, insert on public.noise_measurements  to anon, authenticated;
grant select, insert on public.noise_sessions      to anon, authenticated;
grant select, insert on public.noise_reports       to anon, authenticated;
grant select, insert on public.noise_confirmations to anon, authenticated;


-- ============================================================================
-- 4. LIMPIAR TODAS LAS POLÍTICAS EXISTENTES (incluye duplicadas)
-- ============================================================================

-- ─── noise_measurements ───
drop policy if exists "public_read_access"   on public.noise_measurements;
drop policy if exists "public_insert_access" on public.noise_measurements;

-- ─── noise_sessions ───
drop policy if exists "public_read_sessions"                              on public.noise_sessions;
drop policy if exists "public_insert_sessions"                            on public.noise_sessions;
drop policy if exists "Permitir lectura pública de sesiones históricas"   on public.noise_sessions;
drop policy if exists "Permitir inserción pública de sesiones históricas" on public.noise_sessions;

-- ─── noise_reports (incluye duplicadas de Copilot) ───
drop policy if exists "public_read_reports"         on public.noise_reports;
drop policy if exists "public_insert_reports"       on public.noise_reports;
drop policy if exists "public_read_noise_reports"   on public.noise_reports;
drop policy if exists "public_insert_noise_reports" on public.noise_reports;

-- ─── noise_confirmations (incluye duplicadas de Copilot) ───
drop policy if exists "public_read_confirmations"         on public.noise_confirmations;
drop policy if exists "public_insert_confirmations"       on public.noise_confirmations;
drop policy if exists "public_read_noise_confirmations"   on public.noise_confirmations;
drop policy if exists "public_insert_noise_confirmations" on public.noise_confirmations;


-- ============================================================================
-- 5. CREAR POLÍTICAS CON VALIDACIÓN ESTRICTA
-- ============================================================================

-- ─── noise_measurements ───
create policy "public_read_access"
  on public.noise_measurements
  for select to anon, authenticated
  using (true);

create policy "public_insert_access"
  on public.noise_measurements
  for insert to anon, authenticated
  with check (
    latitude  between -4.5 and 13.5
    and longitude between -82  and -66
    and db_level  between 20  and 140
    and category in ('bajo', 'moderado', 'alto')
  );

-- ─── noise_sessions ───
create policy "public_read_sessions"
  on public.noise_sessions
  for select to anon, authenticated
  using (true);

create policy "public_insert_sessions"
  on public.noise_sessions
  for insert to anon, authenticated
  with check (
    latitude  between -4.5 and 13.5
    and longitude between -82  and -66
    and avg_db    between 20  and 140
    and category in ('bajo', 'moderado', 'alto')
    and sample_count between 1 and 100000
    and end_time > start_time
  );

-- ─── noise_reports ───
create policy "public_read_reports"
  on public.noise_reports
  for select to anon, authenticated
  using (true);

create policy "public_insert_reports"
  on public.noise_reports
  for insert to anon, authenticated
  with check (
    latitude  between -4.5 and 13.5
    and longitude between -82  and -66
    and db_level  between 20  and 140
    and length(note)      between 1 and 280
    and length(client_id) between 8 and 64
  );

-- ─── noise_confirmations ───
create policy "public_read_confirmations"
  on public.noise_confirmations
  for select to anon, authenticated
  using (true);

create policy "public_insert_confirmations"
  on public.noise_confirmations
  for insert to anon, authenticated
  with check (
    latitude  between -4.5 and 13.5
    and longitude between -82  and -66
    and length(client_id) between 8 and 64
    and (measurement_time is null or measurement_time <= now())
  );


-- ============================================================================
-- 6. ÍNDICES PARA RENDIMIENTO
-- ============================================================================
create index if not exists idx_measurements_created_at
  on public.noise_measurements (created_at desc);

create index if not exists idx_measurements_location_time
  on public.noise_measurements (created_at desc, latitude, longitude);

create index if not exists idx_sessions_created_at
  on public.noise_sessions (end_time desc);

create index if not exists idx_reports_created_at
  on public.noise_reports (created_at desc);

create index if not exists idx_confirmations_created_at
  on public.noise_confirmations (created_at desc);

create index if not exists idx_confirmations_client
  on public.noise_confirmations (client_id);


-- ============================================================================
-- 7. FUNCIÓN DE LIMPIEZA AUTOMÁTICA
-- ============================================================================
create or replace function cleanup_old_noise_data()
returns void
language plpgsql
as $$
begin
  -- Mediciones huérfanas: >24h sin vecinas cercanas (<30 m)
  delete from public.noise_measurements m
  where m.created_at < now() - interval '24 hours'
    and not exists (
      select 1
      from public.noise_measurements m2
      where m2.created_at >= now() - interval '24 hours'
        and earth_distance(
              ll_to_earth(m.latitude, m.longitude),
              ll_to_earth(m2.latitude, m2.longitude)
            ) <= 30
    );

  -- Sesiones antiguas: >7 días
  delete from public.noise_sessions
  where end_time < now() - interval '7 days';

  -- Reportes ciudadanos: >30 días
  delete from public.noise_reports
  where created_at < now() - interval '30 days';

  -- Confirmaciones: >24h
  delete from public.noise_confirmations
  where created_at < now() - interval '24 hours';
end;
$$;

comment on function cleanup_old_noise_data() is
  'Limpia periódicamente mediciones, sesiones, reportes y confirmaciones antiguas.';


-- ============================================================================
-- 8. CRON JOB (limpieza cada hora)
-- ============================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-old-noise') then
    perform cron.unschedule('cleanup-old-noise');
  end if;
end $$;

select cron.schedule(
  'cleanup-old-noise',
  '0 * * * *',
  $$ select cleanup_old_noise_data(); $$
);


-- ============================================================================
-- ✅ FIN DEL SCRIPT
-- ============================================================================
-- Si ves "Success. No rows returned", todo se ejecutó correctamente.
-- Ejecuta las verificaciones por separado para confirmar.
-- ============================================================================


-- ============================================================================
-- VERIFICACIONES (ejecutar por separado)
-- ============================================================================

-- 1. RLS activo en las 4 tablas (debe mostrar 4 filas con true)
-- select relname, relrowsecurity
-- from pg_class
-- where relname in (
--   'noise_measurements', 'noise_sessions',
--   'noise_reports', 'noise_confirmations'
-- );

-- 2. Políticas correctas (debe mostrar exactamente 8 filas)
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where tablename in (
--   'noise_measurements', 'noise_sessions',
--   'noise_reports', 'noise_confirmations'
-- )
-- order by tablename, cmd;

-- 3. Cron job activo (debe mostrar 1 fila con active = true)
-- select jobid, jobname, schedule, active
-- from cron.job
-- where jobname = 'cleanup-old-noise';