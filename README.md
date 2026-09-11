# 🎙️ AcoustiMap

> **Mapeo colaborativo de contaminación acústica urbana.**
> Convierte tu dispositivo en un sensor acústico ciudadano: mide el ruido, compártelo de forma anónima y visualiza zonas de riesgo sonoro en un mapa en tiempo real.

[![Demo](https://img.shields.io/badge/demo-en%20vivo-success?logo=github)](https://koizell.github.io/acoustimap/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet)](https://leafletjs.com)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-blue.svg)](#licencia)

🌐 **Demo en vivo:** [https://koizell.github.io/acoustimap/](https://koizell.github.io/acoustimap/)

---

## 🎯 ¿Qué es?

**AcoustiMap** permite medir el nivel de ruido ambiental con el micrófono de tu dispositivo y compartirlo **de forma anónima** en un mapa comunitario. El proyecto visibiliza la contaminación acústica urbana y aporta datos ciudadanos a los ODS de la ONU.

---

## ⚙️ Cómo funciona

1. **Mides** → La app analiza el micrófono con la Web Audio API (no graba audio).
2. **Calcula** → Convierte la intensidad en decibelios (dB) en tiempo real.
3. **Compartes** → Si lo autorizas, tu ubicación se ancla a una cuadrícula de ~70 m y se envía a Supabase cada 10 s.
4. **Visualizas** → El mapa muestra zonas de ruido clasificadas por color:
   - 🟢 **< 55 dB** · Bajo
   - 🟡 **55 – 70 dB** · Moderado
   - 🔴 **> 70 dB** · Alto
5. **Se limpia solo** → Un cron job borra mediciones huérfanas cada hora.

---

## 🔐 Privacidad por diseño

| Dato | ¿Se guarda? |
|---|---|
| 🎵 Audio | ❌ Nunca |
| 📍 Ubicación exacta | ❌ Nunca sale del dispositivo |
| 📍 Ubicación difuminada (~70 m) | ✅ Sí, en Supabase |
| 📊 Nivel de dB | ✅ Sí |
| 🆔 Identidad del usuario | ❌ Nunca |

**Consentimiento explícito:** antes de enviar nada, aparece un modal explicando qué se comparte y qué no.

---

## 🚀 Uso

1. Abre la [demo](https://koizell.github.io/acoustimap/).
2. Pulsa **🎤 Activar Micrófono** y acepta el permiso.
3. Pulsa **📡 Compartir en mapa** y acepta el modal de privacidad.
4. Explora el mapa: zoom, leyenda (ℹ️), botón 📍 para centrar y toggle **En Vivo / Historial**.
5. Detén con **⏹️ Detener** para guardar el resumen de la sesión.

---

## 🧰 Stack

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Mapas | Leaflet + OpenStreetMap |
| Audio | Web Audio API |
| Backend | Supabase (PostgreSQL) |
| Hosting | GitHub Pages |

---

## 📁 Estructura

```
acoustimap/
├── index.html
├── css/
│   ├── base.css        · variables y reset
│   ├── layout.css      · header y tabs
│   ├── map.css         · mapa, leyenda, tooltips
│   ├── panel.css       · botones, stats, modal
│   ├── info.css        · pestañas Salud y ODS
│   └── responsive.css  · media queries
├── js/
│   ├── config.js       · credenciales y utilidades
│   ├── map.js          · mapa y marcador
│   ├── audio.js        · micrófono y dB
│   ├── community.js    · Supabase
│   └── app.js          · UI y eventos
└── sql/
    └── setup.sql       · esquema + RLS + cron
```

---

## 🛠️ Instalación local

```bash
git clone https://github.com/koizell/acoustimap.git
cd acoustimap
python -m http.server 8000
# Abre http://localhost:8000
```

> ⚠️ El micrófono y la geolocalización requieren **HTTPS** en producción.

---

## 🗄️ Configuración de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ejecuta `sql/setup.sql` en el **SQL Editor**.
3. Copia **Project URL** y **anon key** desde *Settings → API*.
4. Pégalos en `js/config.js` (`SUPABASE_URL` y `SUPABASE_ANON_KEY`).

> 🔐 La `anon key` es pública por diseño. Los datos están protegidos por **políticas RLS**.

---

## 🌍 ODS relacionados

| ODS | Aporte |
|---|---|
| **ODS 3** — Salud y Bienestar | Visibiliza zonas de riesgo acústico |
| **ODS 11** — Ciudades Sostenibles | Datos ciudadanos para planificación urbana |

---

## 🤝 Contribuir

1. Haz un **fork**.
2. Crea una rama: `git checkout -b feature/nueva-funcionalidad`.
3. Commits descriptivos y **pull request**.

**Ideas:** temas visuales, gráficos históricos, multi-idioma, exportar a CSV, heatmap, PWA offline.

---

## Licencia

MIT © [Koizell](https://github.com/koizell)

---

<p align="center">
  <sub>Hecho con 🎙️ y conciencia ambiental en Colombia.</sub>
</p>
