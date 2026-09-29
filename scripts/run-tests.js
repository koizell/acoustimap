// Enumera solo casos *.test.js; evita contar helpers o ejemplos sin aserciones.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'test'))
  .filter((name) => name.endsWith('.test.js')).sort()
  .map((name) => path.join('test', name));
if (!tests.length) throw new Error('No se encontraron pruebas en test/.');
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
