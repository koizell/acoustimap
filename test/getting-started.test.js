const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-context');

function startBrowser() {
  const nodes = new Map();
  const node = () => ({ hidden: false, dataset: {}, attributes: {}, classList: { contains: () => true },
    setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; },
    focus() { this.focused = true; } });
  for (const id of ['legend-title', 'legend-toggle', 'legend-close', 'legend-help-title', 'legend-help-intro', 'map-view',
    'zone-drawing-help', 'zone-drawing-step', 'zone-drawing-finish', 'zone-drawing-undo', 'feature-toggle', 'btn-toggle']) nodes.set(id, node());
  nodes.get('zone-drawing-help').hidden = true;
  const handlers = new Map(), mapNode = node(), drawers = [];
  const map = {
    on(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    off(name, fn) { handlers.get(name)?.delete(fn); },
    emit(name, event = {}) { for (const fn of [...(handlers.get(name) || [])]) fn(event); },
    getContainer: () => mapNode,
    removeLayer(layer) { layer.removed = true; }
  };
  const L = { drawLocal: { draw: { handlers: { polygon: { tooltip: {} }, polyline: {} } } }, Draw: {
    Polygon: class {
      constructor() { this.count = 0; drawers.push(this); }
      enable() { this.enabled = true; }
      disable() { this.enabled = false; map.emit('draw:drawstop'); }
      vertex(count) { this.count = count; map.emit('draw:drawvertex', { layers: { getLayers: () => Array(count).fill({}) } }); }
      deleteLastVertex() { if (this.count > 1) this.vertex(this.count - 1); }
      _shapeIsValid() { return this.count >= 3; }
      completeShape() {
        this.completed = true;
        map.emit('draw:created', { layer: { addTo() { return this; }, getLatLngs: () => [[{ lat: 8.75, lng: -75.88 }]] } });
      }
    }
  } };
  const browser = createBrowserContext({ map, L, window: { L, __ACOUSTIMAP_CONFIG__: {}, addEventListener() {} }, document: {
    documentElement: { lang: 'es' }, addEventListener() {},
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => ({ '.feature-menu-toggle': nodes.get('feature-toggle'), '.legend-close': nodes.get('legend-close') }[selector] || null)
  } });
  browser.load('config.js', 'features.js');
  browser.evaluate(`switchTab = () => {}; globalThis.consents = 0; openMicModal = () => consents++;
    globalThis.analyses = []; analyzeDrawnZone = polygon => analyses.push(polygon);`);
  return { ...browser, nodes, mapNode, drawers, handlers, map };
}

test('ayuda: no hay bienvenida automática ni botones adicionales sobre el mapa', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const features = fs.readFileSync(path.join(__dirname, '../js/features.js'), 'utf8');
  assert.doesNotMatch(html, /id="(?:start-guide|start-analyze|start-guide-toggle)"|class="map-start-actions"/);
  assert.doesNotMatch(features, /initializeStartGuide|showStartGuide|acoustimap-start-guide-seen/);
  assert.match(html, /id="map-legend"[^>]*\binert[ >]/);
  assert.match(html, /id="legend-toggle"[^>]*aria-label="Ayuda: cómo usar AcoustiMap"/);
});

test('ayuda: traducciones no activan permisos ni modifican preferencias o aportes', () => {
  const app = startBrowser();
  app.storage.set('acoustimap-theme', 'dark');
  app.storage.set('acoustimap-pending-measurements', '[{"id":"aporte-local"}]');
  app.storage.set('acoustimap-start-guide-seen', '1');
  app.evaluate('updateMapHelpLanguage()');
  assert.equal(app.storage.get('acoustimap-theme'), 'dark');
  assert.equal(app.storage.get('acoustimap-pending-measurements'), '[{"id":"aporte-local"}]');
  assert.equal(app.storage.get('acoustimap-start-guide-seen'), '1');
  assert.equal(app.evaluate('consents'), 0);
  assert.equal(app.nodes.get('legend-toggle').attributes['title'], 'Cómo usar AcoustiMap');
});

