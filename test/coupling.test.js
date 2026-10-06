const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const leer = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

/** Variables que features.js declara y otros ficheros usan a traves del global. */
const DE_FEATURES = [
  'comparisonMode', 'comparisonLayer', 'currentComparisonLayer', 'comparisonRows',
  'drawnZone', 'selectedMapPoint', 'featureClientId',
  'activateComparisonLayer', 'createFeatureUi', 'openFeaturePanel', 'closeFeatureMenu',
  'flushOfflineMeasurements', 'queueOfflineMeasurement', 'enqueueOfflineRecord',
  'summaryText', 'summaryIcon', 'updateSummaryState', 'exitComparisonMode'
];

const hojasDeFeatures = () =>
  fs.readdirSync(path.join(root, 'js'))
    .filter((n) => n.endsWith('.js') && n !== 'features.js' && n !== 'config.local.js')
    .map((n) => `js/${n}`);

test('nadie usa una variable de features.js sin comprobarla antes', () => {
  // features.js se carga el ultimo, pero community.js llama a
  // loadCommunityPoints() en tiempo de carga, y ese camino llega a
  // renderCommunityPoints. Sin la comprobacion, comparisonMode todavia no
  // existe y se lanza ReferenceError en un TDZ.
  //
  // La comprobacion se busca en la linea actual y en las hasta 6 anteriores:
  // lo habitual es "if (typeof f === 'function') { await f(); }", con la
  // guarda y la llamada en lineas consecutivas. Mirar solo la linea propia
  // daba falsos positivos en audio.js y community.js, que ya lo hacen bien.
  //
  // Este detector se auto-verifica con la prueba siguiente: si dejara de
  // encontrar casos, esta pasaria sin comprobar nada.
  const infractores = [];
  for (const archivo of hojasDeFeatures()) {
    for (const hallazgo of buscarReferenciasSinGuarda(leer(archivo))) {
      infractores.push(`${archivo}: ${hallazgo}`);
    }
  }
  assert.deepEqual(infractores, [], 'referencias sin comprobar');
});

/** Localiza usos de variables de features.js que no comprueban con typeof. */
function buscarReferenciasSinGuarda(texto) {
  const infractores = [];
  // Los comentarios se borran antes de mirar. Tambien se quita el \r: los
  // ficheros usan CRLF y, sin limpiarlo, el texto del comentario sobrevive a
  // la sustitucion y el detector lo lee como codigo.
  const lineas = texto.split('\n').map((l) =>
    l.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/, ''));
  lineas.forEach((linea, indice) => {
    if (!linea.trim()) return;
    for (const variable of DE_FEATURES) {
      if (!new RegExp(`(?<![.\\w'\`])` + variable + '\\b').test(linea)) continue;
      // No se descartan las lineas que empiezan por "if": "if (comparisonMode)"
      // sin typeof es exactamente el fallo que se busca. Lo que separa un uso
      // de una declaracion es el tipo de variable en la ventana, no la palabra
      // con la que empieza la linea.
      const ventana = lineas.slice(Math.max(0, indice - 6), indice + 1).join('\n');
      if (ventana.includes('typeof ' + variable)) continue;
      if (new RegExp(`(function|const|let|var)\\s+` + variable + '\\b').test(ventana)) continue;
      infractores.push(`linea ${indice + 1}  usa ${variable}`);
    }
  });
  return infractores;
}

test('el detector de acoplamiento ve fallos reales y no senala los que estan guardados', () => {
  // Si el detector dejara de encontrar casos, la prueba anterior pasaria sin
  // comprobar nada. Se le dan ficheros sinteticos, nunca se modifica el
  // repositorio: se escriben en el temporal y se borran al terminar.
  const os = require('node:os');
  const conGuarda = [
    'function renderCommunityPoints(points) {',
    "  if (typeof comparisonMode !== 'undefined' && comparisonMode) {",
    "    if (typeof activateComparisonLayer === 'function') activateComparisonLayer();",
    '  }',
    '  if (typeof queueOfflineMeasurement === \'function\') queueOfflineMeasurement(1);',
    '}'
  ];
  const sinGuarda = [
    'function renderCommunityPoints(points) {',
    '  if (comparisonMode) activateComparisonLayer();',
    '  clearCommunityLayers();',
    '}'
  ];
  const escribir = (nombre, lineas) => {
    const ruta = path.join(os.tmpdir(), `acoustimap-acoplamiento-${nombre}-${process.pid}.js`);
    fs.writeFileSync(ruta, lineas.join('\n') + '\n', 'utf8');
    return ruta;
  };

  const rutaOk = escribir('ok', conGuarda);
  const rutaMalo = escribir('malo', sinGuarda);
  try {
    assert.deepEqual(buscarReferenciasSinGuarda(fs.readFileSync(rutaOk, 'utf8')), [],
      'un fichero que comprueba con typeof no debe dar hallazgos');

    const fallos = buscarReferenciasSinGuarda(fs.readFileSync(rutaMalo, 'utf8'));
    assert.ok(fallos.some((f) => f.includes('comparisonMode') && !f.includes('activate')),
      `debe ver comparisonMode sin guarda; encontro ${JSON.stringify(fallos)}`);
    assert.ok(fallos.some((f) => f.includes('activateComparisonLayer')),
      `debe ver activateComparisonLayer sin guarda; encontro ${JSON.stringify(fallos)}`);
  } finally {
    fs.unlinkSync(rutaOk);
    fs.unlinkSync(rutaMalo);
  }
});

