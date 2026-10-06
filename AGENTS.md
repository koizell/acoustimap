# AGENTS.md

SPA estática (HTML + CSS + JS sin framework ni bundler) que mide ruido con el
micrófono y lo comparte como **índice relativo** en Supabase. Documentación y
comentarios en español; la UI está en es/en/pt.

## Comandos

```sh
npm run check          # puerta obligatoria: check:syntax + test (CI la ejecuta)
npm run check:syntax   # node --check sobre js/, scripts/, test/, sw.js, build-config.js, cleanup.mjs
npm test               # node --test sobre test/*.test.js
npm run dev            # servidor Node sin caché -> http://localhost:3000; abre el navegador

node --test test/coupling.test.js   # un solo archivo de pruebas
node --check js/map.js              # sintaxis de un solo archivo
```

- `npm run check` **no necesita `npm ci`**: toda la suite usa solo builtins de
  Node. `npm run dev` también usa builtins; `serve` permanece como dependencia
  histórica, pero ya no es necesario para levantar el servidor local.
- `npm run check:syntax` **ignora los argumentos**: siempre recorre todos los
  ficheros, no solo los que le pases. Para uno suelto usa `node --check <f>`.
- No hay ESLint, Prettier, TypeScript ni typecheck. La única puerta es `check`.
- No abras `index.html` por `file://`: el micrófono y la geolocalización exigen
  contexto seguro.
- `js/config.local.js` está en `.gitignore`. Cópialo de
  `js/config.local.js.template` para levantar la UI sin backend (con los
  placeholders no se crea el cliente Supabase y el mapa sale vacío: es lo
  esperado). `npm run build:config` lo genera desde `SUPABASE_URL` y
  `SUPABASE_ANON_KEY`, y falla con código 1 si falta alguna.
- `npm run build:site` rechaza placeholders antes de sustituir `dist/`. La
  configuración de la raíz y el artefacto deben coincidir al verificar.
- **Petición del usuario:** al terminar cambios de frontend, abrir el navegador
  con la versión actual y confirmar raíz/version/resultado de Supabase, no solo
  que el servidor arrancó. En WSL, `npm run dev` abre el navegador de Windows.
  No abrir otra instancia del servidor si ya existe una; el helper `openBrowser`
  exportado por `scripts/dev-server.js` permite abrir la URL del servidor activo.
  Si no se puede abrir o verificar, informar del bloqueo sin afirmar que se hizo.
  No activar el micrófono ni publicar datos de prueba reales automáticamente.
- En localhost no se registra la PWA; se retiran únicamente su registro/cachés,
  sin borrar IndexedDB o preferencias. En producción la PWA sigue disponible.

## Arquitectura: scripts clásicos, un solo ámbito global

No hay bundler. Los scripts clásicos comparten el ámbito global (excepto
`js/audio-level-processor.js`, módulo aislado de AudioWorklet), y
`index.html` los carga en un orden que **es un contrato**, no una preferencia:

```
config.local.js -> config.js -> map.js -> audio.js -> community.js -> app.js -> features.js
```

`test/coupling.test.js` fija esa lista exacta. Además exige que cualquier
fichero anterior a `features.js` **compruebe con `typeof`** antes de usar sus
globales, dentro de una ventana de 6 líneas:

```js
// obligatorio
if (typeof comparisonMode !== 'undefined' && comparisonMode) { ... }
if (typeof queueOfflineMeasurement === 'function') queueOfflineMeasurement(1);
```

Sin la guarda, `community.js` revienta con `ReferenceError` en TDZ durante la
carga, porque llama a `loadCommunityPoints()` → `renderCommunityPoints()` antes
de que `features.js` exista. Si añades un global a `features.js`, añádelo a la
lista `DE_FEATURES` de ese test.

`features.js` es el monolito que contiene análisis espacial, retos, cola
offline, PWA, tema e i18n. `app.js` es la capa fina de pestañas y modales.
`js/kalman.js` existe pero **está deliberadamente sin cargar** (ver el
comentario en `index.html`); el suavizado de GPS real está en `map.js`.

