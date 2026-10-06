const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('medidor compacto: lectura, promedio y acciones quedan fuera de los detalles', () => {
  const panel = html.slice(html.indexOf('id="stats-panel"'), html.indexOf('<!-- MODAL', html.indexOf('id="stats-panel"')));
  const details = panel.indexOf('id="stats-content"');
  assert.ok(details > 0);
  for (const id of ['db-number', 'db-status-text', 'measurement-caveat', 'avg-number', 'btn-toggle', 'btn-share']) {
    assert.ok(panel.indexOf(`id="${id}"`) < details, `${id} siempre visible`);
  }
  for (const id of ['measurement-guidance', 'sample-count']) {
    assert.ok(panel.indexOf(`id="${id}"`) > details, `${id} dentro de detalles`);
  }
  /*
   * La instrumentación del micrófono no está en «Detalles y ayuda»: está en un
   * bloque propio y oculto, porque no es ayuda para medir sino auditoría del
   * instrumento. Se abre con `verCalidadMicrofono()` desde la consola.
   *
   * Lo que este test fija no es el sitio sino el `hidden`: que nadie la vea sin
   * pedirla.
   */
  const micDetail = panel.slice(panel.indexOf('class="mic-detail"'), panel.indexOf('id="stats-content"'));
  assert.ok(micDetail.length > 0, 'el bloque de instrumentación existe');
  for (const id of ['audio-diagnostics-data', 'audio-capture-note', 'audio-signal-reading']) {
    assert.ok(micDetail.includes(`id="${id}"`), `${id} en el bloque oculto`);
  }
  assert.match(panel, /<div class="mic-detail" hidden>/, 'el bloque arranca oculto');
  assert.ok(!/<details class="audio-diagnostics">/.test(panel.slice(details)),
    'el diagnóstico no se abre desde el desplegable de detalles');
  assert.match(panel, /id="stats-content" inert/);
  assert.match(panel, /<details class="measurement-help">/);
});

test('detalles: expandir y plegar sincroniza el foco, inert y aria-expanded', () => {
  const classes = new Set(['collapsed']);
  const attrs = new Map();
  const handle = { setAttribute: (key, value) => attrs.set(key, value), focus: () => { document.activeElement = handle; } };
  const content = { inert: true, contains: (element) => element === child };
  const child = {};
  const label = {};
  const panel = {
    addEventListener() {},
    classList: { toggle: (name) => classes.has(name) ? classes.delete(name) : classes.add(name), contains: (name) => classes.has(name) },
    querySelector: () => handle
  };
  const document = {
    documentElement: { lang: 'es' }, activeElement: handle, addEventListener() {}, querySelectorAll: () => [],
    getElementById: (id) => ({ 'stats-panel': panel, 'stats-content': content, 'stats-handle-label': label }[id])
  };
  const browser = createBrowserContext({ document, requestAnimationFrame() {} });
  browser.load('config.js', 'app.js');
  browser.evaluate('toggleStatsPanel()');
  assert.equal(content.inert, false);
  assert.equal(attrs.get('aria-expanded'), 'true');
  assert.equal(label.innerText, 'Ocultar detalles');
  document.activeElement = child;
  browser.evaluate('toggleStatsPanel()');
  assert.equal(content.inert, true);
  assert.equal(attrs.get('aria-expanded'), 'false');
  assert.equal(document.activeElement, handle);
  assert.equal(label.innerText, 'Detalles y ayuda');
});

test('Motion: el CDN es opcional y reduced-motion evita o cancela la animación', async () => {
  let reduced = false;
  let onChange;
  let animated = 0;
  let cancelled = 0;
  const browser = createBrowserContext({
    requestAnimationFrame() {},
    window: {
      addEventListener() {},
      matchMedia: () => ({ matches: reduced, addEventListener: (_, fn) => { onChange = fn; } }),
      Motion: { animate: (_, frames, options) => {
        animated++;
        assert.equal(options.duration, 0.22);
        assert.deepEqual(Object.keys(frames), ['opacity', 'y']);
        return { finished: new Promise(() => {}), cancel: () => { cancelled++; } };
      } }
    }
  });
  browser.load('config.js', 'app.js');
  browser.context.panel = {};
  browser.evaluate('revealUi(panel)');
  assert.equal(animated, 1);
  reduced = true;
  onChange({ matches: true });
  assert.equal(cancelled, 1);
  browser.evaluate('revealUi(panel)');
  assert.equal(animated, 1);
  reduced = false;
  browser.evaluate('delete window.Motion; revealUi(panel)');
  assert.equal(animated, 1);
});

test('Motion: versión fijada y disponible en la caché opcional de la PWA', () => {
  const motion = 'https://cdn.jsdelivr.net/npm/motion@14.0.0/dist/motion.js';
  assert.ok(html.includes(motion));
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(sw.includes(motion));
  assert.ok(sw.indexOf(motion) > sw.indexOf('Promise.allSettled'));
});
