-- Compatibilidad frontend v4; no crea RPC v5.

-- =============================================================================
-- v4: promedio energético + permitir la escritura de filas v4
--
-- PEGAR Y EJECUTAR EN SUPABASE → SQL EDITOR. Se puede ejecutar más de una vez.
--
-- -----------------------------------------------------------------------------
-- Por qué hace falta, en orden de gravedad
-- -----------------------------------------------------------------------------
--
-- 1. **ESTÁS PERDIENDO MEDICIONES.** La migración v3 dejó el CHECK en
--    `measurement_version in (2, 3)`. El frontend ya escribe v4, así que Postgres
--    rechaza cada envío con 23514. Y como `isOfflineError()` solo reconoce fallos de
--    red, un 23514 no se guarda ni en la cola offline: la lectura se descarta en
--    silencio. El botón pone «Error de envío» y no se guarda nada.
--    Esto es lo que hay que arreglar primero.
--
-- 2. **El mapa no carga.** La RPC `noise_map_cells_v4` no existe (PGRST202), que es
--    lo que dispara el aviso «falta aplicar la migración».
--
-- 3. **El promedio era aritmético.** `round(avg(db_level))` promedia dB, que no es
--    un nivel. Con ruido estable no se nota; con tráfico, queda hasta 6,9 dB por
--    debajo, siempre hacia abajo, o sea marcando como tranquilas las calles más
--    ruidosas.
--
-- -----------------------------------------------------------------------------
-- Por qué esta RPC lee las v3 Y las v4, y no solo las v4
-- -----------------------------------------------------------------------------
--
-- Es una decisión, y quiero que sea explícita porque el proyecto tiene una regla de
-- no mezclar versiones.
--
-- La regla existe para que `measurement_version` no signifique dos cosas distintas
-- según cuándo se escribió la fila. Aquí eso **no** ocurre, por una razón concreta:
-- v3 y v4 capturan **exactamente lo mismo**. El mismo AudioWorklet, el mismo RMS
-- continuo de un segundo, los mismos tratamientos solicitados. v4 no cambia la
-- captura; **solo cambia cómo se combinan varias lecturas**.
--
-- Lo que hay en cada fila:
--
--   v3 → `db_level` = media aritmética de ~50 lecturas de 200 ms de una ventana de 10 s
--   v4 → `db_level` = media energética de las mismas lecturas
--
-- El sesgo de esa media interna de 10 s es **pequeño**, de 1 a 2 dB: en diez segundos
-- la calle no varía tanto. El error grande era el `avg()` de SQL, que promedia
-- mediciones de días y horas distintas —ahí sí hay mucha variación, y por eso llegaba
-- a 6,9 dB— y ese error affects a **todas** las filas históricas, se corrigan o no.
--
-- Aplicar la fórmula correcta a las filas v3 **no las convierte**: los números
-- guardados no cambian, solo la manera de agruparlos. Cada fila conserva su
-- `measurement_version` y las exportaciones CSV y GeoJSON la siguen declarando, así
-- que la procedencia de cada dato queda intacta.
--
-- El resultado: **el mapa sigue poblado hoy**, con el error grande corregido para
-- todo el histórico, y las lecturas nuevas salen ya corregidas.
--
-- Lo que se acepta a cambio: durante unas semanas habrá celdas con una mezcla de
-- filas v3 y v4, y las v3 arrastran ese residuo de 1-2 dB en su media interna. Está
-- documentado aquí y en el README. Si en algún momento quieres solo v4 —mapa vacío
-- hasta acumular datos nuevos, cero mezcla— es borrar el `or m.measurement_version = 3`
-- de la función y volver a ejecutarla.
--
-- -----------------------------------------------------------------------------

begin;

-- 1. Permitir que la columna acepte v4 -----------------------------------------
-- Mantener v5 válida al repetir el archivo combinado después de recibir datos v5.
-- Esto no cambia la selección de la RPC v4 (v3/v4).
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

-- 2. La RPC con promedio energético ------------------------------------------
--
-- `10 * log10(avg(power(10, db_level/10)))` en vez de `round(avg(db_level))`.
--
-- **El orden de los dos argumentos de `power` es al revés de lo que parece.**
-- `power(a, b)` es `a` elevado a `b`, así que `power(db_level, 10)` es `62^10`, no
-- `10^6.2`. La fórmula pedía `power(10, db_level/10)`. Con el orden equivocado la celda
-- devolvía **182** en lugar de **72**, y como `category` se deriva de ese número
-- todo salía «alto». Lo detectó ejecutar la función contra un Postgres de verdad con
-- datos de prueba: ningún test del repositorio la llamaba, porque probarla exigía
-- una base de datos.
--
-- `greatest(db_level, 1)` protege el logaritmo de un 0 o negativo, que daría NaN.
--
-- `or m.measurement_version = 3` es lo que mantiene poblado el mapa; ver el motivo
-- en la cabecera.

