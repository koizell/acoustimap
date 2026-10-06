const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

const root = path.resolve(__dirname, '..');

function contexto() {
  const storage = new Map();
  const browser = createBrowserContext({
    document: { documentElement: { lang: 'es' }, addEventListener() {}, getElementById: () => null },
    window: { __ACOUSTIMAP_CONFIG__: {}, addEventListener() {} },
    localStorage: {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k)
    }
  });
  browser.load('config.js', 'features.js');
  return { browser, storage };
}

test('las categorías del selector son las del CHECK de la base', () => {
  /*
   * El formulario y la tabla tienen que llevar la misma lista. Si el JS ofrece una
   * categoría que el CHECK no admite, el reporte se rechaza con 23514 —el mismo
   * fallo que costó las mediciones de la v4— y en este caso sin ningún aviso: el
   * formulario se ve perfecto y el envío no llega.
   */
  const sql = fs.readFileSync(
    path.join(root, 'migrations', '20261016_report_kind.sql'), 'utf8');
  const enSql = [...sql.matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    .filter((k) => ['ruido', 'basura', 'obra', 'trafico'].includes(k));
  assert.ok(enSql.includes('basura') && enSql.includes('obra'),
    'la migración declara las categorías que el reto usa');

  const features = fs.readFileSync(path.join(root, 'js', 'features.js'), 'utf8');
  const declaradas = features.match(/const REPORT_KINDS = \[([^\]]+)\]/)?.[1] ?? '';
  for (const kind of ['basura', 'obra', 'trafico', 'ruido']) {
    assert.ok(declaradas.includes(`'${kind}'`), `${kind} está en REPORT_KINDS`);
    assert.ok(enSql.includes(kind), `${kind} está en el CHECK de la base`);
  }
});

test('la columna es NOT NULL con default, para que las filas viejas no fallen', () => {
  // Sin DEFAULT, toda fila existente se vuelve NULL y el CHECK la rechaza al
  // validarse: la migración fallaría entera en una base con datos.
  const sql = fs.readFileSync(
    path.join(root, 'migrations', '20261016_report_kind.sql'), 'utf8');
  assert.match(sql, /add column if not exists kind text not null default 'ruido'/);
  assert.match(sql, /validate constraint noise_reports_kind_check/);
});

test('un reporte de basura sin foto no cuenta para el reto de basura', () => {
  const { browser } = contexto();
  // Se escribe a mano en el store, que es lo que hace la app al enviar.
  browser.evaluate(`
    localStorage.setItem('acoustimap-local-challenge-reports', JSON.stringify([
      { kind: 'basura', latitude: 8.75, longitude: -75.88, withPhoto: 0, created_at: new Date().toISOString() }
    ]));`);
  assert.equal(browser.evaluate(`reportChallengeProgress([{ key: 'litter-pickup', type: 'report', kind: 'basura', needsPhoto: true }]).get('litter-pickup')`), 0,
    'sin foto no cuenta: cualquiera puede escribir «hay basura»');
});

test('un reporte de basura con foto sí cuenta, una vez por celda y día', () => {
  const { browser } = contexto();
  browser.evaluate(`
    const hoy = new Date().toISOString();
    localStorage.setItem('acoustimap-local-challenge-reports', JSON.stringify([
      { kind: 'basura', latitude: 8.75, longitude: -75.88, withPhoto: 1, created_at: hoy },
      { kind: 'basura', latitude: 8.75, longitude: -75.88, withPhoto: 1, created_at: hoy },
      { kind: 'obra',  latitude: 8.75, longitude: -75.88, withPhoto: 0, created_at: hoy }
    ]));`);
  const n = browser.evaluate(`reportChallengeProgress([{ key: 'litter-pickup', type: 'report', kind: 'basura', needsPhoto: true }]).get('litter-pickup')`);
  assert.equal(n, 1,
    'los dos reportes de basura están en la misma celda y el mismo día: cuentan como uno');
});

test('el reto de obra no exige foto, y el de basura no se completa con uno de obra', () => {
  const { browser } = contexto();
  browser.evaluate(`
    localStorage.setItem('acoustimap-local-challenge-reports', JSON.stringify([
      { kind: 'obra', latitude: 8.75, longitude: -75.88, withPhoto: 0, created_at: new Date().toISOString() }
    ]));`);
  const defs = [
    { key: 'works', type: 'report', kind: 'obra', needsPhoto: false },
    { key: 'litter', type: 'report', kind: 'basura', needsPhoto: true }
  ];
  const r = browser.evaluate(`reportChallengeProgress(${JSON.stringify(defs)})`);
  assert.equal(r.get('works'), 1, 'la obra no pide foto');
  assert.equal(r.get('litter'), 0, 'y no llena el reto de basura');
});

test('el store de reportes está separado del de mediciones', () => {
  // Un solo almacén obligaría a un filter por db_level para no contar un reporte como
  // si fuera una medición. Dos almacenes hacen imposible ese error.
  const features = fs.readFileSync(path.join(root, 'js', 'features.js'), 'utf8');
  assert.match(features, /const REPORT_CHALLENGE_STORE = 'acoustimap-local-challenge-reports'/);
  assert.match(features, /const CHALLENGE_STORE = 'acoustimap-local-challenge-measurements'/);
});

test('la foto se guarda como un 1 o un 0, nunca como archivo', () => {
  /*
   * La promesa es que la foto del reto no sale del dispositivo. Si el store guardara
   * la ruta, el nombre o un data URL, eso sería una copia de la imagen en el
   * navegador, y además sobrevive a la limpieza del bucket.
   */
  const { browser } = contexto();
  browser.evaluate(`
    recordLocalChallengeReport(
      { kind: 'basura', latitude: 8.75, longitude: -75.88, created_at: new Date().toISOString() },
      { name: 'basura.jpg', type: 'image/jpeg', size: 1234 },
      new Date().toISOString());
    globalThis.guardado = localStorage.getItem('acoustimap-local-challenge-reports');`);
  const guardado = browser.evaluate('globalThis.guardado');
  assert.ok(guardado, 'se guardó algo');
  assert.match(guardado, /"withPhoto":1/, 'guarda el hecho, no la foto');
  assert.doesNotMatch(guardado, /basura\.jpg/);
  assert.doesNotMatch(guardado, /data:image/);
  assert.doesNotMatch(guardado, /photo_path/);
});

test('los tres retos de ruido siguen ahí y los dos nuevos son de reporte', () => {
  const features = fs.readFileSync(path.join(root, 'js', 'features.js'), 'utf8');
  const bloque = features.match(/const CHALLENGE_DEFS = \[([\s\S]*?)\];/)?.[1] ?? '';
  assert.match(bloque, /key: 'rush-hour'[\s\S]*?type: 'measurement'/);
  assert.match(bloque, /key: 'quiet-route'[\s\S]*?type: 'measurement'/);
  assert.match(bloque, /key: 'night-cover'[\s\S]*?type: 'measurement'/);
  assert.match(bloque, /key: 'litter-pickup'[\s\S]*?type: 'report'[\s\S]*?kind: 'basura'/);
  assert.match(bloque, /key: 'report-works'[\s\S]*?type: 'report'[\s\S]*?kind: 'obra'/);
});