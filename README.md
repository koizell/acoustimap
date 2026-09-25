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
- **Contribuir** con datos que ayudan a entender mejor el problema del ruido urbano.

---

## 🚀 Cómo usarlo

### 1. Activar el micrófono

Al abrir la app, pulsa el botón **🎤 Activar** y acepta el permiso de micrófono que te pedirá el navegador.

> **🔒 Tu privacidad está protegida:** el micrófono solo se usa para calcular la intensidad del sonido. **No se graba audio. No se transmite audio. No se guarda audio.**

### 2. Medir el ruido

Verás en pantalla:

- **Nivel instantáneo** en tiempo real.
- **Promedio** de tu sesión, con mínimo, máximo y número de muestras.
- Una **clasificación por color**:
  - 🟢 **Bajo** (< 55) · Entorno confortable
  - 🟡 **Moderado** (55 – 70) · Ligeramente molesto
  - 🔴 **Alto** (> 70) · Ruido dañino

### 3. Compartir en el mapa (opcional)

Si quieres aportar tu medición al mapa comunitario, pulsa **📡 Compartir**. Aparecerá un aviso de privacidad explicándote qué se comparte y qué no. Solo si aceptas, tu medición se enviará de forma anónima.

### 4. Explorar el mapa

- **🟢🟡🔴 Colores:** indican el nivel de ruido de cada zona.
- **Heatmap:** vista de calor con las zonas más ruidosas.
- **Zonas:** vista de puntos con los niveles individuales.
- **Franja horaria:** filtra por mañana, tarde o noche.
- **ℹ️ Leyenda:** información sobre los colores y datos.
- **📍 Centrar:** vuelve a tu ubicación actual.

### 5. Consultar estadísticas

En la pestaña **📊 Stats** encontrarás:

- Resumen general del ruido en la ciudad.
- Ranking de zonas más ruidosas y más silenciosas.
- Alertas de ruido persistente.
- Opción para **reportar** un problema de ruido específico.
- Comparación entre meses.
- **Exportar los datos** en CSV o GeoJSON.

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

## ⚠️ Importante: qué mide AcoustiMap

AcoustiMap calcula un **índice relativo de ruido**, no decibelios calibrados profesionalmente.

- **No es un sonómetro certificado.**
- **No sirve para evaluar cumplimiento normativo.**
- **No reemplaza una medición profesional.**
- **Los valores pueden variar** según el dispositivo y el navegador.

Su propósito es **visibilizar patrones de ruido urbano** de forma colaborativa, no realizar mediciones de precisión.

---

## 🌍 ODS relacionados

AcoustiMap contribuye a los **Objetivos de Desarrollo Sostenible** de la ONU:

- **ODS 3 (Salud y Bienestar):** ayuda a identificar zonas de riesgo acústico.
- **ODS 11 (Ciudades Sostenibles):** aporta datos ciudadanos para la planificación urbana.

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
Las mediciones se conservan un máximo de 90 días. Las confirmaciones, 24 horas. Los reportes, 30 días.

---

## 📄 Licencia

MIT © [Koizell](https://github.com/koizell)

---

<p align="center">
  <sub>Hecho con 🎙️ y conciencia ambiental en Colombia.</sub>
</p>