`audio.js` carga el procesador con `audioWorklet.addModule`, heredando su `?v=`.
El método v5 calcula espectros de 8192 muestras con Hann y ponderación A, promedia
su energía sobre 3 s y emite resúmenes cada 200 ms. Mantiene RMS crudo de 1 s para
diagnóstico; el máximo espectral caduca en la ventana de 3 s. No es SPL calibrado.
de audio. No usa AnalyserNode ni temporizadores para calcular las lecturas y
no sustituye el método en equipos sin AudioWorklet. El procesador no se añade
al orden de scripts clásicos del HTML; sí a build-site y APP_SHELL.

`index.html` lleva `onclick="fn()"` inline contra esos globales, y el texto
estático en español como fallback. Para copy nueva hay que tocar **tres** sitios:
el `index.html`, y los objetos `es`/`en`/`pt` de `updateStaticLanguage()` y del
bloque de traducciones de `features.js`. No hay `data-i18n`.

## Contratos que los tests hacen cumplir

Muchos tests no prueban comportamiento sino **invariantes de contrato**.
`npm run check` es la única red; leerlos antes de tocar código evita romperlos
en silencio.

- **La versión de caché está triplicada.** Todos los `?v=` de `index.html`
  deben llevar un único valor, y ese valor debe coincidir con
  `const ASSET_VERSION` **y** con `CACHE_NAME` en `sw.js`. Al tocar un asset
  público hay que subir los tres sitios a la vez o el
  service worker sigue sirviendo la versión vieja. `test/build-site.test.js`
  además falla si algún `src`/`href` del HTML o entrada de `APP_SHELL` de
  `sw.js` no existe en `dist/`.
- **Añadir un asset = tocar dos listas.** `scripts/build-site.js` tiene una
  lista explícita de ficheros públicos (no copia directorios), y su test exige
  que el HTML y `APP_SHELL` apunten solo a lo que existe en `dist/`.
- **El rango 30–95 del índice es una cadena acoplada.** `audio.js` acota con
  `Math.min(95, Math.max(30, ...))`; `normalizeDbForHeatmap` en `config.js`
  usa `(db - 30) / 65`; y los stops ámbar/naranja del gradiente en `map.js`
  (0.385 / 0.615) son exactamente los umbrales 55 y 70 sobre ese rango.
  Mueve uno y las celdas legítimas caen fuera de la escala o saturan de color.
- `updateMeter` en `audio.js` no puede volver a `getByteFrequencyData`: el
   índice es energía espectral ponderada A → dBFS + 100 → 30–95. `test/index-calibration.test.js`
  ejecuta `rmsToIndex` real con amplitudes sintéticas: no valida categorías de
  entornos reales ni una calibración SPL. El cálculo se temporiza, no usa FPS.
- Umbrales de categoría: bajo `< 55`, moderado `55–70`, alto `> 70`.
- `js/*.js` van en LF, igual que `.editorconfig`; no hay `.gitattributes`.
  `test/coupling.test.js` borra `\r` antes de analizar, así que su detector
  aguanta CRLF, pero no cambies el finales de línea solo por él.
- Sin `transition: all` en CSS; `prefers-reduced-motion` debe neutralizar
  animaciones `infinite`, no solo acortarlas; `meta theme-color`,
  `manifest.webmanifest` y `--bg-dark` en `base.css` deben coincidir.
- `.editorconfig`: LF, 2 espacios, newline final (salvo `*.md`).

## Pruebas

- `test/*.test.js`, un archivo por dominio, con `node:test` + `node:assert/strict`
  y `require()` (CommonJS) — el proyecto **no** usa `import` en las pruebas.
- `scripts/run-tests.js` solo recoge ficheros `*.test.js`; `test/helpers/` no
  son casos.
- No hay red, navegador ni Supabase. El harness es
  `test/helpers/browser-context.js`: `node:vm` con reloj congelado
  (`2026-09-26T15:00:00Z`), `localStorage` y `navigator` falsos. **No emula
  Leaflet, permisos, layout ni IndexedDB** — para eso hace falta un navegador.
- Para ejercitar una función suelta, los tests la extraen por regex del fuente
  (`functionSource`) y la evalúan en un contexto mínimo. Eso significa que la
  función debe seguir siendo una declaración `function` con ese nombre: si la
  conviertes a arrow o le cambias el nombre, el test rompe.
- La suite usa builtins de Node y no requiere servicios externos.

## SQL y Supabase

