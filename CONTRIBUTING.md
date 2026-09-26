# Contribuir a AcoustiMap

El [README](README.md) presenta el proyecto. Para modificarlo, consulta la
[arquitectura](docs/ARQUITECTURA.md) y el [plan de calidad](docs/CALIDAD.md).

## Preparar y verificar un cambio

1. Trabaja en una rama con un objetivo concreto, por ejemplo `codex/quality-tests-docs`.
2. Usa Node.js 24, versión verificada en esta revisión y configurada en CI.
3. Instala las versiones fijadas y ejecuta los controles:

   ```sh
   npm ci --ignore-scripts
   npm run check
   ```

4. Para abrir la app, configura Supabase según el README y ejecuta `npm run dev`.
   Las pruebas automatizadas usan datos sintéticos y no necesitan claves.
5. Si corriges un error, reproduce primero el fallo en una prueba. Aplica el
   cambio mínimo y ejecuta la regresión junto con las pruebas existentes.
6. Revisa `git diff --check` y el diff antes de preparar el PR. Registra las
   pruebas ejecutadas y pendientes, con su salida o enlace a CI.

## Legibilidad y documentación

- Mantén JavaScript del navegador sin frameworks ni bundler y conserva el orden de scripts.
- Usa nombres descriptivos, `const` por defecto y `let` cuando haya reasignación.
- Usa dos espacios y UTF-8, según `.editorconfig`. Evita reformatear archivos
  ajenos al cambio.
- Documenta responsabilidades, unidades, formas de datos, efectos laterales y
  condiciones de reintento. Explica decisiones; evita repetir cada instrucción.
- Añade JSDoc donde una confusión cambie el comportamiento: por ejemplo
  `{lat, lng}` del mapa frente a `{latitude, longitude}` de la base de datos.
- Usa `textContent` para contenido aportado por personas; no interpolarlo en HTML.
- No ocultes fallos de instalación, red o persistencia con resultados de éxito.
- Conserva los nombres SQL por compatibilidad. `db_level` y `avg_db` contienen
  un índice relativo, no dB(A) calibrados.

## Pruebas y publicación

Los casos `test/*.test.js` usan `node:test`. Los helpers y `src/test.js` no cuentan
como casos. Los dobles sustituyen red y APIs del navegador: prueba comportamiento
del código real, no la presencia de una cadena en su archivo fuente.

Para ejecutar un archivo: `node --test test/offline.test.js`.

Al cambiar recursos web, actualiza sus versiones en `index.html` y `sw.js`.
Añade los nuevos recursos públicos a `scripts/build-site.js` y, si corresponde,
a `APP_SHELL`. El empaquetado reemplaza `dist/`; no guardes trabajo manual allí.

CI verifica instalación, sintaxis y pruebas. Solo un push a `main` o una ejecución
manual sobre `main`, después de los controles, prepara y publica el sitio. Los
PR y ramas `codex/**` ejecutan controles sin publicar. La protección de `main`
debe exigir el check `quality` y revisión de PR desde GitHub; el workflow no
configura por sí solo esas protecciones.

## Datos y seguridad

- Prueba escrituras, RLS, Storage y limpieza real en un proyecto Supabase de pruebas.
- El cliente usa URL y clave anon/publicable. `service_role` y
  `PHOTO_CLEANUP_TOKEN` pertenecen al servidor. No incluir claves ni fotos reales
  en fixtures, logs, capturas o PR.
- Para migraciones, documenta objetivo, validación y recuperación; prepara una
  copia de seguridad cuando el cambio afecte datos existentes.
- Graphify es una ayuda local. `graphify-out/`, dependencias, configuración local
  y resultados generados permanecen ignorados por Git.
