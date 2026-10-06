const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

function backendBrowser(reply) {
  const status = { dataset: {}, hidden: true }, counter = {};
  const browser = createBrowserContext({
    document: {
      documentElement: { lang: 'es' }, currentScript: { src: 'https://fixture.test/js/config.js?v=44' },
      addEventListener() {}, getElementById: id => id === 'map-data-status' ? status : id === 'community-count' ? counter : null
    },
    client: { rpc: name => {
      assert.equal(name, 'noise_map_cells_v5');
      return { range: reply };
    } },
    map: { on() {}, getBounds: () => ({ getSouth: () => 8.7, getNorth: () => 8.8, getWest: () => -75.9, getEast: () => -75.8 }) },
    clearCommunityLayers() {}, setCommunityHeatPoints() {}
  });
  browser.load('config.js', 'community.js');
  return { ...browser, status, counter };
}

test('conexión: configuración ausente no se confunde con cero aportes', () => {
  const browser = backendBrowser(() => assert.fail('no hay cliente'));
  assert.equal(browser.status.dataset.state, 'disconnected');
  assert.match(browser.status.textContent, /sin configurar/);
  assert.match(browser.status.textContent, /v44/);
});

test('conexión: no afirma estar conectado antes de que responda la RPC', async () => {
  let finish;
  const browser = backendBrowser(() => new Promise(resolve => { finish = resolve; }));
  browser.evaluate('supabaseClient = client');
  const pending = browser.evaluate('loadCommunityPoints()');
  assert.equal(browser.status.dataset.state, 'loading');
  assert.doesNotMatch(browser.status.textContent, /Supabase conectado/);
  finish({ data: [], error: null });
  await pending;
  assert.equal(browser.status.dataset.state, 'empty');
  assert.match(browser.status.textContent, new RegExp(`Supabase conectado · 0 zonas(?! v\\d)`));
  assert.equal(browser.status.hidden, false);
});

test('conexión: una respuesta con celdas mantiene estado y cantidad visibles', async () => {
  const browser = backendBrowser(async () => ({ data: [{ latitude: 8.75, longitude: -75.88,
    db_level: 60, category: 'moderado', sample_count: 2, created_at: '2026-09-26T14:00:00Z' }], error: null }));
  browser.evaluate('supabaseClient = client');
  await browser.evaluate('loadCommunityPoints()');
  assert.equal(browser.status.dataset.state, 'ready');
  assert.match(browser.status.textContent, new RegExp(`RPC v${browser.evaluate('MEASUREMENT_VERSION')} OK · 1 zona · v44`));
  assert.equal(browser.status.hidden, false);
});

test('conexión: permisos, función ausente y red fallida tienen estados distintos', async () => {
  for (const [code, state] of [['42501', 'denied'], ['PGRST301', 'denied'], ['PGRST202', 'missingMethod'], ['NETWORK', 'error']]) {
    const browser = backendBrowser(async () => ({ error: { code } }));
    browser.evaluate('supabaseClient = client');
    await browser.evaluate('loadCommunityPoints()');
    assert.equal(browser.status.dataset.state, state);
    assert.doesNotMatch(browser.status.textContent, /Supabase conectado/);
  }
});

test('conexión: SDK ausente y configuración inválida no dicen que el servidor esté caído', () => {
  for (const [supabase, expected] of [[undefined, 'sdkError'], [{ createClient() { throw new Error('invalid'); } }, 'configError']]) {
    const browser = createBrowserContext({ window: {
      __ACOUSTIMAP_CONFIG__: { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'public-fixture' },
      supabase
    } });
    browser.load('config.js');
    assert.equal(browser.evaluate('backendInitializationState'), expected);
    assert.equal(browser.evaluate('supabaseClient'), null);
  }
});
