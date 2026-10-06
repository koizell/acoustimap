const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

function appBrowser() {
  const elements = new Map();
  const events = new Map();
  const positionRequests = [];
  let positionsProcessed = 0;
  let watchSuccess;
  const document = {
    documentElement: { lang: 'es' }, activeElement: null,
    addEventListener: (name, handler) => events.set(name, handler),
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: () => [elements.get('header'), elements.get('map-view')]
  };
  function element(id) {
    const classes = new Set();
    const node = {
      id, inert: false, innerText: '', innerHTML: '', style: {}, isConnected: true,
      classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle(name) { if (classes.has(name)) classes.delete(name); else classes.add(name); }
      },
      focus() { document.activeElement = this; },
      addEventListener() {}, setAttribute() {}, querySelector: () => null
    };
    elements.set(id, node);
    return node;
  }
  ['header', 'map-view', 'btn-toggle', 'btn-share', 'gps-chip', 'share-status'].forEach(element);
  const modal = element('mic-modal');
  modal.inert = true;
  const cancel = element('cancel');
  const confirm = element('confirm');
  modal.querySelector = () => cancel;
  modal.querySelectorAll = () => [cancel, confirm];
  document.activeElement = elements.get('btn-toggle');
  const browser = createBrowserContext({
    document, requestAnimationFrame() {},
    navigator: { geolocation: {
      getCurrentPosition(success, error, options) { positionRequests.push({ success, error, options }); },
      clearWatch() {}, watchPosition(success) { watchSuccess = success; return 1; }
    } },
    processNewPosition() {
      positionsProcessed++;
      browser.evaluate('currentPosition = { lat: 8.75, lng: -75.88 }');
    },
    hideMyLocation() {}, loadCommunityPoints() {},
    map: { setView() {} }
  });
  browser.load('config.js', 'app.js');
  return { ...browser, document, elements, events, positionRequests, processed: () => positionsProcessed, watch: (position) => watchSuccess(position) };
}

