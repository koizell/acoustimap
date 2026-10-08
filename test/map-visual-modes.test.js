const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-context');

function source(file, name) {
  const text = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
  const match = text.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} debe conservar su declaración`);
  return match[0];
}

function heatContext() {
  const callbacks = [], canceled = [], attached = new Set();
  const layer = {
    _latlngs: [], _frame: null,
    addTo() { attached.add(this); },
    setLatLngs(points) { this._latlngs = points; }
  };
  const context = {
    communityHeatRenderToken: 0, communityHeatLayer: layer,
    communityLayer: { clearLayers() {} },
    ensureHeatLayer: () => layer, waitForMapSize: callback => callbacks.push(callback),
    normalizeDbForHeatmap: value => (value - 30) / 65,
    map: { hasLayer: value => attached.has(value), removeLayer: value => attached.delete(value) },
    L: { Util: { cancelAnimFrame: id => canceled.push(id) } }, console
  };
  vm.createContext(context);
  vm.runInContext(['detachHeatLayer', 'clearCommunityLayers', 'suspendMapHeatLayers', 'setCommunityHeatPoints', 'addCommunityHeatPoint']
    .map(name => source('map.js', name)).join('\n'), context);
  return { context, layer, attached, callbacks, canceled };
}

test('calor: un dibujo pendiente no puede reaparecer tras cambiar a Puntos', () => {
  const browser = heatContext();
  browser.context.setCommunityHeatPoints([{ lat: 8.75, lng: -75.88, db: 95 }]);
  browser.context.clearCommunityLayers();
  browser.callbacks[0]();
  assert.equal(browser.attached.size, 0);
});

test('calor: solamente el último conjunto pendiente se dibuja', () => {
  const browser = heatContext();
  browser.context.setCommunityHeatPoints([{ lat: 8.75, lng: -75.88, db: 95 }]);
  browser.context.setCommunityHeatPoints([{ lat: 8.76, lng: -75.88, db: 55 }]);
  browser.callbacks[1]();
  browser.callbacks[0]();
  assert.equal(browser.layer._latlngs[0][0], 8.76);
  assert.equal(browser.layer._latlngs[0][2], 25 / 65);
});

test('calor: retirar el canvas cancela el RAF y una pestaña oculta no recupera capas', () => {
  const browser = heatContext();
  browser.attached.add(browser.layer);
  browser.layer._frame = 42;
  browser.context.addCommunityHeatPoint(8.75, -75.88, 95);
  browser.context.suspendMapHeatLayers();
  browser.callbacks[0]();
  assert.deepEqual(browser.canceled, [42]);
  assert.equal(browser.layer._frame, null);
  assert.equal(browser.attached.size, 0);
});

test('calor: una consulta vacía no vuelve a pintar las coordenadas anteriores', () => {
  const browser = heatContext();
  browser.context.setCommunityHeatPoints([{ lat: 8.75, lng: -75.88, db: 95 }]);
  browser.context.setCommunityHeatPoints([]);
  browser.callbacks[0]();
  assert.equal(browser.attached.size, 0);
  assert.equal(browser.layer._latlngs.length, 0);
});

test('calor: se desactiva la atenuación por zoom sin cambiar la escala del índice', () => {
  let options;
  const context = { communityHeatLayer: null, createRelativeHeatLayer: (_, value) => { options = value; return {}; } };
  vm.runInNewContext(`${source('map.js', 'ensureHeatLayer')}\nensureHeatLayer();`, context);
  assert.equal(options.maxZoom, 0);
  assert.equal(options.gradient[0.385], '#facc15');
  assert.equal(options.gradient[0.615], '#f97316');
});

test('puntos: cambiar la visualización termina Comparar incluso sin datos comunitarios', () => {
  const renders = [];
  let exits = 0;
  const context = {
    selectedVisualMode: 'heatmap', lastAggregatedPoints: [],
    document: { querySelectorAll: () => [] },
    exitComparisonMode: () => { exits++; },
    renderCommunityPoints: points => renders.push(points)
  };
  vm.runInNewContext(`${source('community.js', 'setCommunityVisualMode')}\nthis.run = setCommunityVisualMode;`, context);
  context.run('zones');
  assert.equal(context.selectedVisualMode, 'zones');
  assert.equal(exits, 1);
  assert.equal(renders.length, 1);
  context.run('invalid');
  assert.equal(exits, 1);
  assert.equal(context.selectedVisualMode, 'zones');
});

test('comparación: Limpiar funciona sin polígono y restaura la visualización normal', () => {
  let cleared = 0, rendered = 0, canceled = 0;
  const context = {
    drawnZone: null, lastAggregatedPoints: [],
    exitComparisonMode: () => { cleared++; },
    cancelZoneDrawing: () => { canceled++; },
    renderCommunityPoints: () => { rendered++; }, closeFeaturePanel() {}
  };
  vm.runInNewContext(`${source('features.js', 'clearDrawnZone')}\nclearDrawnZone();`, context);
  assert.equal(cleared, 1);
  assert.equal(rendered, 1);
  assert.equal(canceled, 1);
});

test('mapa: si falta la RPC de la versión vigente, lo dice y no finge un mapa vacío', async () => {
  const status = { dataset: {}, hidden: true }, counter = {};
  const browser = createBrowserContext({
    document: {
      documentElement: { lang: 'es' }, addEventListener() {},
      getElementById: id => id === 'community-count' ? counter : id === 'map-data-status' ? status : null
    },
    client: { rpc: () => ({ range: async () => ({ error: { code: 'PGRST202' } }) }) },
    map: { on() {}, getBounds: () => ({ getSouth: () => 8, getNorth: () => 9, getWest: () => -76, getEast: () => -75 }) },
    clearCommunityLayers() {}, setCommunityHeatPoints() {}
  });
  browser.load('config.js', 'community.js');
  browser.evaluate('supabaseClient = client');
  await browser.evaluate('loadCommunityPoints()');
  assert.equal(status.hidden, false);
  assert.equal(status.dataset.state, 'missingMethod');
  /*
   * El número se lee de MEASUREMENT_VERSION en vez de escribirlo. Con la v3 fija en
   * el texto, subir a la v4 dejó el aviso diciendo «falta aplicar la migración v3»,
   * que es justo el momento en que un aviso de migración equivocado cuesta tiempo:
   * se aplica una migración que ya está aplicada y la migración que falta no se
   * aplica nunca.
   */
  assert.match(status.textContent, new RegExp(`migración v${browser.evaluate('MEASUREMENT_VERSION')}`));
  assert.equal(browser.evaluate('lastAggregatedPoints.length'), 0);
});

test('envío: ni Historial ni En vivo añaden círculos sueltos o duplican celdas', async () => {
  for (const mode of ['history', 'live']) {
    let reloads = 0;
    const context = {
      Date, Math, crypto: { randomUUID: () => 'test' },
      sharingEnabled: true, currentPosition: { lat: 8.75, lng: -75.88 },
      lastSendTime: 0, SEND_INTERVAL_MS: 10000, MEASUREMENT_VERSION: 4,
      captureProfile: 'unprocessed', sendWindowEnergia: 1e5, sendWindowCount: 1,
      energiaDe: (db) => Math.pow(10, db / 10),
      promedioEnergetico: (e, c) => (!c || !(e > 0)) ? 0 : 10 * Math.log10(e / c),
      mapMode: mode, selectedVisualMode: 'heatmap',
      snapToGrid: (lat, lng) => ({ lat, lng }), classifyDb: () => 'alto',
      supabaseClient: { from: () => ({ insert: async () => ({ error: null }) }) },
      document: { getElementById: () => ({ classList: { contains: () => true } }) },
      loadCommunityPoints: () => { reloads++; },
      addCommunityPoint: () => assert.fail('no debe crear círculos'),
      addCommunityHeatPoint: () => assert.fail('debe volver a agregar en la RPC'),
      console
    };
    vm.runInNewContext(`${source('community.js', 'sendMeasurementIfDue')}\nthis.run = sendMeasurementIfDue;`, context);
    await context.run();
    assert.equal(reloads, 1);
  }
});

test('envío: guardar en la cola offline no presenta el aporte como publicado en el mapa', async () => {
  let queued = 0;
  const context = {
    Date, Math, crypto: { randomUUID: () => 'queued' },
    sharingEnabled: true, currentPosition: { lat: 8.75, lng: -75.88 },
    lastSendTime: 0, SEND_INTERVAL_MS: 10000, MEASUREMENT_VERSION: 4,
    captureProfile: 'unprocessed', sendWindowEnergia: 1e5, sendWindowCount: 1,
      energiaDe: (db) => Math.pow(10, db / 10),
      promedioEnergetico: (e, c) => (!c || !(e > 0)) ? 0 : 10 * Math.log10(e / c),
    snapToGrid: (lat, lng) => ({ lat, lng }), classifyDb: () => 'alto',
    supabaseClient: { from: () => ({ insert: async () => ({ error: { message: 'offline' } }) }) },
    isOfflineError: () => true, queueOfflineMeasurement: async () => { queued++; },
    document: { getElementById: () => ({ classList: { contains: () => true } }) },
    loadCommunityPoints: () => assert.fail('el mapa público no debe refrescarse por un aporte sin publicar'),
    addCommunityPoint: () => assert.fail('no debe crear círculos'),
    addCommunityHeatPoint: () => assert.fail('no debe pintar una publicación inexistente'),
    console: { error() {} }
  };
  vm.runInNewContext(`${source('community.js', 'sendMeasurementIfDue')}\nthis.run = sendMeasurementIfDue;`, context);
  await context.run();
  assert.equal(queued, 1);
  assert.equal(context.sendWindowCount, 0);
});

test('puntos: etiquetas permanentes solo al acercar y con espacio suficiente', () => {
  let zoom = 14;
  const existing = [{ getTooltip: () => ({ options: { permanent: true } }), getLatLng: () => [100, 100] }];
  const context = {
    map: { getZoom: () => zoom, latLngToContainerPoint: ([x, y]) => ({ x, y }) },
    communityLayer: { eachLayer: callback => existing.forEach(callback) }
  };
  vm.runInNewContext(`${source('community.js', 'communityLabelVisible')}\nthis.visible = communityLabelVisible;`, context);
  assert.equal(context.visible(500, 500), false);
  zoom = 17;
  assert.equal(context.visible(140, 110), false);
  assert.equal(context.visible(220, 110), true);
});

test('puntos: la huella visual no invade celdas vecinas ni representa propagación acústica', () => {
  const layers = [];
  const marker = options => {
    const layer = { options, addTo() { layers.push(this); return this; }, bindTooltip() { return this; }, bindPopup() { return this; } };
    return layer;
  };
  const context = {
    L: { circle: (_, options) => marker(options), circleMarker: (_, options) => marker(options) },
    communityLayer: {}, COLOR_BY_CAT: { bajo: 'green' }, classifyDb: () => 'bajo',
    timeAgo: () => 'ahora', communityText: key => key, densityConfidence: () => 0,
    cellBorderOpacity: () => 1, CIRCLE_VISUAL_RADIUS_M: 50, CELL_SIZE_M: 70,
    communityLabelVisible: () => false,
    addCommunityNoiseMarker: () => layers.push({ type: 'noise-marker' })
  };
  vm.runInNewContext(`${source('community.js', 'addCommunityPoint')}\naddCommunityPoint(8.75, -75.88, 40, 'bajo', null, 1);`, context);
  assert.equal(layers.length, 4);
  assert.ok(layers[0].options.radius <= 35);
  assert.ok(layers[1].options.radius < 35);
});
