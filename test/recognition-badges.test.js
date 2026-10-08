const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

test('insignias: visibles desde el inicio, botones accesibles y descripción aun si ya están ganadas', () => {
  const app = createBrowserContext();
  app.load('config.js', 'features.js');
  for (const language of ['es', 'en', 'pt']) {
    app.evaluate(`currentLanguage = '${language}'`);
    const markup = app.evaluate(`recognitionCollectionMarkup({version:1, earned:{'first-measurement':'2026-09-26T13:00:00.000Z'},days:[],best:0})`);
    assert.match(markup, /class="recognition-achievements" open/);
    assert.equal((markup.match(/class="recognition-medal"/g) || []).length, 12);
    assert.equal((markup.match(/role="tooltip" hidden/g) || []).length, 12);
    assert.equal((markup.match(/aria-describedby="recognition-tip-/g) || []).length, 12);
    assert.match(markup, /recognition-about/);
    assert.equal(markup.includes(app.evaluate(`recognitionText('ruleFirstMeasurement')`)), true);
    assert.equal(markup.includes(app.evaluate(`recognitionText('about')`)), true);
    assert.match(markup, /recognition-medal-number[^>]*>30</);
  }
});

test('insignias: círculos de colores, tipografía secundaria menor y movimiento reducido', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../css/experience.css'), 'utf8');
  assert.match(css, /\.recognition-panel \.recognition-medal\s*\{[^}]*border-radius:\s*50%/);
  assert.match(css, /\.recognition-panel \.recognition-tooltip p\s*\{[^}]*font-family:\s*Georgia[^}]*font-size:\s*0\.875rem/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.recognition-tooltip\s*\{\s*animation:\s*none/);
  assert.match(css, /\.recognition-panel \.recognition-medal\s*\{\s*transition:\s*none/);
  assert.doesNotMatch(css, /\.recognition-badge\s*\{[^}]*background:/);
});

function interaction() {
  const app = createBrowserContext({ clearTimeout() {}, setTimeout() { return 1; } });
  app.load('config.js', 'features.js');
  function node(extra = {}) {
    const listeners = {};
    return { ...extra, addEventListener(name, fn) { listeners[name] = fn; },
      emit(name, event = {}) { listeners[name]?.(event); } };
  }
  const badges = Array.from({ length: 2 }, () => {
    const button = node(), tip = node({ hidden: true });
    return { dataset: {}, isConnected: true, button, tip,
      querySelector: (selector) => selector === 'button' ? button : tip,
      contains: (element) => element === button || element === tip };
  });
  const collection = { querySelectorAll: (selector) => selector === '.recognition-badge' ? badges : badges.map(b => b.tip) };
  app.context.collection = collection;
  app.evaluate('bindRecognitionBadges(collection)');
  return { app, badges };
}

test('insignias: hover/foco, Escape y cambio de círculo muestran solo un detalle', () => {
  const { badges: [a, b] } = interaction();
  a.button.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(a.tip.hidden, false);
  b.button.emit('focus');
  assert.equal(a.tip.hidden, true);
  assert.equal(b.tip.hidden, false);
  let stopped = false;
  b.button.emit('keydown', { key: 'Escape', stopPropagation() { stopped = true; } });
  assert.equal(b.tip.hidden, true);
  assert.equal(stopped, true);
});

test('insignias: toque abre tras el foco, segundo toque cierra y salir con Tab oculta', () => {
  const { badges: [a] } = interaction();
  a.button.emit('pointerenter', { pointerType: 'touch' });
  assert.equal(a.tip.hidden, true);
  a.button.emit('focus');
  a.button.emit('click');
  assert.equal(a.tip.hidden, false);
  assert.equal(a.dataset.pinned, 'true');
  a.button.emit('click');
  assert.equal(a.tip.hidden, true);
  assert.equal(a.dataset.pinned, undefined);
  a.button.emit('focus');
  a.button.emit('blur', { relatedTarget: {} });
  assert.equal(a.tip.hidden, true);
});
