# Arquitectura y contratos

## Componentes

Aplicación estática con scripts clásicos que comparten estado. `index.html`
carga Leaflet, sus plugins y el SDK de Supabase antes de los scripts locales:

```text
config.local.js → config.js → map.js → audio.js → community.js → app.js → features.js
```

| Componente | Responsabilidad |
| --- | --- |
| `js/config.js` | Cliente público Supabase, constantes, estado y utilidades. |
| `js/map.js` | Leaflet, ubicación y ciclo de vida de capas de calor. |
| `js/audio.js` | Micrófono, cálculo del índice y resumen de sesión. |
| `js/community.js` | Celdas visibles, filtros, exportación y envío periódico. |
| `js/app.js` | Navegación, controles y eventos principales. |
| `js/features.js` | Estadísticas, reportes, confirmaciones, comparación, retos, idiomas y cola offline. |
| `sw.js`, `manifest.webmanifest` | Caché de recursos y configuración PWA. |
| `setup.sql`, `migrations/` | Esquema, políticas, funciones y cambios de base de datos. |
| `supabase/functions/cleanup-noise-photos/` | Autenticación del trabajo de limpieza y borrado de fotos caducadas. |
| `scripts/`, `build-config.js` | Verificación y empaquetado con Node.js. |

`js/kalman.js` y `src/test.js` existen pero no se cargan en la página. No asumir
que el filtro Kalman está activo. Los estilos siguen el orden de `index.html`.

## Contratos de datos

| Dato | Contrato |
| --- | --- |
| Posición del mapa | `{lat, lng}` en grados; `currentPosition` puede incluir precisión. |
| Registro SQL | `{latitude, longitude}` en grados, aproximados antes de compartir. |
| `CELL_SIZE_M` | Cuadrícula de unos 70 metros. Volver a aplicar `snapToGrid` conserva la celda. |
| `AGG_GRID` | Agrupación para análisis en grados; diferente de la celda de privacidad en metros. |
| `db_level`, `avg_db` | Nombres históricos que contienen un índice relativo del micrófono. |
| Categoría | `bajo` <55, `moderado` entre 55 y 70, `alto` >70. |
| Periodo del mapa | `history`: 90 días; `live`: 24 horas. |
| Franja del mapa | `all`, `morning`, `afternoon`, `night`; la RPC aplica hora de Colombia. |

El índice no es dB(A) calibrado ni demuestra cumplimiento de límites legales.
Una capa vacía significa falta de datos para el área y filtros seleccionados;
no demuestra que la zona sea silenciosa.

## Flujos que requieren cuidado

### Mediciones y concurrencia

Cada diez segundos, si se comparte y hay posición, `sendMeasurementIfDue`
reserva la ventana de muestras y envía su promedio. Las muestras recibidas
mientras espera entran en otra ventana. Si no se acepta el envío ni se guarda
en la cola, devuelve las muestras reservadas al acumulador. `pending` evita
dos envíos simultáneos de la misma ventana.

`loadCommunityPoints` consulta `noise_map_cells` por límites del mapa, fechas y
franja, con páginas de hasta 1.000 celdas. El token de petición descarta respuestas
anteriores al último movimiento/filtro. Los paneles asíncronos comprueban que
su destino siga montado antes de mostrar resultados.

### Leaflet

La capa de calor se añade al mapa antes de redibujar. Al ocultar la vista se
retiran sus capas; al mostrarla se comprueba que el contenedor tenga tamaño antes
de invalidar/dibujar el canvas. Esto protege frente a `_animating` nulo y canvas
con ancho cero.

### Cola offline

IndexedDB (`acoustimap-offline-v2`, almacén `outbox`) conserva tabla, payload,
UUID, fecha de encolado y foto opcional. El respaldo en localStorage admite
hasta 100 registros y no admite fotos. El navegador o el usuario pueden borrar
este almacenamiento; no es una copia de seguridad.

La sincronización es secuencial: se detiene en el primer error y reintenta al
iniciar la app o recuperar conexión. Conserva UUID y considera `23505` un registro
ya recibido. Revisar este supuesto si se añaden restricciones únicas a las tablas.

La confirmación genera un hash por identificador local, celda y hora. No envía
el identificador como campo `client_id`; no es autenticación ni impide utilizar
otro navegador. Al reconstruirla se convierte el formato SQL al del mapa.

### Privacidad y retención

El código no transmite audio. Los envíos usan posiciones aproximadas y las rutas
de fotos usan UUID de reporte. La clave pública no sustituye las políticas RLS.
El mensaje de inicialización del SDK no verifica conexión real ni migraciones.

La migración define retención de 90 días para mediciones/sesiones, 30 para
reportes y 24 horas para confirmaciones. La ejecución efectiva depende de los
trabajos configurados en Supabase. La limpieza borra primero objetos de Storage
y después filas; si Storage falla, conserva referencias. El código cliente
no permite inferir la política de logs del proveedor.

## Entrega

`build-config.js` genera configuración pública. `build-site.js` selecciona los
recursos de `dist/`; SQL, pruebas, Graphify y funciones de servidor quedan fuera
del artefacto web. Publicar Pages no aplica migraciones ni despliega Edge Functions.
