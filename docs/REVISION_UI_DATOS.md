# Revisión de Resumen, Comparar y Retos

Fecha: 2026-10-07. Auditoría inicial: **v48**. Corrección comprobada: **v49**, método **v5**.
Alcance: auditoría y corrección funcional/visual; sin despliegue, commits ni SQL remoto.

## Dictamen inicial (v48)

Las tres secciones tienen funcionalidad operativa, pero **no están completamente
validadas ni cumplen todas las recomendaciones de UI/UX Pro Max**.
La guía es una referencia de diseño, no una certificación de accesibilidad.

## Resultado de la corrección (v49)

Los fallos reproducidos y los ajustes D11–D21 quedan **corregidos y comprobados
en el alcance siguiente**. No se afirma certificación WCAG ni validación acústica.

| Tarjeta | Arreglo | Confirmación |
| --- | --- | --- |
| D11 — Respuestas antiguas | Identidad de solicitud y del estado renderizado; también descarta errores antiguos. | Regresión Node y navegador: 80 permanece en pantalla tras resolver la respuesta antigua de 40. |
| D12 — Objetivos de retos | Obras cuenta zonas distintas. Basura empareja zonas y días diferentes; conserva los registros locales. | Una sola zona durante tres días queda en 1/2 y 1/3, no completa los retos. Pruebas de zonas distintas, mismo día y combinaciones sin tres pares independientes. |
| D13 — Promedios coherentes | Promedio energético compartido por Resumen, Tendencia, ranking y capas comparativas. | Lecturas 50/80 del mismo día dan 77 también en Tendencia; 50/80/60 de una zona dan 75 en Resumen y ranking, no 63. |
| D14 — Etiqueta | «Lecturas altas» en es/en/pt, sin cambiar el cálculo ni las cifras. | 13 lecturas altas y 4 zonas permanecen diferenciadas con datos reales. |
| D15 — Lectura | Instrucciones de retos y párrafos principales a 16 px, ayudas a 14 px e interlineado más amplio. | Tamaño calculado en Chromium y revisión visual en móvil. |
| D16 — Acciones | Retos separados en mediciones y acciones ciudadanas; botones «Ir a medir» y «Preparar reporte». | Preparación de Basura/Obra selecciona su categoría; medir lleva al mapa sin activar permisos. Flujo simulado de Basura hasta progreso 1/3. |
| D17 — Táctil | Pestañas y acciones de al menos 44 px. | Dimensiones comprobadas en cinco anchos, claro/oscuro. |
| D18 — Recuperación | Fechas UTC, ámbito, Reintentar e Ir al mapa en Comparar. | Error simulado → Reintentar → datos. Un periodo vacío no habilita las capas comparativas. |
| D19 — Selección | Instrucciones, centro del mapa, cancelación/Escape y restauración del foco. Selecciones pendientes excluyentes; salir del mapa las cancela. | Movimiento con flechas y elección con Enter; Escape vuelve al control de origen. Selección de reporte conserva nota y foto. |
| D20 — Contexto y gráfico | Ámbito de todas las zonas explícito. Tabla de siete días naturales UTC, descripción accesible traducida y huecos sin medición. | Siete filas, días sin datos rotulados, sin unir puntos a través de un hueco; axe sin incidencias en la tabla revisada. |
| D21 — Pestañas | Solo la pestaña activa en el orden de Tab. | Home/flechas cambian foco/vista y mantienen un único `tabindex="0"` entre pestañas. |

### Kanban de cierre

- **Verificado:** D11–D21, con límites descritos arriba.
- **En curso:** ninguna corrección.
- **Bloqueado/no autorizado:** comparación con dos periodos reales, inserciones
  públicas y validación acústica física; ver sección de límites.
- **Pendiente dentro de esta revisión:** ninguno de los fallos reproducidos.

### Evidencia final

- `npm run check`: **207 pruebas**, sintaxis de **53 archivos**.
- `npm run build:site`: 20 recursos; configuración de raíz y artefacto idéntica.
- Navegador con backend real: raíz y `dist/` en v49; RPC v5 disponible, 390
  mediciones y 4 zonas al comprobar. Periodo anterior: 0; no se inventa un cambio.
- **60 variantes**: 5 anchos × 2 temas × 3 vistas × datos reales/simulados.
  Sin desbordamiento horizontal, errores JS ni incidencias axe A/AA detectadas
  en los estados revisados, después de estabilizar las animaciones.
- Chrome de Windows abierto y ventana v49 confirmada. `/_dev/status` confirma
  raíz, configuración y v49; ahora sigue la versión del HTML sin quedarse con
  la que había al arrancar el servidor.
- Prueba de reporte aislada: preparar Basura → formulario conservado → centro
  con Enter → respuesta simulada → progreso 1/3, sin subir imagen ni escribir
  Supabase. No se activó el micrófono ni Compartir en las comprobaciones reales.

Evidencia externa: `/tmp/opencode/acoustimap-ui-check/stats-fixed-v49/`.
Ejecutores: `stats-fixed-v49.cjs` y `report-challenge-v49.cjs` en el directorio padre.

Las secciones siguientes conservan el diagnóstico inicial como referencia histórica.

## Verificado

