# Auditoría previa al despliegue — candidato local v58

Fecha: 2026-10-08. Base: `cf03912` y todos los cambios locales acumulados
v51–v57; mitigaciones añadidas en v58. Rama `dev`, sin commit ni publicación.
La web pública seguía en v50 al comprobarla (HTTP 200).

## Dictamen y alcance

**Los hallazgos reproducidos quedan corregidos**, con revisión independiente
final y pruebas locales. No equivale a certificar todo el sistema, la precisión
acústica ni un despliegue que todavía no se ha realizado.

Se revisaron corrección, legibilidad, arquitectura, seguridad y coste de las
operaciones; pruebas, privacidad, dependencias, entradas del respaldo, modales,
dibujo, actualización del mapa, estados de almacenamiento y empaquetado.
No se modificó `main`, SQL remoto, RLS, Edge Functions ni preferencias del usuario.

## Hallazgos y mitigaciones

| Severidad | Problema | Mitigación verificada |
| --- | --- | --- |
| Alta (dependencia) | `serve` fijaba `compression@1.8.1`, vulnerable a DoS por cierre de conexión. No forma parte de `dist/` ni del servidor Node actual. | Override a 1.8.2, conservando `serve`; lockfile generado por npm, revisión de changelog y nueva dependencia `destroy@1.2.0`. Instalación aislada sin scripts y smoke HTTP 200. Audit final: 0 vulnerabilidades conocidas. |
| Importante (prevención) | El build podía publicar una clave privilegiada introducida por error en la configuración. No se encontró una clave privada real; la configuración verificada usa rol `anon`. | Guarda compartida en `scripts/public-config.js`: rechaza `sb_secret_`, JWT malformados y roles no `anon`, antes de escribir/empaquetar. Conserva el artefacto anterior al rechazar y no imprime la clave. |
| Importante | Aviso de recompensa operable encima del consentimiento de micrófono. | Aviso incluido en el fondo inerte y z-index 1900 bajo el modal 2000. Cancelar restaura su estado; no se concede permiso. |
| Importante | Autopan/refrescos cerraban popup y perdían foco al recrear marcadores. | Capturar interacción antes de limpiar y recuperar solo la misma celda presente, sin repetir autopan. Cubre mapa normal y Comparar, en Calor y Puntos. |
| Importante | El cierre del polígono podía cruzar otro segmento. | Guarda compartida de cierre en el botón y la validación por instancia de Leaflet.Draw: primer vértice y doble clic también cubiertos. Error recuperable sin crear el análisis. |
| Importante | `getItem` bloqueado abortaba la inicialización comunitaria. | Traducciones conservan el idioma del documento cuando no pueden leer preferencias. Inicialización completa y colección disponibles. |
| Menor | Deshacer el único vértice no hacía nada en Leaflet.Draw 1.0.4. | Reiniciar el dibujo vacío en ese caso; el doble de pruebas ahora refleja el límite real de la biblioteca. Se puede completar después. |

No se aplicó `npm audit fix --force`, no se borraron dependencias históricas ni
se ejecutaron scripts de instalación. La configuración privada real no se
incluyó en evidencias ni informes. Las coincidencias del escaneo de claves eran
fixtures explícitas ficticias de los nuevos tests.

## Evidencia de verificación

- **279 pruebas aprobadas**, sintaxis de **63 archivos**, `git diff --check` limpio.
- Build: **20 recursos públicos**; versiones HTML/ASSET_VERSION/CACHE_NAME en 58.
- Raíz `/home/koizell-dev/proyectos/acoustimap` y `dist/` con configuración idéntica,
  RPC v5 como anon HTTP 200 y **4 zonas**; sin micrófono ni compartir activos.
- Navegador del usuario abierto con `http://localhost:3000/?dev=58`, usando el
  servidor existente; diagnóstico de raíz/versión/configuración confirmado.
- **78 variantes visuales**: 48 de medallas y 30 de Salud, idiomas es/en/pt,
  claro/oscuro, móvil/escritorio. Sin desbordamientos ni incidencias axe A/AA
  detectadas en las áreas evaluadas; no es certificación WCAG ni prueba con lector
  de pantalla humano.
