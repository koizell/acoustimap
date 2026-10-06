const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

test('envío: recupera las muestras rechazadas sin perder las recibidas durante la petición', async () => {
  let finish;
  const sent = [];
  const delivery = [];
  const browser = createBrowserContext({
    updateSharingDelivery: state => delivery.push(state),
    client: { from: (table) => ({ insert: (payload) => {
      assert.equal(table, 'noise_measurements');
      sent.push(payload);
      return new Promise((resolve) => { finish = resolve; });
    } }) }
  });
  browser.load('config.js', 'community.js');
  browser.evaluate(`supabaseClient = client; sharingEnabled = true;
    currentPosition = { lat: 8.75, lng: -75.88 }; sendWindowEnergia = 3e5; sendWindowCount = 3;`);
  const sending = browser.evaluate('sendMeasurementIfDue()');
  browser.evaluate('sendWindowEnergia = 2e5; sendWindowCount = 2');
  finish({ error: { code: '42501', message: 'Insert denied' } });
  await sending;
  assert.equal(sent.length, 1);
    // Tres muestras de 50 dB: energia 3 x 10^5, y 10*log10(10^5) = 50.
  assert.equal(sent[0].db_level, 50);
  assert.equal(browser.evaluate('sendWindowEnergia'), 5e5);
  assert.equal(browser.evaluate('sendWindowCount'), 5);
  assert.equal(browser.evaluate('sendMeasurementIfDue.pending'), false);
  assert.deepEqual(delivery, ['sending', 'error']);
});

test('mapa: una respuesta antigua no borra los datos de la consulta más reciente', async () => {
  const pending = [];
  const rendered = [];
  let clears = 0;
  const browser = createBrowserContext({
    client: { rpc: (name) => {
      assert.equal(name, 'noise_map_cells_v5');
      return { range: () => new Promise((resolve) => pending.push(resolve)) };
    } },
    map: { on() {}, getBounds: () => ({
      getSouth: () => 8.7, getNorth: () => 8.8, getWest: () => -75.9, getEast: () => -75.8
    }) },
    clearCommunityLayers: () => { clears++; },
    setCommunityHeatPoints: (points) => rendered.push(points),
    comparisonMode: null
  });
  browser.load('config.js', 'community.js');
  const counter = { innerText: '' };
  browser.context.document.getElementById = (id) => id === 'community-count' ? counter : null;
  browser.evaluate('supabaseClient = client');
  const first = browser.evaluate('loadCommunityPoints()');
  const second = browser.evaluate('loadCommunityPoints()');
  pending[1]({ data: [{ latitude: 8.75, longitude: -75.88, db_level: 65,
    category: 'moderado', sample_count: 3, created_at: '2026-09-26T14:00:00.000Z' }], error: null });
  await second;
  const afterRecent = counter.innerText;
  const recentClears = clears;
  pending[0]({ data: [], error: null });
  await first;
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0][0].db, 65);
  assert.equal(rendered[0][0].sampleCount, 3);
  assert.equal(browser.evaluate('lastAggregatedPoints.length'), 1);
  assert.equal(counter.innerText, afterRecent);
  assert.equal(clears, recentClears);
});
