# Revisión UI/UX: mapa primero (v47, local)

## Problema y cambios

La pantalla móvil inicial daba la misma prioridad al mapa, los filtros y el
diagnóstico de conexión. Una cabecera de dos filas y un panel de 243 px cubrían
demasiado terreno incluso sin medir.

| Hallazgo | Gravedad | Corrección |
|---|---|---|
| Filtros y conexión técnica permanentemente superpuestos | Alta | Filtros nativos desplegables; conexión correcta en Información. Los errores siguen visibles. |
| Tarjeta inferior alta en reposo | Alta | Lectura y promedio en paralelo; acciones y detalles en una fila. No se ocultan advertencias. |
| Cabecera móvil de 88 px | Media | Una fila de 56 px, con navegación táctil de 44 px. |
| Iconos emoji dependientes de fuentes | Media | Información y localización con caracteres/SVG fiables y nombres accesibles. |
| Apertura de dos paneles secundarios simultáneos | Media | Filtros e Información se cierran mutuamente. |

## Tipografía e interacción

- Se conserva Inter; lectura numérica de 32 px en móvil con cifras tabulares.
- Acciones de 14 px y controles de filtros de 14 px; metadatos de 12 px.
- Objetivos táctiles de 44 px en acciones, detalles, filtros y controles del mapa.
- Se conserva el aviso «Sin calibrar» y la ayuda, sin añadir jerga a la entrada.
- Filtros operables con Enter; Escape cierra y devuelve el foco al resumen.
- Animación de entrada existente de 220 ms; sin animación infinita ni transiciones
  en controles del mapa/medidor con `prefers-reduced-motion`.
- La calibración, avisos y privacidad no cambian; tampoco el método de medición.

## Comparación en Chromium

Medición aproximada por muestreo geométrico cada 4 px: porcentaje del viewport que
no está cubierto por cabecera, tarjeta, filtros, controles y atribución. No equivale
a medir la comprensión del usuario ni a una prueba en un teléfono físico.

| Viewport | Mapa libre v46 publicada | Mapa libre v47 local | Panel v46 → v47 |
|---|---:|---:|---:|
| 320×568 | 31,8% | 51,1% | 243 → 173 px |
| 390×844 | 54,7% | 70,4% | 243 → 152 px |
| 514×916 | 59,6% | 73,8% | 243 → 152 px |
| 844×390 | 57,8% | 59,8% | 227 → 227 px |
| 1440×900 | 84,3% | 84,9% | 279 → 279 px |

## Verificación y límites

- Cinco tamaños en Chromium, escritorio y móvil emulado; sin scroll horizontal
  ni errores JavaScript en los flujos revisados.
- Filtros, selección de horario, Información, detalles, estado de error y
  movimiento reducido comprobados en el navegador.
- Idiomas español, inglés y portugués comprobados en 320 px.
- axe-core: cero infracciones detectadas en la pantalla inicial móvil de 390 px
  para las reglas WCAG A/AA seleccionadas. No es una certificación de toda la app.
- `npm run check`: 197 pruebas; `npm run build:site`: 20 recursos.
- Micrófono y ubicación real no activados; no se publicaron datos de prueba.
- Capturas y script del navegador en `/tmp/opencode/ac-ux-*`, fuera del build.
- Cambios en `dev`, sin commit ni publicación. La web remota sigue en v46.

Pendiente: validación en teléfono físico, zoom/tamaño de fuente personalizado y
comprobación táctil por una persona. La mejora de área no sustituye esas pruebas.
