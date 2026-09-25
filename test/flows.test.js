const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function functionSource(file, name) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
}

test('comparison renders the selected period without a ReferenceError', () => {
  const layers = [];
  const context = {
    comparisonMode: 'previous',
    comparisonRows: { previous: [{ latitude: 8.75, longitude: -75.88, db_level: 70 }], current: [] },
    comparisonLayer: null,
    currentComparisonLayer: null,
    communityHeatLayer: null,
    window: { L: { heatLayer: () => true } },
    L: { heatLayer: () => ({ setLatLngs(points) { this.points = points; }, addTo() { layers.push(this); } }) },
    map: { hasLayer: () => false, removeLayer() {} },
    communityLayer: { clearLayers() {} },
    normalizeDbForHeatmap: () => 0.6
  };
  vm.runInNewContext(`${functionSource('features.js', 'activateComparisonLayer')}\nthis.run = activateComparisonLayer;`, context);
  context.run();
  assert.equal(layers.length, 1);
  assert.deepEqual(Array.from(layers[0].points[0]), [8.75, -75.88, 0.6]);
});

test('a pending measurement request does not send the same window twice', async () => {
  let inserts = 0;
  let ids = 0;
  const payloads = [];
  let finishRequest;
  const pending = new Promise((resolve) => { finishRequest = resolve; });
  const context = {
    Date, Math,
    crypto: { randomUUID: () => String(++ids) },
    sharingEnabled: true,
    currentPosition: { lat: 8.75, lng: -75.88 },
    lastSendTime: 0,
    SEND_INTERVAL_MS: 10000,
    sendWindowCount: 1,
    sendWindowSum: 50,
    snapToGrid: (lat, lng) => ({ lat, lng }),
    classifyDb: () => 'bajo',
    featureClientId: 'browser-id',
    mapMode: 'history',
    addCommunityPoint() {},
    supabaseClient: { from: () => ({ insert: (payload) => { inserts++; payloads.push(payload); return pending; } }) },
    console
  };
  vm.runInNewContext(`${functionSource('community.js', 'sendMeasurementIfDue')}\nthis.run = sendMeasurementIfDue;`, context);
  const first = context.run();
  const second = context.run();
  assert.equal(inserts, 1);
  assert.equal(Object.hasOwn(payloads[0], 'client_id'), false);
  finishRequest({ error: null });
  await Promise.all([first, second]);
});

test('challenge progress keeps measurements only in browser storage', () => {
  const storage = new Map();
  const context = {
    Date,
    CHALLENGE_STORE: 'acoustimap-local-challenge-measurements',
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value)
    }
  };
  vm.runInNewContext(`${functionSource('features.js', 'recordLocalChallengeMeasurement')}\n${functionSource('features.js', 'getLocalChallengeMeasurements')}\nthis.record = recordLocalChallengeMeasurement; this.read = getLocalChallengeMeasurements;`, context);
  context.record({ latitude: 8.75, longitude: -75.88, db_level: 50, created_at: new Date().toISOString() });
  const rows = context.read();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].db_level, 50);
  assert.equal(Object.hasOwn(rows[0], 'client_id'), false);
});

test('report data and photo path do not expose a stable browser identifier', () => {
  const context = { featureClientId: 'browser-secret' };
  vm.runInNewContext(`${functionSource('features.js', 'buildReportRecord')}\nthis.build = buildReportRecord;`, context);
  const result = context.build('f6490798-8cdd-4d7a-b387-d9a15df279fc', { lat: 8.75, lng: -75.88 }, 50, 'Obras', 'image/jpeg');
  assert.equal(Object.hasOwn(result.payload, 'client_id'), false);
  assert.equal(result.photoPath, 'f6490798-8cdd-4d7a-b387-d9a15df279fc/f6490798-8cdd-4d7a-b387-d9a15df279fc.jpg');
});

test('confirmation key is stable per hour but does not contain the browser identifier', async () => {
  const context = {
    featureClientId: 'browser-secret',
    crypto: { randomUUID: () => 'f6490798-8cdd-4d7a-b387-d9a15df279fc', subtle: webcrypto.subtle },
    TextEncoder,
    Uint8Array,
    Array,
    snapToGrid: (lat, lng) => ({ lat, lng })
  };
  vm.runInNewContext(`${functionSource('features.js', 'buildConfirmation')}\nthis.build = buildConfirmation;`, context);
  const first = await context.build({ lat: 8.75, lng: -75.88 }, '2026-09-24T10:00:00.000Z');
  const second = await context.build({ lat: 8.75, lng: -75.88 }, '2026-09-24T10:00:00.000Z');
  assert.equal(first.confirmation_key, second.confirmation_key);
  assert.match(first.confirmation_key, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(first, 'client_id'), false);
  assert.equal(JSON.stringify(first).includes('browser-secret'), false);
});

