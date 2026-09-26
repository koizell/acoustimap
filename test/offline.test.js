const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

function offlineContext(insert) {
  const browser = createBrowserContext({ client: { from: () => ({ insert }) } });
  browser.load('config.js', 'features.js');
  browser.evaluate('supabaseClient = client');
  return browser;
}

test('offline: una confirmación conserva la clave de su celda y hora al sincronizar', async () => {
  const sent = [];
  const browser = offlineContext(async (payload) => { sent.push(payload); return { error: null }; });
  const confirmation = await browser.evaluate("buildConfirmation({ lat: 8.75, lng: -75.88 }, '2026-09-26T15:00:00.000Z')");
  browser.context.confirmation = confirmation;
  await browser.evaluate("enqueueOfflineRecord('noise_confirmations', confirmation)");
  await browser.evaluate('flushOfflineMeasurements()');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].confirmation_key, confirmation.confirmation_key);
  assert.equal(sent[0].latitude, confirmation.latitude);
  assert.equal(sent[0].longitude, confirmation.longitude);
  assert.equal((await browser.evaluate('getOfflineRecords()')).length, 0);
});

test('offline: un error conserva el registro y permite reintentar la cola', async () => {
  let fail = true;
  const browser = offlineContext(async () => ({ error: fail ? { message: 'Network unavailable' } : null }));
  await browser.evaluate("enqueueOfflineRecord('noise_measurements', { id: 'pending', latitude: 8.75, longitude: -75.88, db_level: 50 })");
  await browser.evaluate('flushOfflineMeasurements()');
  assert.equal((await browser.evaluate('getOfflineRecords()')).length, 1);
  fail = false;
  await browser.evaluate('flushOfflineMeasurements()');
  assert.equal((await browser.evaluate('getOfflineRecords()')).length, 0);
});

test('offline: un registro ya recibido se retira sin duplicar su identificador', async () => {
  const sent = [];
  const browser = offlineContext(async (payload) => {
    sent.push(payload);
    return { error: { code: '23505', message: 'Duplicate id' } };
  });
  await browser.evaluate("enqueueOfflineRecord('noise_measurements', { id: 'same-id', latitude: 8.75, longitude: -75.88, db_level: 50, client_id: 'legacy-private-id' })");
  await browser.evaluate('flushOfflineMeasurements()');
  assert.equal(sent[0].id, 'same-id');
  assert.equal(Object.hasOwn(sent[0], 'client_id'), false);
  assert.notEqual(sent[0].latitude, 8.75, 'la cola antigua también debe anclarse a la cuadrícula');
  assert.equal((await browser.evaluate('getOfflineRecords()')).length, 0);
});

test('offline: dos solicitudes simultáneas no envían el mismo registro dos veces', async () => {
  let finish;
  let calls = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  const browser = offlineContext(() => { calls++; return pending; });
  await browser.evaluate("enqueueOfflineRecord('noise_measurements', { id: 'once', db_level: 50 })");
  const first = browser.evaluate('flushOfflineMeasurements()');
  const second = browser.evaluate('flushOfflineMeasurements()');
  finish({ error: null });
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal((await browser.evaluate('getOfflineRecords()')).length, 0);
});
