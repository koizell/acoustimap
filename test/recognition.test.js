const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

function browser(overrides = {}) {
  const app = createBrowserContext({ btoa, atob, ...overrides });
  app.load('config.js', 'features.js');
  return app;
}
function seed(app, measurements = [], reports = []) {
  app.context.measurements = measurements;
  app.context.reports = reports;
  app.evaluate('localStorage.setItem(CHALLENGE_STORE, JSON.stringify(measurements)); localStorage.setItem(REPORT_CHALLENGE_STORE, JSON.stringify(reports))');
}
function measurement(day = '26', latitude = 8.75, db_level = 50) {
  return { latitude, longitude: -75.88, db_level, created_at: `2026-09-${day}T13:00:00.000Z` };
}
function snapshot(app) { return JSON.parse(app.evaluate('JSON.stringify(getRecognitionState())')); }
function summary(app) { return JSON.parse(app.evaluate('JSON.stringify(recognitionSummary(getRecognitionState()))')); }

test('reconocimiento: abrir no da puntos, rachas ni identificadores nuevos', () => {
  const app = browser();
  app.evaluate('refreshRecognitionFromContributions(false); refreshRecognitionFromContributions(false)');
  assert.deepEqual(snapshot(app), { version: 1, earned: {}, days: [], best: 0 });
  assert.equal(summary(app).points, 0);
  assert.equal(summary(app).level, 1);
  assert.equal(app.storage.has('acoustimap-recognition'), true);
  assert.doesNotMatch(app.storage.get('acoustimap-recognition'), /client_id|latitude|longitude|deviceId|groupId|audio/);
});

test('reconocimiento: primera aportación guarda el hito sin abrir Retos', () => {
  const app = browser();
  app.context.row = measurement();
  app.evaluate('recordLocalChallengeMeasurement(row)');
  assert.ok(snapshot(app).earned['first-measurement']);
  assert.equal(summary(app).points, 25);
  assert.deepEqual(snapshot(app).days, ['2026-09-26']);
});

test('reconocimiento: cada reto aporta 100 puntos solo una vez, incluido tras recargar', () => {
  const app = browser();
  seed(app, [0, 1, 2, 3, 4].map((n) => measurement('26', 8.75 + n * 0.01)));
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.ok(snapshot(app).earned['quiet-route']);
  assert.equal(summary(app).points, 125);
  const before = app.storage.get('acoustimap-recognition');
  app.evaluate('refreshRecognitionFromContributions(false); refreshRecognitionFromContributions(false)');
  assert.equal(app.storage.get('acoustimap-recognition'), before);
  const next = browser();
  for (const [key, value] of app.storage) next.storage.set(key, value);
  next.evaluate('refreshRecognitionFromContributions(false)');
  assert.equal(summary(next).points, 125);
  assert.equal(summary(next).level, 2);
});

test('reconocimiento: logros permanentes sobreviven a la ventana de 30 días', () => {
  const app = browser();
  seed(app, [0, 1, 2, 3, 4].map((n) => measurement('26', 8.75 + n * 0.01)));
  app.evaluate('refreshRecognitionFromContributions(false)');
  const earned = snapshot(app).earned;
  class LaterDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-01T15:00:00Z'])); }
    static now() { return Date.parse('2026-11-01T15:00:00Z'); }
  }
  app.context.Date = LaterDate;
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.equal(app.evaluate('calculateChallengeProgress()["quiet-route"]'), 0);
  assert.deepEqual(snapshot(app).earned, earned);
  assert.equal(summary(app).points, 125);
  assert.equal(summary(app).current, 0);
  assert.equal(summary(app).best, 1);
});

test('reconocimiento: respeta zonas y días de los retos, no el número de envíos', () => {
  const app = browser();
  seed(app, Array.from({ length: 20 }, () => measurement()));
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.equal(summary(app).points, 25);
  assert.equal(snapshot(app).best, 1);
  seed(app, ['24', '25', '26'].map((day) => measurement(day)));
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.ok(snapshot(app).earned['rush-hour']);
  assert.ok(snapshot(app).earned['streak-3']);
  assert.equal(summary(app).points, 175);
});

