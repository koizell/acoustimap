# Verificación local de interfaz y flujos

## Actualización previa a publicación v45 (método v5)

- Puerta local: 191 pruebas aprobadas y sintaxis JavaScript comprobada.
- Build: 20 recursos públicos; configuración local y secretos excluidos de Git.
- FFT ponderada A: 1 kHz/RMS 0,01 produce −40 dBFS; ventana móvil de 3 s.
- Reportes de basura/obra: pruebas de envío y sincronización verifican que no
  suben fotos ni encolan sus bytes; solo cuentan presencia de foto localmente.
- La comprobación anterior en Chromium utilizó señal sintética mediante
  OfflineAudioContext, no el micrófono real ni escrituras remotas.

El resto de este documento es un registro histórico de verificaciones anteriores,
no una afirmación de que esas versiones o todos sus resultados sigan vigentes.

Revisión inicial: 2026-10-05; actualización Kanban: 2026-10-06.
Recursos públicos: versión de caché 44.

## Entorno y alcance

- Servidor HTTP en `http://127.0.0.1:3000`, no `file://`.
- Chromium real automatizado con Playwright, micrófono sintético y GPS simulado.
- Leaflet, Supabase JS, IndexedDB y service worker reales del navegador.
- Interfaz revisada con capturas en 1440×900, 390×844, 320×568 y 844×390.
- Playwright y axe instalados fuera del repositorio; la puerta `npm run check`
  sigue usando únicamente los módulos integrados de Node.

Las operaciones de escritura del navegador se interceptaron con respuestas de
prueba: **no se insertaron mediciones, sesiones, reportes ni confirmaciones en
Supabase real**. Los datos sintéticos permiten comprobar lo que representa la
interfaz, no calibran el micrófono ni representan ambientes físicos.

## Resultados

- `npm run check`: 148 pruebas aprobadas; sintaxis de 44 archivos comprobada.
- `npm run build:site`: artefacto generado con 20 recursos públicos.
- Matriz de 32 estados (8 vistas por 4 tamaños), sin errores de JavaScript,
  desbordamiento horizontal ni infracciones detectadas por axe en las reglas
  WCAG 2 A/AA y 2.1 AA utilizadas. Esto **no certifica** accesibilidad completa.
- Captura y detención del micrófono; diagnóstico RMS/dBFS/índice y liberación
  del stream. Compartir desactivado no provoca escrituras.
- Compartir con GPS: envío automático aproximadamente a los 10 segundos y
  resumen al detener, con coordenadas ancladas, versión/perfil y sin `client_id`.
- Estadísticas: cuatro índices 50, 60, 70 y 80 muestran promedio 65 y una
  lectura alta; comparación con un periodo de índice 40 muestra cambio +25.
- Dibujo de un polígono mediante clics en Leaflet: abre el análisis de zona y
  muestra promedio 65 con las cuatro lecturas incluidas.
- Reporte: conserva la nota al elegir ubicación, valida el tipo de foto y
  muestra el resultado del envío. Confirmación y tendencia regresan a Datos.
- Exportaciones CSV/GeoJSON descargables con versión y perfil de captura.
- Cola offline con IndexedDB: medición, sesión y reporte se conservan y se
  sincronizan una vez al recuperar la conexión en el escenario probado.
- Permisos denegados: el micrófono queda inactivo y el fallo GPS es visible.
- Recarga offline con service worker previamente instalado: la interfaz y los
  retos locales siguen disponibles; no se exige que carguen nuevas teselas.
- Controles y etiquetas en español, inglés y portugués; tema oscuro y textos
  activos de Compartir comprobados también en el artefacto `dist/`.

## Supabase: comprobaciones de solo lectura

Con la configuración anónima pública del sitio existente, respondieron HTTP
200 la RPC `noise_map_cells_v2`, la lectura de `measurement_version` y
`capture_profile` en mediciones/sesiones, y la consulta de reportes. No había
filas v2 en las consultas realizadas. El mapa nuevo puede empezar vacío.

Estas consultas no prueban una inserción real, el almacenamiento de fotos ni
la ejecución de los trabajos de limpieza. No se ejecutó SQL remoto adicional.
La consulta inicial correspondió al método v2; la comprobación posterior v42
encontró la RPC v3 ausente (ver abajo). Antes de publicar hay que aplicar la nueva
migración `migrations/20261005_audio_measurement_v3.sql` y sus comprobaciones.