test('ayuda: lectura y traducción no dependen del almacenamiento', () => {
  const app = startBrowser();
  app.context.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  assert.doesNotThrow(() => app.evaluate('updateMapHelpLanguage()'));
});

test('ayuda: los pasos son texto; escala, técnica y descargas son detalles nativos cerrados', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const help = html.slice(html.indexOf('<section class="legend-help"'), html.indexOf('<details class="legend-reading">'));
  assert.match(help, /<ol class="legend-help-steps">/);
  assert.equal((help.match(/<li>/g) || []).length, 4);
  assert.doesNotMatch(help, /onclick=|<button/);
  for (const name of ['legend-reading', 'legend-technical', 'legend-downloads']) {
    assert.match(html, new RegExp(`<details class="${name}">`));
    assert.doesNotMatch(html, new RegExp(`<details class="${name}"[^>]* open`));
  }
  assert.ok(html.indexOf('id="legend-help-title"') < html.indexOf('id="legend-scale-title"'));
});

test('icono i: apertura enfoca el título, cierre retira controles y devuelve el foco', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const functionSource = appSource.match(/function toggleLegend\([^]*?\n\}/)[0];
  let collapsed = true;
  const body = { scrollTop: 120 }, attributes = {};
  const document = { activeElement: null };
  const title = { focus() { document.activeElement = title; } };
  const toggle = { setAttribute(key, value) { attributes[key] = value; }, focus() { document.activeElement = toggle; } };
  const legend = { inert: true, classList: {
    toggle() { collapsed = !collapsed; }, contains() { return collapsed; }
  }, contains: element => element === title,
  querySelector: selector => selector === '.legend-body' ? body : title };
  document.getElementById = id => ({ 'map-legend': legend, 'legend-toggle': toggle }[id] || null);
  const context = { document };
  vm.runInNewContext(functionSource, context);
  context.toggleLegend();
  assert.equal(legend.inert, false);
  assert.equal(attributes['aria-expanded'], 'true');
  assert.equal(document.activeElement, title);
  assert.equal(body.scrollTop, 0);
  context.toggleLegend();
  assert.equal(legend.inert, true);
  assert.equal(attributes['aria-expanded'], 'false');
  assert.equal(document.activeElement, toggle);
});

test('dibujo: tres puntos habilitan análisis, deshacer actualiza ayuda y botones', () => {
  const app = startBrowser();
  app.evaluate('enableZoneDrawing(); finishZoneDrawing()');
  const drawer = app.drawers[0];
  assert.equal(drawer.completed, undefined);
  assert.equal(app.nodes.get('zone-drawing-finish').disabled, true);
  drawer.vertex(2);
  assert.equal(app.nodes.get('zone-drawing-finish').disabled, true);
  drawer.vertex(3);
  assert.equal(app.nodes.get('zone-drawing-finish').disabled, false);
  assert.match(app.nodes.get('zone-drawing-step').textContent, /Ver análisis/);
  app.evaluate('undoZoneDrawing()');
  assert.equal(app.nodes.get('zone-drawing-finish').disabled, true);
  drawer.vertex(3);
  app.evaluate('finishZoneDrawing()');
  assert.equal(app.evaluate('analyses.length'), 1);
  assert.equal(drawer.enabled, false);
  assert.equal(app.nodes.get('zone-drawing-help').hidden, true);
  assert.equal([...app.handlers.values()].reduce((sum, values) => sum + values.size, 0), 0);
});

test('dibujo: deshacer el único punto reinicia vacío y permite seguir dibujando', () => {
  const app = startBrowser();
  app.evaluate('enableZoneDrawing()');
  app.drawers[0].vertex(1);
  app.evaluate('undoZoneDrawing()');
  assert.equal(app.evaluate('zoneDrawingVertices'), 0);
  assert.equal(app.nodes.get('zone-drawing-undo').disabled, true);
  assert.equal(app.evaluate('activeZoneDrawer.enabled'), true);
});

