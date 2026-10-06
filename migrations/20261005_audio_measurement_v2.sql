-- Ejecutar en el SQL Editor antes de publicar el frontend v2.
-- Requiere setup.sql y las migraciones anteriores de privacidad/higiene.
-- No borra ni reclasifica lecturas antiguas. Sin DEFAULT: los clientes viejos
-- y la cola offline antigua siguen insertando NULL (método desconocido).
begin;

alter table public.noise_measurements
  add column if not exists measurement_version smallint,
  add column if not exists capture_profile text;
alter table public.noise_sessions
  add column if not exists measurement_version smallint,
  add column if not exists capture_profile text;

alter table public.noise_measurements drop constraint if exists noise_measurements_method_check;
alter table public.noise_measurements add constraint noise_measurements_method_check
  check (
    (measurement_version is null and capture_profile is null)
    or (measurement_version is not null and measurement_version = 2
      and capture_profile is not null
      and capture_profile in ('unprocessed', 'processed', 'unknown')
      and db_level between 30 and 95)
  ) not valid;
alter table public.noise_measurements validate constraint noise_measurements_method_check;

alter table public.noise_sessions drop constraint if exists noise_sessions_method_check;
alter table public.noise_sessions add constraint noise_sessions_method_check
  check (
    (measurement_version is null and capture_profile is null)
    or (measurement_version is not null and measurement_version = 2
      and capture_profile is not null
      and capture_profile in ('unprocessed', 'processed', 'unknown')
      and avg_db between 30 and 95)
  ) not valid;
alter table public.noise_sessions validate constraint noise_sessions_method_check;

comment on column public.noise_measurements.measurement_version is
  '2: RMS, búfer 2048, suavizado temporal y tratamientos solicitados desactivados. NULL: método anterior/desconocido. No es dB SPL.';
comment on column public.noise_sessions.measurement_version is
  'Versión del método del resumen de índices; no representa LAeq. NULL: método anterior/desconocido.';
comment on column public.noise_measurements.capture_profile is
  'Tratamientos declarados por getSettings: unprocessed (todos false), processed (alguno true), unknown. Sin identificadores de dispositivo.';
comment on column public.noise_sessions.capture_profile is
  'Perfil declarado de tratamientos del navegador; no es una calibración acústica.';

-- Solo nuevas columnas públicas. No amplía acceso a client_id ni cambia RLS.
grant select (measurement_version, capture_profile)
  on public.noise_measurements to anon, authenticated;
grant select (measurement_version, capture_profile)
  on public.noise_sessions to anon, authenticated;

-- RPC nueva: la anterior sigue disponible para pestañas/clientes antiguos.
-- La vista v2 excluye NULL para no promediar métodos incompatibles.
create or replace function public.noise_map_cells_v2(
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
    where m.measurement_version = 2
      and m.created_at >= greatest(p_since, now() - interval '90 days')
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
revoke all on function public.noise_map_cells_v2(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.noise_map_cells_v2(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Verificación: ambas restricciones deben tener convalidated = true.
select conname, convalidated
from pg_constraint
where conrelid in ('public.noise_measurements'::regclass, 'public.noise_sessions'::regclass)
  and conname in ('noise_measurements_method_check', 'noise_sessions_method_check');

-- Todos estos permisos deben ser true.
select
  has_column_privilege('anon', 'public.noise_measurements', 'measurement_version', 'SELECT') as version_legible,
  has_column_privilege('anon', 'public.noise_measurements', 'capture_profile', 'SELECT') as perfil_legible,
  has_function_privilege('anon',
    'public.noise_map_cells_v2(timestamptz,timestamptz,double precision,double precision,double precision,double precision,text)',
    'EXECUTE') as mapa_ejecutable;

-- Debe ejecutarse sin error. Cero filas es normal hasta recibir lecturas v2.
select * from public.noise_map_cells_v2(
  now() - interval '1 day', now(), 8.7, 8.8, -75.9, -75.8, 'all'
) limit 1;