## Fallos corregidos

- Leyenda recortada/tapada en móvil y cierre superpuesto en escritorio.
- Controles Leaflet desplazados por sumar dos veces la altura del encabezado.
- Panel del medidor encima de los filtros en pantallas horizontales bajas.
- Modales sin gestión de foco/Escape y controles ocultos alcanzables por Tab.
- Barras de retos sin semántica accesible y contraste oscuro de títulos/retos.
- Cambio de idioma duplicando los eventos del mapa, etiquetas de Compartir y
  detalles en el idioma incorrecto y promedio detenido sin actualizar su idioma.
- Avisos GPS sin elemento visible y respuestas tardías tras cancelar Compartir.
- Texto pequeño en las acciones principales y cifras sin ancho uniforme.

Las regresiones de foco, GPS e idioma están en `test/ui-accessibility.test.js`;
el color del título de Salud queda cubierto por `test/styles.test.js`.

## Antes de dar por validado el uso físico

1. Probar Chrome/Android y Safari/iPhone reales, incluidos permisos y orientación.
2. Con Compartir desactivado, observar 20 segundos de ambiente tranquilo,
   conversación a distancia y voz cercana, sin tapar ni rozar el micrófono.
3. Comprobar los tratamientos declarados y que detener apague el indicador de
   uso del micrófono. No atribuir al índice unidades dB SPL ni riesgo clínico.
4. Con consentimiento para compartir, comprobar un aporte real anclado en
   Supabase y su aparición en el mapa v3; verificar una foto si se va a utilizar.

La configuración local y el artefacto local usan placeholders: **no publicar
ese `dist/` directamente**. El despliegue debe generar la configuración real
con `build:config`, como hace el flujo de CI. No se realizaron commits, push
ni despliegues durante esta verificación.

## Rediseño del medidor compacto (v39)

