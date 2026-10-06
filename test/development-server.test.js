const test = require('node:test');
const assert = require('node:assert/strict');
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