test('map requests aggregated cells for the visible area and selected time window', async () => {
  const cells = [
    { latitude: 8.75, longitude: -75.88, db_level: 50, category: 'bajo', created_at: '2026-09-24T13:00:00Z', sample_count: 18 },
    { latitude: 8.76, longitude: -75.87, db_level: 60, category: 'moderado', created_at: '2026-09-23T13:00:00Z', sample_count: 12 }
  ];
  const counter = { innerText: '' };
  let rendered = [];
  let rpcName;
  let rpcParams;
  const context = {
    Date,
    document: { getElementById: () => counter },
    communityLoadToken: 0,
    supabaseClient: { rpc(name, params) {
      rpcName = name;
      rpcParams = params;
      return { range: async () => ({ data: cells, error: null }) };
    } },
    map: { getBounds: () => ({
      getSouth: () => 8.7, getNorth: () => 8.8,
      getWest: () => -75.9, getEast: () => -75.8
    }) },
    mapMode: 'history',
    selectedTimeFilter: 'morning',
    renderCommunityPoints: (points) => { rendered = points; },
    clearCommunityLayers() {},
    timeAgo: () => 'hace tiempo',
    console
  };
  vm.runInNewContext(`${functionSource('community.js', 'loadCommunityPoints')}\nthis.run = loadCommunityPoints;`, context);
  await context.run();
  assert.equal(rpcName, 'noise_map_cells');
  assert.equal(rpcParams.p_time_filter, 'morning');
  assert.equal(rpcParams.p_south, 8.7);
  assert.equal(rpcParams.p_north, 8.8);
  assert.equal(rpcParams.p_west, -75.9);
  assert.equal(rpcParams.p_east, -75.8);
  assert.ok(new Date(rpcParams.p_until) - new Date(rpcParams.p_since) >= 89 * 86400000);
  assert.equal(rendered.length, 2);
  assert.equal(rendered[0].sampleCount, 18);
  assert.match(counter.innerText, /30 mediciones/);
});

test('initial heatmap data mounts the Leaflet layer before redraw', () => {
  const warnings = [];
  const layer = {
    attached: false,
    setLatLngs(points) {
      if (!this.attached) throw new TypeError("Cannot read properties of null (reading '_animating')");
      this.points = points;
    },
    addTo() { this.attached = true; return this; }
  };
  const context = {
    communityLayer: { clearLayers() {} },
    ensureHeatLayer: () => layer,
    map: { hasLayer: () => layer.attached },
    normalizeDbForHeatmap: () => 0.5,
    waitForMapSize: (callback) => callback(),
    console: { warn: (...args) => warnings.push(args) }
  };
  vm.runInNewContext(`${functionSource('map.js', 'setCommunityHeatPoints')}\nthis.run = setCommunityHeatPoints;`, context);
  context.run([{ lat: 8.75, lng: -75.88, db: 55 }]);
  assert.equal(layer.attached, true);
  assert.deepEqual(Array.from(layer.points[0]), [8.75, -75.88, 0.5]);
  assert.equal(warnings.length, 0);
});

test('a newly shared point mounts the heat layer before redraw', () => {
  const warnings = [];
  const layer = {
    attached: false,
    _latlngs: [],
    setLatLngs(points) {
      if (!this.attached) throw new TypeError("Cannot read properties of null (reading '_animating')");
      this.points = points;
    },
    addTo() { this.attached = true; return this; }
  };
  const context = {
    ensureHeatLayer: () => layer,
    map: { hasLayer: () => layer.attached },
    normalizeDbForHeatmap: () => 0.5,
    waitForMapSize: (callback) => callback(),
    console: { warn: (...args) => warnings.push(args) }
  };
  vm.runInNewContext(`${functionSource('map.js', 'addCommunityHeatPoint')}\nthis.run = addCommunityHeatPoint;`, context);
  context.run(8.75, -75.88, 55);
  assert.equal(layer.attached, true);
  assert.deepEqual(Array.from(layer.points[0]), [8.75, -75.88, 0.5]);
  assert.equal(warnings.length, 0);
});
