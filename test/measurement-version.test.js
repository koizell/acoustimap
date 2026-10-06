const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

function queryBrowser() {
  const rows = [
    { id: 'legacy', latitude: 8.75, longitude: -75.88, db_level: 40, measurement_version: null, capture_profile: null },
    { id: 'v2', latitude: 8.75, longitude: -75.88, db_level: 80, measurement_version: 2, capture_profile: 'processed' },
    { id: 'v3', latitude: 8.75, longitude: -75.88, db_level: 70, measurement_version: 3, capture_profile: 'processed' },
    { id: 'current', latitude: 8.75, longitude: -75.88, db_level: 60, measurement_version: 5, capture_profile: 'processed' }
  ];
  const queries = [];
  const blobs = [];
  const button = { disabled: false, innerText: 'Exportar' };
  const browser = createBrowserContext({
    client: { from(table) {
      const request = { table, filters: [], columns: '' };
      queries.push(request);
      const chain = {
        select(columns) { request.columns = columns; return this; },
        eq(key, value) { request.filters.push([key, value]); return this; },
        order() { return this; },
        range(from, to) { request.range = [from, to]; return this; },
        gte() { return this; },
        lt() { return this; },
        then(resolve, reject) {
          const filtered = rows.filter((row) => request.filters.every(([key, value]) => row[key] === value));
          return Promise.resolve({ data: filtered.slice(request.range[0], request.range[1] + 1), error: null }).then(resolve, reject);
        }
      };
      return chain;
    } },
    Blob,
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
    document: {
      documentElement: { lang: 'es' },
      addEventListener() {},
      getElementById: (id) => id.startsWith('export-') ? button : null,
      createElement: () => ({ click() {}, remove() {} }),
      body: { appendChild() {} }
    },
    alert: (message) => assert.fail(message)
  });
  browser.load('config.js', 'community.js', 'features.js');
  browser.evaluate('supabaseClient = client');
  return { ...browser, queries, blobs };
}

test('estadísticas y comparación consultan solo el método actual', async () => {
  const browser = queryBrowser();
  const rows = await browser.evaluate('fetchFeatureMeasurements()');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'current');
  assert.deepEqual(browser.queries[0].filters, [['measurement_version', 5]]);
});

test('CSV: no mezcla el histórico y declara método y perfil de captura', async () => {
  const browser = queryBrowser();
  await browser.evaluate('exportMeasurementsCsv()');
  assert.equal(browser.blobs.length, 1);
  const csv = await browser.blobs[0].text();
  assert.match(csv, /measurement_version,capture_profile/);
  assert.match(csv, /current/);
  assert.doesNotMatch(csv, /legacy/);
  assert.doesNotMatch(csv, /v2/);
  // La v3 queda atrás: promedia distinto a la v4, así que no puede salir en la
  // exportación junto a la vigente como si fueran la misma medida.
  assert.doesNotMatch(csv, /v3/);
  assert.match(csv, /5,processed/);
  assert.deepEqual(browser.queries[0].filters, [['measurement_version', 5]]);
});

test('GeoJSON: no mezcla el histórico y conserva la procedencia del método', async () => {
  const browser = queryBrowser();
  await browser.evaluate('exportMeasurementsGeoJson()');
  assert.equal(browser.blobs.length, 1);
  const collection = JSON.parse(await browser.blobs[0].text());
  assert.equal(collection.features.length, 1);
  assert.equal(collection.features[0].properties.measurement_version, 5);
  assert.equal(collection.features[0].properties.capture_profile, 'processed');
});

