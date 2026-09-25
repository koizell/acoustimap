# 🎙️ AcoustiMap

**Mapa colaborativo de contaminación acústica urbana.**

AcoustiMap convierte tu dispositivo en un sensor de ruido ciudadano. Mide el nivel de sonido de tu entorno, compártelo de forma **anónima** y explora un mapa con las zonas de ruido reportadas por la comunidad.

🌐 **Abrir la aplicación:** [https://koizell.github.io/acoustimap/](https://koizell.github.io/acoustimap/)

---

## 📖 ¿Qué es AcoustiMap?

Es una herramienta de **ciencia ciudadana** para visibilizar la contaminación acústica. Cualquier persona puede:

- **Medir** el nivel de ruido de su entorno con el micrófono.
- **Compartir** esa medición de forma anónima en un mapa comunitario.
- **Explorar** las zonas de ruido de la ciudad en tiempo real.
- **Reportar** problemas específicos de ruido (obras, fiestas, tráfico).
- **Consultar estadísticas** y tendencias por zona.
- **Descargar los datos** para análisis propio.

---

## 🗺️ Las 3 secciones de la app

La aplicación tiene 3 pestañas principales en la parte superior:

| Pestaña | Para qué sirve |
|---|---|
| **🗺️ Mapa** | Medir ruido y explorar zonas comunitarias |
| **📚 Salud + ODS** | Información sobre ruido, salud y ODS |
| **📊 Stats** | Estadísticas, reportes y comparativas |

---

## 🚀 Cómo usar la pestaña Mapa

### 1. Activar el micrófono

Pulsa el botón **🎤 Activar** y acepta el permiso que te pedirá el navegador.

> **🔒 Tu privacidad está protegida:** el micrófono solo se usa para calcular la intensidad del sonido. **No se graba audio. No se transmite audio. No se guarda audio.**

### 2. Medir el ruido

Verás en pantalla:

- **Nivel instantáneo** en tiempo real (grande y destacado).
- **Promedio** de tu sesión, con mínimo, máximo y número de muestras.
- Una **clasificación por color**:
  - 🟢 **Bajo** (< 55 dB) · Entorno confortable
  - 🟡 **Moderado** (55 – 70 dB) · Ligeramente molesto
  - 🔴 **Alto** (> 70 dB) · Ruido dañino

### 3. Compartir en el mapa (opcional)

Si quieres aportar tu medición al mapa, pulsa **📡 Compartir**. Aparecerá un aviso de privacidad. Solo si aceptas, tu medición se enviará de forma anónima.

### 4. Explorar el mapa

- **🎨 Heatmap:** vista de calor con las zonas más ruidosas.
- **📍 Zonas:** vista de puntos con niveles individuales.
- **Franja horaria:** filtra por Todo / Mañana / Tarde / Noche.
- **ℹ️ Leyenda:** colores, contador de mediciones y botones de exportación.
- **📍 Centrar:** vuelve a tu ubicación actual.
- **Zoom:** botones `+` y `−` arriba a la izquierda.

---

## 📊 Cómo usar la pestaña Stats

Esta es la sección más completa. Tiene 4 subsecciones:

### 📈 Resumen

Vista general con:

- **Total de mediciones** registradas en la ciudad.
- **Promedio general** de dB.
- **Niveles altos** detectados.
- **Zonas más ruidosas** (Top 3 con sus coordenadas y número de mediciones).
- **Zonas más silenciosas** (Top 3).
- **Alertas persistentes:** zonas que llevan varios días con niveles altos.

### 📝 Reportar ruido

Puedes dejar un **reporte ciudadano** sobre un problema específico:

- Escribe una nota corta describiendo el origen del ruido (obra, fiesta, tráfico pesado, etc.).
- Añade la ubicación (se difumina igual que las mediciones).
- El reporte queda visible para toda la comunidad.

> Los reportes ciudadanos **humanizan los datos**: no solo dicen "72 dB" sino también *"obra en la calle desde las 7 AM"*.

### ↔️ Comparar meses

Visualiza **dos periodos de tiempo en paralelo** para ver si el ruido ha mejorado o empeorado en una zona específica.

- Selecciona el mes A y el mes B.
- El mapa muestra las diferencias con colores.
- Útil para evaluar el impacto de políticas urbanas o cambios de tráfico.

### 🎯 Retos

Pequeños **desafíos de medición** que gamifican la participación:

- "Mide tu calle 3 veces esta semana"
- "Encuentra la zona más silenciosa de tu barrio"
- "Reporta un ruido molesto persistente"

Cada reto completado genera datos más consistentes y te ayuda a explorar tu ciudad.

---

## 📤 Exportar datos

Desde la leyenda del mapa puedes descargar las mediciones de la comunidad en dos formatos:

- **📄 CSV** → ideal para Excel o Google Sheets.
- **🌐 GeoJSON** → ideal para software de mapas (QGIS, ArcGIS, etc.).

Perfecto para estudiantes, investigadores o funcionarios que quieran hacer su propio análisis.

---

## 🔒 Tu privacidad

AcoustiMap está diseñado con la **privacidad como prioridad**. Esto es lo que ocurre con tu información:

| Dato | ¿Se guarda? | ¿Dónde? |
|---|---|---|
| 🎵 **Audio** | ❌ **Nunca** | Se analiza en tu dispositivo y se descarta |
| 📍 **Ubicación exacta** | ❌ **Nunca** | Solo se muestra en tu pantalla |
| 📍 **Ubicación difuminada** | ✅ Sí | Anclada a una cuadrícula de ~70 m |
| 📊 **Nivel de ruido** | ✅ Sí | Asociado a la ubicación difuminada |
| 🆔 **Tu identidad** | ❌ **Nunca** | No hay cuentas, ni emails, ni nombres |

### ¿Qué significa "difuminada"?

Tu ubicación real **nunca sale de tu dispositivo**. Lo que se envía es una coordenada anclada al centro de una celda de **~70 × 70 metros**. Así:

- **Tú** ves tu posición exacta (punto azul).
- **Los demás** solo ven la zona aproximada donde se midió.
- **Nadie** puede saber exactamente dónde estabas.

### Sin cuentas, sin rastreo

- No necesitas registrarte ni iniciar sesión.
- No se usan cookies de seguimiento.
- No se guarda tu dirección IP.
- No hay publicidad ni terceros.

---

## ⚠️ Qué mide y qué no mide

AcoustiMap calcula un **índice relativo de ruido**, no decibelios calibrados profesionalmente.

**✅ Sirve para:**
- Comparar zonas de la ciudad.
- Identificar patrones horarios.
- Detectar zonas crónicamente ruidosas.
- Generar datos ciudadanos abiertos.

**❌ No sirve para:**
- Certificar cumplimiento normativo.
- Reemplazar un sonómetro profesional.
- Denuncias legales formales.

Su propósito es **visibilizar patrones de ruido urbano** de forma colaborativa.

---

## 🌍 ODS relacionados

AcoustiMap contribuye a los **Objetivos de Desarrollo Sostenible** de la ONU:

- **ODS 3 (Salud y Bienestar):** ayuda a identificar zonas de riesgo acústico que afectan el descanso y la salud cardiovascular.
- **ODS 11 (Ciudades Sostenibles):** aporta datos ciudadanos para la planificación urbana y el control del tráfico.

---

## 📌 Preguntas frecuentes

**¿Se graba mi voz?**
No. El audio se analiza en memoria y se descarta inmediatamente. Nunca se guarda ni se transmite.

**¿Pueden saber dónde vivo?**
No. Tu ubicación exacta nunca sale de tu dispositivo. Solo se comparte una coordenada difuminada a ~70 m.

**¿Necesito crear una cuenta?**
No. La app es completamente anónima. No hay registro ni inicio de sesión.

**¿Funciona en cualquier dispositivo?**
Sí, funciona en navegadores modernos (Chrome, Firefox, Edge, Safari). Requiere HTTPS, que GitHub Pages ya proporciona.

**¿Los datos son precisos?**
No son decibelios calibrados. Son un índice relativo útil para comparar zonas, no para mediciones profesionales.

**¿Cuánto tiempo se guardan mis datos?**
- Mediciones: máximo 24 horas si no hay actividad cercana.
- Confirmaciones: 24 horas.
- Reportes: 30 días.
- Sesiones: 7 días.

**¿Puedo usar los datos para un trabajo académico?**
Sí. Puedes exportar los datos en CSV o GeoJSON y citar el proyecto. El código es open source bajo licencia MIT.

**¿Cómo aporto al proyecto?**
Puedes contribuir en [GitHub](https://github.com/koizell/acoustimap) con mejoras, traducciones o nuevas funcionalidades.

---

## 📄 Licencia

MIT © [Koizell](https://github.com/koizell)

---

<p align="center">
  <sub>Hecho con 🎙️ y conciencia ambiental en Colombia.</sub>
</p>
