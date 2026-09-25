# 🔒 Seguridad y Privacidad de AcoustiMap

Este documento explica cómo AcoustiMap protege tu privacidad y tus datos cuando usas la aplicación.

---

## 🛡️ Tu privacidad

AcoustiMap fue diseñado con la **privacidad como prioridad**. Esto es lo que ocurre con tu información:

| Dato | ¿Se guarda? | ¿Dónde? |
|---|---|---|
| 🎵 **Audio** | ❌ **Nunca** | Se analiza en tu dispositivo y se descarta |
| 📍 **Ubicación exacta** | ❌ **Nunca** | Solo visible en tu pantalla |
| 📍 **Ubicación difuminada** | ✅ Sí | Anclada a una cuadrícula de ~70 m |
| 📊 **Nivel de ruido** | ✅ Sí | Asociado a la ubicación difuminada |
| 🆔 **Tu identidad** | ❌ **Nunca** | Sin cuentas, emails ni nombres |
| 🍪 **Cookies de rastreo** | ❌ **Nunca** | No se usan |
| 🌐 **Dirección IP** | ❌ **Nunca** | No se almacena |

### Difuminado de ubicación

Tu ubicación real **nunca sale de tu dispositivo**. Antes de enviar cualquier dato, la app ancla la coordenada al centro de una celda de **~70 × 70 metros**.

- **Tú** ves tu posición exacta (punto azul en tu pantalla).
- **Los demás** solo ven la zona aproximada.
- **Nadie** puede saber exactamente dónde estabas.

### Consentimiento explícito

Antes de enviar cualquier dato a la nube, la app muestra una **ventana de confirmación** explicando:

- Qué se envía (nivel de dB + coordenada difuminada).
- Qué **NO** se envía (audio, ubicación exacta, identidad).
- Cómo se protege tu privacidad.

Solo si pulsas **"Aceptar"** se envía la información.

---

## 🗄️ Protección de los datos

Los datos que se guardan están completamente **anonimizados**:

- 📊 Nivel de ruido (dB)
- 📍 Coordenada difuminada (~70 m)
- 🕒 Fecha y hora
- 🏷️ Categoría (Bajo / Moderado / Alto)

**NO se almacena:**
- ❌ Audio
- ❌ Ubicación exacta
- ❌ Identidad del usuario
- ❌ Direcciones IP
- ❌ Cookies de seguimiento

### Protección contra accesos no autorizados

El servidor garantiza que:

- ✅ Cualquier usuario puede **leer** las mediciones del mapa.
- ✅ Cualquier usuario puede **contribuir** con una nueva medición.
- 🚫 **Ningún usuario** puede modificar mediciones existentes.
- 🚫 **Ningún usuario** puede borrar mediciones.
- 🚫 **Ningún usuario** puede acceder a datos internos.
- 🚫 **Ningún usuario** puede saber quién midió cada zona.

Todo intento de modificación o borrado es bloqueado automáticamente por el servidor.

### Limpieza automática

El servidor elimina automáticamente:

- **Mediciones:** máximo 24 h si no hay actividad cercana.
- **Confirmaciones:** 24 h.
- **Reportes:** 30 días.
- **Sesiones:** 7 días.

Así el mapa siempre muestra información reciente y relevante.

---

## 🔍 Qué puedes y qué no puedes hacer

### ✅ Permitido

- Ver el mapa comunitario completo.
- Medir el ruido de tu entorno.
- Compartir tu ubicación difuminada (con consentimiento).
- Ver tu ubicación exacta en tu propia pantalla.
- Exportar los datos en CSV o GeoJSON.
- Reportar problemas específicos de ruido.
- Comparar periodos y consultar estadísticas.

### 🚫 Bloqueado

- Ver la ubicación exacta de otros usuarios.
- Escuchar el audio de otros usuarios.
- Modificar o borrar mediciones ajenas.
- Saber quién midió cada zona.
- Acceder a información personal de otros.

---

## ⚠️ Riesgos conocidos

Aunque AcoustiMap está diseñado con altos estándares de seguridad, existen algunas limitaciones que debes conocer:

### 1. Mediciones falsas
Alguien con conocimientos técnicos podría insertar mediciones inventadas dentro de los rangos válidos. La app valida coordenadas, niveles de dB y categorías, pero no puede verificar que la medición sea real. En la práctica es poco probable, pero posible.

### 2. Errores de GPS
El GPS de los dispositivos puede desviarse decenas de metros, especialmente en interiores o zonas urbanas densas. La app muestra el margen real (±X m) y aplica un filtro para suavizar lecturas, pero la precisión nunca es perfecta.

### 3. Pausas automáticas del servidor
El plan gratuito del servidor puede pausarse por inactividad prolongada. Al reactivarse, todo vuelve a la normalidad automáticamente.

### 4. Precisión del sensor
AcoustiMap calcula un índice relativo, no decibelios calibrados profesionalmente. Sirve para comparar zonas, no para certificaciones legales.

---

## 📊 Nivel de seguridad

| Aspecto | Nivel |
|---|---|
| Protección contra robo de datos | 🟢 Alto |
| Protección de la privacidad | 🟢 Alto |
| Protección contra modificación | 🟢 Alto |
| Protección contra spam | 🟡 Medio |
| Transparencia | 🟢 Alto |

**Nivel general: 7/10** — Seguro para uso público real.

---

## 📢 Reportar una vulnerabilidad

Si encuentras un problema de seguridad en la aplicación, **por favor no lo publiques en un issue abierto**. En su lugar:

1. Contacta al autor del proyecto en [GitHub](https://github.com/koizell).
2. Describe el problema con el mayor detalle posible.
3. Si puedes, incluye pasos para reproducirlo.

**Compromiso del autor:**
- Responder en un plazo de **72 horas**.
- Analizar y corregir el problema.
- Dar crédito público al investigador, si lo desea.

---

## 📌 Compromiso de AcoustiMap

El proyecto se compromete a:

- **Nunca** vender ni compartir datos con terceros.
- **Nunca** grabar audio de los usuarios.
- **Nunca** rastrear la identidad de los usuarios.
- **Mantener** el código abierto y auditable.
- **Actualizar** este documento si cambian las condiciones de seguridad.

---

<p align="center">
  <sub>Última actualización: 2026 · Ver <a href="README.md">README</a></sub>
</p>
