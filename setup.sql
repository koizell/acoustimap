-- ============================================================================
-- AcoustiMap - Configuración completa de Supabase
-- ============================================================================
-- Este archivo configura toda la base de datos necesaria para AcoustiMap:
--   1. Extensiones (para cálculos geoespaciales y cron jobs)
--   2. Tabla de mediciones
--   3. Seguridad a nivel de fila (RLS) + políticas
--   4. Índices para consultas rápidas
--   5. Limpieza automática de datos huérfanos
--
-- CÓMO USARLO:
--   1. Entra a tu proyecto en https://supabase.com
--   2. En el menú lateral, abre "SQL Editor"
--   3. Clic en "New query"
--   4. Pega TODO este contenido
--   5. Clic en "Run" (o Ctrl + Enter)
--
-- Es seguro ejecutarlo múltiples veces: usa IF NOT EXISTS y DROP IF EXISTS
-- para que no dé errores si las cosas ya existen.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONES NECESARIAS
-- ============================================================================
-- cube y earthdistance: cálculo de distancia entre coordenadas (metros)
-- pg_cron: programar tareas recurrentes (limpieza automática)

create extension if not exists cube;
create extension if not exists earthdistance;
create extension if not exists pg_cron;


-- ============================================================================
-- 2. TABLA DE MEDICIONES
-- ============================================================================
-- Guarda cada medición de ruido enviada por los usuarios.
-- Las coordenadas ya vienen difuminadas (~70 m) desde el cliente.
-- El audio NUNCA se guarda.

create table if not exists public.noise_measurements (
  id          uuid primary key default gen_random_uuid(),
  latitude    double precision not null,
  longitude   double precision not null,
  db_level    integer not null,
  category    text not null,
  created_at  timestamp with time zone not null default timezone('utc'::text, now())
);

-- Comentarios descriptivos (aparecen en el dashboard de Supabase)
comment on table  public.noise_measurements            is 'Mediciones de ruido geolocalizadas (coordenadas difuminadas ~70 m).';
comment on column public.noise_measurements.latitude   is 'Latitud anclada a cuadrícula de ~70 m.';
comment on column public.noise_measurements.longitude  is 'Longitud anclada a cuadrícula de ~70 m.';
comment on column public.noise_measurements.db_level   is 'Nivel de ruido en dB (rango válido: 20-140).';
comment on column public.noise_measurements.category   is 'Clasificación: bajo | moderado | alto.';


-- ============================================================================
-- 3. SEGURIDAD: RLS + PERMISOS
-- ============================================================================
-- Row Level Security (RLS) bloquea TODO por defecto.
-- Los permisos (GRANT) se revocan y se otorgan explícitamente.

alter table public.noise_measurements enable row level security;

-- Revocar permisos que Supabase concede por defecto
revoke all on public.noise_measurements from anon;
revoke all on public.noise_measurements from authenticated;

-- Otorgar SOLO lo necesario: leer e insertar
grant select, insert on public.noise_measurements to anon;
grant select, insert on public.noise_measurements to authenticated;


-- ============================================================================
-- 4. POLÍTICAS DE RLS
-- ============================================================================
-- Se eliminan primero por si ya existen (idempotente).

drop policy if exists "public_read_access"   on public.noise_measurements;
drop policy if exists "public_insert_access" on public.noise_measurements;

-- Política 1: Cualquiera puede LEER las mediciones (para el mapa comunitario)
create policy "public_read_access"
  on public.noise_measurements
  for select
  to anon, authenticated
  using (true);

-- Política 2: Cualquiera puede INSERTAR una medición válida
-- Se valida que los datos estén dentro de rangos razonables.
-- Así se evita que alguien meta datos basura tipo db_level = 99999
-- o coordenadas fuera del planeta.
create policy "public_insert_access"
  on public.noise_measurements
  for insert
  to anon, authenticated
  with check (
    latitude  between -90  and 90
    and longitude between -180 and 180
    and db_level  between 20  and 140
    and category in ('bajo', 'moderado', 'alto')
  );


-- ============================================================================
-- 5. ÍNDICES
-- ============================================================================
-- El mapa pide las mediciones ordenadas por fecha descendente.
-- Un índice en created_at acelera esa consulta cuando la tabla crezca.

create index if not exists idx_noise_measurements_created_at
  on public.noise_measurements (created_at desc);


-- ============================================================================
-- 6. LIMPIEZA AUTOMÁTICA (TTL: 24 h + 30 m)
-- ============================================================================
-- Regla de negocio:
--   Se borra una medición si:
--     a) Tiene más de 24 horas de antigüedad, Y
--     b) NO existe otra medición en las últimas 24 h a menos de 30 m.
--   En otras palabras: solo sobreviven las zonas "activas".
--   Las zonas silenciosas o viejas se limpian solas.

create or replace function cleanup_old_noise_measurements()
returns void
language plpgsql
as $$
begin
  delete from public.noise_measurements m
  where m.created_at < now() - interval '24 hours'
    and not exists (
      select 1
      from public.noise_measurements m2
      where m2.created_at >= now() - interval '24 hours'
        and earth_distance(
              ll_to_earth(m.latitude, m.longitude),
              ll_to_earth(m2.latitude, m2.longitude)
            ) <= 30   -- 30 metros
    );
end;
$$;

comment on function cleanup_old_noise_measurements() is
  'Borra mediciones con más de 24h si no hay otras mediciones cercanas (<30 m) en las últimas 24h.';


-- Programar el cron job para que se ejecute cada hora en punto.
-- Primero, eliminar el job si ya existe (para evitar duplicados).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-old-noise') then
    perform cron.unschedule('cleanup-old-noise');
  end if;
end $$;

select cron.schedule(
  'cleanup-old-noise',       -- nombre del job
  '0 * * * *',               -- cada hora en punto
  $$ select cleanup_old_noise_measurements(); $$
);


-- ============================================================================
-- 7. VERIFICACIÓN
-- ============================================================================
-- Ejecuta estas consultas por separado para confirmar que todo quedó bien.

-- ✅ Debe mostrar: relrowsecurity = true
-- select relname, relrowsecurity
-- from pg_class
-- where relname = 'noise_measurements';

-- ✅ Debe mostrar exactamente 2 filas:
--    public_read_access   | SELECT | {anon,authenticated}
--    public_insert_access | INSERT | {anon,authenticated}
-- select policyname, cmd, roles
-- from pg_policies
-- where tablename = 'noise_measurements';

-- ✅ Debe mostrar el job programado
-- select jobid, jobname, schedule, active
-- from cron.job
-- where jobname = 'cleanup-old-noise';


-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
-- Si todo salió bien, verás "Success. No rows returned" en el SQL Editor.
-- A partir de este momento, la app puede leer e insertar mediciones
-- y la base de datos se limpia automáticamente cada hora.
-- ============================================================================