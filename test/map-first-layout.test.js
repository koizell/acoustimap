const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');
const root = path.resolve(__dirname, '..');

test('mapa primero: filtros nativos cerrados y conexión técnica bajo Información', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<details class="map-filters" id="map-filters" ontoggle="onMapFiltersToggle\(\)">/);
  const filters = html.slice(html.indexOf('id="map-filters"'), html.indexOf('<!-- Botón de leyenda'));
  for (const id of ['time-all', 'time-night', 'mode-history', 'mode-live', 'visual-heatmap', 'visual-zones']) {
    assert.ok(filters.includes(`id="${id}"`));
  }
  assert.ok(html.indexOf('id="map-connection-detail"') > html.indexOf('id="map-legend"'));
  const css = fs.readFileSync(path.join(root, 'css/experience.css'), 'utf8');
  assert.match(css, /\.map-data-status\[data-state="ready"\] \{ display: none; \}/);
  assert.ok(!css.includes('.map-data-status[data-state="error"] { display: none; }'));
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.stats-handle \{[^}]*min-height: 44px/);
});

test('filtros: Escape cierra y devuelve el foco sin romper los modales', () => {
  let focused = false;
  let handler;
  const filters = { open: true, querySelector: () => ({ focus() { focused = true; } }) };
  const browser = createBrowserContext({ requestAnimationFrame() {}, document: {
    documentElement: { lang: 'es' },
    getElementById: id => id === 'map-filters' ? filters : null,
    addEventListener(name, fn) { if (name === 'keydown') handler = fn; }
  } });
  browser.load('config.js', 'app.js');
  handler({ key: 'Escape' });
  assert.equal(filters.open, false);
  assert.equal(focused, true);
});

test('estado de conexión: Información conserva la respuesta completa', () => {
  const banner = { dataset: {}, setAttribute() {} };
  const detail = {};
  const browser = createBrowserContext({ document: {
    documentElement: { lang: 'es' },
    addEventListener() {},
    getElementById: id => ({ 'map-data-status': banner, 'map-connection-detail': detail }[id])
  } });
  browser.load('config.js', 'community.js');
  browser.evaluate("setMapDataStatus('ready')");
  assert.equal(detail.textContent, banner.textContent);
  assert.match(detail.textContent, /RPC v5 OK/);
  browser.evaluate("setMapDataStatus('denied')");
  assert.equal(banner.dataset.state, 'denied');
  assert.equal(banner.hidden, false);
});
