const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

function buildInTemporaryDirectory(t, values) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'acoustimap-config-test-'));
  // Solo se elimina el directorio temporal creado por esta prueba.
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'js'));
  fs.copyFileSync(path.join(__dirname, '..', 'build-config.js'), path.join(directory, 'build-config.js'));
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_ANON_KEY;
  Object.assign(env, values);
  const result = spawnSync(process.execPath, ['build-config.js'], { cwd: directory, env, encoding: 'utf8' });
  return { ...result, output: path.join(directory, 'js', 'config.local.js') };
}

test('configuración: conserva comillas, barras y saltos sin producir JavaScript inválido', (t) => {
  const values = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: "public-test-'\\\nvalue" };
  const result = buildInTemporaryDirectory(t, values);
  assert.equal(result.status, 0, result.stderr);
  const context = { window: {} };
  assert.doesNotThrow(() => vm.runInNewContext(fs.readFileSync(result.output, 'utf8'), context));
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.__ACOUSTIMAP_CONFIG__)), values);
});

test('configuración: una variable ausente interrumpe el build y no crea el archivo público', (t) => {
  const result = buildInTemporaryDirectory(t, { SUPABASE_URL: 'https://example.supabase.co' });
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(result.output), false);
});

test('configuración: no imprime fragmentos de la clave en los logs', (t) => {
  const key = 'public-test-value-that-must-not-be-logged';
  const result = buildInTemporaryDirectory(t, { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: key });
  assert.equal(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`.includes(key.slice(0, 20)), false);
});