test('la RPC nueva filtra v2 y no reemplaza ni reclasifica el histórico', () => {
  const version = 2;
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261005_audio_measurement_v2.sql'), 'utf8')
    .replace(/--[^\n]*/g, '');
  assert.match(sql, new RegExp(`where m\\.measurement_version = ${version}\\b`));
  assert.match(sql, /create or replace function public\.noise_map_cells_v2\(/);
  assert.doesNotMatch(sql, /(?:create or replace|drop) function public\.noise_map_cells\(/);
  assert.doesNotMatch(sql, /\b(?:delete from|update) public\.noise_measurements\b/i);
  assert.doesNotMatch(sql, /add column[^;]*\bdefault\b/i);
  assert.match(sql, /security invoker set search_path = ''/);
});

test('la RPC de la versión vigente filtra por esa versión y no toca el histórico', () => {
  // Este test no nombra la versión: la lee de MEASUREMENT_VERSION y busca la
  // migración correspondiente. Antes fijaba el 3 a mano, así que subir a 4 lo dejó
  // comprobando una migración que ya no era la que se aplica — que es como se
  // cuela la regla de oro de este proyecto sin que nadie lo note.
  const browser = queryBrowser();
  const version = browser.evaluate('MEASUREMENT_VERSION');
  const archivo = fs.readdirSync(path.join(__dirname, '..', 'migrations'))
    .find((n) => n.includes(`_v${version}.sql`));
  assert.ok(archivo, `existe una migración para la v${version}`);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', archivo), 'utf8')
    .replace(/--[^\n]*/g, '');

  // La ponderación A cambia la métrica: no mezclar RMS sin ponderar con v5.
  assert.match(sql, new RegExp(`where m\\.measurement_version = ${version}`),
    'la RPC vigente no mezcla métodos distintos');
  assert.match(sql, new RegExp(`create or replace function public\\.noise_map_cells_v${version}\\(`));
  assert.match(sql, /measurement_version is null and capture_profile is null/);
  assert.doesNotMatch(sql, /(?:create or replace|drop) function public\.noise_map_cells(?:_v[23])?\(/);
  assert.doesNotMatch(sql, /\b(?:delete from|update) public\.noise_measurements\b/i);
  assert.match(sql, /security invoker set search_path = ''/);
  assert.match(sql, new RegExp(`grant execute on function public\\.noise_map_cells_v${version}\\([\\s\\S]*?to anon, authenticated`));
  // Cada versión anterior sigue siendo aplicable: la compatibilidad se declara.
  for (const previa of [2, 3].filter((n) => n < version)) {
    assert.match(sql, new RegExp(`measurement_version in \\([^)]*${previa}[^)]*\\)`),
      `la migración declara que ${previa} sigue siendo válido`);
  }
});

test('la celda del mapa promedia en energía, no aritméticamente', () => {
  // Esta es la corrección, y por eso tiene su propio test en vez de quedar dentro
  // del de la versión.
  //
  // `round(avg(m.db_level))` es media aritmética de dB. Con ruido estable coincide
  // con la de energía y el error no se ve; con ruido que varía, que es una calle,
  // queda por debajo — hasta 6,9 dB medido en el caso de un autobús cada 20 s. Y
  // quedaba hacia abajo, o sea que el mapa marcaba como tranquilas las calles más
  // ruidosas.
  //
  // Se comprueba contra el SQL, no contra una réplica en JavaScript: una réplica
  // puede quedarse vieja sin que ninguna prueba se entere, que es justo lo que pasó
  // con `modelPixels()` en el barrido de otro repo.
  const browser = queryBrowser();
  const version = browser.evaluate('MEASUREMENT_VERSION');
  const archivo = fs.readdirSync(path.join(__dirname, '..', 'migrations'))
    .find((n) => n.includes(`_v${version}.sql`));
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', archivo), 'utf8')
    .replace(/--[^\n]*/g, '');

  assert.doesNotMatch(sql, /round\(avg\(m\.db_level\)\)/,
    'sigue la media aritmética de dB');
  /*
   * `power(a, b)` es `a^b`, así que el orden importa y el equivocado **también
   * compila y también se ejecuta**: `power(db_level, 10)` es `62^10`, y la celda
   * devolvía 182 en lugar de 72, con todo el mapa en «alto». Se ejecutó contra un
   * Postgres de verdad y por eso se sabe; el test de forma lo ata para que no vuelva.
   */
  assert.match(sql, /power\(10, greatest\(m\.db_level, 1\)::double precision \/ 10\)/,
    'promedia en energía: 10·log10(media(10^(dB/10)))');
  assert.doesNotMatch(sql, /power\(greatest\(m\.db_level, 1\)::double precision, 10\)/,
    'los argumentos de power() están al revés: sería db_level^10');
  assert.match(sql, /greatest\(m\.db_level, 1\)/, 'protege el logaritmo');
});

test('las lecturas v3 no se convierten ni se mezclan con las v4', () => {
  // La v4 promedia distinto a la v3, así que una fila v3 no puede pasar por la
  // fórmula nueva sin mentir sobre cómo se calculó. Se comprueba que la migración
  // solo crea la RPC nueva y no toca las anteriores.
  const anterior = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261005_audio_measurement_v3.sql'), 'utf8');
  const nuevo = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261015_energy_average_v4.sql'), 'utf8')
    .replace(/--[^\n]*/g, '');
  assert.doesNotMatch(nuevo, /\b(?:delete from|update) public\./i);
  assert.doesNotMatch(nuevo, /noise_map_cells_v3/,
    'no reescribe la RPC anterior: cada versión conserva la suya');
  assert.match(anterior, /create or replace function public\.noise_map_cells_v3\(/);
  assert.match(nuevo, /create or replace function public\.noise_map_cells_v4\(/);
});
