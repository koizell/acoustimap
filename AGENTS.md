# AGENTS.md — AcoustiMap

App estática de ciencia ciudadana: HTML/CSS/JS sin framework ni bundler, Leaflet, Web Audio, Supabase (PostgreSQL + Storage + Edge Functions), GitHub Pages. Todo el código, los comentarios y la documentación están en **español**: conserva ese idioma.

## Comandos

```sh
npm ci --ignore-scripts   # instalación fijada (forma exacta que usa CI)
npm run check             # PUERTA OBLIGATORIA: check:syntax + test (31 casos)
npm run dev               # npx serve . -> http://localhost:3000
```

- **Un solo archivo de prueba:** `node --test test/flows.test.js` (también `test/offline.test.js`, `test/core.test.js`, `test/photo-cleanup.test.js`, `test/build-site.test.js`, `test/build-config.test.js`, `test/community-errors.test.js`, `test/ui-regressions.test.js`).
- `npm test` (`scripts/run-tests.js`) solo recoge `test/*.test.js`. `test/helpers/` y `src/test.js` **no** son casos; `src/test.js` es un archivo muerto.
- Node 24 en CI; `engines` dice `>=18`.
- Las pruebas usan dobles sintéticos: **no** necesitan claves de Supabase ni red.

## Configuración local

- `js/config.local.js` está en `.gitignore` y define `window.__ACOUSTIMAP_CONFIG__`. Créalo copiando `js/config.local.js.template`; los placeholders (`TU-PROYECTO`, `TU_ANON_KEY_AQUI`) permiten abrir la UI sin backend, pero el cliente Supabase no se crea y el mapa queda vacío.
- Micrófono y geolocalización exigen contexto seguro: usa `localhost`, no abras `index.html` por `file://`.
- `npm run build:config` (`node build-config.js`) **falla con exit 1** si falta `SUPABASE_URL` o `SUPABASE_ANON_KEY`, y sobrescribe `js/config.local.js`.
- `npm run build:site` **requiere que `js/config.local.js` exista** (lo valida antes de tocar nada) y **reemplaza `dist/` por completo**. No guardes trabajo manual en `dist/`. Orden en CI: `build:config` y luego `build:site`.

## Arquitectura: lo que no se deduce de los nombres

- Scripts clásicos que comparten estado global, cargados en este orden fijo desde `index.html`:
  `config.local.js → config.js → map.js → audio.js → community.js → app.js → features.js`.
  Ese orden es un contrato de dependencias, no una preferencia estética.
- `js/kalman.js` existe pero **la app no lo carga**: no asumas que el filtro Kalman está activo.
- Responsabilidades: `config.js` (cliente, constantes, estado, `snapToGrid`, `classifyDb`), `map.js` (Leaflet, GPS, ciclo de vida del heatmap), `audio.js` (índice relativo y resumen de sesión), `community.js` (`noise_map_cells`, envío cada 10 s, exportación), `app.js` (navegación y eventos), `features.js` (73 KB: estadísticas, reportes, confirmaciones, comparación, zonas, retos, temas, idiomas, cola offline).
- Contratos de datos que se rompen con facilidad:
  - Posición del mapa `{lat, lng}` vs. registro SQL `{latitude, longitude}`. Convertir explícitamente; mezclarlo ya causó un bug (QA-01 en `docs/CALIDAD.md`).
  - `CELL_SIZE_M = 70` es la celda de privacidad **en metros**; `AGG_GRID = 0.0014` agrupa visualmente **en grados**. Son dos rejillas distintas.
  - `db_level` y `avg_db` son nombres históricos que contienen un **índice relativo**, no dB(A) calibrados. No los renombres.
  - Categorías: `bajo` <55, `moderado` 55–70, `alto` >70.
  - Franjas horarias: la RPC aplica hora de Colombia (UTC−5) para todos los visitantes. Periodos: `history` 90 días, `live` 24 h.
- Vaciar una capa o panel significa "sin datos", no "zona silenciosa". No lo comuniques como ausencia de riesgo.

## Versión de caché y artefacto

- La versión es un único número repetido en tres sitios: `?v=32` en `index.html`, `CACHE_NAME = 'acoustimap-shell-v32'` y `ASSET_VERSION = '32'` en `sw.js`. **Sube los tres a la vez** al cambiar recursos web; si no, los usuarios con pestañas abiertas conservan recursos viejos.
- `scripts/build-site.js` tiene una **lista explícita** de recursos públicos. Un asset nuevo que no se añada ahí no llega a `dist/`. `test/build-site.test.js` falla si `index.html` referencia algo ausente del artefacto, o si `APP_SHELL` referencia algo que `index.html` no menciona.

