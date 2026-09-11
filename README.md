# 🎙️ AcoustiMap

> **Mapeo colaborativo de contaminación acústica urbana.**
> Convierte tu dispositivo en un sensor acústico ciudadano: mide el ruido, compártelo de forma anónima y visualiza zonas de riesgo sonoro en un mapa en tiempo real.

[![GitHub Pages](https://img.shields.io/badge/demo-en%20vivo-success?logo=github)](https://koizell.github.io/acoustimap/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?logo=leaflet)](https://leafletjs.com)
[![Licencia](https://img.shields.io/badge/Licencia-MIT-blue.svg)](#-licencia)

🌐 **Demo en vivo:** [https://koizell.github.io/acoustimap/](https://koizell.github.io/acoustimap/)

---

## 📖 Tabla de contenidos

- [¿Qué es AcoustiMap?](#-qué-es-acoustimap)
- [Cómo funciona](#-cómo-funciona)
- [Características principales](#-características-principales)
- [Privacidad por diseño](#-privacidad-por-diseño)
- [Cómo usarlo](#-cómo-usarlo)
- [Stack tecnológico](#-stack-tecnológico)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Instalación y despliegue](#-instalación-y-despliegue)
- [Configuración de Supabase](#-configuración-de-supabase)
- [Cómo contribuir](#-cómo-contribuir)
- [ODS relacionados](#-ods-relacionados)
- [Licencia](#-licencia)
- [Autor](#-autor)

---

## 🎯 ¿Qué es AcoustiMap?

**AcoustiMap** es una aplicación web que permite a cualquier persona **medir el nivel de ruido ambiental** de su entorno usando el micrófono de su dispositivo y **compartirlo de forma anónima** en un mapa comunitario.

El proyecto nació para visibilizar la **contaminación acústica urbana**, un problema de salud pública subestimado, y aportar datos abiertos y ciudadanos a los **Objetivos de Desarrollo Sostenible (ODS)** de la ONU.

---

## ⚙️ Cómo funciona

El flujo de la aplicación es simple:

### 1. Mides con el micrófono 🎤
Al pulsar **"Activar Micrófono"**, la app accede al micrófono (con tu permiso) y comienza a analizar la intensidad del sonido en tiempo real usando la **Web Audio API**. No se graba nada, solo se calcula la intensidad en decibelios (dB).

### 2. La app calcula el dB 📊
Cada 200 ms se toma una muestra del espectro de frecuencias del micrófono y se convierte en un nivel aproximado de presión sonora (dB SPL). Se muestran:

- Nivel instantáneo (medidor en vivo)
- Promedio de la sesión
- Mínimo, máximo y número de muestras

### 3. Compartes de forma anónima 🔒
Si activas **"Compartir en el mapa"**, la app:

1. Obtiene tu ubicación GPS con **alta precisión**.
2. La **ancla a una cuadrícula de ~70 m** (nadie sabe tu dirección exacta).
3. Envía el nivel de ruido + coordenada difuminada a **Supabase** cada 10 segundos.

Tú ves tu ubicación **exacta** (punto azul), pero los demás usuarios solo ven la **zona difuminada** con el nivel de ruido.

### 4. Visualizas el mapa comunitario 🗺️
El mapa muestra las zonas de ruido reportadas por todos los usuarios, clasificadas por color:

| Color | Nivel | Significado |
|---|---|---|
| 🟢 Verde | < 55 dB | Entorno confortable |
| 🟡 Amarillo | 55 - 70 dB | Ligeramente molesto |
| 🔴 Rojo | > 70 dB | Dañino / crítico |

Cada zona muestra un tooltip con **"hace X min/h/d"** indicando cuándo fue la última medición en ese punto.

### 5. Se limpia solo 🧹
Un **cron job** en PostgreSQL borra cada hora las mediciones con más de **24 horas de antigüedad** que **no tengan** otras mediciones cercanas (< 30 m) en ese período. Así, el mapa solo muestra zonas "vivas".

---

## ✨ Características principales

| Característica | Descripción |
|---|---|
| 🎤 **Medición en vivo** | Cálculo de dB con Web Audio API, sin grabar audio |
| 📊 **Estadísticas de sesión** | Promedio, mínimo, máximo, muestras y duración |
| 🗺️ **Mapa interactivo** | Leaflet + OpenStreetMap con zoom y capas |
| 🟢🟡🔴 **Clasificación por riesgo** | Bajo, Moderado, Alto según dB |
| 📍 **Marcador personal exacto** | Solo tú ves tu ubicación real (círculo azul) |
| 🔒 **Difuminado determinista** | Tu posición se ancla a una cuadrícula de ~70 m |
| 🕒 **Historial con timestamps** | Cada zona muestra "hace Xm/h/d" desde la última medición |
| 🔄 **Modo En Vivo / Historial** | Alterna entre últimas 24 h o todo el histórico |
| 🌓 **Panel colapsable** | Icono ℹ️ que despliega la leyenda del mapa |
| 📱 **Responsive** | Adaptado a móvil, tablet y escritorio |
| 💾 **Resumen de sesión** | Guarda un resumen promedio al detener el monitoreo |
| 🔋 **Wake Lock API** | Mantiene la pantalla encendida mientras mide |

---

## 🔐 Privacidad por diseño

AcoustiMap está construido con la privacidad como **principio fundamental**, no como una ocurrencia tardía.

| Dato | ¿Se guarda? | ¿Dónde? |
|---|---|---|
| 🎵 **Audio** | ❌ Nunca | Se procesa en memoria y se descarta |
| 📍 **Ubicación exacta** | ❌ Nunca sale del dispositivo | Solo se muestra en tu navegador |
| 📍 **Ubicación difuminada** | ✅ Sí | Supabase (anclada a cuadrícula de ~70 m) |
| 📊 **Nivel de dB** | ✅ Sí | Supabase (asociado a la ubicación difuminada) |
| 🆔 **Identidad del usuario** | ❌ Nunca | No hay cuentas, login ni cookies |

### ¿Qué es la cuadrícula de ~70 m?

En vez de enviar tu latitud/longitud exactas, la app las **ancla al centro de una celda fija** de ~70 × 70 metros. Esto significa que:

- Todas tus mediciones desde el mismo lugar caen en **el mismo punto** (sin ruido visual).
- Nadie puede **triangular** tu posición real usando múltiples mediciones.
- Es **consentido explícitamente** mediante un checkbox antes de compartir.

### Consentimiento explícito

Antes de enviar cualquier dato a la nube, la app muestra un **modal de confirmación** explicando:

- Qué se envía (nivel de dB + coordenada difuminada)
- Qué **NO** se envía (audio, ubicación exacta, identidad)
- Cómo se protege tu privacidad

---

## 🚀 Cómo usarlo

### 1. Abre la aplicación

Visita [https://koizell.github.io/acoustimap/](https://koizell.github.io/acoustimap/) desde cualquier navegador moderno.

> ⚠️ **Recomendado:** usar **HTTPS** (GitHub Pages ya lo tiene) y aceptar los permisos de **micrófono** y **ubicación**.

### 2. Activa el micrófono

Pulsa el botón **🎤 Activar Micrófono** y acepta el permiso del navegador.

- Verás el **medidor en vivo** con tu nivel de dB actual.
- El **promedio de la sesión** se calcula automáticamente.

### 3. Comparte en el mapa

Pulsa **📡 Compartir en mapa**. Aparecerá un **modal de privacidad**. Si aceptas:

- Se solicitará permiso de ubicación (una sola vez).
- Tu punto azul aparecerá en el mapa.
- Cada 10 segundos se enviará un promedio a Supabase.

### 4. Explora el mapa

- **Zoom:** botones `+`/`−` arriba a la izquierda.
- **Centrar en mí:** botón 📍 arriba a la izquierda.
- **Leyenda:** icono ℹ️ arriba a la derecha.
- **Modo En Vivo / Historial:** toggle arriba a la derecha.
- **Detalles de cada zona:** toca cualquier círculo del mapa.

### 5. Detén el monitoreo

Pulsa **⏹️ Detener**. La app guardará un **resumen de sesión** (promedio + duración + ubicación anclada) y liberará los recursos.

---

## 🧰 Stack tecnológico

| Capa | Tecnología | Uso |
|---|---|---|
| **Frontend** | HTML5, CSS3, JavaScript (Vanilla) | Interfaz y lógica cliente |
| **Mapas** | Leaflet 1.9.4 + OpenStreetMap | Renderizado del mapa |
| **Audio** | Web Audio API (`AnalyserNode`) | Análisis de frecuencias en dB |
| **Geolocalización** | `navigator.geolocation` | Posición con `enableHighAccuracy` |
| **Backend** | Supabase (PostgreSQL) | Almacenamiento de mediciones |
| **Hosting** | GitHub Pages | Despliegue estático gratuito |
| **Estilos** | CSS modular con variables | Tema claro, responsive |

---

## 📁 Estructura del proyecto

```
acoustimap/
├── index.html              → Página principal
├── README.md               → Este archivo
├── css/
│   ├── base.css            → Variables, reset, animaciones
│   ├── layout.css          → Header, tabs, contenedores
│   ├── map.css             → Mapa, leyenda, tooltips
│   ├── panel.css           → Botones, stats, modal
│   ├── info.css            → Pestañas Salud y ODS
│   └── responsive.css      → Media queries
├── js/
│   ├── config.js           → Credenciales, constantes, utilidades
│   ├── map.js              → Mapa Leaflet, marcador, botón 📍
│   ├── audio.js            → Micrófono, cálculo de dB, sesión
│   ├── community.js        → Supabase: carga y envío
│   └── app.js              → Tabs, leyenda, modal, botones
└── sql/
    └── setup.sql           → Esquema de base de datos + RLS + cron
```

### Orden de carga (importante)

Los archivos JS se cargan en este orden específico:

```html
<script src="js/config.js"></script>     <!-- 1. Base -->
<script src="js/map.js"></script>        <!-- 2. Mapa -->
<script src="js/audio.js"></script>      <!-- 3. Audio -->
<script src="js/community.js"></script>  <!-- 4. Supabase -->
<script src="js/app.js"></script>        <!-- 5. UI final -->
```

Los CSS también tienen orden (el `responsive.css` debe ir al final).

---

## 🛠️ Instalación y despliegue

### Requisitos

- Un navegador moderno (Chrome, Firefox, Edge, Safari).
- Un servidor local simple para desarrollo (HTTPS en producción).

### Clonar el repositorio

```bash
git clone https://github.com/koizell/acoustimap.git
cd acoustimap
```

### Ejecutar localmente

**Opción A — Python 3:**
```bash
python -m http.server 8000
```

**Opción B — Node.js:**
```bash
npx serve
```

**Opción C — VS Code:**
Instala la extensión **Live Server** y haz clic derecho en `index.html` → *"Open with Live Server"*.

Abre: [http://localhost:8000](http://localhost:8000)

> ⚠️ El micrófono y la geolocalización requieren **HTTPS** en producción. En `localhost` funcionan sin problema.

### Despliegue en GitHub Pages

1. Sube tu código a GitHub.
2. Ve a **Settings → Pages**.
3. Configura:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main`
   - **Folder:** `/ (root)`
4. Guarda. En 1–2 minutos estará en `https://<tu-usuario>.github.io/acoustimap/`.

---

## 🗄️ Configuración de Supabase

### 1. Crear el proyecto

1. Regístrate en [supabase.com](https://supabase.com).
2. Crea un proyecto llamado `acoustimap`.
3. Elige la región más cercana a tus usuarios (ej: São Paulo para Sudamérica).

### 2. Ejecutar el SQL

Abre el **SQL Editor** en Supabase y pega el contenido de `sql/setup.sql`. Al ejecutarlo:

- Se crean las tablas `noise_measurements` y `noise_sessions`.
- Se activa **Row Level Security (RLS)**.
- Se crean políticas de lectura e inserción para anónimos.
- Se programa un **cron job** de limpieza automática cada hora.

### 3. Obtener credenciales

Ve a **Project Settings → API** y copia:

- **Project URL** → va en `js/config.js` (`SUPABASE_URL`).
- **anon public key** → va en `js/config.js` (`SUPABASE_ANON_KEY`).

> 🔐 **La `anon key` es pública por diseño.** Lo que protege tus datos son las **políticas RLS**, no el secreto de la clave.

### 4. Estructura de las tablas

**`noise_measurements`** (mediciones individuales)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` | Identificador único |
| `latitude` | `double precision` | Latitud anclada a cuadrícula |
| `longitude` | `double precision` | Longitud anclada a cuadrícula |
| `db_level` | `integer` | Nivel de ruido (20-140) |
| `category` | `text` | `bajo` / `moderado` / `alto` |
| `created_at` | `timestamptz` | Fecha de la medición |

**`noise_sessions`** (resumen de sesiones)

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` | Identificador único |
| `latitude` | `double precision` | Latitud anclada |
| `longitude` | `double precision` | Longitud anclada |
| `avg_db` | `integer` | Promedio de la sesión |
| `category` | `text` | Clasificación |
| `sample_count` | `integer` | Número de muestras |
| `start_time` | `timestamptz` | Inicio de la sesión |
| `end_time` | `timestamptz` | Fin de la sesión |

### 5. Seguridad (RLS)

| Operación | Permiso | Restricción |
|---|---|---|
| `SELECT` | ✅ Anónimos | Sin restricción |
| `INSERT` | ✅ Anónimos | Validación de rangos |
| `UPDATE` | ❌ Nadie | — |
| `DELETE` | ❌ Nadie (solo cron) | — |

---

## 🤝 Cómo contribuir

Las contribuciones son bienvenidas. Si quieres aportar:

1. Haz un **fork** del repositorio.
2. Crea una rama para tu feature: `git checkout -b feature/nueva-funcionalidad`.
3. Haz commits descriptivos: `git commit -m "Añadir filtro por rango de dB"`.
4. Sube tu rama: `git push origin feature/nueva-funcionalidad`.
5. Abre un **Pull Request** explicando tu cambio.

### Ideas para contribuir

- 🎨 Nuevos temas visuales (oscuro, alto contraste).
- 📊 Gráficos históricos por zona.
- 🌍 Soporte multi-idioma (i18n).
- 📤 Exportar datos a CSV/GeoJSON.
- 🗺️ Mapa de calor continuo (heatmap).
- 📱 PWA instalable con soporte offline.

---

## 🌍 ODS relacionados

| ODS | Meta | Aporte de AcoustiMap |
|---|---|---|
| **ODS 3** — Salud y Bienestar | 3.9: Reducir muertes por contaminación | Visibiliza zonas de riesgo acústico |
| **ODS 11** — Ciudades Sostenibles | 11.6: Reducir impacto ambiental urbano | Datos ciudadanos para planificación |
| **ODS 17** — Alianzas | 17.17: Alianzas multisector | Ciencia ciudadana abierta |

---

## 📄 Licencia

Este proyecto está bajo la licencia **MIT**. Puedes usarlo, modificarlo y redistribuirlo libremente, siempre citando el origen.

Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

## 👤 Autor

**Koizell** — [github.com/koizell](https://github.com/koizell)

¿Preguntas, sugerencias o bugs? Abre un [issue](https://github.com/koizell/acoustimap/issues) en el repositorio.

---

<p align="center">
  <sub>Hecho con 🎙️, ☕ y conciencia ambiental en Colombia.</sub>
</p>