test('reconocimiento: los reportes cuentan sin micrófono, con las reglas de foto existentes', () => {
  const app = browser();
  app.context.report = { latitude: 8.75, longitude: -75.88, kind: 'obra', created_at: '2026-09-26T13:00:00Z' };
  app.evaluate('recordLocalChallengeReport(report, null); report.latitude = 8.76; recordLocalChallengeReport(report, null)');
  assert.ok(snapshot(app).earned['first-report']);
  assert.ok(snapshot(app).earned['report-works']);
  assert.equal(snapshot(app).earned['first-measurement'], undefined);
  assert.equal(summary(app).points, 125);
  assert.equal(app.evaluate('reportChallengeProgress(CHALLENGE_DEFS).get("litter-pickup")'), 0);
});

test('reconocimiento: rachas e hitos usan días Colombia y no dependen de ordenar los aportes', () => {
  const app = browser();
  const rows = Array.from({ length: 10 }, (_, n) => measurement(String(17 + n), 8.75 + n * 0.01)).reverse();
  rows.push({ ...measurement('26'), created_at: '2026-09-26T04:00:00.000Z' }); // 25 en CO
  seed(app, rows);
  app.evaluate('refreshRecognitionFromContributions(false)');
  const state = snapshot(app);
  assert.equal(state.days.length, 10);
  for (const key of ['ten-zones', 'ten-days', 'streak-3', 'streak-7']) assert.ok(state.earned[key], key);
  assert.equal(state.earned['streak-30'], undefined);
  assert.equal(summary(app).current, 10);
  assert.equal(summary(app).best, 10);
});

test('reconocimiento: racha de ayer sigue activa; un día perdido la corta sin retirar medallas', () => {
  const app = browser();
  app.context.days = ['2026-09-23', '2026-09-24', '2026-09-25'];
  assert.equal(app.evaluate('recognitionStreak(days).current'), 3);
  app.context.days = ['2026-09-22', '2026-09-23', '2026-09-24'];
  assert.equal(app.evaluate('recognitionStreak(days).current'), 0);
  assert.equal(app.evaluate('recognitionStreak(days).best'), 3);
});

test('reconocimiento: 30 días consecutivos ganan su insignia sin reducir el índice', () => {
  const app = browser();
  const now = Date.parse('2026-09-26T13:00:00Z');
  seed(app, Array.from({ length: 30 }, (_, n) => ({ ...measurement('26', 8.75, 90), created_at: new Date(now - n * 86400000).toISOString() })));
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.ok(snapshot(app).earned['streak-30']);
  assert.equal(summary(app).current, 30);
  assert.equal(snapshot(app).earned['quiet-route'], undefined);
});

test('reconocimiento: no premia aportes futuros, coordenadas inválidas ni índices fuera del método', () => {
  const app = browser();
  seed(app, [measurement('27'), { ...measurement(), latitude: Infinity }, { ...measurement(), latitude: 100 }, measurement('26', 8.75, 99)],
    [{ ...measurement('27'), kind: 'obra' }, { ...measurement(), kind: 'desconocido' }]);
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.equal(summary(app).points, 0);
  assert.equal(snapshot(app).days.length, 0);
});

test('reconocimiento: almacén nuevo solo contiene catálogo, fechas y días, nunca rutas o fotos', () => {
  const app = browser();
  seed(app, [measurement()], [{ ...measurement(), kind: 'basura', withPhoto: 1 }]);
  app.evaluate('refreshRecognitionFromContributions(false)');
  const raw = app.storage.get('acoustimap-recognition');
  assert.doesNotMatch(raw, /client|latitude|longitude|db_level|withPhoto|photo|note|8\.75|75\.88/);
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['best', 'days', 'earned', 'version']);
});

