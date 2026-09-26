# Calidad, pruebas y revisión

## Alcance y referencias

Revisión del 26 de septiembre de 2026, desde `b62ab6a`, rama
`codex/quality-tests-docs`: legibilidad, documentación y regresiones. Se revisaron
cliente JavaScript, build, CI, pruebas y lógica de limpieza. No se ejecutaron
escrituras ni borrados en producción.

La alineación siguiente utiliza descripciones públicas de las normas. No es
certificación, auditoría de conformidad ni evaluación formal de madurez; no se
ha comprobado cada requisito del texto normativo completo.

| Referencia oficial | Práctica aplicada | Alcance pendiente |
| --- | --- | --- |
| [ISO/IEC/IEEE 12207:2026](https://www.iso.org/standard/90219.html), sustituye la edición 2017 | Rama identificada, revisión, verificación y entrega condicionada a pruebas. | Evaluación completa de procesos del ciclo de vida. |
| [ISO/IEC 25000:2014](https://www.iso.org/standard/64764.html) y [25010:2023](https://www.iso.org/standard/78176.html) | Criterios observables de corrección, fiabilidad, seguridad, interacción y mantenibilidad. | Evaluación integral de características y rendimiento real. |
| [ISO/IEC 33001:2015](https://www.iso.org/standard/54175.html), introducción a la familia 330xx | Hallazgos y evidencia para repetir y mejorar el proceso. | Evaluación de capacidad/madurez organizacional. |
| [ISO/IEC 29110-1-1:2024](https://www.iso.org/standard/85337.html) | Documentación breve y responsabilidades para un proyecto pequeño. | Selección y evaluación formal de un perfil de la familia. |
| [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) | Configuración pública separada, artefacto limitado, pruebas de privacidad y logs sin claves. | Sistema de gestión: riesgos, accesos, activos e incidentes de la organización. |
| [ISO/IEC/IEEE 29119-2:2021](https://www.iso.org/standard/79428.html), pruebas | Casos asociados a riesgos, resultados y criterios de salida. | Implantación completa de los procesos normativos. |

Estas normas no prescriben un estilo JavaScript. Las convenciones internas
se encuentran en [CONTRIBUTING](../CONTRIBUTING.md).

## Hallazgos y evidencia

| ID | Hallazgo | Corrección / evidencia |
| --- | --- | --- |
| QA-01 | Confirmaciones offline recibían campos SQL donde se esperaba una posición; cambiaba su clave. | Conversión explícita. Regresión falló antes del cambio y pasa después. |
| QA-02 | Build alteraba barras/saltos y escribía parte de la clave en logs. | `JSON.stringify` y eliminación de valores del log. Dos regresiones fallaron antes y pasan después. |
| QA-03 | CI omitía pruebas y silenciaba errores de instalación; faltaba lockfile. | Lockfile y job `quality` obligatorio para publicar. Instalación y controles locales pasan; ejecución remota pendiente. |
| QA-04 | Pages empaquetaba el repositorio entero. | Lista de recursos públicos en `dist/`; prueba del artefacto, HTML y precaché. |
| QA-05 | Un ejemplo sin aserciones se contaba como prueba; instrucciones de desarrollo obsoletas. | Solo `test/*.test.js`, arquitectura, JSDoc y contexto de Copilot actualizado. |
| QA-06 | La revisión del nuevo workflow detectó que serializar solo el deploy permitía publicar builds fuera de orden. | Se serializa el workflow completo por rama; YAML y dependencias entre jobs comprobados localmente. |

Entorno: Windows, Node.js 24.16.0, npm 11.13.0. Base: 19 casos con aserciones
y un ejemplo contado como prueba. Resultado: **31 casos, 31 aprobados, 0 fallos**,
con sintaxis comprobada en **22 archivos JavaScript**. `npm ci --ignore-scripts`
instaló las versiones fijadas y auditó 86 paquetes, sin vulnerabilidades conocidas
informadas en esa consulta. Esto no evalúa scripts CDN ni demuestra ausencia de fallos.

## Matriz automatizada

| Riesgo / criterio | Archivo en `test/` |
| --- | --- |
| Umbrales, aproximación de coordenadas e idempotencia, intensidad acotada | `core.test.js` |
| Ventana pendiente sin envío duplicado; filtros/área/fechas; privacidad de reportes y retos | `flows.test.js` |
| Error conserva muestras nuevas y reservadas; respuesta atrasada no borra mapa actual | `community-errors.test.js` |
| Calor montado antes de redibujar; mapa oculto y paneles reemplazados seguros; comparación vacía | `flows.test.js`, `ui-regressions.test.js` |
| Confirmación conserva clave; cola permite reintentos y evita envíos paralelos | `offline.test.js` |
| Fallo de Storage conserva filas; fallo SQL se propaga; sin candidatos no se borra | `photo-cleanup.test.js` |
| Configuración fiel, ausencia de variables bloquea build, logs sin claves | `build-config.test.js` |
| Artefacto contiene recursos y excluye pruebas, SQL y archivos locales | `build-site.test.js` |

Los nuevos casos de flujos cargan scripts completos en VM con red, reloj y APIs
del navegador controlados. Algunos casos heredados extraen funciones: sirven
como regresión puntual, no como integración completa. No se ha medido porcentaje
de cobertura ni auditado exhaustivamente cada función.

## Integración y pruebas manuales pendientes en esta rama

Usar un proyecto Supabase de pruebas con migraciones y datos sintéticos. Registrar
versión del código, dispositivo/navegador, fecha, resultado y evidencia sin secretos.

| Caso | Procedimiento | Aceptación |
| --- | --- | --- |
| M-01 | Alternar Mapa/Datos/Salud rápidamente; calor/puntos; redimensionar. | Sin excepciones de canvas o panel desmontado; mapa visible al regresar. |
| M-02 | Probar 360 px/escritorio, teclado, zoom 200 %, temas e idiomas. | Controles accesibles, foco visible y textos comprensibles. |
| M-03 | Conceder/denegar micrófono y GPS; iniciar/detener; revisar Network. | Estado comprensible, micrófono liberado, coordenadas aproximadas, ningún audio enviado. |
| M-04 | Cargar online, desconectar, medir/confirmar/reportar, recargar y reconectar. | IndexedDB conserva pendientes; sube una vez y retira solo aceptados. Probar cuota agotada. |
| M-05 | Usar fixtures conocidos para franjas, zonas, estadísticas, comparación y exportación. | Recuentos y promedios correctos para área/periodo; falta de datos explícita; revisar límites horarios CO. |
| M-06 | Con anon probar INSERT válido/inválido, UPDATE y DELETE. | Solo operaciones autorizadas; validación y RLS rechazan el resto. |
| M-07 | Fotos sintéticas vigentes/caducadas; función sin token, incorrecto y correcto; fallo de Storage. | Autenticación y retención correctas; referencias conservadas ante fallo. Verificar cron y Vault. |
| M-08 | Instalar PWA anterior, actualizar, cerrar/reabrir y desconectar. | Nueva caché activa sin mezclar versiones; recursos disponibles según caché. |
| M-09 | Abrir PR y observar `quality`; tras revisión e integración observar Pages. | Fallo impide publicación; PR no publica; sitio corresponde al cambio aprobado. |

Seguimiento: `features.js` concentra varias responsabilidades; la cola de respaldo
tiene límite de 100 registros; el lockfile npm no fija los SDK CDN. IndexedDB real,
RLS, autenticación de Edge Functions y dispositivos requieren las pruebas anteriores.

## Criterio de entrega

Autor: explica el cambio y ejecuta controles. Revisor: comprueba diff, contratos,
privacidad y evidencia. Responsable del proyecto: decide publicación y registra
pendientes. En un proyecto individual pueden ser la misma persona; no presentarlo
como revisión independiente.

Para integrar deben pasar `npm ci --ignore-scripts`, `npm run check` y
`git diff --check`; registrar resultado de los casos manuales afectados. Cambios
de datos/permisos requieren además M-06/M-07 en pruebas. Registrar cada defecto
con pasos, esperado/real, severidad, corrección y caso de regresión.

Un caso no ejecutado se marca pendiente. Esta evidencia local no confirma
publicación, protección de ramas ni configuración efectiva de Supabase en producción.