Se consultaron el catálogo MCP de 21st (paneles flotantes y controles de mapa),
el tema gratuito [Teal Mist](https://21st.dev/community/themes/teal-mist) y las
guías de [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).
Se adaptaron las referencias a HTML/CSS/JS clásicos, sin React ni Tailwind.

- Paleta: acción verde petróleo `#0b6f6a`, superficies blancas, texto
  `#17313b`, secundario `#526b74` y bordes `#dae3e4`; categorías conservan
  verde/ámbar/rojo y sus umbrales. Los colores de estado no son límites sanitarios.
- Tipografía Inter: peso 500 en etiquetas, 600 en cifras y números tabulares.
- Lectura, categoría, promedio y acciones siempre visibles; advertencia breve
  de escala relativa. Instrucciones, muestras y ajustes técnicos plegados en
  «Detalles y ayuda», también en escritorio.
- Panel en la esquina inferior derecha en escritorio y debajo del mapa en
  móvil; encabezado móvil más corto y acciones de al menos 44 px de alto.
- [Motion](https://motion.dev/docs/quick-start) 14.0.0, sin bundler: entradas y
  aperturas de 220 ms con opacidad/desplazamiento de 8 px. No anima cifras
  ni modifica el cálculo o la sensibilidad del micrófono.
- La animación se omite con `prefers-reduced-motion`; cambiar esa preferencia
  cancela las animaciones activas. Si falla el CDN, los controles siguen usables.
- Motion entra en la caché externa opcional del service worker, no bloquea su
  instalación si falla la descarga.

Regresiones nuevas: `test/compact-meter.test.js` y el caso de diagnóstico
compacto en `test/audio-meter.test.js`. La captura física y las escrituras en
Supabase siguen fuera del alcance de las simulaciones locales.

El rediseño se verificó en los cuatro tamaños, los tres idiomas y ambos temas.
También se comprobó que los detalles se puedan abrir y recorrer, que el texto
de Compartir no se recorte, y que la UI funcione tanto con movimiento reducido
como con el CDN de Motion bloqueado. Los 18 flujos de navegador con datos
sintéticos y las comprobaciones de permisos/PWA volvieron a pasar.

## Ajuste del comportamiento de lectura (método v3, caché v40)

- Se reemplazaron las ventanas discontinuas de 2048 muestras y el suavizado
  de amplitud por RMS continuo de una ventana móvil de 1 segundo.
- El procesador real está en `js/audio-level-processor.js`; entrega cinco
  resúmenes por segundo de audio, sin depender de temporizadores de la UI.
- No hay corrección inventada, compensación automática del silencio ni cambio
  de la fórmula de escala. Las señales constantes mantienen su RMS; los picos
  breves aportan energía en proporción a su duración y no se ocultan si recortan.
- Al arrancar o recuperar una suspensión espera otra ventana completa. Los
  mensajes atrasados, repetidos o de una captura anterior no añaden mediciones.
- Un track silenciado por el navegador no se registra como ambiente silencioso.
- No reproduce sonido, graba audio ni transmite búferes. Para equipos sin
  AudioWorklet muestra un error, libera el micrófono y no sustituye el método.
- `test/audio-energy.test.js` ejecuta el procesador real con señales sintéticas,
  44.1/48 kHz, cambios sostenidos, picos de 50 ms, dos canales y reinicios.
- La migración v3 se verificó en PostgreSQL local con PGlite: se puede repetir,
  las restricciones se validan, NULL/v2 se conservan, la RPC v3 no mezcla v2
  y el rol anónimo sigue sin acceso a `client_id`. No se aplicó remotamente.
- La captura AudioWorklet v3, los diagnósticos y la detención se comprobaron
  también en Chromium real con micrófono sintético. Esto no certifica la
  respuesta de un micrófono físico ni convierte el índice en dB SPL.
- En el mismo navegador se inyectó un WAV PCM con tono de amplitud conocida:
  0.01 → 0.1 → 0.01 produjo índices 57 → 77 → 57. Aumentar diez veces la
  amplitud eleva 20 dB la señal digital; al volver, no quedan compensaciones
  aprendidas ni cambios arbitrarios de ganancia.
- Los 18 flujos se repitieron con metadatos/RPC v3 simulados y pasaron. La PWA
  pudo arrancar AudioWorklet y medir sin red con el módulo previamente cacheado.

## Rediseño del Resumen (caché v41)

- Referencias consultadas en 21st: [Stats cards with links](https://21st.dev/@ephraimduncan/components/stats-cards-with-links),
  [Dashboard Stats Skeleton](https://21st.dev/@cnippet-dev/components/v-skeleton-4)
  y [Empty Background](https://21st.dev/@uiable/components/empty-background).
  Adaptación propia en HTML/CSS/JS clásico; no se compró ni instaló código React.
- UI/UX Pro Max: tarjetas KPI, jerarquía de encabezados, estados vacíos con
  acción, indicador accesible de carga y controles enfocados por teclado.
  Se conservaron Inter y la paleta teal del proyecto, no el layout comercial
  genérico sugerido por el generador.
- Tres métricas compactas; rankings en tarjetas; alertas y reportes plegables.
  El resumen diferencia carga, ausencia de aportes, backend sin configurar y
  error de consulta, sin repetir mensajes en listas vacías ni inventar ceros.
- No modifica la medición, los promedios aritméticos, el filtro v3 ni Supabase.
- Chromium + axe: 32 estados (4 estados de datos × 4 tamaños × claro/oscuro),
  sin desbordamiento horizontal ni incidencias WCAG A/AA detectadas en Datos.
  Se comprobaron reintento, regreso al mapa, respuesta tardía al cambiar de
  sección, copy es/en/pt, detalles por teclado y backend ausente. Los datos
  y errores se simularon; no hubo escrituras en Supabase real.

## Revisión de Calor/Puntos (caché v42)

Revisión del contrato HTML/CSS y de `config.js`, `map.js`, `community.js`, las
rutas de mapa de `app.js`/`features.js`, la RPC v3, el empaquetado y `sw.js`.

Fallos reproducidos antes de corregir:

- Leaflet.heat 0.2.0 atenúa por zoom. Con `maxZoom: 17`, una celda de índice
  95 normalizada a 1 entraba al dibujo como 0.125 en el zoom inicial 14.
  Se desactivó esa atenuación (`maxZoom: 0`) sin modificar mediciones ni escala.
- `comparisonMode` seguía activo al seleccionar Puntos/Calor o filtros: la
  capa de comparación sustituía la vista solicitada. Ahora los controles
  normales terminan Comparar; Comparar también respeta Puntos y agrega celdas.
- Los callbacks de tamaño y los RAF de Leaflet.heat podían repintar conjuntos
  antiguos o acceder a un mapa ya retirado. Ahora se invalidan/cancelan; al
  volver de otra pestaña se restaura la última carga antes de consultar la red.
- El envío en Historial añadía círculos incluso en Calor. En vivo añadía datos
  sin volver a agregar la celda y sin respetar la franja elegida. Tras una
  inserción confirmada se consulta la RPC; la cola offline no se pinta como
  una publicación recibida por Supabase.
- RPC inexistente, consulta vacía y falta de backend se distinguen con un
  aviso visible y traducido. Se corrigió el fallback HTML que aún decía v2.

El calor sigue siendo una visualización suavizada: los halos de celdas próximas
se superponen. Para leer el índice y el número de mediciones de una celda se
utiliza Puntos; el color de cada píxel del halo no es otra medición acústica.

Pruebas específicas: `test/map-visual-modes.test.js` cubre 10 regresiones.
Chromium real aprobó 8 flujos adicionales: zoom 12/14/17/19, 20 alternancias
Calor/Puntos, salida de Comparar, Limpiar sin polígono, filtros y consultas
atrasadas, respuesta con el mapa oculto, red caída/RPC ausente e inserciones
simuladas en ambos periodos y visualizaciones. Sin errores de JavaScript.
Las comprobaciones de envío no escribieron en Supabase real.
Los 18 flujos generales volvieron a pasar tras la corrección. El aviso visible
se comprobó a 320/390/1440 px en claro/oscuro: no tapa los controles de zoom
y axe no detectó incidencias WCAG A/AA en el mapa.

### Comprobación remota de solo lectura

El sitio publicado seguía sirviendo recursos v35 al revisar. Con su configuración
pública se consultaron RPC y registros sin ejecutar SQL ni insertar datos:

- `noise_map_cells`: HTTP 200, 22 celdas en el área consultada de Montería.
- `noise_map_cells_v2`: HTTP 200, sin celdas en esa área.
- `noise_map_cells_v3`: HTTP 404, `PGRST202` (función no disponible).
- Se encontraron registros de versión NULL; las consultas limitadas para
  versiones 2/3 no devolvieron registros.

**La publicación v3 continúa bloqueada por su migración pendiente.** No se
rellena el mapa con datos NULL/v2 ni se cambia su versión para disimularlo.
No se aplicaron migraciones ni se desplegó el frontend en esta revisión.

## Revisión Kanban (2026-10-06, caché v43)

Tablero y bloqueos: `docs/KANBAN_REVISION_LOCAL.md`.

- Calor deja de sumar densidad: media ponderada espacial del índice y cobertura
  máxima para opacidad. Los bordes no cambian un índice alto a color bajo.
  No se altera `rmsToIndex`, el procesador v3 ni ningún dato almacenado.
- Puntos limita el halo a media celda (~35 m) y el círculo principal a ~29 m,
  evitando la anterior huella de 90 m. Etiquetas permanentes desde zoom 16 con
  separación visual; cada marcador mantiene popup con índice y cantidad.
- GPS deja de implicar «Compartiendo»: espera, envío, cola, confirmación y error
  tienen estados distintos. Una respuesta anterior no cambia otra activación.
  Sin backend se aclara que la cola no es el mapa comunitario. Al sincronizar
  mediciones se actualizan el estado confirmado y la vista de mapa.
- Medidor: «Índice moderado», «Sin calibrar», dBFS y tratamientos activos/no
  verificables visibles. Se retiró del README la asociación injustificada de
  categorías digitales con molestia ambiental. No se baja la escala ni se
  descuenta un supuesto ruido de fondo.

### Evidencia de navegador

`/tmp/opencode/acoustimap-ui-check/kanban.cjs` alimenta el AudioWorklet real
con un oscilador digital, **no con el micrófono físico**:

| Entrada digital | Índice observado |
|---|---:|
| Cero digital | 30 (suelo de la escala, no 30 dB SPL) |
| Seno de amplitud 0.01 | 57 |
| Seno de amplitud 0.1 | 77 |
| Regreso a 0.01 | 57 |

Un pico de 50 ms con amplitud 0.3 alcanza ~74 según el resumen y sale de la
ventana; no se mantiene como una señal sostenida. La prueba de cola usa
IndexedDB real, GPS simulado y ningún backend. Después se prueban **24 estados
visuales**: 320/390/504/1440 px × claro/oscuro × desconectado/Calor/Puntos.
Las vistas con fixtures llevan un rótulo visible «MAPA CON DATOS SIMULADOS»;
no se añaden estos datos a la configuración, la app ni Supabase.
Sin errores JavaScript, desbordamiento horizontal ni incidencias detectadas
por axe en las reglas WCAG A/AA aplicadas. Capturas y resultados en
`/tmp/opencode/acoustimap-ui-check/kanban-v43/`.

Se repitieron los 8 flujos específicos de mapa y los 18 generales. Una prueba
de dibujo falló con coordenadas de pantalla fijas tras cambiar el viewport;
se hizo reproducible proyectando la ubicación de la fixture con Leaflet y
volvió a pasar sin cambiar el cálculo de análisis de zona. La prueba de cola
espera la petición pendiente antes de exigir confirmación local.

### Criterio pendiente: respuesta al ambiente físico

**No se da por cumplido.** El código puede transformar correctamente la señal
digital y seguir mostrando índices elevados por sensibilidad, ganancia del
sistema, procesamiento no declarado, viento, roces o ruido propio del equipo.
La captura del usuario no permite distinguir esas causas ni demostrar una
calibración. Prueba manual sin Compartir, siempre en el mismo equipo:

1. Recargar local con Ctrl+Shift+R y activar el micrófono sin mover el equipo.
2. Mantener el ambiente estable 10 s; anotar rango del índice y dBFS.
3. Hablar a ~1 m durante 5 s, sin soplar, tocar ni cubrir el micrófono.
4. Volver al ambiente inicial 10 s; comprobar si la señal vuelve cerca del
   rango anterior una vez que la voz sale de la ventana de 1 s.
5. Abrir Diagnóstico y anotar ganancia automática, reducción de ruido y eco.

Si sube sin una fuente nueva, necesitamos esos valores, navegador y sistema
antes de atribuirlo al algoritmo. No se asigna un valor «correcto» al silencio
acústico sin referencia calibrada. El mapa real requiere configuración local
válida y la RPC v3 aplicada; los placeholders no contienen aportes.

## Reparación de conexión y apertura del navegador (caché v44)

- `dist/` conservaba placeholders pese a la configuración real de la raíz.
  Se regeneró y se comprobó igualdad del archivo público en ambos lugares.
  El build rechaza configuración ausente/placeholders antes de sustituir `dist/`.
- El cliente creado ya no se anuncia como «conectado». Solo una respuesta RPC
  correcta confirma conexión. La banda visible distingue comprobación, cero/n
  zonas, falta de configuración/SDK, permisos, RPC ausente y error de red.
  Incluye la versión cargada, en es/en/pt.
- `npm run dev` usa un servidor Node sin caché HTTP, limitado a recursos públicos,
  y abre el navegador predeterminado (Windows desde WSL). `/_dev/status` permite
  comprobar raíz, versión y presencia de configuración sin mostrar la clave.
- En localhost se desinstala únicamente el registro propio de la PWA y sus
  cachés; no se borran IndexedDB, la cola ni preferencias. En producción se
  conserva la PWA. Su configuración usa red primero, conserva una copia válida
  para offline y no almacena placeholders.
- Se abrió Chrome de Windows en `http://localhost:3000/?dev=44` y se confirmó
  la ventana «AcoustiMap … v44». Desde Windows, `/_dev/status` confirmó la raíz
  correcta y `configured: true`.
- Verificación Chromium de **solo lectura con Supabase real**, sin fixtures en
  la raíz/artefacto: RPC v3 HTTP 200 y 2 zonas al revisar, tanto en raíz como
  `dist/`, con Calor/Puntos funcionales. No se activó el micrófono ni Compartir
  en estas comprobaciones. Se comprobó 320/390/504/1440 px, claro/oscuro, sin
  desbordamiento, solapamiento del aviso con zoom ni incidencias axe A/AA.
- Las pruebas separadas con fixtures verifican carga pendiente, celda recibida,
  permiso rechazado y red fallida; no escriben registros reales.
- En un host seguro de previsualización que usa la rama PWA de producción,
  se instaló caché v44 y se comprobó recarga sin red, configuración pública
  válida y AudioWorklet offline con entrada sintética, sin Compartir ni errores JS.

Capturas/resultados: `/tmp/opencode/acoustimap-ui-check/connection-v44/`.
La reparación no calibra el micrófono ni reclasifica datos anteriores como v3.
