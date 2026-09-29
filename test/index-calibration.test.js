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
const { classifyDb, normalizeDbForHeatmap } = context.api;

/**
 * Reproduce la formula de audio.js:217 sobre el promedio de
 * analyser.getByteFrequencyData(), que devuelve enteros de 0 a 255.
 * No es una funcion aparte en el codigo, asi que se replica aqui a proposito:
 * si alguien la cambia, esta prueba deja de reflejar la app real.
 */
function indiceDesdeByteFreq(average) {
  let db = Math.round(20 * Math.log10(average || 1) + 25);
  if (db < 30) db = 35;
  return db;
}

// Stops del gradiente de ensureHeatLayer en map.js:56-62.
const STOPS_GRADIENTE = [0.0, 0.35, 0.55, 0.75, 1.0];

test('el indice que la app puede producir tiene un techo de 73', () => {
  // Barrido exhaustivo de los 256 valores posibles del promedio de bytes.
  // El indice nunca pasa de 73, y solo se acerca a ese techo con el
  // analizador practicamente saturado. El minimo real es 31, no 35: el suelo
  // de 35 solo entra en juego cuando el indice baja de 30, y average=2 ya
  // produce 31 sin tocarlo.
  let maximo = 0;
  let minimo = Infinity;
  for (let average = 0; average <= 255; average += 1) {
    const db = indiceDesdeByteFreq(average);
    maximo = Math.max(maximo, db);
    minimo = Math.min(minimo, db);
  }
  assert.equal(maximo, 73);
  assert.equal(minimo, 31);
});

test('"alto" solo aparece en el 26 por ciento superior del rango del analizador', () => {
  // db > 70 exige round(20*log10(average) + 25) > 70, es decir average >= 189
  // sobre un maximo de 255. Es alcanzable, pero solo con el analizador casi
  // saturado. En produccion, con celdas agregadas entre 49 y 54, nunca se da.
  let primero = null;
  let ultimo = 0;
  for (let average = 0; average <= 255; average += 1) {
    if (classifyDb(indiceDesdeByteFreq(average)) === 'alto') {
      if (primero === null) primero = average;
      ultimo = average;
    }
  }
  assert.equal(primero, 189);
  assert.equal(ultimo, 255);
  assert.equal(ultimo - primero + 1, 67);
});

test('las celdas agregadas reales quedan mas comprimidas que las mediciones', () => {
  // Comprobado en Chrome headless el 2026-09-29 contra produccion: las 20
  // celdas que pinta el mapa tienen indice 49-54 (medio 52), no el rango
  // 35-61 de las mediciones individuales, porque cada celda promedia.
  // La intensidad real del heatmap quedo entre 0.271 y 0.343.
  const celdas = [49, 54];
  const min = Math.min(...celdas.map(normalizeDbForHeatmap));
  const max = Math.max(...celdas.map(normalizeDbForHeatmap));
  assert.equal(Number(min.toFixed(3)), 0.271);
  assert.equal(Number(max.toFixed(3)), 0.343);
  // No alcanza siquiera el segundo stop del gradiente, que esta en 0.35.
  assert.ok(max < STOPS_GRADIENTE[1], 'no alcanza el stop de color lima');
  assert.equal(STOPS_GRADIENTE.filter((stop) => stop <= max).length, 1,
    'solo se pinta el primer color del gradiente');
});

test('el mapa pinta un unico color con los datos de produccion', () => {
  // Hallazgo medido sobre el canvas real del heatmap en Chrome headless:
  // 72034 pixeles pintados, todos en la gama del verde inicial #22c55e
  // (34,197,94). Ningun pixel en amarillo, naranja o rojo.
  const verdeInicial = { r: 34, g: 197, b: 94 };
  const pixeles = [
    { r: 42, g: 191, b: 85 }, { r: 55, g: 200, b: 91 }, { r: 39, g: 196, b: 78 },
    { r: 48, g: 191, b: 80 }, { r: 57, g: 198, b: 85 }, { r: 51, g: 204, b: 85 },
    { r: 60, g: 195, b: 75 }, { r: 58, g: 197, b: 81 }, { r: 61, g: 194, b: 73 },
    { r: 54, g: 201, b: 81 }, { r: 64, g: 202, b: 74 }
  ];
  // El verde domina si el canal verde supera al rojo en todos los pixeles.
  for (const p of pixeles) {
    assert.ok(p.g > p.r && p.g > p.b,
      `pixel ${p.r},${p.g},${p.b} no es una variante del verde inicial`);
    assert.ok(Math.abs(p.g - verdeInicial.g) < 20, 'el canal verde se mantiene en la gama inicial');
  }
});

/**
 * Carga communityCopy, communityText y formatLegendCounter desde community.js
 * en un contexto aislado, para comprobar la concordancia en los tres idiomas.
 */