| Tarjeta | Evidencia | Resultado |
| --- | --- | --- |
| D1 — Versión y navegador | `/_dev/status` identifica la raíz del proyecto, v48 y configuración presente. Chrome de Windows abierto en `http://localhost:3000/?dev=48`; ventana v48 confirmada. | Verificado |
| D2 — Lecturas reales | Supabase respondió HTTP 200 a `noise_map_cells_v5`, `noise_measurements` y `noise_reports`, con acceso público anónimo. | Verificado, solo lectura |
| D3 — Resumen real | 390 mediciones, 4 zonas, promedio mostrado 63 y 13 lecturas por encima de 70 al revisar. El ranking y «Ver en mapa» funcionan. | Verificado |
| D4 — Comparar real | Periodo actual: 390 mediciones; anterior: 0. Informa datos insuficientes y oculta realmente métricas y acciones (`display: none`), sin inventar un cambio. | Verificado el estado incompleto |
| D5 — Comparación simulada | Dos periodos simulados producen 47 y 74, cambio +27; ambos botones abren el mapa y su capa correspondiente. | Flujo normal verificado con fixtures |
| D6 — Estados | Resumen distingue carga, vacío, error y backend ausente. Reintentar recupera el resumen. Comparar distingue datos insuficientes, error y falta de configuración. | Verificado con fixtures |
| D7 — Retos locales | Progreso vacío, parcial y completo; rutas de medición/reporte separadas. Un reporte de basura simulado con foto incrementa 1/3, sin subida de imagen. | Verificado con fixtures; ver D12 |
| D8 — Visual y accesibilidad automática | 30 variantes: 320/375/768/1024/1440 px × claro/oscuro × 3 secciones. Sin desbordamiento horizontal ni incidencias axe WCAG A/AA detectadas en `#stats-view`. | Verificado en esos estados, no certificación |
| D9 — Teclado, idioma y movimiento | Flechas y End cambian las pestañas y el foco. Retos se traduce a es/en/pt. Reduced motion reduce la animación a una iteración de 0,01 ms. | Verificado en ese alcance |
| D10 — Suite | `npm run check`: 200 pruebas aprobadas y sintaxis de 52 archivos. | Verificado; no cubre todos los fallos siguientes |

El progreso de los retos es personal y local. Que el resumen comunitario muestre
390 mediciones no significa que los retos de un navegador nuevo deban tener progreso.

## Hallazgos iniciales: fallos reproducidos en v48

| Tarjeta | Prioridad | Problema y reproducción | Criterio de corrección |
| --- | --- | --- | --- |
| D11 — Respuestas antiguas | Alta | Abrir Comparar con una consulta pendiente, pasar a Retos y volver a Comparar. La respuesta nueva muestra 80; al resolver la anterior vuelve a 40. `panelIsCurrent()` solo comprueba panel/vista, no la identidad de la solicitud. | Descartar respuestas de consultas anteriores aunque se haya vuelto a la misma vista. Prueba con respuestas en orden inverso. |
| D12 — Objetivos de retos | Alta | Tres reportes de obra en una única celda y días distintos completan 2/2, aunque la UI exige zonas distintas. Basura también llega a 3/3 en una única celda durante tres días. `reportChallengeProgress()` cuenta parejas celda/día, no zonas y días independientes. | Acordar la regla y hacer coincidir explicación, cálculo y pruebas. No redefinir el objetivo silenciosamente. |
| D13 — Tendencia incoherente | Alta | Dos lecturas simuladas de 50 y 80 el mismo día: `averageDb()` devuelve 77; `renderTrendChart()` muestra 65. El resumen promedia energía y la tendencia promedia aritméticamente. | Usar una definición consistente de promedio en las vistas; prueba de regresión con lecturas variables. |
| D14 — Etiqueta de métrica | Media | «Zona ruidosa: 13» convive con «4 zonas analizadas». El cálculo cuenta filas con `db_level > 70`, no zonas. | Etiquetar como lecturas altas o calcular realmente zonas; conservar claridad sobre la escala no calibrada. |

Referencias de implementación: `js/features.js:128`, `js/features.js:448`,
`js/features.js:783`, `js/features.js:946`, `js/features.js:1031`,
`js/features.js:1110`.

## Hallazgos iniciales: ajustes UI/UX Pro Max en v48

- **D15 — Lectura móvil (alta):** instrucciones de retos a 11,52 px, estado a
  10,56 px y ayudas del resumen alrededor de 11–13 px. La guía recomienda
  16 px para texto de cuerpo móvil. Las instrucciones necesarias para completar
  el reto no deberían tratarse como letra secundaria diminuta.
- **D16 — Acciones de retos (media):** ninguna tarjeta ofrece «Empezar a medir»
  o «Reportar» con la categoría adecuada. El usuario debe deducir la ruta y
  abandonar la sección por su cuenta. Separar mediciones y acciones ciudadanas
  también reduciría el bloque introductorio.
- **D17 — Objetivos táctiles (media):** pestañas de 43 px de alto en móvil y
  40 px en escritorio, por debajo de los 44 px recomendados por la guía. No es
  por sí solo un fallo WCAG detectado por axe.
- **D18 — Recuperación en Comparar (media):** error o datos insuficientes
  muestran texto, pero no un reintento o una acción útil. Incluir periodos
  fechados, recuentos y una salida clara; no habilitar una comparación inexistente.
