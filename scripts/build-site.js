/**
 * Empaqueta únicamente los recursos públicos en dist/ después de build:config.
 * La lista explícita evita publicar SQL, pruebas, herramientas o archivos locales.
 * dist/ es una carpeta generada: su contenido anterior se reemplaza.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'dist');
const files = [
  'index.html', 'manifest.webmanifest', 'sw.js', 'assets/icon.svg',
  ...['base', 'layout', 'map', 'panel', 'info', 'responsive', 'features', 'experience'].map((name) => `css/${name}.css`),
  ...['config.local', 'config', 'map', 'audio', 'community', 'app', 'features'].map((name) => `js/${name}.js`)
];

// Valida todas las entradas antes de sustituir el artefacto anterior.
for (const file of files) {
  if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`Falta el recurso: ${file}`);
}
if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error('El directorio de publicación debe ser dist/ dentro del proyecto.');
}
fs.rmSync(output, { recursive: true, force: true });
for (const file of files) {
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, file), destination);
}
console.log(`Publicación preparada: ${files.length} recursos en dist/.`);
