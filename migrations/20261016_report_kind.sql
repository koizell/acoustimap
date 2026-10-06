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