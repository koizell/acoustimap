# Kanban: medidor y mapa en local

Fecha: 2026-10-06. Límite de trabajo en curso: **una tarjeta de corrección**.
No se publica, no se ejecuta SQL remoto y no se sustituyen datos reales por pruebas.

## Criterios de terminado

- Reproducción antes de corregir, prueba de regresión y comprobación en Chromium.
- Capturas en 320/390/504/1440 px, claro/oscuro; sin controles solapados.
- Señales digitales conocidas: silencio, amplitud constante, escalón y pico breve.
- Calor: el color expresa el índice suavizado, no la suma del número de celdas.
- Puntos: índice/cantidad legibles; no capas duplicadas ni etiquetas masivas solapadas.
- Ninguna UI dice «Compartiendo» si no se puede publicar.
- Un micrófono físico no se da por validado con señales simuladas.

## Pendiente

- Sin correcciones pendientes dentro del alcance; quedan los bloqueos reales.

## En revisión

- Sin tarjetas activas.

## Verificado

- **K1 — Diagnóstico inicial.** En la captura el mapa está desconectado de
  Supabase; ese vacío no prueba un fallo de Leaflet. El valor 63 procede de
  `dBFS + 100`, no de 63 dB SPL. La captura no establece el nivel acústico real.
- **K2 — Color del calor.** Reproducido: veinte celdas de índice 40 llegaban
  a intensidad 1. Corregido: media espacial ponderada, opacidad por cobertura
  máxima y color independiente del fundido. Una/veinte celdas: mismo RGBA en
  Chromium (`95, 201, 50, 180`). Seis pruebas unitarias de raster aprobadas.
- **K3 — Estado de compartir.** GPS ya no implica publicación. Se distinguen
  GPS, espera de lectura, envío, cola local, confirmación y error. Respuestas
  de una activación anterior no cambian el estado de la nueva.
- **K6 — Presentación del medidor.** Número y fórmula intactos. «Índice
  moderado» en vez de atribuir «Moderado» al ambiente; sin calibrar, dBFS y
  tratamientos activos/no verificables visibles sin abrir los detalles.
- **K5 — Puntos y controles.** Halo ≤35 m y círculo ~29 m en vez de 90/50 m;
  etiquetas desde zoom 16 con espacio. 24 capturas revisadas con Chromium/axe
  en 320/390/504/1440 px, claro/oscuro y tres estados. Sin desbordamiento ni
  incidencias WCAG A/AA detectadas; no equivale a certificación completa.
- **K7 — Puerta final.** 138 pruebas y sintaxis de 40 archivos aprobadas.
  8 flujos de mapa y 18 generales aprobados. Señal digital cero/0.01/0.1/0.01
  dio 30/57/77/57; pico de 50 ms vuelve a su base. Capturas y señales de prueba
  no prueban sensibilidad/calibración física ni publicaciones reales.

## Bloqueado

- **B1 — Sensibilidad del micrófono físico.** Falta verificar RMS/dBFS y ajustes
  de captura en el equipo del usuario: ambiente estable, voz a distancia y
  regreso al ambiente, con Compartir desactivado. No se resta un «silencio»
  supuesto ni se cambia la ganancia para producir números más agradables.

## Fuera del alcance

- **K4 — Vista personal sin backend.** No se añadió una vista de sesión privada
  nueva. El mapa comunitario ahora usa configuración real y se verificó con
  aportes v3 reales; los casos sin backend se prueban por separado.

## Verificación adicional v44

- **K8 — Conexión raíz/artefacto.** Configuración idéntica sin placeholders,
  lectura RPC real HTTP 200 con 2 zonas; Calor/Puntos probados en ambos. Aviso
  persistente de estado/versión y build que rechaza artefactos desconectados.
  El bloqueo B2 se resolvió cuando el usuario aplicó la migración v3.
- **K9 — Navegador actual.** Chrome de Windows abierto y ventana v44 confirmada;
  endpoint local servido por la raíz correcta. `npm run dev` abre automáticamente
  el navegador y evita caché HTTP. Se conservan preferencias y cola offline.
- **K10 — Regresiones.** 148 pruebas y sintaxis de 44 archivos aprobadas;
  matriz real de 16 estados (raíz/artefacto × 4 anchos × 2 temas), sin incidencias
  axe A/AA detectadas. Comprobaciones de red/carga/permisos separadas con fixtures.
- **K11 — PWA publicada.** Host seguro de previsualización con rama de producción:
  caché v44, recarga sin red, configuración pública válida y AudioWorklet offline
  comprobados. Micrófono sintético con Compartir desactivado; sin errores JS.
