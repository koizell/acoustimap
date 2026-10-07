const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDevServer, openBrowser } = require('../scripts/dev-server');

test('servidor local: versión verificable, sin caché y sin publicar archivos privados', async (t) => {
  const server = createDevServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const status = await fetch(`${base}/_dev/status`);
  const metadata = await status.json();
  assert.match(metadata.version, /^\d+$/);
  assert.equal(typeof metadata.configured, 'boolean');
  assert.equal(Object.hasOwn(metadata, 'SUPABASE_ANON_KEY'), false);
  for (const resource of ['/', '/index.html?dev=44', '/js/config.js?v=44', '/js/audio-level-processor.js?v=44', '/sw.js']) {
    const response = await fetch(`${base}${resource}`);
    assert.equal(response.status, 200, resource);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const resource of ['/setup.sql', '/.git/config', '/test/backend-connection.test.js', '/README.md', '/%2e%2e/setup.sql']) {
    assert.equal((await fetch(`${base}${resource}`)).status, 404);
  }
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
});

test('abrir navegador: no admite URLs o comandos externos como entrada', async () => {
  await assert.rejects(openBrowser('https://outside.test/'), /URL local inválida/);
  await assert.rejects(openBrowser("http://localhost:3000/'; Remove-Item x"), /URL local inválida/);
});

test('servidor local: copia limpia sin config.local.js responde sin configurar', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acoustimap-dev-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'index.html'), '<script src="js/config.js?v=45"></script>');
  const server = createDevServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/_dev/status`);
  assert.equal(response.status, 200);
  const metadata = await response.json();
  assert.equal(metadata.configured, false);
  assert.equal(metadata.version, '45');
  fs.writeFileSync(path.join(root, 'index.html'), '<script src="js/config.js?v=46"></script>');
  const refreshed = await fetch(`http://127.0.0.1:${server.address().port}/_dev/status`);
  assert.equal((await refreshed.json()).version, '46', 'el diagnóstico sigue la versión servida sin reiniciar');
});
