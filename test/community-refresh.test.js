const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

test('comunidad: una recarga conserva el popup y foco de la misma celda sin repetir autopan', async () => {
  const layers = [], openings = [], counter = {};
  let browser;
  function marker(open = false) {
    const button = { focus() { browser.context.document.activeElement = button; } };
    const popup = { options: { autoPan: true }, getElement: () => ({ contains: () => false }) };
    return { isPopupOpen: () => open, getLatLng: () => ({ lat: 8.75, lng: -75.88 }), getPopup: () => popup,
      getElement: () => ({ querySelector: () => button }), openPopup() { openings.push(popup.options.autoPan); open = true; }, button };
  }
  browser = createBrowserContext({
    document: { documentElement: { lang: 'es' }, addEventListener() {},
      getElementById: id => id === 'community-count' ? counter : id === 'map-view' ? { classList: { contains: () => true } } : null },
    communityLayer: { eachLayer(fn) { layers.forEach(fn); }, clearLayers() { layers.length = 0; } },
    clearCommunityLayers() { layers.length = 0; }, setCommunityHeatPoints() {},
    map: { on() {}, getBounds: () => ({ getSouth: () => 8, getNorth: () => 9, getWest: () => -76, getEast: () => -75 }) },
    client: { rpc: () => ({ range: async () => ({ data: [{ latitude: 8.75, longitude: -75.88, db_level: 60, category: 'moderado', sample_count: 1, created_at: '2026-09-26T13:00:00Z' }], error: null }) }) },
    setInterval() {}
  });
  browser.load('config.js', 'community.js');
  browser.context.addMarker = () => { const next = marker(); layers.push(next); return next; };
  browser.evaluate('addCommunityNoiseMarker = addMarker; supabaseClient = client');
  const previous = marker(true); layers.push(previous); browser.context.document.activeElement = previous.button;
  await browser.evaluate('loadCommunityPoints()');
  assert.deepEqual(openings, [false]);
  assert.equal(browser.context.document.activeElement, layers[0].button);
  assert.equal(layers[0].getPopup().options.autoPan, true);
  await browser.evaluate('loadCommunityPoints()');
  assert.deepEqual(openings, [false, false]);
  browser.load('features.js');
  browser.context.window.L = { heatLayer() {} };
  browser.context.createRelativeHeatLayer = () => ({ addTo() {}, setLatLngs() {} });
  browser.context.suspendMapHeatLayers = () => {};
  browser.evaluate(`comparisonMode = 'current'; comparisonRows.current = [{latitude:8.75,longitude:-75.88,db_level:60,created_at:'2026-09-26T13:00:00Z'}]; addCommunityPoint = addMarker`);
  for (const mode of ['heatmap', 'zones']) {
    browser.context.mode = mode;
    const before = openings.length;
    browser.evaluate('selectedVisualMode = mode; activateComparisonLayer()');
    assert.equal(openings.length, before + 1, 'Comparar debe recuperar el popup también al cambiar la visualización');
    assert.equal(openings.at(-1), false);
    assert.equal(browser.context.document.activeElement, layers[0].button);
  }
});