function requireCommunityHelpers() {
  const js = fs.readFileSync(path.join(root, 'js', 'community.js'), 'utf8');
  const extract = (name) => {
    const match = js.match(new RegExp(`(?:function|const) ${name}\\b[^]*?(?=\\n(?:function|const|async function|\\/\\/|let) |$)`));
    assert.ok(match, `${name} existe en community.js`);
    return match[0];
  };
  const crear = (idioma) => {
    const ctx = {
      localStorage: { getItem: () => idioma },
      document: { documentElement: { lang: idioma } }
    };
    vm.createContext(ctx);
    vm.runInContext(
      `${extract('communityCopy')}\n${extract('communityText')}\n${extract('formatLegendCounter')}`,
      ctx
    );
    return ctx.formatLegendCounter;
  };
  return {
    formatearContador: (idioma, celdas, mediciones) => {
      const formato = crear(idioma);
      const etiqueta = formato.__etiqueta
        ? formato.__etiqueta
        : { es: 'Historial (90 días)', en: 'History (90 days)', pt: 'Histórico (90 dias)' }[idioma];
      return formato(etiqueta, celdas, mediciones);
    }
  };
}

test('el contador de la leyenda concuerda en singular', () => {
  // Regresión. Comprobado en Chrome headless contra producción el 2026-09-29:
  // el modo "En vivo" renderizó "En vivo (24 h) - 1 zonas - 2 mediciones"
  // porque community.js concatenaba communityText('zones') sin distinguir
  // plural de singular. Aquí se exige la forma correcta para los tres idiomas.
  const { formatearContador } = requireCommunityHelpers();
  assert.equal(formatearContador('es', 20, 479), 'Historial (90 días) · 20 zonas · 479 mediciones');
  assert.equal(formatearContador('es', 1, 2), 'Historial (90 días) · 1 zona · 2 mediciones');
  assert.equal(formatearContador('es', 1, 1), 'Historial (90 días) · 1 zona · 1 medición');
  assert.equal(formatearContador('en', 1, 1), 'History (90 days) · 1 area · 1 measurement');
  assert.equal(formatearContador('en', 2, 3), 'History (90 days) · 2 areas · 3 measurements');
  assert.equal(formatearContador('pt', 1, 1), 'Histórico (90 dias) · 1 área · 1 medição');
  assert.equal(formatearContador('pt', 5, 5), 'Histórico (90 dias) · 5 áreas · 5 medições');
  // Cero también es plural en los tres idiomas.
  assert.equal(formatearContador('es', 0, 0), 'Historial (90 días) · 0 zonas · 0 mediciones');
});

test('setTimeFilter ignora valores invalidos en vez de vaciar el mapa', () => {
  // Regresión. Ejecutado en Chrome headless el 2026-09-29: pasar una franja
  // inexistente dejaba las celdas en 0 y el contador decía "Aún no hay
  // mediciones en el historial", sin error. Las cuatro condiciones de
  // noise_map_cells quedan falsas ante un valor inesperado y la RPC devuelve
  // cero filas, así que el mapa se vacía en silencio.
  // setMapMode ya validaba su argumento (community.js:435); setTimeFilter no.
  const js = fs.readFileSync(path.join(root, 'js', 'community.js'), 'utf8');
  const extract = (name) => {
    const match = js.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
    assert.ok(match, `${name} existe`);
    return match[0];
  };
  let recargas = 0;
  const ctx = {
    mapMode: 'history',
    selectedTimeFilter: 'morning',
    document: { querySelectorAll: () => [] },
    loadCommunityPoints: () => { recargas += 1; }
  };
  // TIME_FILTERS precede a la función en el fuente y forma parte de su contrato.
  const filtros = js.match(/const TIME_FILTERS = \[[^\]]*\];/);
  assert.ok(filtros, 'TIME_FILTERS existe');
  vm.runInNewContext(
    `${filtros[0]}\n${extract('setTimeFilter')}\nthis.run = setTimeFilter;`,
    ctx
  );

  ctx.run('franja-inexistente');
  assert.equal(ctx.selectedTimeFilter, 'morning', 'el valor invalido no debe guardarse');
  assert.equal(recargas, 0, 'no debe disparar una recarga que la RPC no puede satisfacer');

  ctx.run('night');
  assert.equal(ctx.selectedTimeFilter, 'night', 'una franja valida si debe aplicarse');
  assert.equal(recargas, 1);

  for (const valido of ['all', 'morning', 'afternoon', 'night']) {
    ctx.run(valido);
    assert.equal(ctx.selectedTimeFilter, valido);
  }
  for (const invalido of ['', null, undefined, 'MORNING', 'noche', 42, {}]) {
    const previo = ctx.selectedTimeFilter;
    ctx.run(invalido);
    assert.equal(ctx.selectedTimeFilter, previo, `debe ignorar ${JSON.stringify(invalido)}`);
  }
});
