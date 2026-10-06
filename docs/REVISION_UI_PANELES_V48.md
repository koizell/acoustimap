# Revisión de Información y herramientas — v48 local

## Diseño

- Información se organiza en escala de tres niveles, datos de la vista y
  descargas. Método y diagnóstico de conexión se conservan en un desplegable
  cerrado por defecto; los fallos de conexión siguen apareciendo sobre el mapa.
- Títulos sin mayúsculas sostenidas, texto de 13–15 px según función, interlineado
  1,4–1,6, espacios de 8/12/16 px y lectura numérica tabular.
- Herramientas en una columna: acciones del mapa y preferencias. SVG de 20 px,
  sin emojis dependientes de fuentes ni botones elevados en una cuadrícula apretada.
- Acciones de herramientas de 48 px; cerrar, exportar y disparadores de 44 px.
- Desplazamiento interno cuando la pantalla es pequeña. Cabecera de Información
  y botón de cierre permanecen fuera del área desplazable.
- Entrada de 220 ms con el helper existente; estados CSS de 160–180 ms.
  Movimiento reducido desactiva animaciones/transiciones de estos controles.

## Interacción corregida

- Información, filtros y herramientas se cierran mutuamente.
- Escape cierra el panel y devuelve el foco al disparador.
- Las herramientas reciben el foco en la primera acción al abrirse y se cierran
  al pulsar fuera. Información y filtros también se cierran al pulsar fuera.
- Los listeners de cierre no se multiplican al cambiar idioma.
- El estado de Tema oscuro se refleja en `aria-pressed`.
- El contenedor de herramientas ya no crece encima del botón Información y no
  intercepta su pulsación. En horizontal, Información abre debajo de los botones,
  sin dejar el disparador parcialmente cubierto.

## Pruebas realizadas

- Chromium en 320×568, 390×844, 514×916, 844×390 y 1440×900.
- Apertura, cierre, exclusividad, foco, despliegue técnico, acceso a descargas y
  movimiento reducido, sin activar micrófono ni publicar datos.
- axe-core: cero infracciones detectadas con Información y herramientas abiertas
  en los cinco tamaños, tanto en tema claro como oscuro, para las reglas WCAG
  A/AA seleccionadas. No equivale a certificar la aplicación entera.
- Cambio real de tema y ciclo español → inglés → portugués → español a 320 px,
  sin duplicar la barra ni causar errores JavaScript.
- `npm run check`: 200 pruebas aprobadas. Build de 20 recursos.
- Capturas y script de navegador: `/tmp/opencode/ac-info-v48-*`,
  `/tmp/opencode/ac-tools-v48-*` y `/tmp/opencode/ac-popovers-review.cjs`.

## Estado

Revisión realizada en `dev`, antes del commit y la publicación, junto a la mejora
inicial del mapa v47. Falta validar en teléfono físico y con lector de pantalla.
