# 🎙️ AcoustiMap

**Mapa colaborativo de contaminación acústica urbana.**

AcoustiMap convierte tu dispositivo en un sensor de ruido ciudadano. Mide el nivel de sonido de tu entorno, compártelo de forma **anónima** y explora un mapa con las zonas de ruido reportadas por la comunidad.

🌐 **Abrir la aplicación:** [https://koizell.github.io/acoustimap/](https://koizell.github.io/acoustimap/)

La aplicación usa la Web Audio API para medir el nivel de ruido de tu entorno en tiempo real. No graba audio.

**Lo que ve quien mide: un número en dB, la palabra «Sin calibrar» debajo, y el color.** Es una escala orientativa para comparar una calle con otra, no un sonómetro. **No sirve para evaluar exposición, cumplimiento normativo ni riesgo para la salud**, y los dispositivos y navegadores producen valores distintos ante el mismo sonido. Esa advertencia no está en cada pantalla: está en la leyenda del mapa, que es donde alguien va a mirar para entender qué significa un color, y aquí.

El método **v5** analiza el espectro con FFT de 8192 muestras y ventana Hann, aplica ponderación A por frecuencia y promedia la energía sobre una ventana móvil de aproximadamente **3 segundos**. Actualiza la lectura cada 200 ms. La escala sigue siendo `dBFS + 100`, acotada a 30–95: **no es presión sonora calibrada ni un sonómetro certificado**. Las pruebas con señales sintéticas verifican el cálculo, no la precisión acústica del dispositivo.

La instrumentación —señal en dBFS, filtros del navegador, versión del método y avisos de recorte— **no está en la pantalla**. Se abre escribiendo `verCalidadMicrofono()` en la consola. Se quitó de ahí porque para quien mide ruido en la calle eran cuatro datos que no cambian lo que haría con la cifra, y ocupaban el sitio de los botones; para quien audita la medida son los cuatro que importan. Los identificadores se conservan porque el código los escribe, y ningún dato se recalcula por haberlos escondido.

Los umbrales bajo (<55), moderado (55–70) y alto (>70) son categorías orientativas de la aplicación, **no límites ambientales aplicables a esta escala sin calibrar**. El gradiente del mapa cambia de color en esos mismos puntos.

### El promedio es en energía, no aritmético

Desde v4, varias lecturas se combinan con `10·log10(media(10^(nivel/10)))`. La v5 conserva esa fórmula, pero las lecturas ya incorporan la ponderación frecuencial.

El promedio móvil reduce la variación momentánea; **no elimina eventos fuertes reales**. Un golpe audible contribuye por su energía y duración. El diagnóstico muestra un máximo espectral reciente por separado, que caduca al salir de la ventana; no debe confundirse con un Lmax normalizado Fast/Slow.

Corregidos los cinco sitios: el promedio de pantalla, el resumen de sesión, la ventana que se envía, la media de la pestaña de Datos y la agregación por celda (`migrations/20261015_energy_average_v4.sql`).

**El mapa v5 empieza sin celdas hasta recibir lecturas v5.** No se mezcla RMS sin ponderar con energía ponderada A. Las RPC antiguas permanecen, las filas anteriores no se borran ni se convierten. La RPC v4 conserva su filtro histórico v3/v4.

Aplicar la curva A no certifica cumplimiento de IEC 61672 ni calibra la sensibilidad del micrófono. No usar estas lecturas para evaluar exposición, salud o cumplimiento normativo.

### Historial de métodos

El método inicial promediaba bytes del espectro. v2 tomó ventanas temporales de 2048 valores con suavizado; v3 pasó a RMS continuo de un segundo, con media aritmética; v4 cambió a promedio energético. **v5 analiza el espectro ponderado A con promedio móvil de 3 s**. El rango 30–95 es una decisión de interfaz: las simulaciones no equivalen a calibración acústica.

Las lecturas sin versión declarada permanecen con `measurement_version = NULL` y cada versión conserva la suya: **ninguna se convierte retroactivamente**, tampoco al sincronizar la cola offline. Mapa, estadísticas, comparación y exportaciones del frontend usan solo la versión vigente. Es normal que inicialmente aparezcan vacíos; el histórico se conserva en la base, sujeto a su retención normal. Incluso entre lecturas de la misma versión, diferentes micrófonos y tratamientos activos/no verificables pueden producir valores distintos.

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
| **📊 Estadísticas** | Estadísticas, reportes y comparativas |

---

## 🚀 Cómo usar la pestaña Mapa

### 1. Activar el micrófono

Pulsa el botón **🎤 Activar** y acepta el permiso que te pedirá el navegador.

> **🔒 Tu privacidad está protegida:** el micrófono solo se usa para calcular la intensidad del sonido. **No se graba audio. No se transmite audio. No se guarda audio.**

### 2. Medir el ruido

Verás en pantalla:

- **El nivel de ruido del último segundo**, en dB, grande y destacado. Debajo pone **«Sin calibrar»**, que es lo único que hay que saber antes de usarlo.
- **Promedio** de tu sesión, con mínimo, máximo y número de muestras.
- Una **clasificación por color**:
  - 🟢 **Bajo** (< 55) · Entrazable
  - 🟡 **Moderado** (55 – 70) · Molesto
  - 🔴 **Alto** (> 70) · Molesto de forma sostenida

> Sin calibrar significa eso: sirve para comparar zonas entre sí, no para medir exposición ni cumplir límites. Los límites que definen cada color están en la leyenda del mapa, no aquí.

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

## 📊 Cómo usar la pestaña Estadísticas

Esta es la sección más completa. Tiene 4 subsecciones:

### 📈 Resumen

Vista general con:

- **Total de mediciones** del método vigente en los últimos 30 días, de todas las zonas con aportes (no solo la vista del mapa).
- **Promedio energético general** en una escala relativa sin calibrar, no dB SPL.
- **Lecturas altas:** número de mediciones por encima de 70, no número de zonas.
- **Zonas más ruidosas** (Top 3 con número de mediciones y botón «Ver en mapa»).
- **Zonas más silenciosas** (Top 3).
- **Alertas persistentes:** zonas que llevan varios días con niveles altos.

La tendencia de una zona usa el mismo promedio energético y ofrece una tabla de
siete días naturales UTC. Los días sin mediciones quedan como falta de datos,
no como silencio, y el gráfico no une los puntos a través de esos huecos.
Puedes elegir una ubicación tocando el mapa o moviéndolo con las flechas y
usando «Elegir centro del mapa»; Escape o «Cancelar selección» cancela la acción.

### 📝 Reportar ruido

Puedes dejar un **reporte ciudadano** sobre un problema específico:

- Escribe una nota corta describiendo el origen del ruido (obra, fiesta, tráfico pesado, etc.).
- Añade la ubicación (se difumina igual que las mediciones).
- El reporte queda visible para toda la comunidad.

> Los reportes ciudadanos **humanizan los datos**: no solo dicen "72 dB" sino también *"obra en la calle desde las 7 AM"*.

### ↔️ Comparar meses

Compara los **últimos 30 días con los 30 anteriores**, para todas las zonas con
aportes del método vigente. Se indican fechas UTC y recuentos de cada periodo.

- Los botones muestran un periodo u otro en el mapa, no una resta por celda.
- Si falta un periodo, no se calcula un cambio ni se habilitan esos botones.
- Puedes reintentar o volver al mapa si faltan datos o falla la consulta.
- El resultado no controla que se hayan medido las mismas zonas o dispositivos:
  no demuestra por sí solo una mejora ambiental ni el efecto de una política.

### 🎯 Retos

Cinco retos, con progreso personal guardado en este navegador durante 30 días,
incluidos los aportes pendientes de conexión:

- **Hora punta:** medir la misma zona entre 07:00 y 09:00 de Colombia durante 3 días.
- **Ruta tranquila:** 5 ubicaciones distintas con lectura baja (<55).
- **Cobertura nocturna:** 3 parejas distintas de zona/día, entre 18:00 y 06:00 de Colombia.
- **Recoge basura:** reportes de basura recogida con foto, en 3 zonas y 3 días distintos.
- **Denuncia la obra:** reportes de obra en 2 zonas distintas, sin exigir foto ni medición.

Las tarjetas ofrecen «Ir a medir» o «Preparar reporte» con su categoría. No
activan permisos ni publican por sí solas. Las fotos de Basura/Obra no se suben;
solo se conserva el indicador local de haber adjuntado foto. Una foto adjunta
no constituye verificación independiente del acto reportado.
El progreso previo se recalcula con estas reglas sin borrar los aportes locales;
un reto completado repitiendo la misma zona puede volver a quedar pendiente.

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

AcoustiMap muestra el nivel de ruido en **dB sin calibrar**. Es una escala para orientarse y comparar, no un sonómetro.

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
Son dB **sin calibrar**. Sirven para comparar zonas entre sí, no como medición profesional: dos móviles distintos pueden dar cifras diferentes ante el mismo ruido.

**¿Cuánto tiempo se guardan mis datos?**
- Mediciones: 90 días.
- Sesiones: 90 días.
- Confirmaciones: 24 horas.
- Reportes: 30 días.

El detalle está en [SECURITY.md](SECURITY.md).

**¿Puedo usar los datos para un trabajo académico?**
Sí. Puedes exportar los datos en CSV o GeoJSON y citar el proyecto. El código es open source bajo licencia MIT.

**¿Cómo aporto al proyecto?**
Puedes contribuir en [GitHub](https://github.com/koizell/acoustimap) con mejoras, traducciones o nuevas funcionalidades.

---

## 🛠️ Desarrollo local

Sirve el repositorio desde localhost para probar la interfaz; el micrófono y la geolocalización exigen un contexto seguro, así que no abras `index.html` por `file://`.

```sh
npm ci --ignore-scripts   # instalación fijada, la misma que usa CI
npm run check             # puerta obligatoria: sintaxis + pruebas
npm run dev               # npx serve . -> http://localhost:3000
```

`js/config.local.js` está en `.gitignore`: créalo copiando `js/config.local.js.template` para poder abrir la interfaz sin backend. Con los placeholders de la plantilla el cliente Supabase no se crea y el mapa queda vacío, así que es normal que no aparezcan datos. `npm run build:config` lo genera a partir de `SUPABASE_URL` y `SUPABASE_ANON_KEY` y falla con código 1 si falta alguno.

---

## 🚀 Publicación en GitHub Pages

El flujo [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) publica la rama `main` en [koizell.github.io/acoustimap](https://koizell.github.io/acoustimap/). Necesita los secretos de Actions `SUPABASE_URL` y `SUPABASE_ANON_KEY` para generar `js/config.local.js` durante el build. Publicar **no** aplica migraciones ni despliega Edge Functions: son pasos manuales y en el orden de la sección siguiente. Aplica y verifica primero las migraciones; después publica el frontend.

El service worker cambia de versión para renovar los recursos guardados. Si había una pestaña abierta antes del despliegue, recárgala: seguía usando los recursos anteriores.

---

## 🗄️ Despliegue de Supabase

Para un proyecto nuevo, ejecuta en el SQL Editor de Supabase, en este orden:

1. [`setup.sql`](setup.sql)
2. [`migrations/20260923_complete_features.sql`](migrations/20260923_complete_features.sql)
3. [`migrations/20260925_privacy_and_retention.sql`](migrations/20260925_privacy_and_retention.sql)
4. [`migrations/20260928_schema_hygiene.sql`](migrations/20260928_schema_hygiene.sql)
5. [`migrations/20260929_drop_unused_measurement_link.sql`](migrations/20260929_drop_unused_measurement_link.sql)
6. [`migrations/20261005_audio_measurement_v2.sql`](migrations/20261005_audio_measurement_v2.sql)
7. [`migrations/20261005_audio_measurement_v3.sql`](migrations/20261005_audio_measurement_v3.sql)
8. [`migrations/20261015_energy_average_v4.sql`](migrations/20261015_energy_average_v4.sql)
9. [`migrations/20261016_report_kind.sql`](migrations/20261016_report_kind.sql)
10. [`migrations/20261017_weighted_a_v5.sql`](migrations/20261017_weighted_a_v5.sql)
11. [`migrations/20261018_report_kind_read_grant.sql`](migrations/20261018_report_kind_read_grant.sql): permiso de lectura de `kind`, para bases ya migradas que rechacen los reportes con 401/42501.

En un proyecto existente ya migrado hasta v3, ejecuta [`deploy/apply-v5.sql`](deploy/apply-v5.sql): reúne v4, categorías y v5 en ese orden. No es un instalador desde cero. Si ya aplicaste v4/categorías, puedes ejecutar solo la migración v5. Revisa cualquier política RLS adicional creada manualmente: **las políticas permisivas de `INSERT` se combinan con OR** y pueden eludir restricciones.

En SQL Editor, pega el contenido del archivo y pulsa **Run**; con conexión PostgreSQL también puedes usar `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/apply-v5.sql`. No compartas esa URL ni la incluyas en el frontend.

Confirma que `noise_map_cells_v5` responde con el rol `anon` **antes** de publicar. La migración concede ejecución a `anon` y `authenticated`; conserva RLS y no borra histórico. Es normal ver cero celdas v5 al principio. Este archivo no se ha aplicado automáticamente a tu Supabase.

Después despliega la Edge Function `cleanup-noise-photos` desde [`supabase/functions/cleanup-noise-photos`](supabase/functions/cleanup-noise-photos) con Supabase CLI y configura un secreto aleatorio `PHOTO_CLEANUP_TOKEN` en los secretos de la función. La función tiene `verify_jwt = false` en [`supabase/config.toml`](supabase/config.toml) y exige ese token en la cabecera `x-cleanup-token` de cada petición; no pongas el token en el frontend.

Crea en Supabase Vault `acoustimap_project_url` (la URL de tu proyecto) y `acoustimap_photo_cleanup_token`. **El valor de este último debe ser una copia exacta del secreto `PHOTO_CLEANUP_TOKEN` de la función, no un token nuevo.** Son dos copias del mismo valor guardadas en dos sitios distintos, y nada en el sistema avisa si divergen. Si pierdes el valor, vuelve a generar uno y actualiza los dos lados. Ejecuta luego [`migrations/20260925_schedule_photo_cleanup.sql`](migrations/20260925_schedule_photo_cleanup.sql), que configura una invocación por hora mediante `pg_cron` y `pg_net`. La tarea de limpieza de filas sin fotos de `setup.sql` permanece activa.

### Comprobación posterior al despliegue

Que el trabajo programado exista no significa que la Edge Function responda. `pg_net` encola la petición de forma asíncrona, así que `cron.job_run_details` marca `succeeded` aunque la función conteste con error. Hay que comprobar el código de respuesta por separado:

```sql
-- Debe devolver solo 200. Un 401 significa que acoustimap_photo_cleanup_token
-- (Vault) no coincide con PHOTO_CLEANUP_TOKEN (secreto de la función) y que
-- ninguna foto se está borrando. El 503 indica que falta el secreto en la función.
select status_code, count(*) as llamadas, max(created) as ultima
from net._http_response
group by 1 order by 2 desc;
```

Mientras esa consulta devuelva algo distinto de 200, la limpieza de fotos está detenida. Como `cleanup_old_noise_data` solo borra reportes cuyo `photo_path` es nulo, los reportes con foto se retienen de forma indefinida y su archivo permanece accesible por URL. Espera a la siguiente ejecución del trabajo (cada hora en punto 15) antes de darlo por comprobado.

En el SQL Editor, confirma que las funciones y los trabajos programados existen:

```sql
select jobname, schedule from cron.job
where jobname in ('cleanup-old-noise', 'cleanup-noise-photos');

select conname, convalidated from pg_constraint
where conname like 'noise_%_grid_check' or conname like 'noise_%_no_client_check'
order by conname;

with latitude_cell as (
  select (floor(4.6 / (70.0 / 111000.0)) + 0.5) * (70.0 / 111000.0) as lat
), snapped as (
  select lat,
    (floor(-74.1 / (70.0 / (111000.0 * cos(radians(lat))))) + 0.5)
    * (70.0 / (111000.0 * cos(radians(lat)))) as lng
  from latitude_cell
)
select public.is_noise_grid_cell(lat, lng) as snapped_cell_is_valid,
  public.is_noise_grid_cell(4.6, -74.1) as exact_point_is_valid
from snapped;
```

Los trabajos deben aparecer, las restricciones de cuadrícula e identificador deben tener `convalidated = true`, `snapped_cell_is_valid` debe ser `true` y `exact_point_is_valid`, `false`. Comprueba además que `select * from public.noise_map_cells(now() - interval '1 day', now(), 8.7, 8.8, -75.9, -75.8, 'all') limit 1;` se ejecuta sin error.

Las migraciones de higiene aplicadas en producción el 28 y el 29 de septiembre de 2026, [`migrations/20260928_schema_hygiene.sql`](migrations/20260928_schema_hygiene.sql) y [`migrations/20260929_drop_unused_measurement_link.sql`](migrations/20260929_drop_unused_measurement_link.sql), corrigen las restricciones, índices y funciones que quedaron sin uso. Se ejecutaron a mano en producción y no son necesarias en un proyecto nuevo, pero sí en uno que ya tenga `setup.sql`.

Desde el navegador, comprueba que el mapa carga, vuelve a consultar al moverlo, una medición se comparte una sola vez por intervalo, las franjas de historial incluyen días anteriores según la hora de Colombia, la comparación mensual abre sin errores, y un reporte con foto se ve. Para comprobar la limpieza sin esperar 30 días, se puede invocar la función con el token y verificar sus contadores; no alteres las fechas de reportes de producción para probarla.

---

## 🧰 Stack

HTML, CSS y JavaScript sin framework ni bundler; Leaflet y OpenStreetMap; Supabase PostgreSQL, Storage y Edge Functions; GitHub Pages.

---

## 🔒 Privacidad

Qué datos guarda la app, quién puede verlos y qué limitaciones tiene, y cuánto tiempo se retiene cada cosa, en [SECURITY.md](SECURITY.md).

---

## 📄 Licencia

MIT © [Koizell](https://github.com/koizell) · texto completo en [LICENSE](LICENSE)

---

<p align="center">
  <sub>Hecho con 🎙️ y conciencia ambiental en Colombia.</sub>
</p>
