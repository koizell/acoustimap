const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

test('publicación: incluye los recursos de la app y excluye código privado, pruebas y herramientas', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acoustimap-site-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.resolve(__dirname, '..');
  for (const item of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'assets', 'scripts']) {
    fs.cpSync(path.join(project, item), path.join(root, item), { recursive: true });
  }
  fs.mkdirSync(path.join(root, 'js'));
  for (const item of fs.readdirSync(path.join(project, 'js')).filter((name) => name !== 'config.local.js')) {
    fs.copyFileSync(path.join(project, 'js', item), path.join(root, 'js', item));
  }
  fs.writeFileSync(path.join(root, 'js/config.local.js'), 'window.__ACOUSTIMAP_CONFIG__ = {};');
  for (const item of ['.git', 'graphify-out', 'supabase', 'test', 'node_modules', 'dist']) {
    fs.mkdirSync(path.join(root, item));
    fs.writeFileSync(path.join(root, item, 'private.txt'), 'not-for-publication');
  }
  fs.writeFileSync(path.join(root, '.env'), 'PRIVATE=fixture');
  fs.writeFileSync(path.join(root, 'js/local-experiment.js'), 'not-for-publication');

  const result = spawnSync(process.execPath, ['scripts/build-site.js'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const dist = path.join(root, 'dist');
  assert.deepEqual(fs.readdirSync(dist).sort(), ['assets', 'css', 'index.html', 'js', 'manifest.webmanifest', 'sw.js']);
  assert.equal(fs.existsSync(path.join(dist, 'js/local-experiment.js')), false);
  assert.equal(fs.existsSync(path.join(dist, 'js/config.local.js.template')), false);

  // Comprueba el artefacto que consumen el HTML y la instalación offline reales.
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|#)/.test(reference)) continue;
    assert.ok(fs.existsSync(path.join(dist, reference.split('?')[0])), reference);
  }
  const context = vm.createContext({ self: { addEventListener() {}, skipWaiting() {}, clients: { claim() {} } } });
  vm.runInContext(fs.readFileSync(path.join(dist, 'sw.js'), 'utf8'), context);
  for (const reference of vm.runInContext('APP_SHELL', context)) {
    assert.ok(fs.existsSync(path.join(dist, reference.split('?')[0])), reference);
    if (!['./', './index.html'].includes(reference)) assert.ok(html.includes(reference.slice(2)), reference);
  }
});