test('el orden de carga en index.html no ha cambiado', () => {
  // El orden es un contrato de dependencias, no una preferencia estetica.
  const esperado = [
    'js/config.local.js', 'js/config.js', 'js/map.js', 'js/audio.js',
    'js/community.js', 'js/app.js', 'js/features.js'
  ];
  const html = leer('index.html');
  const scripts = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]);
  assert.deepEqual(scripts, esperado, 'los scripts internos deben seguir en este orden');
});

test('la version de cache es la misma en los tres sitios', () => {
  // Si divergen, el service worker sigue sirviendo recursos viejos aunque el
  // HTML pida los nuevos.
  const html = leer('index.html');
  const sw = leer('sw.js');
  const delHtml = new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]));
  assert.equal(delHtml.size, 1, `index.html mezcla versiones: ${[...delHtml].join(', ')}`);
  const version = [...delHtml][0];
  assert.match(sw, new RegExp(`const ASSET_VERSION = '${version}'`),
    'sw.js ASSET_VERSION debe coincidir con index.html');
  assert.match(sw, new RegExp(`CACHE_NAME = 'acoustimap-shell-v${version}'`),
    'sw.js CACHE_NAME debe coincidir con index.html');
});

test('el indice nunca sale del rango que el heatmap puede representar', () => {
  // audio.js acota a 30-95 y normalizeDbForHeatmap cubre 30-95. Si uno de los
  // dos cambia sin el otro, celdas legitimas caerian fuera de la escala o
  // saturarian en el mismo color.
  const audio = leer('js/audio.js');
  assert.match(audio, /Math\.min\(95, Math\.max\(30, Math\.round\(dbfs \+ 100\)\)\)/,
    'audio.js acota el indice a 30-95');

  const config = leer('js/config.js');
  const rango = config.match(/\(db - (\d+)\) \/ (\d+)/);
  assert.ok(rango, 'normalizeDbForHeatmap tiene un rango explicito');
  const min = Number(rango[1]);
  const amplitud = Number(rango[2]);
  assert.equal(min, 30, 'el suelo de la escala es el indice minimo');
  assert.equal(min + amplitud, 95, 'el techo de la escala es el indice maximo');

  // Y los stops del gradiente siguen cayendo sobre los umbrales.
  const mapa = leer('js/map.js');
  const stops = [...mapa.matchAll(/^\s+(0\.\d+):\s*'#\w+',?$/gm)].map((m) => Number(m[1]));
  assert.ok(stops.includes(+((55 - 30) / 65).toFixed(3)), 'el ambar cae sobre el umbral 55');
  assert.ok(stops.includes(+((70 - 30) / 65).toFixed(3)), 'el naranja cae sobre el umbral 70');
});

test('la migracion de produccion esta documentada en el repositorio', () => {
  // Las migraciones 20260928 y 20260929 ya se aplicaron en produccion. Si se
  // perdieran de ahi, el repositorio dejaria de ser la fuente de verdad.
  for (const archivo of ['20260928_schema_hygiene.sql', '20260929_drop_unused_measurement_link.sql']) {
    assert.ok(fs.existsSync(path.join(root, 'migrations', archivo)), `falta migrations/${archivo}`);
  }
  // Y la que hace posible el mapa, que la app consulta en cada carga.
  assert.ok(fs.existsSync(path.join(root, 'migrations', '20260925_privacy_and_retention.sql')));
});
