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

**Pendiente al aplicar:** tras ejecutar la migración, comprobar con una consulta
de solo lectura que las cuatro franjas devuelven conjuntos distintos, y que
`night` durante el día devuelve 0.
