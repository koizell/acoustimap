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

Lo aplica un trabajo programado cada hora. Las fotos se borran con un función
de servidor que primero elimina el archivo del almacenamiento y luego la fila,
para no dejar objetos huérfanos. Si el almacenamiento falla, la fila se
conserva y se reintenta.

Los datos del SQLite de tu navegador (retos, cola sin conexión) no salen del
dispositivo y se pierden si borras los datos del sitio.

## Limitaciones conocidas

**1. El índice es relativo, no calibrado.** Sirve para comparar zonas en el
momento de la medición. El resultado depende del micrófono del dispositivo y
del navegador, así que dos equipos distintos pueden leer valores distintos
ante el mismo sonido.

**2. Cualquiera puede insertar mediciones dentro de los rangos válidos.** Las
restricciones comprueban que las coordenadas caigan en la cuadrícula y que el
índice esté entre 20 y 140, pero no que la medición sea real. Una persona con
conocimientos técnicos podría enviar lecturas inventadas.

**3. El GPS se desvía.** En interiores y zonas densas la precisión puede caer
a decenas o cientos de metros. La app muestra el margen real y suaviza
lecturas, pero la celda final depende de esa precisión. Con ±150 m de error,
tu lectura puede caer en una celda distinta de la que estabas realmente.

**4. Historial heterogéneo.** Hasta el 29 de septiembre de 2026 el índice se
calculaba con el promedio del espectro de frecuencias; desde entonces usa la
energía total de la señal en el tiempo. Las dos escalas no son comparables
entre sí. Las mediciones antiguas aparecen más bajas de lo que indican.

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

<sub>Última revisión: 2026-09-29 · ver <a href="README.md">README</a> y <a href="CONTRIBUTING.md">CONTRIBUTING</a></sub>
