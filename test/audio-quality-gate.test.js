const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

/**
 * El filtro de calidad decide si una medición llega al mapa comunitario.
 * El AGC confirmado es la causa principal de que dos equipos midan distinto,
 * así que una lectura procesada no debe publicarse como si fuera limpia.
 */
function gateBrowser() {
  const browser = createBrowserContext({
    document: { documentElement: { lang: 'es' }, addEventListener() {}, getElementById: () => null }
  });
  browser.load('config.js', 'community.js', 'features.js');
  browser.evaluate(`
    globalThis.inserts = [];
    globalThis.states = [];
    globalThis.updateSharingDelivery = (state) => states.push(state);
    supabaseClient = { from: () => ({ insert: async (payload) => { inserts.push(payload); return { error: null }; } }) };
    sharingEnabled = true;
    currentPosition = { lat: 8.75, lng: -75.88 };
    lastSendTime = 0;
    sendWindowEnergia = 1000000;
    sendWindowCount = 1;
  `);
  return browser;
}

test('filtro de calidad: con procesado confirmado no se publica y queda en local', async () => {
  const browser = gateBrowser();
  browser.evaluate("captureProfile = 'processed'");
  await browser.evaluate('sendMeasurementIfDue()');
  assert.equal(browser.evaluate('inserts.length'), 0, 'no contamina el mapa');
  assert.equal(browser.evaluate('states.at(-1)'), 'reducedQuality');
  assert.equal(browser.evaluate('getLocalChallengeMeasurements().length'), 1, 'la lectura no se pierde');
});

test('filtro de calidad: el usuario puede autorizar el envío pese al procesado', async () => {
  const browser = gateBrowser();
  browser.evaluate("captureProfile = 'processed'; forceProcessedPublish = true");
  await browser.evaluate('sendMeasurementIfDue()');
  assert.equal(browser.evaluate('inserts.length'), 1);
  assert.equal(browser.evaluate('inserts[0].capture_profile'), 'processed');
  assert.equal(browser.evaluate('states.at(-1)'), 'published');
});

test('filtro de calidad: sin procesado confirmado se publica con normalidad', async () => {
  const browser = gateBrowser();
  browser.evaluate("captureProfile = 'unprocessed'");
  await browser.evaluate('sendMeasurementIfDue()');
  assert.equal(browser.evaluate('inserts.length'), 1);
  assert.equal(browser.evaluate('inserts[0].capture_profile'), 'unprocessed');
});

test('filtro de calidad: un ajuste no verificable no bloquea, para no dejar el mapa sin aportes', async () => {
  const browser = gateBrowser();
  browser.evaluate("captureProfile = 'unknown'");
  await browser.evaluate('sendMeasurementIfDue()');
  assert.equal(browser.evaluate('inserts.length'), 1);
});

test('filtro de calidad: el botón de autorización no se activa solo y respeta el idioma', () => {
  const browser = createBrowserContext({
    document: { documentElement: { lang: 'es' }, addEventListener() {}, getElementById: () => null }
  });
  browser.load('config.js', 'audio.js');
  assert.equal(browser.evaluate('forceProcessedPublish'), false, 'por defecto nunca publica procesado');
  browser.evaluate('setForceProcessedPublish(true)');
  assert.equal(browser.evaluate('forceProcessedPublish'), true);
  browser.evaluate('setForceProcessedPublish(false)');
  assert.equal(browser.evaluate('forceProcessedPublish'), false);
  for (const language of ['es', 'en', 'pt']) {
    browser.context.document.documentElement.lang = language;
    assert.equal(typeof browser.evaluate("diagnosticCopy[document.documentElement.lang].allow"), 'string');
  }
});