- **D19 — Selección en mapa (media):** al iniciar la selección para tendencia
  se cambia al mapa sin una instrucción visible de selección ni cancelación.
  El clic sobre el mapa sí abre la tendencia. Hace falta revisar también una
  alternativa por teclado y el manejo de selecciones pendientes al abandonar.
- **D20 — Contexto y gráfico (media):** «de tu zona» sugiere un filtro local,
  pero Resumen/Comparar consultan todas las mediciones del método vigente, sin
  límites geográficos. La tendencia debe ofrecer datos tabulados, distinguir
  días sin mediciones y traducir su descripción accesible.
- **D21 — Pestañas (baja):** las flechas funcionan, pero todas las pestañas
  permanecen en el orden de Tab. Adoptar un único tabulador activo simplificaría
  la navegación de teclado.

Referencias visuales durante la auditoría v48: `css/features.css:137–143`,
`css/experience.css:49–50`, `css/experience.css:158–159`,
`css/experience.css:319–382`, `index.html:282–288`.

## Bloqueado / no verificado

- Comparación con dos periodos **reales**: faltan mediciones v5 del anterior.
- Inserciones, permisos de escritura y fotografías en el backend real: no se
  realizaron contribuciones públicas ni subidas de prueba. Las respuestas de
  escritura usadas para probar el formulario fueron interceptadas y simuladas.
- No se activó el micrófono físico; estos resultados no prueban calibración,
  sensibilidad acústica ni comparabilidad física entre dispositivos.
- La matriz axe cubre los estados reales revisados, no un lector de pantalla,
  todos los estados de error o una auditoría WCAG completa.

## Evidencia y próximos criterios

Scripts, capturas y JSON externos al artefacto público:
`/tmp/opencode/acoustimap-ui-check/stats-audit-v48/`.
Ejecutores: `stats-audit-v48.cjs` y `stats-flows-v48.cjs` en su directorio padre.
Los casos simulados usan contextos de navegador separados y no cambian datos
del usuario en Chrome de Windows ni registros de Supabase.

Guía consultada: UI/UX Pro Max, mediante su sistema de diseño y búsquedas
de accesibilidad, lectura móvil, interacción táctil y recuperación de errores.
Se aplicaron criterios al HTML/CSS/JS existente, sin añadir Tailwind ni framework.

Límite Kanban: una corrección en curso. Se priorizaron D11–D14 y después
lectura/acciones. Cada cierre exige reproducción, prueba de regresión, revisión
en navegador y apertura de la versión actual.

## Filtro de calidad del micrófono (v50)

Motivo: el AGC y la supresión de ruido del navegador alteran la amplitud que
recibe el medidor y son la causa principal de que el mismo ambiente dé cifras
distintas según el aparato («en algunos se dispara y en otros no»).

Regla aplicada en el cliente:

- Si el navegador **confirma** procesamiento (`capture_profile === 'processed'`),
  la medición **no se publica** al mapa. Queda en el progreso local del
  dispositivo y el botón muestra «No enviada (audio procesado)».
- `unknown` **no** se bloquea: demasiados equipos no reportan sus ajustes y
  bloquearlos dejaría el mapa sin aportes.
- El usuario puede autorizar el envío desde el diagnóstico («Publicar igualmente
  (calidad reducida)»). Entonces se publica etiquetada con su `capture_profile`.
- No se activa solo: `forceProcessedPublish` empieza en `false`.

Verificado en navegador con captura procesada simulada y etiquetada como tal:
0 publicaciones al bloquear; 1 publicación con `capture_profile: 'processed'`
tras autorizar; 0 escrituras reales; aviso y casilla en es/en/pt; sin errores JS.
`npm run check`: 212 pruebas y sintaxis de 54 archivos.

Pendiente (pasos siguientes, aún sin implementar):

- **Servidor:** que la RPC pueda separar por `capture_profile` para no mezclar
  en el mapa celdas ya publicadas con procesamiento.
- **Estabilizar la lectura mostrada** (suavizado/histéresis) sin cambiar la fórmula.
- **Calibración por referencia** si algún día hay un sonómetro.

Este filtro **no** convierte el índice en dB SPL ni lo hace comparable con los
65 dB de la OMS; solo impide mezclar escalas distintas en el mapa.

## Filtros del mapa: franja horaria y periodo (revisión v50)

**Periodo — correcto.** `Historial 90 días` y `En vivo 24 h` sí recortan. Con
datos reales: últimas 24 h = 645 muestras, últimas 2 h = 255, y una ventana
antigua (3 d → 1 d) = 0. Parecían iguales solo porque todas las mediciones son
recientes.

**Franja horaria — estaba roto, y no era el cliente.** La RPC v5 comparaba con la
clave en español:

```sql
and (p_time_filter is null or p_time_filter <> 'noche' or (...))
```

El cliente envía `'all'`/`'morning'`/`'afternoon'`/`'night'`, así que
`p_time_filter <> 'noche'` era **siempre verdadera** y el filtro no se aplicaba:
Todo, Mañana, Tarde y Noche devolvían el **mismo** conjunto. Evidencia real:
`p_time_filter = 'night'` devolvía 645 muestras con lecturas de las **09:41 de
Colombia** (mañana).