## Pruebas: dos estilos, ambos delicados

- **Scripts completos en VM** vía `test/helpers/browser-context.js` (`offline.test.js`, `community-errors.test.js`): reloj fijo, `localStorage` y red simulados. No emula Leaflet, permisos, layout ni IndexedDB.
- **Extracción por regex** (`core.test.js`, `flows.test.js`, `ui-regressions.test.js`): cortan una función con `/function NOMBRE\([\s\S]*?\n\}/` y la evaluan aparte. Convertir una de esas funciones a arrow function o cambiar su indentación **rompe la prueba silenciosamente**. Si extraes una función nueva, márcala con el mismo estilo.
- No escribas pruebas que solo busquen cadenas en el código fuente; prueba comportamiento. Para bugs, reproduce primero el fallo en una prueba, luego aplica el cambio mínimo.

## Datos y seguridad

- Frontend solo con URL y clave **anon**; nunca `service_role` ni `PHOTO_CLEANUP_TOKEN` en el cliente, fixtures, logs ni capturas.
- La clave pública no sustituye RLS. Las políticas permisivas de `INSERT` se combinan con OR: revisa a mano las políticas RLS creadas fuera del repositorio.
- No afirmes que una política o un cron existe en Supabase solo porque el SQL está en el repo. El despliegue y los permisos se verifican aparte.
- Nunca transmitas audio ni añadas un identificador estable del navegador a los datos públicos. Usa `textContent` para contenido de personas.
- Mapea, filtra y prueba escrituras, RLS, Storage y limpieza en un proyecto Supabase de **pruebas**, nunca en producción.

## Despliegue

- `.github/workflows/deploy.yml`: el job `quality` corre en push a `main`, a `codex/**` y en PR a `main`; `build` y `deploy` solo en `main` y solo si `quality` pasó. El workflow **no** configura por sí solo la protección de `main` (debe exigir el check `quality` y revisión de PR).
- Publicar en Pages **no** aplica migraciones ni despliega Edge Functions. Son pasos manuales y en este orden:
  `setup.sql` → `migrations/20260923_complete_features.sql` → `migrations/20260925_privacy_and_retention.sql` → (opcional) `migrations/20260925_schedule_photo_cleanup.sql`.
- El mapa nuevo depende de la RPC `noise_map_cells`: aplícala y verifícala **antes** de publicar el frontend.
- `supabase/functions/cleanup-noise-photos` tiene `verify_jwt = false` y exige `x-cleanup-token` en cada petición; su núcleo testeable está en `cleanup.mjs` (Deno/TS en el wrapper, lógica en ESM).
- Tras un despliegue, recarga las pestañas que ya estaban abiertas: sus fotos usaban rutas con identificadores antiguos que Storage ya no acepta.
- `.github/workflows/notificar-code2vault.yml` hace `repository_dispatch` a un repo privado en cada push a `main` que no sea solo documentación.

## Convenciones

- `const` por defecto, `let` solo con reasignación. Dos espacios, UTF-8, LF (`.editorconfig`).
- Comentarios en español, con JSDoc donde una confusión cambie el comportamiento.
- No reformatees archivos ajenos al cambio ni hagas refactorizaciones extensas sin motivo comprobado.
- Al integrarse deben pasar `npm ci --ignore-scripts`, `npm run check` y `git diff --check`; registra los casos manuales afectados (`docs/CALIDAD.md`, tabla M-01..M-09).

## Fuentes de verdad y documentos obsoletos

Lee antes de decidir: `README.md` (setup y despliegue), `CONTRIBUTING.md` (convenciones y proceso), `docs/ARQUITECTURA.md` (responsabilidades y contratos), `docs/CALIDAD.md` (riesgos, matriz de pruebas, evidencia), `.github/copilot-instructions.md` (reglas para agentes), `setup.sql` y `migrations/`.

- **`OBJETIVOS.md` está obsoleto**: describe `styles.css` y `script.js`, que ya no existen. No lo tomes como referencia de estructura.
- `graphify-out/`, `supabase/.temp/`, `node_modules/` y `dist/` están ignorados por Git. Graphify es una ayuda local; no incluyas su salida en PRs.
