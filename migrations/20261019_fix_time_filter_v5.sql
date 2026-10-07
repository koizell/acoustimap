-- Corrige el filtro de franja horaria de la RPC del mapa (v5).
--
-- La version anterior comparaba con 'noche':
--     and (p_time_filter is null or p_time_filter <> 'noche' or (...))
-- pero el cliente envia 'all'/'morning'/'afternoon'/'night'. Como nunca llega
-- 'noche', `p_time_filter <> 'noche'` era siempre verdadera y la franja no se
-- aplicaba: Todo, Manana, Tarde y Noche devolvian exactamente el mismo conjunto.
--
-- Los cortes deben coincidir con CO_TIME_BANDS de js/config.js:
--   morning    06:00-11:59
--   afternoon  12:00-17:59
--   night      >=18:00 o <06:00 (envuelve medianoche)
-- Siempre en hora de Colombia (America/Bogota), no la del dispositivo.
--
-- No se borran ni se modifican datos: solo se reemplaza el cuerpo de la funcion.
-- version: 5 (misma firma y mismo metodo; solo cambia el filtro horario).

begin;

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
      and (
        p_time_filter is null
        or p_time_filter = 'all'
        or (p_time_filter = 'morning'
          and extract(hour from m.created_at at time zone 'America/Bogota') between 6 and 11)
        or (p_time_filter = 'afternoon'
          and extract(hour from m.created_at at time zone 'America/Bogota') between 12 and 17)
        or (p_time_filter = 'night'
          and (
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

-- Los permisos se conservan: la RPC la invoca el cliente anonimo.
revoke all on function public.noise_map_cells_v5(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.noise_map_cells_v5(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;

do $$
begin
  raise notice 'OK: noise_map_cells_v5 aplica manana, tarde y noche en hora de Colombia.';
end;
$$;