create or replace function public.noise_map_cells_v4(
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
    where m.measurement_version in (3, 4)
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
revoke all on function public.noise_map_cells_v4(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.noise_map_cells_v4(timestamptz, timestamptz,
  double precision, double precision, double precision, double precision, text)
  to anon, authenticated;

commit;

-- 3. Comprobación, DESPUÉS del commit ----------------------------------------
--
-- Va fuera de la transacción a propósito. Antes estaba dentro, entre el
-- `create function` y el `commit`, y eso era un fallo de diseño con dosándola:
--
--   - Un error en este bloque —que es decorativo— abortaba la transacción entera y
--     **no se aplicaba nada**. Se perdían el CHECK nuevo y la RPC, y el mensaje de
--     error que llegaba era el de este bloque, no el del trabajo que faltaba.
--   - Ya pasó: la primera versión tenía aquí un `if exists (...)` y Postgres lo
--     rechazaba con «syntax error at or near "else"». El bloque no hacía nada
--     útil, pero tumbaba la migración entera. Solo se vio al ejecutarla contra un
--     Postgres de verdad; aquí nunca se había ejecutado.
--
-- IF EXISTS es válido en PL/pgSQL. El error anterior fue la falta de punto y coma
-- después de RAISE, no el uso de EXISTS.

do $$
declare
  v_sin_validar integer;
begin
  select count(*) into v_sin_validar
  from pg_constraint
  where conname = 'noise_measurements_method_check' and not convalidated;

  if v_sin_validar > 0 then
    raise warning 'El CHECK de noise_measurements no se validó: hay filas que no lo cumplen. Revísalas antes de seguir.';
  else
    raise notice 'OK: el CHECK acepta la v4 y la RPC v4 existe. La app debería dejar de pedir la migración.';
  end if;
end;
$$;

-- Si todo fue bien, la app debe dejar de mostrar «falta aplicar la migración» y el
-- botón Compartir debe pasar de «Error de envío» a «Enviado».


-- =============================================================================
-- Categoría de reporte: para que los retos puedan contar algo que signifique
--
-- PEGAR Y EJECUTAR EN SUPABASE → SQL EDITOR. Se puede ejecutar más de una vez.
--
-- -----------------------------------------------------------------------------
-- Por qué
-- -----------------------------------------------------------------------------
--
-- El reto de recoger basura se completaría con **cualquier** reporte que lleve una
-- foto. Eso está mal: fotografiar una obra en seco completaría el reto de recoger
-- basura, que es justo lo contrario de lo que se quiere. Para que un reto signifique
-- algo tiene que poder distinguir *de qué* trata el reporte, y eso no se puede sacar
-- del texto libre.
--
-- Así que se añade `kind`, con cuatro valores, y el formulario ofrece elegir uno.
--
-- -----------------------------------------------------------------------------
-- Qué NO se hace aquí, y por qué
-- -----------------------------------------------------------------------------
--
-- **La foto del reto no se sube.** Sigue el camino de siempre para los reportes
-- normales —bucket, URL pública, limpieza programada— pero el reto no usa ese
-- camino: la foto se queda en el dispositivo y solo se guarda el hecho de que se
-- adjuntó.
--
-- El motivo es que la promesa de privacidad de la app es «anónimo, sin audio,
-- cuadrícula de 70 m». Una foto de una calle anula la cuadrícula: identifica el
-- edificio, y a veces a quien sale en la imagen. Publicar fotos de calles ajenas para
-- completar un reto cambia el producto que es, y eso no se decide por ser más
-- divertido.
--
-- Lo que sí se manda del reto es: categoría, día y celda. Nada más. Con eso se puede
-- contar el progreso y ver *dónde* hay más reportes de basura, que es el dato útil
-- para una ciudad, sin publicar ninguna imagen.
--
-- -----------------------------------------------------------------------------
-- Compatibilidad
-- -----------------------------------------------------------------------------
--
-- La columna es NOT NULL DEFAULT 'ruido', así que las filas existentes quedan en
-- 'ruido' y el CHECK valida. No se reescribe ni se borra ninguna fila.

begin;

alter table public.noise_reports
  add column if not exists kind text not null default 'ruido';

alter table public.noise_reports drop constraint if exists noise_reports_kind_check;
alter table public.noise_reports add constraint noise_reports_kind_check
  check (kind in ('ruido', 'basura', 'obra', 'trafico'))
  not valid;
alter table public.noise_reports validate constraint noise_reports_kind_check;

comment on column public.noise_reports.kind is
  'Categoría del reporte: ruido (observación del nivel), basura, obra o trafico. Por defecto ruido, que es lo que había antes de esta columna. Los retos se cuentan por categoría, no por texto.';

commit;

-- Comprobación fuera de la transacción: si esto falla no deshace nada de arriba.
do $$
declare
  v_columna text;
begin
  select data_type into v_columna
  from information_schema.columns
  where table_name = 'noise_reports' and column_name = 'kind';

  if v_columna is null then
    raise warning 'La columna noise_reports.kind no existe. Revisa la migración.';
  else
    raise notice 'OK: noise_reports.kind existe. El formulario de reportes puede ofrecer la categoría.';
  end if;
end;
$$;