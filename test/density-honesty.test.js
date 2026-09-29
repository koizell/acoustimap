const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const context = {
  window: { __ACOUSTIMAP_CONFIG__: {} },
  console: { log() {}, warn() {}, error() {} },
  navigator: {},
  Math,
  Date
};
vm.runInNewContext(
  `${source}\nthis.api = { classifyDb, normalizeDbForHeatmap, densityConfidence, cellBorderOpacity };`,
  context
);
const { classifyDb, normalizeDbForHeatmap, densityConfidence, cellBorderOpacity } = context.api;

const community = fs.readFileSync(path.join(root, 'js', 'community.js'), 'utf8');
const mapa = fs.readFileSync(path.join(root, 'js', 'map.js'), 'utf8');
const indice = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const features = fs.readFileSync(path.join(root, 'js', 'features.js'), 'utf8');

test('la confianza crece con la densidad y satura a partir de 30', () => {
  assert.equal(densityConfidence(0), 0);
  assert.ok(Math.abs(densityConfidence(1) - Math.sqrt(1 / 30)) < 1e-9);
  assert.equal(densityConfidence(30), 1);
  assert.equal(densityConfidence(332), 1, 'una celda muy medida no crece mas alla de 1');
  let anterior = -1;
  for (let n = 0; n <= 30; n += 1) {
    const actual = densityConfidence(n);
    assert.ok(actual >= anterior, `debe ser monotono creciente en ${n}`);
    anterior = actual;
  }
});

test('la confianza no puede degradar una lectura aislada', () => {
  // El borde de una celda con una sola lectura tiene que seguir siendo visible.
  assert.ok(cellBorderOpacity(1) > 0.3, `borde demasiado tenue: ${cellBorderOpacity(1)}`);
  assert.ok(cellBorderOpacity(1) <= 0.5, 'una lectura suelta no debe parecer firmly medida');
  assert.ok(cellBorderOpacity(332) > 0.7, 'una celda muy medida debe standout');
  assert.ok(cellBorderOpacity(30) <= 0.81, 'no debe pasar de 0.8');
  // Valores ausentes o invalidos no pueden romper nada.
  for (const raro of [undefined, null, 0, -5, 'x', NaN]) {
    const v = cellBorderOpacity(raro);
    assert.ok(Number.isFinite(v) && v >= 0.3 && v <= 0.81, `valor raro ${raro} produjo ${v}`);
  }
});

test('la intensidad del heatmap NO depende de la densidad', () => {
  // Decision de producto: un ciudadano que reporta ruido extremo aporta el dato
  // mas valioso, asi que una lectura suelta no se atenua. La densidad solo
  // modula el borde y el rotulo.
  const heat = mapa.slice(mapa.indexOf('function setCommunityHeatPoints'));
  const usar = heat.slice(0, heat.indexOf('function addCommunityHeatPoint'));
  assert.doesNotMatch(usar, /densityConfidence|cellBorderOpacity|sampleCount/,
    'setCommunityHeatPoints no debe ponderar por densidad');

  // Y el color del circulo sale solo de la categoria.
  const punto = community.slice(community.indexOf('function addCommunityPoint'));
  const principal = punto.slice(0, punto.indexOf('// Punto central'));
  assert.match(principal, /fillOpacity:\s*0\.18/,
    'el relleno no debe depender de la densidad');
  assert.match(principal, /color,/, 'el color sale de la categoria');
  assert.match(principal, /weight:\s*1\.2 \+ 1\.3 \* densityConfidence\(sampleCount\)/);
  assert.match(principal, /opacity:\s*cellBorderOpacity\(sampleCount\)/);
});

test('el rotulo permanente lleva indice y mediciones, no solo la hora', () => {
  // Antes decia "hace 5 d" en las 20 celdas: tres textos distintos repetidos
  // y sin informacion. Ahora cada rotulo dice cuanto y con quantas lecturas.
  assert.match(community, /\.bindTooltip\(`\$\{db\} · \$\{sampleCount\}`/);
  assert.doesNotMatch(community, /\.bindTooltip\(when,[\s\S]{0,200}permanent/,
    'el rotulo permanente ya no debe ser solo la hora');
  // La hora sigue disponible al hacer clic.
  assert.match(community, /lastMeasurement/);
});

test('la leyenda explica el rotulo y el borde en los tres idiomas', () => {
  assert.match(indice, /id="legend-hint"/, 'index.html declara el texto de la leyenda');
  assert.match(indice, /[ií]ndice · mediciones/, 'el texto nombra indice y mediciones');
  assert.match(features, /legendHint: 'Cada círculo/, 'traduccion en espanol');
  assert.match(features, /legendHint: 'Each circle/, 'traduccion en ingles');
  assert.match(features, /legendHint: 'Cada círculo mostra/, 'traduccion en portugues');
  assert.match(features, /legend-hint/, 'updateStaticLanguage lo reescribe al cambiar de idioma');
});

test('el umbral de categoria no cambia con el nuevo rotulo', () => {
  // El color sigue siendo el indice: 50 bajo, 60 moderado, 75 alto.
  assert.equal(classifyDb(50), 'bajo');
  assert.equal(classifyDb(60), 'moderado');
  assert.equal(classifyDb(75), 'alto');
  // Y una celda de una sola lectura sigue siendo totalmente visible.
  assert.ok(cellBorderOpacity(1) >= 0.3);
  assert.ok(Math.abs(normalizeDbForHeatmap(50) - (20 / 65)) < 1e-9);
});
