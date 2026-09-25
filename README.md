# AcoustiMap

Mapa colaborativo de patrones de ruido. [Abrir demo](https://koizell.github.io/acoustimap/).

## Qué mide

La aplicación usa la Web Audio API para calcular un **índice relativo de ruido** en tiempo real. No graba audio. La escala conserva los umbrales históricos de la interfaz: bajo (<55), moderado (55–70) y alto (>70). **Los valores no son decibelios calibrados (dB SPL)** y no sirven para evaluar exposición, cumplimiento normativo ni riesgo para la salud. Los dispositivos y navegadores pueden producir valores distintos ante el mismo sonido.

Con consentimiento, se envía cada 10 segundos el promedio del índice, la categoría y una ubicación anclada a una cuadrícula aproximada de 70 m. El mapa consulta celdas agregadas del área visible: últimas 24 horas en «En vivo» o hasta 90 días en «Historial», y vuelve a consultar al moverlo. Las franjas usan la hora de Colombia (UTC−5) para todos los visitantes. También permite comparar meses, registrar reportes y exportar CSV o GeoJSON. Las exportaciones llaman `noise_index` al valor. La columna de base de datos `db_level` conserva su nombre anterior por compatibilidad, pero representa el mismo índice relativo.

## Privacidad y retención

- El audio y la ubicación exacta no se envían al servidor. La base de datos valida la cuadrícula de las coordenadas nuevas.
- No se envía un identificador estable del navegador. Los retos personales se calculan en el almacenamiento local de ese dispositivo; se pierden si se limpia ese almacenamiento.
- Las confirmaciones usan una clave SHA-256 derivada de un secreto local, celda y hora. Las fotos se guardan bajo el UUID aleatorio de cada reporte. Las fotos adjuntas a reportes son públicas mientras el reporte esté vigente.
- Mediciones y sesiones se conservan 90 días; confirmaciones, 24 horas; reportes, 30 días. Una Edge Function borra las fotos mediante Storage API antes de borrar sus reportes. También retira fotos huérfanas después de un día.
- La migración borra los `client_id` históricos, ancla las coordenadas antiguas a la cuadrícula y restringe las escrituras nuevas. Los enlaces de fotos antiguas que incluían ese identificador se retiran del reporte; la limpieza programada elimina esos archivos del bucket.

## Desarrollo local

Sirve el repositorio desde localhost para probar la interfaz. El micrófono y la geolocalización requieren un contexto seguro (HTTPS o localhost). Ejecuta `npm test` y `node --check` en los scripts de `js/` y en `sw.js` antes de publicar.

## Publicación en GitHub Pages

El flujo [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publica la rama `main` en [koizell.github.io/acoustimap](https://koizell.github.io/acoustimap/). Necesita los secretos de Actions `SUPABASE_URL` y `SUPABASE_ANON_KEY` para generar `js/config.local.js` durante el build. Aplica y verifica primero las migraciones de Supabase de la sección siguiente; después publica el frontend. El service worker cambia de versión para renovar los recursos guardados; si había una pestaña abierta antes del despliegue, recárgala.

## Despliegue de Supabase

Para un proyecto nuevo, ejecuta en el SQL Editor de Supabase, en este orden:

1. [`setup.sql`](setup.sql)
2. [`migrations/20260923_complete_features.sql`](migrations/20260923_complete_features.sql)
3. [`migrations/20260925_privacy_and_retention.sql`](migrations/20260925_privacy_and_retention.sql)

En un proyecto que ya tenga las dos primeras migraciones, ejecuta solo la tercera. Revisa cualquier política RLS adicional creada manualmente: las políticas permisivas de `INSERT` se combinan con OR y pueden eludir las restricciones nuevas. La migración retira las políticas conocidas del repositorio.

Aplica la migración de privacidad y confirma que `noise_map_cells` responde **antes** de publicar este frontend: el mapa nuevo depende de esa función. Después de publicar, recarga las pestañas que hubieran quedado abiertas con la versión anterior; sus fotos usaban rutas con identificadores antiguos y ya no se aceptan en Storage.

Después despliega la Edge Function `cleanup-noise-photos` desde [`supabase/functions/cleanup-noise-photos`](supabase/functions/cleanup-noise-photos) con Supabase CLI y configura un secreto aleatorio `PHOTO_CLEANUP_TOKEN` en los secretos de la función. La función tiene `verify_jwt = false` en [`supabase/config.toml`](supabase/config.toml) y exige ese token en la cabecera `x-cleanup-token` de cada petición; no pongas el token en el frontend.

Crea en Supabase Vault `acoustimap_project_url` (la URL de tu proyecto) y `acoustimap_photo_cleanup_token` (el mismo token de la función). Ejecuta luego [`migrations/20260925_schedule_photo_cleanup.sql`](migrations/20260925_schedule_photo_cleanup.sql). Esta migración configura una invocación por hora mediante `pg_cron` y `pg_net`. La tarea de limpieza de filas sin fotos de `setup.sql` permanece activa.

### Comprobación posterior al despliegue

En el SQL Editor, confirma que las funciones y los trabajos programados existen:

```sql
select jobname, schedule from cron.job
where jobname in ('cleanup-old-noise', 'cleanup-noise-photos');

select conname, convalidated from pg_constraint
where conname like 'noise_%_grid_check' or conname like 'noise_%_no_client_check'
order by conname;

with latitude_cell as (
  select (floor(4.6 / (70.0 / 111000.0)) + 0.5) * (70.0 / 111000.0) as lat
), snapped as (
  select lat,
    (floor(-74.1 / (70.0 / (111000.0 * cos(radians(lat))))) + 0.5)
    * (70.0 / (111000.0 * cos(radians(lat)))) as lng
  from latitude_cell
)
select public.is_noise_grid_cell(lat, lng) as snapped_cell_is_valid,
  public.is_noise_grid_cell(4.6, -74.1) as exact_point_is_valid
from snapped;
```

Los trabajos deben aparecer, las restricciones de cuadrícula e identificador deben tener `convalidated = true`, `snapped_cell_is_valid` debe ser `true` y `exact_point_is_valid`, `false`. Comprueba además que `select * from public.noise_map_cells(now() - interval '1 day', now(), 8.7, 8.8, -75.9, -75.8, 'all') limit 1;` se ejecuta sin error. Desde el navegador, comprueba que el mapa carga, vuelve a consultar al moverlo, una medición se comparte una sola vez por intervalo, las franjas de historial incluyen días anteriores según la hora de Colombia, la comparación mensual abre sin errores, y un reporte con foto se ve. Para comprobar la limpieza sin esperar 30 días, se puede invocar la función con el token y verificar sus contadores; no alteres las fechas de reportes de producción para probarla.

## Stack

HTML, CSS y JavaScript sin framework; Leaflet y OpenStreetMap; Supabase PostgreSQL, Storage y Edge Functions; GitHub Pages.

## Licencia

MIT © [Koizell](https://github.com/koizell)
