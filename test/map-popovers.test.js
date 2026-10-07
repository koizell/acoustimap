const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');
const root = path.resolve(__dirname, '..');

test('Información: escala, datos, técnica y descargas se agrupan por prioridad', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const id of ['legend-scale-title', 'legend-data-title', 'legend-technical-title', 'legend-download-title']) {
    assert.ok(html.includes(`id="${id}"`));
  }
  const technical = html.slice(html.indexOf('<details class="legend-technical">'), html.indexOf('</details>', html.indexOf('<details class="legend-technical">')));
  assert.ok(technical.includes('id="map-connection-detail"'));
  assert.ok(technical.includes('id="measurement-method-note"'));
  assert.ok(!technical.includes(' open'));
});

test('herramientas: cerrar sincroniza hidden, aria-expanded y foco', () => {
  let focused = false;
  const menu = { hidden: false };
  const attrs = {};
  const toggle = { setAttribute(k,v) { attrs[k] = v; }, focus() { focused = true; } };
  const toolbar = { querySelector: s => s === '.feature-menu-items' ? menu : toggle };
  const browser = createBrowserContext({ document: { querySelector: () => toolbar, addEventListener() {} } });
  browser.load('config.js', 'features.js');
  browser.evaluate('closeFeatureMenu(true)');
  assert.equal(menu.hidden, true);
  assert.equal(attrs['aria-expanded'], 'false');
  assert.equal(focused, true);
});

test('paneles: cierre táctil, Escape y reconstrucción sin multiplicar listeners', () => {
  const counts = {};
  const node = () => ({ setAttribute() {}, addEventListener() {}, querySelector: node });
  const browser = createBrowserContext({ document: {
    addEventListener(event) { counts[event] = (counts[event] || 0) + 1; },
    createElement: node, getElementById: id => id === 'map-view' ? { appendChild() {} } : null
  }, map: { on() {} } });
  browser.load('config.js', 'features.js');
  browser.evaluate('createFeatureUi(); createFeatureUi(); createFeatureUi()');
  assert.equal(counts.keydown, 1);
  assert.equal(counts.pointerdown, 1);
});
