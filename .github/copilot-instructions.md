
# Instrucciones para GitHub Copilot - AcoustiMap

Este archivo da contexto permanente a Copilot sobre el proyecto AcoustiMap. **Léelo siempre antes de sugerir código.**

---

## 🎯 Descripción del proyecto

**AcoustiMap** es una aplicación web de ciencia ciudadana que permite medir el nivel de ruido ambiental con el micrófono del dispositivo y compartirlo de forma anónima en un mapa comunitario.

- **Frontend:** HTML + CSS + JavaScript vanilla (sin frameworks)
- **Mapas:** Leaflet 1.9.4 + OpenStreetMap
- **Audio:** Web Audio API (AnalyserNode)
- **Backend:** Supabase (PostgreSQL)
- **Hosting:** GitHub Pages
- **Idioma del código y UI:** Español

---

## 📁 Estructura del proyecto

```
acoustimap/
├── index.html              · Página única (SPA)
├── README.md               · Documentación pública
├── SECURITY.md             · Política de seguridad
├── css/
│   ├── base.css            · Variables, reset, animaciones
│   ├── layout.css          · Header, tabs, contenedores
│   ├── map.css             · Mapa, leyenda, tooltips
│   ├── panel.css           · Botones, stats, modales
│   ├── info.css            · Pestañas Salud y ODS
│   └── responsive.css      · Media queries (cargar al final)
├── js/
│   ├── config.js           · Credenciales, constantes, estado global
│   ├── map.js              · Mapa, marcadores, ubicación
│   ├── audio.js            · Micrófono, dB, sesión
│   ├── community.js        · Supabase: carga y envío
│   └── app.js              · UI, tabs, modales, eventos
└── sql/
    └── setup.sql           · Esquema BD (NO modificar sin avisar)
```

**Orden de carga de scripts (crítico):**

```
config.js → map.js → audio.js → community.js → app.js
```

---

## 🧠 Conceptos clave del proyecto

### Estado global (en `js/config.js`)

- `isMonitoring`: si el micrófono está activo
- `sharingEnabled`: si el usuario comparte ubicación
- `currentPosition`: `{ lat, lng, accuracy }` filtrada con Kalman
- `session`: objeto con `sum`, `count`, `min`, `max`, `startTime`, `timerId`
- `mapMode`: `'live'` (últimas 24h) o `'history'` (todo)
- `positionHistory`: array de últimas lecturas GPS

### Privacidad por diseño

- El audio **nunca** se graba ni transmite.
- La ubicación exacta **nunca** sale del navegador.
- Las coordenadas se anclan a una cuadrícula de **~70 m** con `snapToGrid()` antes de enviarse.
- Los usuarios ven su ubicación exacta (punto azul) pero los demás solo ven la zona difuminada.
- Sin login, sin cookies, sin IPs guardadas.

### Constantes importantes

- `CELL_SIZE_M = 70`: tamaño de la celda de difuminado
- `CIRCLE_VISUAL_RADIUS_M = 50`: radio visual del círculo comunitario
- `SEND_INTERVAL_MS = 10000`: envío a Supabase cada 10 s
- `REFRESH_INTERVAL_MS = 30000`: refresco del mapa cada 30 s
- `AGG_GRID = 0.0014`: agrupación de mediciones cercanas

### Clasificación de ruido

- `< 55 dB` → `bajo` (verde)
- `55 – 70 dB` → `moderado` (amarillo)
- `> 70 dB` → `alto` (rojo)

---

## 🗄️ Base de datos Supabase

### Tablas

**`noise_measurements`** (mediciones individuales)

| Columna    | Tipo        |
| ---------- | ----------- |
| id         | uuid (PK)   |
| latitude   | float8      |
| longitude  | float8      |
| db_level   | int4        |
| category   | text        |
| created_at | timestamptz |

**`noise_sessions`** (resumen de sesiones)

| Columna      | Tipo        |
| ------------ | ----------- |
| id           | uuid (PK)   |
| latitude     | float8      |
| longitude    | float8      |
| avg_db       | int4        |
| category     | text        |
| sample_count | int4        |
| start_time   | timestamptz |
| end_time     | timestamptz |

### Seguridad

- **RLS activado** en ambas tablas.
- Políticas: solo `SELECT` e `INSERT` para `anon` y `authenticated`.
- **NUNCA** sugerir políticas de `UPDATE` o `DELETE` desde el cliente.
- La limpieza la hace un cron job del servidor.

### Cliente Supabase

```js
supabaseClient.from('noise_measurements').insert({ ... })
supabaseClient.from('noise_measurements').select('...').gte('created_at', since)
```

---

## 🎨 Convenciones de código