- **20 escenarios de navegador**: siete de medallas, seis de Salud y siete de
  regresión de auditoría. Incluyen movimiento reducido, texto al 200%, teclado,
  toque, fuentes/Motion no disponibles y las rutas alternativas identificadas.
- Regresiones de lógica/configuración ejecutadas en rojo antes de la corrección
  y verde después. Una mutación aislada que invierte la comprobación de checksum
  produjo **6 fallos**: esa protección sí está vigilada. El fuente real no se mutó.
- Reconocimiento reconciliado con 5.000 aportes sintéticos: 52–60 ms en el equipo
  de desarrollo. No es presupuesto ni medida de rendimiento de celulares reales.
- Sin errores JavaScript, llamadas a permisos o escrituras remotas en los casos
  aislados. Las verificaciones reales permitieron solo lecturas de datos.

Los tests de regresión usan Leaflet/Leaflet.Draw reales en Chromium aislado,
sin la configuración real y con la comunicación de la app interceptada. Los
datos sintéticos no tocaron el perfil del usuario ni Supabase. No había MCP
Chrome DevTools configurado: se usó Playwright/Chromium existente, sin añadirlo.

Evidencia externa, sin claves:

- `/tmp/opencode/acoustimap-audit-final-check.log`
- `/tmp/opencode/acoustimap-audit-final-dependencies.json`
- `/tmp/opencode/acoustimap-audit-install.log`
- `/tmp/opencode/acoustimap-audit-mutation.log`
- `/tmp/opencode/acoustimap-ui-check/audit-v58/regressions.json`
- `/tmp/opencode/acoustimap-ui-check/audit-badges-v58/evidence.json`
- `/tmp/opencode/acoustimap-ui-check/audit-health-v58/evidence.json`

## Límites y riesgos pendientes

1. **Acústica:** falta validación física entre dispositivos/sonómetro. Sigue
   siendo índice relativo, no dB SPL. La agregación remota no separa perfiles
   de captura: las excepciones procesadas/históricas pueden entrar en el mapa.
2. **Flujos reales de escritura:** no se probaron inserciones, fotos, permisos
   de captura ni envío extremo a extremo con datos reales. No se puede deducir
   su éxito de una RPC de lectura HTTP 200. No se hizo una auditoría remota de RLS.
3. **PWA:** las pruebas unitarias vigilan listas/cachés/versiones y preservación
   de almacenes. No se certificó aquí la actualización v50→v58 de una instalación
   real; localhost no registra la PWA. Verificarla después del despliegue sin
   borrar IndexedDB, preferencias ni reconocimiento.
4. **CDN/cabeceras:** `npm audit` no cubre las bibliotecas cargadas por CDN. El SDK
   Supabase usa una referencia mayor mutable; revisar fijación/integridad en una
   tarea específica. La respuesta pública observada tiene HSTS pero no CSP,
   `nosniff`, protección de iframe ni Referrer-Policy por cabecera. No se cambió
   el alojamiento ni se afirmó haber mitigado esos controles.
5. **Reconocimiento:** respaldo legible/no cifrado; checksum de copia, no firma.
   Hasta 400 días de actividad; no es identidad de hardware ni ranking fiable.
6. **Arquitectura:** `features.js` ya es un monolito extenso de scripts clásicos.
   No se hizo una extracción masiva junto con las correcciones: requiere una
   tarea independiente respetando orden de scripts, caché y listas del build.

## Antes y después de publicar

- La fusión a `main` la hace una persona, tras revisar los cambios acumulados.
  El push activa Pages y también `notificar-code2vault.yml`; no omitir ese efecto.
- Ejecutar otra vez `npm run check`, build y audit en la revisión que se vaya a
  publicar. El guard del build exige una clave pública, no credenciales elevadas.
- Tras publicar: comprobar versión real, RPC v5 como anon, pestañas, popup,
  respaldo, consentimiento y actualización PWA. No generar aportes de prueba
  reales automáticamente. Revisar resultados de Actions y reportes de usuarios.
- **Recuperación:** volver a desplegar código validado con una versión de caché
  nueva y coherente, sin borrar almacenes ni datos de Supabase. No hay migración
  SQL de v58 que deshacer. Conservar el ledger aunque una UI anterior no lo muestre.
  No se ejecutó una recuperación ni se afirma un tiempo de recuperación medido.
