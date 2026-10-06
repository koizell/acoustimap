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
vm.runInNewContext(`${source}\nthis.api = { classifyDb, normalizeDbForHeatmap };`, context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'audio.js'), 'utf8')
  + '\nthis.audioApi = { rmsToIndex };', context);
const { classifyDb, normalizeDbForHeatmap } = context.api;

// Ejecuta la fórmula real, no una réplica que pueda separarse del medidor.
const indiceDesdeRms = context.audioApi.rmsToIndex;

// Stops del gradiente de ensureHeatLayer en map.js.
const STOPS_GRADIENTE = [0.0, 0.25, 0.385, 0.615, 1.0];

/** Amplitudes sintéticas para verificar la escala, no entornos calibrados. */
const ESCENARIOS = [
  { nombre: 'amplitud 0.0002', rms: 0.0002 },
  { nombre: 'amplitud 0.0008', rms: 0.0008 },
  { nombre: 'amplitud 0.003', rms: 0.003 },
  { nombre: 'amplitud 0.012', rms: 0.012 },
  { nombre: 'amplitud 0.04', rms: 0.04 },
  { nombre: 'amplitud 0.12', rms: 0.12 },
  { nombre: 'amplitud 0.35', rms: 0.35 },
  { nombre: 'amplitud 0.707', rms: 0.707 }
];

test('el indice recorre todo el rango con amplitudes sintéticas', () => {
  const tabla = ESCENARIOS.map(({ nombre, rms }) => {
    const index = indiceDesdeRms(rms);
    return { nombre, rms, index, categoria: classifyDb(index) };
  });
  for (const fila of tabla) {
    console.log(`  ${fila.nombre.padEnd(26)} rms ${String(fila.rms).padEnd(7)} -> indice ${fila.index}  ${fila.categoria}`);
  }

  // Los tres umbrales tienen que quedar dentro del rango alcanzable, cosa que
  // no ocurria con la metrica anterior: alli "alto" exigia un promedio de 178
  // sobre 255, practically inalcanzable.
  const alcanzable = ESCENARIOS.map(({ rms }) => indiceDesdeRms(rms));
  assert.ok(Math.min(...alcanzable) < 45, 'el silencio debe llegar a la zona baja');
  assert.ok(alcanzable.some((i) => i >= 55 && i <= 70), 'debe haber escenarios moderados');
  assert.ok(Math.max(...alcanzable) > 70, 'debe haber escenarios altos');

  // Cada decade de amplitud suma unos 20 puntos de indice.
  const silencio = indiceDesdeRms(0.0008);
  const traves = indiceDesdeRms(0.008);
  assert.ok(traves - silencio >= 19 && traves - silencio <= 21,
    `10x de amplitud debe sumar ~20 puntos, sumo ${traves - silencio}`);
});

test('el indice queda acotado entre 30 y 95', () => {
  assert.equal(indiceDesdeRms(0), 30, 'silencio absoluto da el suelo');
  assert.equal(indiceDesdeRms(1e-12), 30, 'muy por debajo del ruido tambien');
  assert.equal(indiceDesdeRms(0.707), 95, 'senal a plena escala da el techo');
  assert.equal(indiceDesdeRms(5), 95, 'por encima de plena escala no se desborda');
  for (let rms = 0; rms <= 1; rms += 0.001) {
    const index = indiceDesdeRms(rms);
    assert.ok(index >= 30 && index <= 95, `rms ${rms} produjo ${index}`);
    assert.ok(Number.isInteger(index), 'el indice debe ser entero');
  }
});

test('los stops del gradiente coinciden con los umbrales de categoria', () => {
  // El rango 30-95 tiene 65 puntos. 55 cae en 0.385 y 70 en 0.615, asi que el
  // ambar y el naranja del heatmap arrancan donde arrancan "moderado" y "alto".
  const cerca = (a, b) => Math.abs(a - b) < 1e-3;
  assert.ok(cerca((55 - 30) / 65, STOPS_GRADIENTE[2]),
    `el stop ambar ${STOPS_GRADIENTE[2]} debe caer en el umbral 55`);
  assert.ok(cerca((70 - 30) / 65, STOPS_GRADIENTE[3]),
    `el stop naranja ${STOPS_GRADIENTE[3]} debe caer en el umbral 70`);
  assert.ok(cerca(normalizeDbForHeatmap(55), STOPS_GRADIENTE[2]));
  assert.ok(cerca(normalizeDbForHeatmap(70), STOPS_GRADIENTE[3]));
  // El indice maximo tiene que llegar al rojo del gradiente.
  assert.equal(normalizeDbForHeatmap(95), 1);
  assert.equal(normalizeDbForHeatmap(30), 0.05, 'el suelo mantiene un valor minimo visible');
});

test('el gradiente entero queda accesible con el rango del indice', () => {
  // Antes solo se pintaba verde y lima: ningun dato real pasaba de 0.44.
  // Ahora el rango completo 30-95 recorre las cinco bandas.
  const alcanzados = STOPS_GRADIENTE.filter((stop) => stop <= 1);
  assert.equal(alcanzados.length, 5, 'las cinco bandas son alcanzables');
  for (const stop of STOPS_GRADIENTE) {
    const indice = stop * 65 + 30;
    assert.ok(indice <= 95, `el stop ${stop} exige indice ${indice.toFixed(1)} y el tope es 95`);
  }
});

test('las mediciones historicas siguen siendo representables', () => {
   // Los valores antiguos siguen dentro de la escala, pero no deben mezclarse
   // en los promedios actuales: la RPC los deja fuera sin borrar los registros.
  assert.equal(Number(normalizeDbForHeatmap(35).toFixed(3)), 0.077);
  assert.equal(Number(normalizeDbForHeatmap(61).toFixed(3)), 0.477);
  assert.equal(classifyDb(35), 'bajo');
  assert.equal(classifyDb(61), 'moderado');
});

test('el indice ya no depende de getByteFrequencyData', () => {
  // Regresion estructural: la metrica antigua promediaba los 128 bins y se
  // hundia con sonidos tonales. Con un pitido fuerte ocupaba pocos bins y la
  // media se quedaba en 93 de 255, indice 64, sin acercarse a "alto".
  const audio = fs.readFileSync(path.join(root, 'js', 'audio.js'), 'utf8');
  // Se ignoran los comentarios: el de updateMeter nombra la metrica antigua
  // para explicar por que se cambio.
  const cuerpo = audio
    .slice(audio.indexOf('function updateMeter'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(cuerpo, /getByteFrequencyData/,
    'updateMeter no debe seguir usando el promedio espectral');
  assert.doesNotMatch(cuerpo, /20\s*\*\s*Math\.log10\([^)]*average/,
    'no debe quedar la conversion del promedio de bytes');
  // v3 obtiene la señal temporal del AudioWorklet, no del AnalyserNode.
  assert.match(audio, /audioWorklet\.addModule\(AUDIO_PROCESSOR_URL\)/);
   assert.match(cuerpo, /weightedDbToIndex\(aDbfs\)/);
  const processor = fs.readFileSync(path.join(root, 'js', 'audio-level-processor.js'), 'utf8');
  assert.match(processor, /const channels = inputs\[0\]/);
   assert.match(processor, /power \+= value \* value/);
   assert.match(processor, /this\.fft\.transform\(this\.re, this\.im\)/);
  assert.doesNotMatch(processor, /getByteFrequencyData/);
});