test('dibujo: no crea ni analiza un cierre que cruza otros segmentos', () => {
  const app = startBrowser();
  app.evaluate('enableZoneDrawing()');
  app.drawers[0].vertex(4);
  app.evaluate('activeZoneDrawer._poly = {newLatLngIntersects:()=>true}; activeZoneDrawer._markers = [1,2,3,4].map(n => ({getLatLng:()=>({lat:n,lng:n})})); finishZoneDrawing()');
  assert.equal(app.drawers[0].completed, undefined);
  assert.equal(app.evaluate('analyses.length'), 0);
  assert.equal(app.drawers[0].enabled, true);
  assert.match(app.nodes.get('zone-drawing-step').textContent, /cruzar/);
});

test('dibujo: el cierre nativo del primer punto también rechaza cruces', () => {
  const app = startBrowser();
  app.evaluate('enableZoneDrawing()');
  app.drawers[0].vertex(4);
  app.evaluate('activeZoneDrawer._poly = {newLatLngIntersects:()=>true}; activeZoneDrawer._markers = [{getLatLng:()=>({lat:8.75,lng:-75.88})}]');
  assert.equal(app.evaluate('activeZoneDrawer._shapeIsValid()'), false);
  assert.match(app.nodes.get('zone-drawing-step').textContent, /cruzar/);
  app.evaluate('activeZoneDrawer._poly.newLatLngIntersects = () => false');
  assert.equal(app.evaluate('activeZoneDrawer._shapeIsValid()'), true);
});

test('dibujo: repetir y cancelar no duplica listeners ni borra el polígono anterior', () => {
  const app = startBrowser();
  app.context.previous = {};
  app.evaluate('drawnZone = previous; enableZoneDrawing(); enableZoneDrawing();');
  assert.equal(app.drawers[0].enabled, false);
  assert.equal(app.drawers[1].enabled, true);
  assert.equal([...app.handlers.values()].reduce((sum, values) => sum + values.size, 0), 3);
  app.evaluate('cancelZoneDrawing(true)');
  assert.equal(app.context.previous.removed, undefined);
  assert.equal(app.nodes.get('feature-toggle').focused, true);
  assert.equal(app.nodes.get('zone-drawing-help').hidden, true);
  assert.equal([...app.handlers.values()].reduce((sum, values) => sum + values.size, 0), 0);
  app.map.emit('draw:created', { layer: {} });
  assert.equal(app.evaluate('analyses.length'), 0);
});

test('dibujo: la parada nativa cancela limpiamente y restaura el foco al menú', () => {
  const app = startBrowser();
  app.evaluate('enableZoneDrawing()');
  app.map.emit('draw:drawstop');
  assert.equal(app.drawers[0].enabled, false);
  assert.equal(app.nodes.get('feature-toggle').focused, true);
  assert.equal(app.nodes.get('zone-drawing-help').hidden, true);
});

test('primer recorrido: ayuda y controles disponibles en es/en/pt', () => {
  const app = startBrowser();
  for (const language of ['es', 'en', 'pt']) {
    app.evaluate(`currentLanguage = '${language}'; updateMapHelpLanguage()`);
    for (const key of ['title', 'help', 'label', 'close', 'intro', 'exploreTitle', 'explore', 'measureTitle', 'measure',
      'shareTitle', 'share', 'drawTitle', 'draw', 'data', 'private', 'drawing', 'first', 'next', 'ready', 'finish', 'undo', 'cancel', 'intersection', 'unavailable']) {
      assert.equal(typeof app.evaluate(`startUiText('${key}')`), 'string');
    }
    assert.ok(app.nodes.get('legend-help-title').textContent);
    assert.ok(app.nodes.get('legend-close').attributes['aria-label']);
  }
});

test('dibujo y selección no quedan activos al salir del mapa; iconos no interceptan el dibujo', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.match(appSource, /tabId !== 'map-view' && typeof cancelZoneDrawing === 'function'\) cancelZoneDrawing\(\)/);
  const css = fs.readFileSync(path.join(__dirname, '../css/experience.css'), 'utf8');
  assert.match(css, /\[data-drawing\] \.community-noise-marker \{ pointer-events: none; \}/);
});