### JavaScript

- **Vanilla JS**, sin frameworks, sin bundlers, sin npm.
- Usar `const` y `let`, nunca `var`.
- Funciones nombradas con verbos: `loadCommunityPoints`, `sendMeasurementIfDue`.
- Variables en camelCase, constantes globales en SCREAMING_SNAKE_CASE.
- Comentarios y textos en **español**.
- Cada archivo tiene un comentario de cabecera describiendo su responsabilidad.

### CSS

- Usar variables CSS ya definidas: `--primary`, `--green`, `--yellow`, `--red`, `--card-bg`, `--text-main`, `--text-muted`.
- Mobile-first en `responsive.css`.
- No añadir frameworks CSS (Tailwind, Bootstrap, etc.).
- Mantener la modularidad: cada estilo en su archivo correspondiente.

### HTML

- Sin plantillas ni frameworks.
- IDs semánticos en español cuando sea posible.
- `data-*` attributes para hooks de JS si hace falta.

---

## 🚫 Qué NO hacer

- ❌ **No** usar frameworks (React, Vue, Svelte, etc.).
- ❌ **No** añadir `package.json` ni `node_modules`.
- ❌ **No** usar TypeScript (el proyecto es JS puro).
- ❌ **No** modificar `sql/setup.sql` sin avisar.
- ❌ **No** exponer la `service_role` key de Supabase.
- ❌ **No** usar `eval()` ni `Function()` con datos dinámicos.
- ❌ **No** usar `innerHTML` con datos del usuario.
- ❌ **No** cambiar el orden de carga de los scripts.
- ❌ **No** romper la privacidad: si tocas `snapToGrid`, `sendMeasurementIfDue` o `showMyLocation`, revisa que la lógica de difuminado siga intacta.
- ❌ **No** añadir dependencias externas sin justificarlo (CDN sí, npm no).

---

## ✅ Qué SÍ hacer

- ✅ Mantener la separación de responsabilidades por archivo.
- ✅ Reutilizar funciones y constantes existentes antes de crear nuevas.
- ✅ Actualizar `README.md` y `SECURITY.md` si el cambio lo amerita.
- ✅ Añadir tooltips explicativos en zonas del código que lo requieran.
- ✅ Usar `leaflet` puro para mapas (no plugins sin justificar).
- ✅ Probar que el modo "En Vivo" y "Historial" sigan funcionando tras cambios en `community.js`.

---

## 🎯 Funcionalidades planificadas (contexto para futuras implementaciones)

Las siguientes funciones están planeadas. Al implementar alguna, priorizar simplicidad y no romper lo existente:

### Prioridad alta

1. **Mapa de calor (heatmap)** — reemplazar círculos por capa continua con `leaflet.heat`.
2. **Filtros por franja horaria** — mañana / tarde / noche.
3. **Exportar datos** — botón para descargar CSV/GeoJSON desde Supabase.
4. **Modo oscuro** — toggle en el header con `prefers-color-scheme`.

### Prioridad media

5. **Sistema de confirmación de ruido** — botón "Yo también lo escucho" en cada zona.
6. **Panel de estadísticas por zona** — gráfico de evolución al hacer clic en un punto.
7. **Ranking de zonas** — Top 3 más ruidosas / más silenciosas.

### Prioridad baja

8. **Dibujar zonas (sketch)** — polígono para filtrar por área.
9. **Comparar antes/después** — dos capas temporales.
10. **Reportes ciudadanos** — nota corta + opcional foto.
11. **PWA offline** — service worker + manifest.
12. **Internacionalización (i18n)** — español + inglés + portugués.
13. **Retos de medición** — gamificación.
14. **Alertas de ruido persistente** — marcar zonas crónicas.

---

## 📌 Reglas para cambios grandes

Cuando se pida implementar una funcionalidad nueva:

1. **Preguntar primero** en qué archivo(s) va, antes de escribir código.
2. **No reescribir** archivos completos si solo se necesitan cambios puntuales.
3. **Preservar** la estructura modular existente.
4. **Mantener** el idioma español en textos de UI y comentarios.
5. **No añadir** librerías nuevas sin confirmar (excepto `leaflet.heat` para el heatmap).
6. **Verificar** que el cambio no rompe la privacidad ni la seguridad.

---

## 🔗 Enlaces útiles

- Repositorio: https://github.com/koizell/acoustimap
- Demo: https://koizell.github.io/acoustimap/
- Leaflet docs: https://leafletjs.com/reference.html
- Supabase JS docs: https://supabase.com/docs/reference/javascript
- leaflet.heat: https://github.com/Leaflet/Leaflet.heat

---

**Última actualización:** 2026
