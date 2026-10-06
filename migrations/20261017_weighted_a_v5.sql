-- =============================================================================
-- v5: el mismo promedio energético, ahora con mediciones ponderadas A
--
-- Aplicar DESPUÉS de 20261015_energy_average_v4.sql.
--
-- -----------------------------------------------------------------------------
-- Qué cambia y qué no
-- -----------------------------------------------------------------------------
--
-- La agregación **no** cambia. Sigue siendo el promedio en energía que introdujo la
-- v4: `10 * log10(avg(power(10, db_level / 10)))`. Un L_Aeq de mediciones ya
-- promediadas sigue siendo un L_Aeq, y por eso el SQL es idéntico al de la v4.
--
-- Lo que cambia es **cada fila**: la app ya no guarda un RMS del dominio temporal
-- sino un nivel ponderado A sobre el espectro. La v4 guardaba una cifra que no
-- distinguía un motor de una voz; la v5 guarda una que sí.
--
-- Se sube de versión por el mismo motivo que la v4 a la v3: cambia el número
-- guardado, no solo la consulta. Mezclar ambas bajo una etiqueta haría que
-- `measurement_version = 5` significara dos cosas distintas según la fecha.
--
-- -----------------------------------------------------------------------------
-- Por qué la RPC también cambia de nombre
-- -----------------------------------------------------------------------------
--
-- Filtra solo v5: no mezcla energía ponderada A con RMS sin ponderar.
-- Y tiene que ser otra porque **reescribir una RPC ya aplicada rompe a quien la
-- tenga desplegada**: el frontend viejo seguiría llamando a `noise_map_cells_v4`, y si
-- esa función Passara a filtrar por la 5, leería cero celdas durante la ventana de
-- despliegue. Con las dos funciones vivas, cada versión del frontend llama a la suya
-- y el mapa sigue funcionando durante el despliegue.
--
-- La v4 sigue existiendo, y sigue leyendo las v3 y v4.

begin;

alter table public.noise_measurements drop constraint if exists noise_measurements_method_check;
alter table public.noise_measurements add constraint noise_measurements_method_check
  check (
    (measurement_version is null and capture_profile is null)
    or (measurement_version is not null and measurement_version in (2, 3, 4, 5)
      and capture_profile is not null
      and capture_profile in ('unprocessed', 'processed', 'unknown')
      and db_level between 30 and 95)
  ) not valid;
alter table public.noise_measurements validate constraint noise_measurements_method_check;

alter table public.noise_sessions drop constraint if exists noise_sessions_method_check;
alter table public.noise_sessions add constraint noise_sessions_method_check
  check (
    (measurement_version is null and capture_profile is null)
    or (measurement_version is not null and measurement_version in (2, 3, 4, 5)
      and capture_profile is not null
      and capture_profile in ('unprocessed', 'processed', 'unknown')
      and avg_db between 30 and 95)
  ) not valid;
alter table public.noise_sessions validate constraint noise_sessions_method_check;

comment on column public.noise_measurements.measurement_version is
  '5: nivel digital ponderado A, promedio movil de energia de 3 s. 4: promedio energetico de RMS sin ponderar. 3: RMS de 1 s con media aritmetica. 2: ventanas 2048 y suavizado. NULL: desconocido. Ninguno es SPL calibrado ni una certificacion IEC.';
comment on column public.noise_sessions.measurement_version is
  '5: promedio energetico (L_Aeq) de una sesion de mediciones ponderadas A. 4: promedio energetico de lecturas sin ponderar. 3 y anteriores: media aritmetica de indices.';

create or replace function public.noise_map_cells_v5(
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
      round((
        10 * log10(avg(power(10, greatest(m.db_level, 1)::double precision / 10)))
      )::numeric)::integer as avg_index,
      max(m.created_at) as last_at,
      count(*) as samples
    from public.noise_measurements m
    where m.measurement_version = 5
      and m.created_at >= greatest(p_since, now() - interval '90 days')
      and m.created_at < least(p_until, now())
      and m.latitude between least(p_south, p_north) and greatest(p_south, p_north)
      and m.longitude between least(p_west, p_east) and greatest(p_west, p_east)
      and (p_time_filter is null or p_time_filter <> 'noche'
        or (
          extract(hour from m.created_at at time zone 'America/Bogota') >= 18
          or extract(hour from m.created_at at time zone 'America/Bogota') < 6
        ))
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
revoke all on function public.noise_map_cells_v5(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.noise_map_cells_v5(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;

do $$
declare
  v_columna text;
begin
  select data_type into v_columna
  from information_schema.columns
  where table_name = 'noise_measurements' and column_name = 'measurement_version';

  if v_columna is null then
    raise warning 'No se encuentra noise_measurements. Revisa que se aplico el esquema antes.';
  else
    raise notice 'OK: la v5 acepta mediciones ponderadas A y la RPC v5 existe.';
  end if;
end;
$$;