test('reconocimiento: límites y niveles se derivan del catálogo, no de contadores importados', () => {
  const app = browser();
  const totals = app.evaluate(`recognitionSummary({earned:Object.fromEntries(RECOGNITION_DEFS.map(item=>[item.key,new Date().toISOString()])),days:[],best:0})`);
  assert.equal(totals.points, 1050);
  assert.equal(totals.level, 5);
  assert.equal(totals.next, null);
  assert.equal(app.evaluate('RECOGNITION_DEFS.length'), 12);
});

test('respaldo: roundtrip a un navegador nuevo sin mediciones ni publicación', async () => {
  const first = browser();
  seed(first, [0, 1, 2, 3, 4].map((n) => measurement('26', 8.75 + n * 0.01)));
  const code = await first.evaluate('createRecognitionBackup()');
  assert.match(code, /^AM1\.[A-Za-z0-9_-]+\.[a-f0-9]{16}$/);
  const decoded = JSON.parse(atob(code.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  assert.doesNotMatch(JSON.stringify(decoded), /latitude|longitude|client|noise_measurements|photo|note/);
  const second = browser();
  second.context.code = code;
  assert.equal(await second.evaluate('restoreRecognitionBackup(code)'), true);
  assert.deepEqual(snapshot(second), snapshot(first));
  assert.equal(second.storage.has('acoustimap-local-challenge-measurements'), false);
  assert.equal(second.evaluate('calculateChallengeProgress()["quiet-route"]'), 0);
});

test('respaldo: une logros, conserva preferencias/cola y no duplica puntos al importar varias veces', async () => {
  const first = browser(); seed(first, [measurement()]);
  const code = await first.evaluate('createRecognitionBackup()');
  const second = browser();
  second.context.report = { ...measurement(), kind: 'obra' };
  second.evaluate('recordLocalChallengeReport(report, null)');
  second.storage.set('acoustimap-offline-outbox', '["no-tocar"]');
  second.storage.set('acoustimap-theme', 'dark');
  second.context.code = code;
  for (let n = 0; n < 3; n++) await second.evaluate('restoreRecognitionBackup(code)');
  assert.equal(summary(second).points, 50);
  assert.ok(snapshot(second).earned['first-report']);
  assert.equal(second.storage.get('acoustimap-offline-outbox'), '["no-tocar"]');
  assert.equal(second.storage.get('acoustimap-theme'), 'dark');
});

test('respaldo: rechazo atómico de checksum, versión, claves desconocidas, fechas y tamaño', async () => {
  const app = browser(); seed(app, [measurement()]);
  const valid = await app.evaluate('createRecognitionBackup()');
  const before = app.storage.get('acoustimap-recognition');
  const cases = ['', valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0'), 'x'.repeat(16001)];
  for (const invalid of [
    { version: 2, earned: {}, days: [], best: 0 },
    { version: 1, earned: {}, days: [], best: 0, latitude: 8.75 },
    { version: 1, earned: { imaginary: '2026-09-26T13:00:00.000Z' }, days: [], best: 0 },
    { version: 1, earned: { 'first-report': '2026-09-27T13:00:00.000Z' }, days: [], best: 0 },
    { version: 1, earned: {}, days: ['2026-02-30'], best: 0 },
    { version: 1, earned: {}, days: ['2026-09-27'], best: 0 },
    { version: 1, earned: {}, days: ['2026-09-26'], best: -1 },
    { version: 1, earned: {}, days: Array(401).fill('2026-09-26'), best: 0 }
  ]) {
    const encoded = btoa(JSON.stringify(invalid)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    app.context.encoded = encoded;
    cases.push(`AM1.${encoded}.${await app.evaluate('recognitionChecksum(encoded)')}`);
  }
  for (const code of cases) {
    app.context.code = code;
    await assert.rejects(app.evaluate('restoreRecognitionBackup(code)'));
    assert.equal(app.storage.get('acoustimap-recognition'), before);
  }
});

test('respaldo: los logros ganados mientras se verifica el código no se pierden', async () => {
  const first = browser(); seed(first, [measurement()]);
  const code = await first.evaluate('createRecognitionBackup()');
  const app = browser(); app.context.code = code;
  const restoration = app.evaluate('restoreRecognitionBackup(code)');
  app.context.report = { ...measurement(), kind: 'obra' };
  app.evaluate('recordLocalChallengeReport(report, null)');
  await restoration;
  assert.equal(summary(app).points, 50);
});

test('reconocimiento: cuota bloqueada conserva memoria y permite respaldar sin fingir persistencia', async () => {
  const app = browser(); seed(app, [measurement()]);
  const original = app.context.localStorage;
  app.context.localStorage = { ...original, setItem(key, value) {
    if (key === 'acoustimap-recognition') throw new Error('quota');
    original.setItem(key, value);
  } };
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.equal(summary(app).points, 25);
  assert.equal(app.evaluate('recognitionStorageStatus'), 'unavailable');
  assert.equal(app.storage.has('acoustimap-recognition'), false);
  assert.match(await app.evaluate('createRecognitionBackup()'), /^AM1\./);
});

test('reconocimiento: no sobrescribe datos dañados hasta recuperar un código válido', async () => {
  const source = browser(); seed(source, [measurement()]);
  const code = await source.evaluate('createRecognitionBackup()');
  const app = browser(); app.storage.set('acoustimap-recognition', 'datos antiguos dañados');
  app.evaluate('refreshRecognitionFromContributions(false)');
  assert.equal(app.storage.get('acoustimap-recognition'), 'datos antiguos dañados');
  assert.equal(app.evaluate('recognitionStorageStatus'), 'corrupt');
  app.context.code = code;
  await app.evaluate('restoreRecognitionBackup(code)');
  assert.equal(summary(app).points, 25);
  assert.equal(app.evaluate('recognitionStorageStatus'), 'ok');
});

test('reconocimiento: unión entre pestañas conserva insignias de ambos estados', () => {
  const events = new Map();
  const app = browser({ window: { __ACOUSTIMAP_CONFIG__: {}, addEventListener: (name, handler) => events.set(name, handler) } });
  seed(app, [measurement()]); app.evaluate('refreshRecognitionFromContributions(false)');
  app.storage.set('acoustimap-recognition', JSON.stringify({ version: 1, earned: { 'first-report': '2026-09-26T13:00:00.000Z' }, days: ['2026-09-25'], best: 1 }));
  events.get('storage')({ key: 'acoustimap-recognition', newValue: app.storage.get('acoustimap-recognition') });
  assert.equal(summary(app).points, 50);
  assert.deepEqual(snapshot(app).days, ['2026-09-25', '2026-09-26']);
});

test('reconocimiento: traducción completa, iconos decorativos y animación no obligatoria', () => {
  const app = browser();
  for (const language of ['es', 'en', 'pt']) {
    app.evaluate(`currentLanguage='${language}'`);
    for (const key of ['title', 'help', 'rules', 'backup', 'backupHelp', 'generate', 'restore', 'restoreHelp', 'invalid', 'unavailable', 'corrupt']) {
      assert.notEqual(app.evaluate(`recognitionText('${key}')`), key, `${language}:${key}`);
    }
    for (const item of JSON.parse(app.evaluate('JSON.stringify(RECOGNITION_DEFS)'))) {
      assert.notEqual(app.evaluate(`recognitionTitle('${item.key}')`), item.key);
      assert.match(app.evaluate(`recognitionIcon('${item.key}')`), /aria-hidden="true" focusable="false"/);
    }
  }
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'js/features.js'), 'utf8');
  const rewards = source.slice(source.indexOf('const RECOGNITION_STORE'), source.indexOf('function reportChallengeProgress'));
  assert.doesNotMatch(rewards, /supabaseClient|fetch\(|enqueueOfflineRecord|confirmMicActivation|client_id/);
  const css = fs.readFileSync(path.join(root, 'css/experience.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce[^}]*\.recognition-notice[^}]*animation:\s*none/);
});