test('modales: foco inicial, fondo inerte, Tab circular y Escape devuelve el foco', () => {
  const browser = appBrowser();
  browser.evaluate('openMicModal()');
  assert.equal(browser.document.activeElement.id, 'cancel');
  assert.equal(browser.elements.get('header').inert, true);
  assert.equal(browser.elements.get('mic-modal').inert, false);
  browser.document.activeElement = browser.elements.get('confirm');
  let prevented = false;
  browser.events.get('keydown')({ key: 'Tab', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(browser.document.activeElement.id, 'cancel');
  browser.events.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(browser.document.activeElement.id, 'confirm');
  browser.events.get('keydown')({ key: 'Escape', preventDefault() {} });
  assert.equal(browser.document.activeElement.id, 'btn-toggle');
  assert.equal(browser.elements.get('header').inert, false);
  assert.equal(browser.elements.get('mic-modal').inert, true);
});

test('GPS: cancelar Compartir ignora una respuesta tardía de ubicación', () => {
  const browser = appBrowser();
  browser.evaluate('toggleSharing(); toggleSharing()');
  browser.positionRequests[0].success({ coords: { latitude: 8.75, longitude: -75.88 } });
  assert.equal(browser.processed(), 0);
  assert.equal(browser.evaluate('sharingEnabled'), false);
  assert.equal(browser.evaluate('currentPosition'), null);
});

test('GPS: el error de una solicitud anterior no cancela la nueva', () => {
  const browser = appBrowser();
  browser.evaluate('toggleSharing(); toggleSharing(); toggleSharing()');
  browser.positionRequests[0].error({ code: 1 });
  assert.equal(browser.evaluate('sharingEnabled'), true);
  browser.positionRequests[1].error({ code: 1 });
  assert.equal(browser.evaluate('sharingEnabled'), false);
  assert.match(browser.elements.get('share-status').innerText, /permiso/);
});

test('GPS: detener Compartir ignora actualizaciones pendientes del watch', () => {
  const browser = appBrowser();
  browser.evaluate('toggleSharing()');
  browser.positionRequests[0].success({ coords: { latitude: 8.75, longitude: -75.88 } });
  assert.equal(browser.processed(), 1);
  browser.evaluate('toggleSharing()');
  browser.watch({ coords: { latitude: 8.76, longitude: -75.89 } });
  assert.equal(browser.processed(), 1);
  assert.equal(browser.evaluate('currentPosition'), null);
});

test('GPS: timeout reintenta con red y no se confunde con permiso denegado', () => {
  const browser = appBrowser();
  browser.evaluate('toggleSharing()');
  browser.positionRequests[0].error({ code: 3, message: 'Timeout expired' });
  assert.equal(browser.evaluate('sharingEnabled'), true);
  assert.equal(browser.positionRequests.length, 2);
  assert.equal(browser.positionRequests[1].options.enableHighAccuracy, false);
  browser.positionRequests[1].error({ code: 3 });
  assert.equal(browser.evaluate('sharingEnabled'), false);
  assert.match(browser.elements.get('share-status').innerText, /tardó/);
  assert.doesNotMatch(browser.elements.get('share-status').innerText, /permiso/);
});

test('GPS: éxito del reintento funciona y cancelarlo descarta respuestas tardías', () => {
  const browser = appBrowser();
  browser.evaluate('toggleSharing()');
  browser.positionRequests[0].error({ code: 2 });
  browser.positionRequests[1].success({ coords: { latitude: 8.75, longitude: -75.88 } });
  assert.equal(browser.processed(), 1);
  browser.evaluate('toggleSharing(); toggleSharing()');
  browser.positionRequests[2].error({ code: 3 });
  browser.evaluate('toggleSharing()');
  browser.positionRequests[3].success({ coords: { latitude: 8.75, longitude: -75.88 } });
  assert.equal(browser.processed(), 1);
});

test('Compartir: GPS activado no se presenta como una publicación confirmada', () => {
  const browser = appBrowser();
  for (const [language, label] of [['es', 'GPS activo'], ['en', 'GPS enabled'], ['pt', 'GPS ativo']]) {
    browser.document.documentElement.lang = language;
    browser.evaluate('sharingEnabled = true; updateActionButtons()');
    assert.ok(browser.elements.get('btn-share').innerHTML.includes(label));
  }
});

test('Compartir: envío, cola y fallo se distinguen; una respuesta antigua no cambia el estado', () => {
  const browser = appBrowser();
  browser.evaluate("sharingEnabled = true; updateSharingStatus('sharing')");
  for (const [state, label] of [['sending', 'Enviando'], ['queued', 'En cola local'], ['published', 'Enviado'], ['error', 'Error de envío']]) {
    browser.evaluate(`updateSharingDelivery('${state}')`);
    assert.ok(browser.elements.get('btn-share').innerHTML.includes(label));
  }
  browser.evaluate("updateSharingDelivery('published', -1)");
  assert.equal(browser.evaluate('sharingDeliveryState'), 'error');
  browser.evaluate("sharingEnabled = false; updateSharingDelivery('published')");
  assert.equal(browser.evaluate('sharingDeliveryState'), 'error');
});

test('idioma: el aviso GPS existente se traduce sin pedir otra ubicación', () => {
  const browser = appBrowser();
  browser.evaluate("updateSharingStatus('denied')");
  browser.document.documentElement.lang = 'en';
  browser.evaluate('updateSharingStatus()');
  assert.match(browser.elements.get('share-status').innerText, /Location unavailable/);
  assert.equal(browser.positionRequests.length, 0);
});

test('idioma: reconstruir la interfaz no multiplica las selecciones del mapa', () => {
  const handlers = [];
  const node = () => ({ setAttribute() {}, addEventListener() {}, querySelector: node });
  const browser = createBrowserContext({
    document: {
      addEventListener() {}, createElement: node,
      getElementById: () => ({ appendChild() {} })
    },
    map: { on: (event, handler) => handlers.push({ event, handler }) }
  });
  browser.load('config.js', 'features.js');
  browser.evaluate('createFeatureUi(); createFeatureUi(); createFeatureUi()');
  assert.equal(handlers.filter(({ event }) => event === 'click').length, 1);
});

test('HTML y retos: controles ocultos inertes, contenido desplazable enfocable y progreso accesible', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const id of ['mic-modal', 'share-modal', 'map-legend']) {
    assert.match(html, new RegExp(`<div[^>]*id="${id}"[^>]*\\binert[ >]`));
  }
  assert.match(html, /id="health-view"[^>]*tabindex="0"/);
  assert.match(html, /id="share-status"[^>]*role="status"/);
  const features = fs.readFileSync(path.join(root, 'js/features.js'), 'utf8');
  assert.match(features, /class="challenge-track" role="progressbar"[^>]*aria-valuenow=/);
});