- Orden de aplicación: `setup.sql` y después `migrations/` **en orden alfabético**
  (prefijo `AAAAMMDD_`). Se ejecuta a mano en el SQL Editor; `deploy.yml` no
  toca la base de datos. Al añadir migración: nuevo fichero en `migrations/`,
  actualizar la lista ordenada de la sección "Despliegue de Supabase" del
  `README.md`, y explicar en el README si es para un proyecto nuevo o para uno
  existente.
- Restricciones que los tests vigilan sobre el SQL:
  - toda función `SECURITY DEFINER` debe fijar `set search_path`;
  - nada de `ADD CONSTRAINT ... NOT VALID` sin su `VALIDATE CONSTRAINT`;
  - la única función autorizada a borrar `noise_measurements` es
    `cleanup_old_noise_data` (retención). Podar datos desde una migración está
    prohibido; cualquier excepción nueva hay que justificarla en
    `test/migrations.test.js`.
- La app llama a la RPC `noise_map_cells_v5` en cada carga y al mover el mapa: sin
  esa función el mapa no funciona. Verifica que responde antes de publicar.
- Ejecuta las migraciones de método en orden v2, v3, v4, categorías y v5, sin
  volver a aplicar v2/v3 después de v5 (estrechan el CHECK). En una base ya migrada
  hasta v3, `deploy/apply-v5.sql` reúne las tres últimas. La cola conserva la
  versión original. Mapa, análisis y exportaciones filtran v5 y pueden empezar
  vacíos; las RPC antiguas permanecen. Comprobar ejecución como anon, no solo postgres.
- `supabase/functions/cleanup-noise-photos` tiene `verify_jwt = false` y exige
  el secreto `PHOTO_CLEANUP_TOKEN` en la cabecera `x-cleanup-token`. Ese mismo
  valor está duplicado en Supabase Vault como `acoustimap_photo_cleanup_token`
  para el trabajo de `pg_cron`, y **nada avisa si divergen**. Nunca pongas ese
  token en el frontend. `pg_net` encola en asíncrono: que `cron.job_run_details`
  diga `succeeded` no prueba que la función respondió 200 (el README trae la
  consulta de comprobación).

## Privacidad (invariantes, no sugerencias)

`test/repo-hygiene.test.js` y varios de flujo lo verifican:

- **Ningún payload enviado a Supabase lleva `client_id`**, aunque
  `features.js` mantenga un `featureClientId` en `localStorage`. No lo
  reintroduzcas, ni en mediciones, ni en la cola offline, ni en reportes.
- Toda coordenada que sale se ancla con `snapToGrid` a la celda de ~70 m
  (`CELL_SIZE_M`), también al reencolar registros antiguos.
- Solo `cleanup_old_noise_data` borra mediciones. No escribas una segunda vía.
- Nada de docs afirma que el índice sean dB SPL calibrados. Las reglas de
  retención (`90 d` mediciones/sesiones, `24 horas` confirmaciones, `30 d`
  reportes) están fijadas por test en `SECURITY.md`: si cambian en SQL, cambia
  también el texto.

## Git, ramas y despliegue

- Rama de trabajo `dev`. `main` es la de despliegue: la fusión la hace una
  persona.
- `deploy.yml` corre en push a `main`/`codex/**` y en PR a `main`, con jobs `quality` →
  `build` → `deploy`. `build`/`deploy` solo se ejecutan si
  `github.ref == 'refs/heads/main'`; un push a `dev` no activa ese flujo. Node 24 en CI.
- Publicar **no** aplica migraciones ni despliega Edge Functions: es un paso
  manual y en orden.
- Ojo: un push a `main` con cambios de código también dispara
  `notificar-code2vault.yml`, que manda un `repository_dispatch` a un repo
  privado externo. No lo toques ni lo saltes sin avisar.
- Asunto de commit en español, en imperativo y en una línea; el cuerpo explica
  el porqué. Los commits más antiguos vienen en inglés: la convención actual
  es español.
- `opencode.json` está en `.gitignore` a propósito (commit `bee6121` lo retiró).
  Las instrucciones viven aquí; no lo reintroduzcas.
- `LICENSE` (MIT, `Copyright (c) 2026 Koizell`) y `SECURITY.md` no son
  opcionales: hay tests de regresión porque ya se borraron por error una vez.
