# Contexto de desarrollo — AcoustiMap

Aplicación de ciencia ciudadana con HTML/CSS/JavaScript, Leaflet, Web Audio y
Supabase. El índice del micrófono es relativo, no dB(A) calibrados.

## Fuentes de contexto

- `README.md`: presentación del proyecto y configuración.
- `CONTRIBUTING.md`: convenciones, comandos y proceso de cambios.
- `docs/ARQUITECTURA.md`: responsabilidades, datos y contratos.
- `docs/CALIDAD.md`: riesgos, pruebas y evidencia; no certificación ISO.
- `setup.sql` y `migrations/`: esquema y cambios SQL.

## Reglas del proyecto

- Mantener scripts clásicos y el orden de `index.html`: config.local, config,
  map, audio, community, app, features. `js/kalman.js` no está cargado por la app.
- Node/npm se usan para desarrollo, pruebas y publicación; no hay bundler.
  La Edge Function usa Deno/TypeScript; su núcleo de limpieza está en `cleanup.mjs`.
- Conservar responsabilidades por archivo, nombres descriptivos y comentarios
  en español para contratos y decisiones. Evitar refactorizaciones extensas
  sin necesidad comprobada.
- No confundir posiciones `{lat, lng}` con registros `{latitude, longitude}`.
  Aproximar coordenadas antes de compartir; no añadir un identificador local
  estable a los datos públicos ni transmitir audio.
- No incluir `service_role`, tokens privados ni datos personales en frontend,
  fixtures o logs. Usar `textContent` para contenido aportado por usuarios.
- No afirmar que existen políticas o trabajos activos en Supabase solo porque
  el SQL está en el repositorio. Verificar despliegue y permisos por separado.
- Ejecutar `npm run check`; añadir regresión para errores reproducidos. No usar
  pruebas que solo busquen texto cuando se puede probar comportamiento.
- Al cambiar recursos web, actualizar versiones en `index.html` y `sw.js`.
  Nuevos recursos públicos deben figurar en `scripts/build-site.js`.
- Mantener Graphify y salidas generadas locales e ignoradas; no incluirlas en PR.

Mapa de calor, filtros, exportación, reportes, confirmaciones, estadísticas,
comparación, zonas, retos, idiomas y PWA ya existen. Consultar su implementación
y pruebas antes de proponerlos como funciones nuevas.