Corrección: `migrations/20261019_fix_time_filter_v5.sql` redefine la misma
función con los cortes de `CO_TIME_BANDS` (mañana 6–11, tarde 12–17, noche ≥18 o
<6, en `America/Bogota`). No borra ni modifica datos.

La prueba `test/challenge-bands.test.js` validaba contra la migración **v2** y por
eso no lo detectó. Ahora valida contra la **última definición** de
`noise_map_cells_v5` y rechaza cualquier comparación con una clave que el cliente
no envía.

**Verificado tras la aplicación manual en Supabase (2026-10-07):** consultas
reales como `anon`, con un mismo instante de corte, devolvieron 774 muestras:
384 de mañana, 260 de tarde y 130 de noche. La suma de las tres franjas coincide
con Todo. Los periodos de 90 días y 24 horas coincidían porque las mediciones
disponibles estaban dentro de las últimas 24 horas; últimas 2 horas devolvió
384 y la ventana antigua (3 d → 1 d), 0.

También se probaron en un navegador los ocho cruces de periodo y franja en
`https://koizell.github.io/acoustimap/`, versión v50: RPC HTTP 200, horas dentro
de la franja seleccionada, número de celdas representadas correcto y ningún
error JavaScript. Sin activar el micrófono ni publicar aportes de prueba.

El filtro usa la hora de cada medición (`created_at`), no la hora de consulta.
Noche puede mostrar mediciones nocturnas anteriores aunque se consulte de día;
lo que debe excluir son las mediciones de mañana y tarde.

## Mapa interactivo (v51)

| Kanban | Cambio | Evidencia |
| --- | --- | --- |
| Hecho | Iconos de barras de sonido en Calor y Puntos | Movimiento real comprobado en navegador; el raster, los colores y los índices no cambian. |
| Hecho | Detalles y acción Acercar | Clic, Enter, Espacio y Escape; botón nativo de 44 × 44 px y foco restaurado desde el popup. |
| Hecho | Pausa voluntaria y movimiento reducido | Preferencia local conservada al recargar; `prefers-reduced-motion` desactiva la animación, no la acelera. |
| Hecho | Ciclo de vida y rendimiento | Ocultar la página/pestaña pausa; veinte cambios de modo no duplican iconos; cero datos retira la capa; como máximo 80 iconos animan, todas las zonas siguen consultables. |
| Hecho | Selección de ubicaciones | Los iconos no interceptan reportes/tendencias; se evita el segundo clic de Enter que genera Leaflet con `keypress`. |
| Hecho | Idiomas y revisión visual | es/en/pt; 16 combinaciones de 320/390/768/1440 px, claro/oscuro y Calor/Puntos, incluyendo sus popups, sin desbordamiento ni incidencias axe A/AA detectadas. |

Verificación de solo lectura de la raíz
`/home/koizell-dev/proyectos/acoustimap` y del artefacto `dist/`: versión v51,
configuración coincidente y RPC v5 HTTP 200 con 4 zonas reales y 4 iconos.
Suite: 222 pruebas; sintaxis de 55 archivos. Los escenarios de interacción usan
datos simulados, no publicaciones reales. No se activó el micrófono.

Las barras son decorativas: no representan audio en directo, propagación,
frecuencia de aportes ni variaciones medidas. Los filtros temporales y la
fórmula de medición permanecen intactos. No requiere nuevas migraciones SQL.

## Análisis de zona y Tendencia (v52, local)

