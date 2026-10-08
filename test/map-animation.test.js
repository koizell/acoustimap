const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const community = fs.readFileSync(path.join(root, 'js/community.js'), 'utf8');

function source(name) {
  const match = community.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} conserva su declaración`);
  return match[0];
}

function motionContext() {
  const attributes = {}, writes = [];
  const view = { setAttribute: (key, value) => { attributes[key] = value; } };
  const button = { setAttribute: (key, value) => { button[key] = value; } };
  const context = {
    communityMotionEnabled: true,
    reduced: false,
    document: { hidden: false, getElementById: id => id === 'map-view' ? view : button },
    window: { matchMedia: () => ({ matches: context.reduced }) },
    localStorage: { setItem: (key, value) => writes.push([key, value]) },
    communityInteractionText: key => key
  };
  vm.createContext(context);
  vm.runInContext(`${source('updateCommunityMotion')}\n${source('toggleCommunityMotion')}`, context);
  return { context, attributes, button, writes };
}

function markerContext() {
  const attributes = {}, handlers = {}, events = {};
  let opens = 0, closes = 0, selected = 0, zoom = 14, focused = 0;
  const button = {
    setAttribute: (key, value) => { attributes[key] = value; },
    addEventListener: (key, callback) => { handlers[key] = callback; },
    focus() { focused++; }
  };
  const zoomButton = {};
  const popupElement = { querySelector: () => zoomButton };
  const marker = {
    on(key, callback) { events[key] = callback; return this; },
    bindTooltip(text, options) { this.tooltip = { text, options }; return this; },
    bindPopup(html) { this.html = html; return this; },
    addTo() { events.add(); return this; },
    getElement: () => ({ querySelector: () => button }),
    getLatLng: () => ({ lat: 8.75, lng: -75.88 }),
    openPopup() { opens++; events.popupopen({ popup: { getElement: () => popupElement } }); },
    closePopup() { closes++; events.popupclose(); }
  };
  const context = {
    COLOR_BY_CAT: { bajo: '#22c55e', moderado: '#facc15', alto: '#dc2626' },
    classifyDb: () => 'bajo', communityLayer: {},
    selecting: false,
    document: { getElementById: () => ({ hasAttribute: () => context.selecting }) },
    communityText: key => key, communityInteractionText: key => key, timeAgo: () => 'hace 1 h',
    L: {
      divIcon: options => { marker.iconOptions = options; return options; },
      marker: (_, options) => { marker.options = options; return marker; },
      DomEvent: { disableClickPropagation() {}, stop(event) { event.stopped = true; } }
    },
    map: {
      fire(event, data) { assert.equal(event, 'click'); assert.equal(data.latlng.lat, 8.75); selected++; },
      getZoom: () => zoom,
      setView(position, value) { assert.deepEqual(Array.from(position), [8.75, -75.88]); zoom = value; }
    }
  };
  vm.createContext(context);
  vm.runInContext(`${source('communityPopupHtml')}\n${source('addCommunityNoiseMarker')}`, context);
  context.addCommunityNoiseMarker(8.75, -75.88, 60, 'moderado', '2026-10-07T15:00:00Z', 12);
  return { context, marker, attributes, handlers, popupElement, zoomButton,
    counts: () => ({ opens, closes, selected, zoom, focused }) };
}

test('animación: pausar conserva los datos y guarda solo la preferencia local', () => {
  const { context, attributes, button, writes } = motionContext();
  context.updateCommunityMotion();
  assert.equal(attributes['data-motion'], 'on');
  assert.equal(button['aria-pressed'], 'true');
  context.toggleCommunityMotion();
  assert.equal(attributes['data-motion'], 'off');
  assert.equal(button['aria-pressed'], 'false');
  assert.deepEqual(writes, [['acoustimap-map-motion', 'off']]);
  context.toggleCommunityMotion();
  assert.equal(attributes['data-motion'], 'on');
});

test('animación: movimiento reducido manda sobre la preferencia y ocultar la página pausa', () => {
  const { context, attributes, button } = motionContext();
  context.reduced = true;
  context.updateCommunityMotion();
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'reduced');
  assert.equal(attributes['data-motion'], 'off');
  context.reduced = false;
  context.document.hidden = true;
  context.updateCommunityMotion();
  assert.equal(attributes['data-motion'], 'off');
  assert.equal(button.disabled, false);
  context.document.hidden = false;
  context.updateCommunityMotion();
  assert.equal(attributes['data-motion'], 'on');
  context.communityMotionEnabled = false;
  context.document.hidden = true;
  context.updateCommunityMotion();
  context.document.hidden = false;
  context.updateCommunityMotion();
  assert.equal(attributes['data-motion'], 'off');
});

test('icono: botón nativo de 44 px, barras decorativas y datos accesibles', () => {
  const { marker, attributes } = markerContext();
  assert.deepEqual(Array.from(marker.iconOptions.iconSize), [44, 44]);
  assert.match(marker.iconOptions.html, /<button type="button"/);
  assert.match(marker.iconOptions.html, /aria-hidden="true"/);
  assert.match(marker.iconOptions.html, /--noise-color:#facc15/);
  assert.equal(marker.options.keyboard, false, 'solo el botón interior ocupa un tab stop');
  assert.match(attributes['aria-label'], /index 60, 12 measurements/);
  assert.match(marker.html, /lastMeasurement: hace 1 h/);
  assert.match(marker.html, /12 measurements/);
});

test('icono: tocar abre detalles, Escape los cierra y Acercar cambia solo la vista', () => {
  const { handlers, attributes, zoomButton, counts } = markerContext();
  handlers.click({});
  assert.equal(counts().opens, 1);
  assert.equal(attributes['aria-expanded'], 'true');
  handlers.keydown({ key: 'Escape' });
  assert.equal(counts().closes, 1);
  assert.equal(attributes['aria-expanded'], 'false');
  handlers.click({});
  zoomButton.onclick();
  assert.equal(counts().zoom, 17);
  assert.equal(counts().closes, 2);
});

test('icono: la selección de ubicación no queda interceptada por el popup', () => {
  const { context, handlers, counts } = markerContext();
  context.selecting = true;
  handlers.click({});
  assert.equal(counts().selected, 1);
  assert.equal(counts().opens, 0);
});

test('icono: el keypress de Leaflet no duplica el clic nativo de Enter', () => {
  const { handlers, counts } = markerContext();
  let stopped = false;
  handlers.keypress({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(counts().opens, 0);
});

test('popup: Escape desde el contenido devuelve el foco al icono', () => {
  const { handlers, popupElement, counts } = markerContext();
  handlers.click({});
  popupElement.onkeydown({ key: 'Escape' });
  assert.equal(counts().closes, 1);
  assert.equal(counts().focused, 1);
});

test('calor y puntos: límite de 80 animaciones sin excluir zonas ni cambiar índices', () => {
  for (const mode of ['heatmap', 'zones']) {
    const icons = [], points = Array.from({ length: 100 }, (_, index) => ({
      lat: index, lng: -75.88, db: 60, category: 'moderado', sampleCount: 12
    }));
    const context = {
      selectedVisualMode: mode, COMMUNITY_ANIMATED_MARKER_LIMIT: 80,
      clearCommunityLayers() {}, document: { getElementById: () => ({ classList: { contains: () => true } }) },
      setCommunityHeatPoints: actual => assert.equal(actual, points),
      addCommunityNoiseMarker: (...args) => icons.push(args),
      addCommunityPoint: (...args) => icons.push(args)
    };
    vm.runInNewContext(['captureCommunityInteraction', 'restoreCommunityInteraction', 'renderCommunityPoints'].map(source).join('\n'), context);
    context.renderCommunityPoints(points);
    assert.equal(icons.length, 100);
    assert.equal(icons.filter(args => args.at(-1)).length, 80);
    icons.forEach(args => assert.equal(args[2], 60));
  }
});

test('animación: solo transforma barras; se detiene en pestaña oculta o movimiento reducido', () => {
  const css = fs.readFileSync(path.join(root, 'css/map.css'), 'utf8');
  const frames = css.match(/@keyframes noise-bars[^]*?\n\}/)[0];
  assert.doesNotMatch(frames, /opacity|radius|background|color|width|height/);
  assert.match(frames, /scaleY/);
  assert.match(css, /#map-view:not\(\.active\)[^}]*animation-play-state: paused/);
  assert.match(css, /prefers-reduced-motion: reduce[^]*?\.noise-marker-animated \.noise-bar \{ animation: none !important/);
  assert.match(community, /visibilitychange.*updateCommunityMotion/);
  assert.match(community, /getItem\('acoustimap-map-motion'\)/);
});

test('interacción: explicación estática y traducciones en los tres idiomas', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const features = fs.readFileSync(path.join(root, 'js/features.js'), 'utf8');
  assert.match(html, /id="map-motion-toggle".*aria-pressed/);
  assert.match(html, /id="legend-motion-note"/);
  assert.equal((features.match(/noiseInteractionHint:/g) || []).length, 3);
  assert.equal((features.match(/noiseAnimationNote:/g) || []).length, 3);
  assert.match(features, /\['map-motion-hint', t\('noiseInteractionHint'\)\]/);
  assert.match(features, /\['legend-motion-note', t\('noiseAnimationNote'\)\]/);
});
