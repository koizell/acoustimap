-- ============================================================================
-- AcoustiMap - Configuración completa de base de datos
-- ============================================================================
-- Este script configura TODA la base de datos necesaria para AcoustiMap:
--   1. Extensiones (geoespacial + cron)
--   2. Tablas (mediciones + sesiones)
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
-- 2. TABLA: noise_measurements
-- ============================================================================
create table if not exists public.noise_measurements (
  id          uuid primary key default gen_random_uuid(),
  latitude    double precision not null,
  longitude   double precision not null,
  db_level    integer not null,
  category    text not null,
  created_at  timestamp with time zone not null default timezone('utc'::text, now())
);

comment on table  public.noise_measurements           is 'Mediciones de ruido geolocalizadas (coordenadas difuminadas ~70 m).';
comment on column public.noise_measurements.latitude  is 'Latitud anclada a cuadrícula de ~70 m.';
comment on column public.noise_measurements.longitude is 'Longitud anclada a cuadrícula de ~70 m.';
comment on column public.noise_measurements.db_level  is 'Nivel de ruido en dB (rango válido: 20-140).';
comment on column public.noise_measurements.category  is 'Clasificación: bajo | moderado | alto.';


-- ============================================================================
-- 3. TABLA: noise_sessions
-- ============================================================================
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

comment on table  public.noise_sessions             is 'Resumen de sesiones de medición (promedio + duración).';
comment on column public.noise_sessions.avg_db      is 'Promedio de dB de la sesión completa.';
comment on column public.noise_sessions.sample_count is 'Número total de muestras tomadas en la sesión.';


-- ============================================================================
-- 4. SEGURIDAD: RLS + PERMISOS
-- ============================================================================
alter table public.noise_measurements enable row level security;
alter table public.noise_sessions     enable row level security;

revoke all on public.noise_measurements from anon;
revoke all on public.noise_measurements from authenticated;
revoke all on public.noise_sessions     from anon;
revoke all on public.noise_sessions     from authenticated;

grant select, insert on public.noise_measurements to anon;
grant select, insert on public.noise_measurements to authenticated;
grant select, insert on public.noise_sessions     to anon;
grant select, insert on public.noise_sessions     to authenticated;


-- ============================================================================
-- 5. LIMPIAR TODAS LAS POLÍTICAS EXISTENTES (incluye las duplicadas antiguas)
-- ============================================================================
-- noise_measurements
drop policy if exists "public_read_access"               on public.noise_measurements;
drop policy if exists "public_insert_access"             on public.noise_measurements;

-- noise_sessions (incluye los nombres antiguos por si acaso)
drop policy if exists "public_read_sessions"                              on public.noise_sessions;
drop policy if exists "public_insert_sessions"                            on public.noise_sessions;
drop policy if exists "Permitir lectura pública de sesiones históricas"   on public.noise_sessions;
drop policy if exists "Permitir inserción pública de sesiones históricas" on public.noise_sessions;


-- ============================================================================
-- 6. CREAR POLÍTICAS LIMPIAS CON VALIDACIÓN ESTRICTA
-- ============================================================================

-- ─── noise_measurements ───
create policy "public_read_access"
  on public.noise_measurements
  for select
  to anon, authenticated
  using (true);

create policy "public_insert_access"
  on public.noise_measurements
  for insert
  to anon, authenticated
  with check (
    latitude  between -4.5 and 13.5
    and longitude between -82  and -66
    and db_level  between 20  and 140
    and category in ('bajo', 'moderado', 'alto')
  );

-- ─── noise_sessions ───
create policy "public_read_sessions"
  on public.noise_sessions
  for select
  to anon, authenticated
  using (true);

create policy "public_insert_sessions"
  on public.noise_sessions
  for insert
  to anon, authenticated
  with check (
    latitude  between -4.5 and 13.5
    and longitude between -82  and -66
    and avg_db    between 20  and 140
    and category in ('bajo', 'moderado', 'alto')
    and sample_count between 1 and 100000
    and end_time > start_time
  );


-- ============================================================================
-- 7. ÍNDICES PARA RENDIMIENTO
-- ============================================================================
create index if not exists idx_measurements_created_at
  on public.noise_measurements (created_at desc);

create index if not exists idx_measurements_location_time
  on public.noise_measurements (created_at desc, latitude, longitude);

create index if not exists idx_sessions_created_at
  on public.noise_sessions (end_time desc);


-- ============================================================================
-- 8. FUNCIÓN DE LIMPIEZA AUTOMÁTICA
-- ============================================================================
create or replace function cleanup_old_noise_measurements()
returns void
language plpgsql
as $$
begin
  -- Borrar mediciones huérfanas (más de 24h y sin otras cercanas a <30 m)
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

  -- Borrar sesiones antiguas (>7 días)
  delete from public.noise_sessions
  where end_time < now() - interval '7 days';
end;
$$;

comment on function cleanup_old_noise_measurements() is
  'Limpia mediciones huérfanas (>24h sin vecinas cercanas) y sesiones antiguas (>7 días).';


-- ============================================================================
-- 9. CRON JOB (limpieza cada hora)
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
  $$ select cleanup_old_noise_measurements(); $$
);


-- ============================================================================
-- ✅ FIN DEL SCRIPT
-- ============================================================================
-- Si ves "Success. No rows returned", todo se ejecutó correctamente.
-- Ejecuta las verificaciones por separado para confirmar.
-- ============================================================================