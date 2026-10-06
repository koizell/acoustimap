const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const leer = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const html = leer('index.html');

/**
 * La pantalla dice «dB» y no dice «índice».
 *
 * ## Por qué este test existe
 *
 * El panel mostraba «63 índice», «Índice moderado», «Sin calibrar · 1 s · no son
 * dB» y «Señal digital: -36.6 dBFS», todo a la vez. Para quien mide ruido en la
 * calle eran cuatro cosas que no va a leer; para quien audita la medida eran las
 * cuatro que sí. No había forma de servir a los dos con la misma pantalla.
 *
 * La decisión fue partirla: el número va en `dB`, que es lo que la gente entiende
 * de un ruido, con una sola línea debajo que dice lo único que cambia lo que
 * alguien haría con él —**sin calibrar**—. Y el resto de la instrumentación se
 * abre desde la consola con `verCalidadMicrofono()`.
 *
 * Este test fija esa decisión. No es una prueba de estilo: cada aserción
 * corresponde a algo que estaba en la pantalla y que se decidió quitar, y el
 * término «índice» vuelve a colarse si alguien edita una cadena sin mirar.
 */

/** El panel de medición, sin el resto del documento. */
const panel = html.slice(
  html.indexOf('id="stats-panel"'),
  html.indexOf('<!-- MODAL', html.indexOf('id="stats-panel"'))
);

test('el número grande y el promedio llevan dB como unidad', () => {
  const unidades = [...panel.matchAll(/class="(db|avg)-unit">([^<]+)</g)].map((m) => m[2].trim());
  assert.deepEqual(unidades, ['dB', 'dB'],
    'la unidad visible es dB, y solo dB');
});

test('la palabra «índice» no aparece en el panel de medición', () => {
  assert.ok(!/índice/i.test(panel),
    `queda «índice» en el panel: ${panel.match(/.{0,40}índice.{0,40}/i)?.[0]}`);
});

test('el aviso de debajo del número son dos palabras, no un párrafo', () => {
  const aviso = html.match(/id="measurement-caveat">([^<]+)</)?.[1].trim();
  assert.equal(aviso, 'Sin calibrar');
  assert.ok(aviso.split(/\s+/).length <= 3,
    'el aviso cabe en un vistazo; si crece, la advertencia ha vuelto a la pantalla');
});

test('la instrumentación existe pero no se ve sin pedirla', () => {
  // Los identificadores se conservan porque `updateAudioDiagnostics()` los escribe,
  // y sin ellos la función que los rellena fallaría en silencio.
  for (const id of ['audio-signal-reading', 'audio-processing-warning', 'audio-quality-warning',
    'audio-diagnostics-title', 'audio-diagnostics-data', 'audio-capture-note']) {
    assert.ok(html.includes(`id="${id}"`), `existe ${id}`);
  }
  assert.match(html, /<div class="mic-detail" hidden>/,
    'el bloque de instrumentación arranca oculto');
  assert.ok(!html.includes('id="audio-quality-warning" role="status" aria-live="polite"></p>\n\n        <div'),
    'el aviso de recorte sale del flujo normal, no queda suelto fuera del bloque');
});

test('la función de consola abre la instrumentación', () => {
  const audio = leer('js/audio.js');
  assert.match(audio, /function verCalidadMicrofono\(\)/);
  assert.match(audio, /\.hidden = false/,
    'abrirla quita el hidden, que es lo que la hace invisible');
  assert.match(audio, /verCalidadMicrofono/, 'está documentada en su propio comentario');
});

test('los umbrales numéricos viven en la leyenda, no en el panel', () => {
  // El color del mapa necesita su umbral al lado: sin él, un rojo no significa
  // nada. El panel de medición no lo repite.
  assert.ok(!/\b(55|70)\b/.test(panel),
    `el panel repite un umbral: ${panel.match(/.{0,40}\b(55|70)\b.{0,40}/)?.[0]}`);
  const features = leer('js/features.js');
  assert.match(features, /low: 'dB < 55 · Bajo'/);
  assert.match(features, /medium: 'dB 55–70 · Moderado'/);
  assert.match(features, /high: 'dB > 70 · Alto'/);
});

test('la leyenda dice para qué sirve la escala y para qué no', () => {
  const features = leer('js/features.js');
  // El aviso de «sin calibrar» no desaparece: se muda a la leyenda, que es donde
  // alguien que va a comparar dos zonas lo va a leer.
  assert.match(features, /legendNote: 'Escala orientativa sin calibrar\./);
  assert.ok(!/no equivale a dB/.test(features),
    'la frase «no equivale a dB» ya no es necesaria: la unidad dice dB y el aviso dice sin calibrar');
});

test('las tres categorías del panel son palabras sueltas', () => {
  const audio = leer('js/audio.js');
  for (const categoria of ['lowIndex', 'moderateIndex', 'highIndex']) {
    const valor = audio.match(new RegExp(`${categoria}: '([^']+)'`))?.[1];
    assert.ok(valor, `existe ${categoria}`);
    assert.ok(!/índice|index/i.test(valor),
      `${categoria} sigue diciendo «índice»: «${valor}»`);
  }
});