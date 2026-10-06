const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

/*
 * El promedio de energía, que es la corrección que hizo la v4.
 *
 * ## El error
 *
 * La app sumaba los dB de cada lectura y dividía por la cantidad. Eso no es un
 * promedio de ruido: los dB son logarítmicos, de modo que dos sonidos de 60 dB juntos
 * no dan 60 dB, dan 63. Lo que se promedia es la energía y el logaritmo se aplica al
 * final.
 *
 * ## Por que nadie lo notaba
 *
 * Porque con una señal **estable** las dos medias coinciden. El error solo aparece
 * cuando el ruido varía, que es exactamente lo que pasa en una calle con tráfico. Y
 * cuando aparece, va siempre hacia abajo: la app decía que el ruido era más bajo de
 * lo que era, tanto más cuanto más variaba. El mapa marcaba como tranquilas las calles
 * más ruidosas, que son justo las que le importan a la app.
 *
 * ## Por que este test usa números y no una frase
 *
 * Porque la versión anterior de esta comprobación podía pasar con cualquiera de las
 * dos fórmulas. Lo que fija es el **resultado medido**: 74, no «un valor entre 65 y
 * 74». Si alguien vuelve a sumar dB, el número se va a 65 y falla.
 */

function medidor() {
  const browser = createBrowserContext({
    document: {
      documentElement: { lang: 'es' },
      addEventListener() {},
      getElementById: () => ({
        innerText: '', textContent: '', innerHTML: '', disabled: false, style: {},
        classList: { add() {}, remove() {}, contains: () => false }
      })
    },
    setInterval() { return 1; },
    clearInterval() {}
  });
  browser.load('config.js');
  return browser;
}

/** El promedio tal como lo hacía la app, calculando sobre una lista de lecturas. */
function promedioDeLaApp(lecturas, browser, energetico) {
  return browser.evaluate(`(() => {
    const lecturas = ${JSON.stringify(lecturas)};
    const energia = lecturas.reduce((suma, db) => suma + energiaDe(db), 0);
    return ${energetico
      ? 'Math.round(promedioEnergetico(energia, lecturas.length))'
      : 'Math.round(lecturas.reduce((suma, db) => suma + db, 0) / lecturas.length)'};
  })()`);
}

test('una serie estable da el mismo resultado con las dos fórmulas', () => {
  const browser = medidor();
  const estable = [60, 60, 60, 60];
  assert.equal(promedioDeLaApp(estable, browser, false),
    promedioDeLaApp(estable, browser, true),
    'por eso el error pasó inadvertido durante tanto tiempo');
});

test('una serie que varía da un número más alto, no más bajo', () => {
  const browser = medidor();
  const calle = [50, 60, 70, 80];
  const aritmetico = promedioDeLaApp(calle, browser, false);
  const energetico = promedioDeLaApp(calle, browser, true);
  assert.equal(aritmetico, 65);
  assert.equal(energetico, 74);
  assert.ok(energetico > aritmetico,
    'el error va siempre hacia abajo, que es lo que hace el mapa menos fiable');
});

test('un autobús que pasa cada 20 s no se promedia como si fuera silencio', () => {
  // El caso que motivó la corrección, medido sobre la variación del tráfico urbano.
  const browser = medidor();
  const calle = [62, 62, 62, 62, 62, 78, 62, 62, 62, 62, 62, 80];
  const energetico = promedioDeLaApp(calle, browser, true);
  assert.ok(energetico >= 70,
    `con la media aritmética daba ${promedioDeLaApp(calle, browser, false)}, que es justo lo que se quería evitar`);
});

test('la energía de un dB es 10^(dB/10), no 10^(dB/20)', () => {
  // El 20 sería la razón de presiones, que es la fórmula del LAeq de un sonómetro.
  // Aquí se promedia energía, y confundir los dos da otro número sin avisar.
  const browser = medidor();
  assert.equal(browser.evaluate('energiaDe(60)'), 1e6);
  assert.equal(browser.evaluate('energiaDe(0)'), 1);
  assert.equal(Math.round(browser.evaluate('promedioEnergetico(1e6, 1)')), 60);
});

test('una ventana vacía o sin energía no devuelve NaN ni -Infinity', () => {
  // db_level = 0 daría log10(0). Es el motivo del `greatest(db_level, 1)` en la RPC,
  // y aquí se comprueba que el lado de JavaScript tampoco lo produce.
  const browser = medidor();
  assert.equal(browser.evaluate('promedioEnergetico(0, 0)'), 0);
  assert.equal(browser.evaluate('promedioEnergetico(0, 5)'), 0);
  assert.equal(browser.evaluate('promedioEnergetico(1e6, 0)'), 0);
  assert.ok(Number.isFinite(browser.evaluate('promedioEnergetico(1e6, 3)')));
});

test('el resumen de sesión y la media de la ventana usan la misma fórmula', () => {
  // Si divergen, la cifra que se guarda en la base y la que se ve en pantalla
  // cuentan historias distintas sobre la misma sesión, y una app de ciencia ciudadana
  // no puede permitírselo.
  // Se cuentan solo las llamadas, no las menciones: hay un comentario que explica por
  // qué se cambió, y un `match` a secas contaba también ese comentario y pedía tres
  // en vez de dos. Un test que se rompe por su propia documentación es un test que
  // enseña a ignorar sus fallos.
  const audio = require('node:fs')
    .readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const usos = audio.match(/promedioEnergetico\(/g) ?? [];
  assert.equal(usos.length, 2,
    'el promedio de pantalla y el del resumen deben salir ambos de promedioEnergetico');
  assert.doesNotMatch(audio, /session\.sum/, 'la suma de dB ya no existe');
  assert.doesNotMatch(audio, /sendWindowSum/, 'la ventana ya no suma dB');
});