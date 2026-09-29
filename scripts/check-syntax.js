// Validación sintáctica sin ejecutar scripts del navegador ni acceder a Supabase.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function javascriptFiles(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(file);
    return /\.(js|mjs)$/.test(entry.name) && entry.name !== 'config.local.js' ? [file] : [];
  });
}
const files = ['build-config.js', 'sw.js', 'supabase/functions/cleanup-noise-photos/cleanup.mjs',
  ...['js', 'scripts', 'test'].flatMap(javascriptFiles)];
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
console.log(`Sintaxis JavaScript: ${files.length} archivos comprobados.`);
process.exitCode = failed ? 1 : 0;
