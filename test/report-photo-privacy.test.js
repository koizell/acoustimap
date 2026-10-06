const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

function reportBrowser(kind, offline = false) {
  const sent = [];
  const queued = [];
  const photo = { name: 'private-photo.jpg', type: 'image/jpeg', size: 123 };
  const elements = {
    '#report-note': { value: 'Reporte de prueba' },
    '#report-photo': { files: [photo], value: 'private-photo.jpg' },
    '#report-kind': { value: kind },
    '#feature-status': { textContent: '' },
    '#send-report': { disabled: false, isConnected: true },
    '#report-photo-name': { textContent: photo.name }
  };
  const panel = { querySelector: (selector) => elements[selector] };
  const browser = createBrowserContext({
    document: { documentElement: { lang: 'es' }, addEventListener() {}, getElementById(id) {
      if (id === 'feature-panel') return panel;
      if (id === 'db-number') return { innerText: '60' };
      return null;
    } },
    navigator: { onLine: !offline }
  });
  browser.load('config.js', 'features.js');
  browser.context.testClient = {
    storage: { from() { return { async upload(path, file) { sent.push({ path, file }); return { error: null }; } }; } },
    from() { return { async insert(payload) {
      if (offline) throw new Error('Failed to fetch');
      sent.push({ payload });
      return { error: null };
    } }; }
  };
  browser.context.testQueue = async (table, payload, file) => queued.push({ table, payload, file });
  browser.evaluate(`supabaseClient = testClient; selectedMapPoint = {lat: 8.75, lng: -75.88};
    enqueueOfflineRecord = testQueue; loadCitizenReports = () => {};`);
  return { browser, sent, queued };
}

test('reportes de retos: submitReport nunca sube imágenes, pero cuenta la foto', async () => {
  for (const kind of ['basura', 'obra']) {
    const { browser, sent } = reportBrowser(kind);
    await browser.evaluate('submitReport()');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.photo_path, null);
    assert.equal(sent[0].payload.kind, kind);
    const local = JSON.parse(browser.storage.get('acoustimap-local-challenge-reports'));
    assert.equal(local[0].withPhoto, 1);
    assert.ok(!JSON.stringify(local).includes('private-photo'));
  }
});

test('reportes de retos offline: no guardan bytes ni ruta en la cola', async () => {
  const { browser, queued, sent } = reportBrowser('basura', true);
  await browser.evaluate('submitReport()');
  assert.equal(sent.length, 0);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].payload.photo_path, null);
  assert.equal(queued[0].file, null);
});

test('cola anterior de retos: sincronizar tampoco publica fotos ya encoladas', async () => {
  const { browser, sent } = reportBrowser('basura');
  browser.context.oldQueue = [{ id: 'queued', table: 'noise_reports', queuedAt: '2026-09-26',
    payload: { id: 'report', kind: 'basura', latitude: 8.75, longitude: -75.88, note: 'Basura', photo_path: 'old/photo.jpg' },
    photo: { type: 'image/jpeg', name: 'private-photo.jpg' } }];
  browser.evaluate('getOfflineRecords = async () => oldQueue; removeOfflineRecord = async () => {};');
  await browser.evaluate('flushOfflineMeasurements()');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.photo_path, null);
});

test('reportes normales: conservan el flujo de fotos públicas con aviso explícito', async () => {
  const { browser, sent } = reportBrowser('ruido');
  await browser.evaluate('submitReport()');
  assert.equal(sent.length, 2);
  assert.ok(sent[0].file);
  assert.equal(sent[1].payload.photo_path, sent[0].path);
  assert.match(browser.evaluate("reportPhotoNotice('ruido')"), /publicará/);
  assert.match(browser.evaluate("reportPhotoNotice('basura')"), /no se sube/);
});
