# Seguridad y Privacidad de AcoustiMap

Este documento explica qué datos maneja AcoustiMap, cómo los protege y qué
limitaciones tiene. Se aplica al sitio publicado en
[koizell.github.io/acoustimap](https://koizell.github.io/acoustimap/).

> **El índice no son decibelios.** AcoustiMap calcula un *índice relativo* a
> partir de la amplitud del micrófono. No es dB SPL calibrado, no sirve para
> evaluar exposición ni para acreditar cumplimiento de límites legales. Compara
> zonas entre sí, nada más.

## Qué se guarda

| Dato | ¿Se guarda? | Dónde |
|---|---|---|
| Audio | **Nunca** | Se analiza en el dispositivo y se descarta |
| Ubicación exacta | **Nunca** | Solo se ve en tu pantalla |
| Ubicación aproximada | Sí | Anclada a una cuadrícula de ~70 m |
| Índice de ruido | Sí | Junto a la ubicación aproximada |
| Versión del método y perfil de captura | Sí | Mediciones y sesiones; sin modelo ni identificador del micrófono |
| Tu identidad | **Nunca** | Sin cuentas, correos ni nombres |
| Identificador estable del navegador | **Nunca** | Tus retos se calculan en tu dispositivo |
| Seguimiento | **Nunca** | Sin cookies de rastreo |

El proyecto **no tiene usuarios registrados**. No hay cuentas, ni correo, ni
contraseñas, ni forma de vincular una medición con una persona.

## Difuminado de ubicación

Antes de enviar nada, la app ancla la coordenada al centro de una celda de
**~70 × 70 metros**. Tú ves tu punto exacto en azul; los demás solo ven la
zona.

Esto no es una cortesía del cliente: la base de datos lo impone. Cada tabla
tiene la restricción `noise_*_grid_check`, que rechaza cualquier coordenada
que no caiga exactamente en el centro de una celda. Los disparadores de
inserción vuelven a anclar la coordenada aunque alguien llame a la API
directamente saltándose la interfaz. La migración de privacidad además borró
los identificadores estables históricos y reancló las coordenadas antiguas.

## Consentimiento explícito

Nada se envía hasta que pulsas **Compartir** y aceptas el aviso que explica
qué se envía, qué no, y por qué. El audio se analiza en local y se descarta
siempre, acepte o no.

## Quién puede hacer qué

El acceso se controla con políticas de RLS por tabla:

- Cualquiera puede **leer** mediciones, sesiones, reportes y confirmaciones.
- Cualquiera puede **insertar** una medición nueva, sujeta a validación.
- **Nadie** puede modificar ni borrar filas con la clave pública.
- **Nadie** puede leer la columna de identificador ni la clave de
  confirmación: no están entre las columnas concedidas al rol anónimo.
- **Nadie** puede ejecutar los trabajos de limpieza ni las funciones internas.

La clave que viaja en el navegador es pública y solo sirve para hablar con la
API. La seguridad no depende de ella: depende de las restricciones de tabla y
de las políticas, que se aplican aunque alguien tenga una política más
permisiva creada a mano.

## Retención

| Dato | Se conserva |
|---|---|
| Mediciones | 90 días |
| Sesiones | 90 días |
| Reportes | 30 días |
| Confirmaciones | 24 horas |
| Fotografías de reportes | 30 días, o hasta que se borren junto a su reporte |

En reportes de basura y obra, la foto solo acredita progreso local del reto: no se
sube ni se guarda en la cola offline. El progreso conserva únicamente si había foto,
la categoría, la celda y la fecha durante 30 días. Los reportes normales de ruido y
tráfico sí pueden publicar una foto, con aviso explícito antes del envío.

Lo aplica un trabajo programado cada hora. Las fotos se borran con un función
de servidor que primero elimina el archivo del almacenamiento y luego la fila,
para no dejar objetos huérfanos. Si el almacenamiento falla, la fila se
conserva y se reintenta.

El progreso de retos se guarda en `localStorage` y la cola sin conexión usa
IndexedDB, con respaldo en `localStorage` cuando IndexedDB no está disponible.
Estos almacenes se pierden si borras los datos del sitio. Los aportes de la cola
se envían al recuperar conexión bajo el consentimiento original; el progreso
personal no se envía.

El reconocimiento se guarda aparte en `acoustimap-recognition`: insignias con
su fecha de logro, hasta 400 días de actividad y mejor racha. Puntos y nivel se
derivan del catálogo local. Los logros no caducan mientras ese almacén exista;
no contienen coordenadas, fotos, audio, nombres ni identificador del navegador.
No hay reconocimiento de hardware, fingerprinting ni sincronización remota.

Un código de respaldo permite recuperar y unir solo ese reconocimiento en otro
navegador, sin reenviar contribuciones ni recuperar fotos o datos pendientes.
El código **no está cifrado**: revela insignias, fechas y días de actividad a
quien lo tenga. Su checksum detecta daños, no autentica a una persona ni valida
que sus aportes sean reales. No es una contraseña. El esquema se valida y
rechaza versiones, campos, fechas o tamaños no admitidos antes de guardar.
Un código inválido no modifica la colección ni otros almacenes locales.

## Limitaciones conocidas

**1. El índice es relativo, no calibrado.** Sirve para comparar zonas en el
momento de la medición. El resultado depende del micrófono del dispositivo y
del navegador, así que dos equipos distintos pueden leer valores distintos
ante el mismo sonido.
Se solicita desactivar ganancia automática, reducción de ruido y cancelación
de eco; algunos navegadores mantienen esos tratamientos o no permiten verificarlos.
Solo se comparte un perfil genérico (`unprocessed`, `processed` o `unknown`)
y la versión del método. RMS, dBFS y el diagnóstico detallado permanecen en
memoria local. No se envían `deviceId`, `groupId` ni etiquetas del micrófono.
Desde v4 los promedios se calculan en energía. El método v5 analiza el espectro
con ponderación A y una ventana móvil de 3 segundos en AudioWorklet. Mantiene
muestras temporalmente en memoria para la FFT; no las persiste ni transmite.
Solo comunica resúmenes numéricos a la interfaz y su salida de audio es cero.
No resta un supuesto ruido de fondo ni calibra el equipo: no es un nivel SPL
calibrado ni un sonómetro certificado.

**2. Cualquiera puede insertar mediciones dentro de los rangos válidos.** Las
restricciones comprueban que las coordenadas caigan en la cuadrícula y que el
índice esté entre 20 y 140 para registros sin versión, y entre 30 y 95 para
v2/v3/v4/v5, pero no que la medición sea real. Una persona con
conocimientos técnicos podría enviar lecturas inventadas.

**3. El GPS se desvía.** En interiores y zonas densas la precisión puede caer
a decenas o cientos de metros. La app muestra el margen real y suaviza
lecturas, pero la celda final depende de esa precisión. Con ±150 m de error,
tu lectura puede caer en una celda distinta de la que estabas realmente.

**4. Historial heterogéneo.** Antes se utilizaba promedio espectral y luego
RMS con captura por defecto y suavizado por fotograma. El método v2 usa captura
con tratamientos solicitados desactivados y suavizado temporal. El v3 calcula
RMS continuo sobre 1 segundo con los mismos ajustes solicitados. La v4 cambió
los promedios a energía y la v5 aplica ponderación A sobre el espectro. No se atribuye
v5 a lecturas antiguas: conservan su versión original y la nueva vista del mapa,
estadísticas y exportaciones las excluye para no mezclar métodos. No se borran
por esta migración: siguen sujetas a la retención normal.

**5. Un plan gratuito puede pausarse.** Si el proyecto queda inactivo, el
proveedor puede suspenderlo. Al reactivarse, el servicio vuelve por su cuenta.

## Reportar un problema

Si encuentras una vulnerabilidad, **no abras un issue público**. Escribe al
autor en [GitHub](https://github.com/koizell) describiendo el problema, cómo
reproducirlo y qué datos se ven afectados. Si prefieres, abre un issue
privado de seguridad.

El proyecto se compromete a responder, analizar y corregir, y a dar crédito
público a quien lo solicite.

## Compromiso

- No vender ni compartir datos con terceros.
- No grabar audio.
- No rastrear la identidad de nadie.
- Mantener el código abierto y auditable.
- Actualizar este documento si cambian las condiciones.

---

<sub>Última revisión: 2026-10-05 · ver <a href="README.md">README</a></sub>