Referencias: [Line Chart](https://21st.dev/@kuratlielia/components/line-chart)
y [Advanced Stats](https://21st.dev/@uilayout.contact/components/advanced-stats)
de 21st. Adaptación propia en HTML/CSS/JS, sin React, nuevas dependencias ni
cambios de cálculo. La visualización sigue siendo una gráfica, no una imagen
generada por IA.

| Kanban | Cambio | Evidencia |
| --- | --- | --- |
| Hecho | Tarjetas del polígono: índice medio, mediciones y zonas | Resumen de 30 días separado de la tendencia de 7; promedio energético existente, método v5 y escala relativa sin calibrar. Lecturas 50/80 siguen dando 77. |
| Hecho | Gráfica compartida interactiva | Cursor y lectura por ratón/toque; flechas, Inicio/Fin, botones de al menos 44 × 44 px, atributos accesibles y fila seleccionada sincronizados. |
| Hecho | Ejes y ausencia de datos | Rango fijo 30–95, fechas UTC, tabla desplegable de siete días y segmentos solo entre días consecutivos con datos. Una lectura no genera una línea; datos antiguos pueden dar resumen con semana vacía. |
| Hecho | Recuperación y respuestas antiguas | Reintentar en el polígono; regresar al área del mapa; consultas tardías, errores antiguos y desconexiones no sustituyen el análisis vigente. |
| Hecho | Visual y accesibilidad automática | 32 variantes: 320/390/768/1440 px × claro/oscuro × zona/tendencia × datos/vacío. Sin desbordamiento ni incidencias axe A/AA detectadas. Contraste de líneas y puntos ≥ 3:1 en ambos temas; movimiento reducido desactiva la entrada de la tarjeta. Copy es/en/pt comprobada en ambas vistas. |
| Pendiente | Publicación | Cambios de frontend locales en `dev`, sin commit ni despliegue de v51/v52. |

### Evidencia v52

- `npm run check`: **233 pruebas aprobadas**, sintaxis de **56 archivos**.
- `npm run build:site`: 20 recursos; configuración idéntica en raíz y `dist/`.
- Navegador real: raíz `/home/koizell-dev/proyectos/acoustimap`, versión **52**,
  RPC `noise_map_cells_v5` HTTP **200** tanto en raíz como en el artefacto.
- Dibujo mediante Leaflet: análisis de **1.005 mediciones / 4 zonas**, índice
  medio **66**. Última semana: cinco días vacíos, 265 mediciones el 6 de octubre
  y 740 el 7. Son cifras del instante de revisión, no datos fijos.
- El artefacto se revisó con otro polígono: **744 mediciones / 2 zonas**; sus
  tarjetas coinciden con las filas dentro de ese polígono. La diferencia de
  recuentos no es una diferencia de configuración.
- **9 escenarios de interacción** y matriz visual anterior, con datos
  simulados aislados; cero errores JavaScript y cero escrituras reales.
- Navegador abierto en `http://localhost:3000/?dev=52`. No se activó el
  micrófono ni Compartir; no se borraron mediciones ni preferencias del usuario.

Evidencia externa: `/tmp/opencode/acoustimap-ui-check/zone-analysis-v52/`.
Ejecutor: `zone-analysis-v52.cjs` en el directorio padre. Los controles
automáticos no equivalen a una certificación WCAG ni prueban calibración o
comparabilidad acústica entre dispositivos. No se ejecutó SQL remoto.

## Primer recorrido para usuarios nuevos (v53, local)

Objetivo: explicar las acciones en el lugar donde se necesitan, no limitarse a
mejorar la apariencia de la gráfica. Sin cambios de cálculo, permisos automáticos
ni publicaciones de prueba.

| Kanban | Cambio | Evidencia |
| --- | --- | --- |
| Hecho | Bienvenida breve con Explorar / Analizar / Medir | Visible con almacenamiento nuevo, sin robar el foco. Consultar el mapa no pide micrófono ni ubicación. |
| Hecho | Ayuda recuperable | Cómo usar permanece visible; cerrar recuerda una única preferencia local, sin borrar aportes o ajustes. Escape cierra y restaura el foco. Si el almacenamiento está bloqueado, la ayuda sigue funcionando. |
| Hecho | Acciones explícitas | Medir sustituye a Activar; Analizar zona tiene acceso directo fuera de `⋯`. Medir abre primero el consentimiento, sin activar la captura. Compartir se explica como otro paso opcional. |
| Hecho | Dibujo guiado | Instrucciones traducidas, Ver análisis deshabilitado hasta tres puntos, Deshacer punto y Cancelar. Dibujo táctil y por ratón comprobados. Cancelar, Escape y salir del mapa retiran handlers sin borrar el polígono anterior. Diez inicios/cancelaciones no duplican eventos. |
| Hecho | Ayudas sin interferencias | La bienvenida y las instrucciones respetan el espacio del medidor en móvil; la ayuda tiene desplazamiento en pantallas bajas. Abrir ayuda/dibujo contrae los detalles del medidor, sin iniciar ni detener la medición. Los iconos no interceptan vértices; el marcador invisible de captura de Leaflet no se presenta como botón accesible. |
| Hecho | Idiomas y revisión automática | 24 combinaciones de 320/390/768/1440 px × claro/oscuro × es/en/pt, revisadas con bienvenida y dibujo: **48 estados** sin desbordamiento ni incidencias axe A/AA detectadas. Cambio de idioma mediante el menú real comprobado. |
| Pendiente | Prueba de comprensión con una persona nueva | La automatización verifica funcionamiento y presentación; no demuestra por sí sola que una persona encuentre las acciones o entienda los resultados. No se afirma certificación WCAG. |
| Pendiente | Publicación | v53 sigue local en `dev`, sin commit ni despliegue. |

### Evidencia v53

- `npm run check`: **242 pruebas aprobadas**, sintaxis de **57 archivos**.
- `npm run build:site`: 20 recursos, configuración idéntica en raíz y `dist/`.
- Raíz `/home/koizell-dev/proyectos/acoustimap` y artefacto sirven **v53**;
  `noise_map_cells_v5` responde HTTP **200**. El dibujo con controles reales
  abrió el análisis en ambas copias: 4 zonas con mediciones del método v5.
- **11 escenarios de uso**, incluido consentimiento → Cancelar, persistencia
  de ayuda, recuperación, idioma, detalles expandidos, dibujo táctil y pantalla
  de 320 × 568 px. Cero errores JS, solicitudes de permisos o escrituras reales.
- Los contextos de prueba están aislados del navegador del usuario. No se
  activó el micrófono, no se publicó información ni se ejecutó SQL remoto.

Evidencia externa: `/tmp/opencode/acoustimap-ui-check/getting-started-v53/`.
Ejecutor: `getting-started-v53.cjs` en el directorio padre.

## Ayuda sencilla desde el icono «i» (v54, local)

**Sustituye el primer recorrido de v53 por petición del usuario.** Se retiran
los botones Cómo usar / Analizar zona del mapa, la bienvenida automática y su
código. La preferencia antigua de bienvenida no se borra; simplemente deja de
usarse. Se conserva Medir, Compartir y el dibujo desde el menú original `⋯`.

| Kanban | Cambio | Evidencia |
| --- | --- | --- |
| Hecho | Un único acceso a la ayuda: «i» | Primera visita sin panel automático ni botones añadidos; nombre accesible y tooltip traducidos. |
| Hecho | Cuatro pasos de uso antes de la leyenda | Explorar, Medir, Compartir opcional y `⋯ → Dibujar zona`; solo texto, no controles duplicados ni acciones automáticas. |
| Hecho | Detalles progresivos | Escala, método/conexión y descargas en `details`/`summary` nativos, inicialmente cerrados. Datos de la vista y exportaciones conservados. |
| Hecho | Tipografía y movimiento | Inter existente, cuerpo de instrucciones a 16 px / interlineado 1,5; títulos seminegrita, controles ≥ 44 × 44 px. Entrada de 150 ms sin animar altura; movimiento reducido elimina la transición. |
| Hecho | Foco y cierre | Abrir enfoca el título y vuelve al inicio de la ayuda; Escape/cerrar restaura el foco al icono, y el panel cerrado queda inerte. Filtros y menú excluyen la ayuda sin bloquear el mapa. |
| Hecho | Regresión del dibujo | Abrir «i» cancela un dibujo en curso. Cancelar el dibujo restaura el foco al menú `⋯`, no a un botón retirado. El recorrido descrito abre el análisis con datos reales en raíz y artefacto. |
| Pendiente | Publicación y comprensión con usuarios | v54 solo local en `dev`, sin commit/despliegue. La revisión automática no sustituye observar a una persona nueva ni certifica WCAG. |

### Investigación aplicada

- [NN/G — Help and Documentation](https://www.nngroup.com/articles/help-and-documentation/):
  ayuda a petición, orientada a tareas, breve, con pasos concretos y escaneables;
  evitar introducir pantallas obligatorias que interrumpan el uso.
- [NN/G — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
  instrucciones principales primero; información especializada plegada.
- [21st — Accessible Accordion, A11YPros](https://21st.dev/@a11ypros/components/a11y-accordion):
  referencia obtenida mediante MCP; patrón de `details`/`summary` nativos,
  navegación de teclado y foco visible. Adaptación propia sin instalar React,
  shadcn ni dependencias nuevas; no se toma su descripción como certificación.
- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill):
  búsquedas locales de tipografía legible y movimiento reducido, más su guía
  oficial: cuerpo móvil de 16 px, contraste ≥ 4,5:1, jerarquía de pesos,
  controles táctiles y transiciones cancelables. La búsqueda local sobre
  disclosure no devolvió un resultado pertinente; ese criterio se fundamenta
  en NN/G, no en una coincidencia inventada.
- [W3C — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html):
  animación no esencial desactivable con `prefers-reduced-motion`.

### Evidencia v54

- `npm run check`: **243 pruebas aprobadas**, sintaxis de **57 archivos**.
- `npm run build:site`: 20 recursos, configuración idéntica en raíz y `dist/`.
- Raíz `/home/koizell-dev/proyectos/acoustimap` y artefacto sirven **v54**;
  RPC v5 HTTP **200**. El dibujo siguiendo la instrucción del panel abrió el
  análisis real en ambos: **1.032 mediciones / 4 zonas** en ese instante.
- **48 estados visuales**: 320/375/768/1440 px × claro/oscuro × es/en/pt ×
  detalles plegados/desplegados. Sin desbordamiento ni incidencias axe A/AA
  detectadas en el mapa; el panel no tapa el medidor en móvil.
- **11 escenarios**: primera visita limpia, teclado, detalles nativos,
  recuperación/foco, menú/filtros, dibujo, idioma real, movimiento reducido,
  pantalla baja/paisaje, texto de instrucciones ampliado al 200% y error de
  backend. La prueba de texto ampliado cubre el panel, no todo el zoom del sitio.
- Sin errores JavaScript, solicitudes de micrófono/ubicación ni escrituras
  reales. Preferencias y datos locales del usuario conservados; sin SQL remoto.

Evidencia externa: `/tmp/opencode/acoustimap-ui-check/info-help-v54/`.
Ejecutor: `info-help-v54.cjs` en el directorio padre.

## Tipografía y animación de Salud y ODS (v55, local)

Se mejora la sección existente sin añadir controles, cambiar cálculos ni tocar
las mediciones o preferencias del usuario.

| Kanban | Cambio | Evidencia |
| --- | --- | --- |
| Hecho | Jerarquía tipográfica | Inter existente; título adaptable 28–36 px, títulos de tarjeta/sección 20 px seminegrita y cuerpo 16 px con interlineado 1,6. Jerarquía HTML h1 → h2, sin saltarse h2 en las tarjetas. |
| Hecho | Lectura y espaciado | Cabecera y texto explicativo limitados a 65ch; alineación izquierda, separación consistente, tarjetas con 20/24 px de relleno. Tres columnas desde 960 px; una columna en móvil/tablet para no estrechar el texto. |
| Hecho | Iconos y traducciones | SVG decorativos escalables en lugar de emojis. Se traduce solo la etiqueta; cambiar de idioma no destruye ni duplica el icono. Se conservan los tres colores también en oscuro. |
| Hecho | Animación discreta | Una entrada CSS del conjunto: desplazamiento de 6 px durante 220 ms, sin rebote, retrasos ni texto inicialmente invisible. Sin hover de botón sobre tarjetas informativas. Movimiento reducido desactiva la animación; no se duplica con `revealUi`. |
| Hecho | Verificación real | Raíz y artefacto v55, configuración idéntica, Supabase RPC v5 HTTP 200 con 4 zonas. Sin permisos solicitados, escrituras reales ni errores JavaScript durante la revisión. |
| Pendiente | Publicación | Cambios solo locales en `dev`, sin commit/despliegue. Pruebas automáticas no sustituyen una evaluación con usuarios ni certifican WCAG. |

### Referencias y evidencia

- UI/UX Pro Max, búsqueda local de tipografía y movimiento: cuerpo móvil de
  16 px, interlineado 1,5–1,75, líneas acotadas y escala de tamaños consistente.
  Los 220 ms son una decisión para este desplazamiento corto, no una norma
  universal. Reutilizar Inter evita introducir otra fuente o dependencia.
- [21st — Feature Card](https://21st.dev/@ravikatiyar162/components/feature-card),
  demo 8114, consultada mediante MCP: referencia de jerarquía título/cuerpo,
  espaciado y tarjetas temáticas. Implementación propia en HTML/CSS: no se
  instalan React/Framer Motion, ni se copian su rebote de 800 ms o efectos hover
  porque no aportan a estas tarjetas informativas.
- `npm run check`: **247 pruebas aprobadas**, sintaxis de **58 archivos**.
- `npm run build:site`: 20 recursos; raíz y `dist/` en **v55**.
- **30 variantes**: 320/375/768/1024/1440 px × claro/oscuro × es/en/pt,
  sin desbordamiento ni incidencias axe A/AA detectadas en `#health-view`.
- **6 escenarios** adicionales: idioma mediante el menú real, navegación
  rápida, movimiento reducido, desplazamiento por teclado en móvil, texto
  de la sección al 200% en los tres idiomas, y fuentes/CDN Motion bloqueados.
  El ensayo al 200% amplía el texto de Salud, no prueba el zoom de todo el sitio.
- Capturas revisadas en escritorio claro y móvil oscuro; el contenido largo
  continúa mediante desplazamiento vertical normal, sin comprimir la letra.

Evidencia externa: `/tmp/opencode/acoustimap-ui-check/health-v55/`.
Ejecutor: `health-v55.cjs` en el directorio padre.

## Reconocimiento local sin login y Codegraph global (v56, local)

Implementación de las decisiones del usuario: solo almacenamiento local, sin
nombre ni avatar personal, colección dentro de Retos, cuatro tipos de recompensa
y código de respaldo. Codegraph es el MCP de **websines/codegraph-mcp**, no
Graphify; se instaló globalmente antes de desarrollar la función.

| Kanban | Cambio | Evidencia |
| --- | --- | --- |
| Hecho | MCP y skill globales | Rust mínimo, binario y entrada global de OpenCode; 28 herramientas conectadas y skill reconocida. Configuración global confirmada también en una segunda ubicación, sin indexarla. |
| Hecho | Indexación realmente funcional | Parche local mínimo de la consulta JS; búsqueda MCP de `loadChallengeProgress` y relaciones consultadas antes de refactorizar. Se excluyó la configuración secreta antes de indexar. |
| Hecho | Logros permanentes separados del progreso | Almacén `acoustimap-recognition`, 12 insignias, 5 niveles y puntos derivados del catálogo. Reto completado = 100 puntos una sola vez; pasar los 30 días no retira insignias. |
| Hecho | Hitos y rachas | Primera medición/reporte, 10 zonas, 10 días y rachas de 3/7/30 días. Días de Colombia, contribuciones guardadas elegibles (también offline), abrir la app no cuenta. Hasta 400 días, mejor racha conservada. |
| Hecho | Respaldo sin identificación | Código versionado, esquema cerrado, checksum de copia y límite de tamaño. Unión idempotente con lectura del estado actual después del await; no restaura ni publica mediciones, cola o fotos. |
| Hecho | Interfaz accesible y discreta | SVG locales; colección y respaldo en detalles nativos. Texto de instrucciones a 16 px. Aviso `aria-live` sin robar foco; movimiento reducido sin animación. Actualizar logros conserva texto de respaldo, panel abierto y foco. |
| Hecho | Fallos de almacenamiento | Cuota bloqueada: memoria de visita y aviso honesto, con código utilizable. Datos de reconocimiento dañados no se sobrescriben hasta recuperar un código válido. Unión de logros entre pestañas. |
| Hecho | Calidad y navegador | 267 pruebas, sintaxis de 59 archivos, build con 20 recursos. Raíz y `dist/` v56 con configuración idéntica y RPC v5 HTTP 200, 4 zonas. |
| Pendiente | Publicación / evaluación con usuarios | Solo local en `dev`, sin commit ni push. Sin migración SQL. Pruebas no certifican WCAG ni la comprensión por personas nuevas. |

### Revisión de Codegraph

Instalación, parche reproducible y limitaciones en
[CODEGRAPH_MCP.md](CODEGRAPH_MCP.md). La suite del binario pasa **100 pruebas**;
la suite completa del proveedor no compila su prueba de integración por una
API retirada. No se presenta como aprobada. El grafo tiene enlaces ambiguos y
referencias sin resolver: se usó para orientación, contrastando fuentes/pruebas.
No se borró ni sustituyó el grafo Graphify que ya existía.

### Evidencia de recompensas

- 20 pruebas nuevas cubren idempotencia, caducidad del progreso, permanencia del
  logro, reglas de zona/día/foto, rachas, rango del índice y fechas válidos, ausencia de
  coordenadas en el reconocimiento, niveles y copia/restauración.
- **12 escenarios de navegador**: visita limpia, desbloqueo/recarga, teclado,
  portapapeles/fallback, transferencia a otro contexto, código dañado, campos y
  foco conservados durante actualización, dos pestañas, idioma real, cuota,
  movimiento reducido y texto al 200%.
- **48 variantes**: 320/375/768/1440 px × claro/oscuro × es/en/pt × colección y
  respaldo plegados/desplegados. Sin desbordamiento ni incidencias axe A/AA
  detectadas en Datos y aviso; las capturas se revisaron también visualmente.
- Pruebas de recompensas con **aportaciones sintéticas solo en almacenes de
  contextos de navegador aislados**, no en el perfil del usuario ni en Supabase.
  Lecturas reales verificadas por separado en raíz y artefacto.
- Sin errores JavaScript, solicitudes de micrófono/geolocalización ni escrituras
  reales durante la revisión. Ningún dato de reconocimiento en payloads remotos.

El respaldo contiene fechas/días de actividad y es legible, no cifrado. Su
checksum detecta daños de copia, no autenticidad: los premios son reconocimiento
personal, no ranking verificado ni recompensas monetarias. Una copia antigua no
contiene logros posteriores. Información y reglas en README/SECURITY.

Evidencia externa: `/tmp/opencode/acoustimap-ui-check/recognition-v56/`.
Ejecutor: `recognition-v56.cjs` en el directorio padre.

## Insignias circulares con detalle contextual (v57, local)

Corrección solicitada por el usuario: se retiraron las tarjetas y sus nombres
permanentes. La colección muestra directamente medallas circulares, con colores
por logro, SVG y estados ✓/◇ más borde continuo/discontinuo. Los textos largos
se plegaron en «Cómo se ganan»; niveles, puntos y respaldo permanecen disponibles.

- Nombre al pasar el cursor con entrada de 180 ms; descripción en Georgia,
  14 px frente a 16 px del título, con fuentes locales de respaldo.
- Detalle también por foco o toque; un detalle a la vez, hover sobre el propio
  detalle sin desaparecer, Escape sin perder foco, segundo toque o toque fuera
  para cerrar. Sin animación/giro con `prefers-reduced-motion`.
- Actualizar reconocimiento conserva el foco en la medalla y el texto del
  respaldo. No cambia el esquema guardado ni las reglas de logros/puntos/rachas.
- **271 pruebas**, sintaxis de 60 archivos. **48 variantes** de pantalla
  (320/375/768/1440 × claro/oscuro × es/en/pt × círculos/detalle), siete escenarios
  de navegador y descripción al 200%. Sin desbordamientos ni incidencias axe
  A/AA detectadas en Datos; no constituye certificación de accesibilidad.
- Raíz y `dist/` v57 con configuración idéntica, RPC v5 HTTP 200 y 4 zonas.
  Sin permisos, errores JavaScript ni escrituras remotas durante la revisión.
- Logros y respaldo probados con aportes sintéticos en un contexto aislado,
  sin modificar el perfil del usuario. Sin commit, push ni publicación.

Evidencia: `/tmp/opencode/acoustimap-ui-check/badges-v57/evidence.json`, capturas
y ejecutor `badges-v57.cjs` en el directorio padre.

## Auditoría y mitigaciones antes de publicar (v58, local)

Revisión independiente en tres pases, sin edición por el revisor: identificó
fallos reales, comprobó mitigaciones y detectó dos rutas alternativas que también
se corrigieron. Dictamen final: hallazgos auditados cerrados, sin certificar un
despliegue no realizado.

- 279 pruebas, sintaxis de 63 archivos, build de 20 recursos y audit npm sin
  vulnerabilidades conocidas. Override `compression@1.8.2`, instalación aislada
  sin scripts y guarda contra claves privilegiadas en configuración pública.
- Consentimiento aislado del aviso; popup/foco conservados en mapa y Comparar;
  cierre de dibujo validado por botón y recorridos nativos; almacenamiento
  bloqueado tolerado al inicializar; deshacer el primer punto recuperable.
- 78 variantes visuales y 20 escenarios de navegador; raíz y artefacto v58 con
  configuración idéntica, RPC v5 HTTP 200/4 zonas. Sin permisos ni escrituras
  reales, sin commit/push/publicación.

Detalle, límites, evidencias y recuperación:
[AUDITORIA_PRE_DESPLIEGUE.md](AUDITORIA_PRE_DESPLIEGUE.md).
