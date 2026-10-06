const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

/**
 * Un rechazo de Postgres no es un fallo de red, y por eso no puede seguir el camino
 * de la cola offline.
 *
 * ## El fallo que motivó esto
 *
 * La app ya escribía v4 y la migración que admitía el 4 en el CHECK no estaba
 * aplicada. Postgres contestaba `23514` a cada envío. `isOfflineError()` solo
 * reconoce fallos de red, así que ese `23514` no se guardaba en ninguna parte: **cada
 * medición se descartaba en silencio**. El botón decía «Error de envío», que es un
 * texto razonable para un problema de red y completamente engañoso para esto.
 *
 * Y el aviso que sí se veía era el del mapa —«falta aplicar la migración»—, que habla
 * de la RPC y no del INSERT. Dos síntomas, una sola causa, y el que se muestra no
 * señalaba el sitio.
 *
 * ## Qué se fija aquí
 *
 * Que un error de esquema: no se encola, no se cuenta como enviado, y **dice qué
 * hacer** en lugar de recomendar revisar la conexión.
 */
function envioCon(error) {
  const client = { from: () => ({ insert: async () => ({ error }) }) };
  const estados = [];
  const browser = createBrowserContext({
    document: {
      documentElement: { lang: 'es' },
      addEventListener() {},
      getElementById: (id) => ({ 'map-view': { classList: { contains: () => false } } }[id] ?? null)
    },
    navigator: { onLine: true },
    client,
    updateSharingDelivery() {},
    updateSharingStatus(key) { estados.push(key); },
    loadCommunityPoints() {},
    updateGpsChip() {},
    snapToGrid: (lat, lng) => ({ lat, lng }),
    classifyDb: () => 'bajo',
    recordLocalChallengeMeasurement() {},
    console: { warn() {}, log() {}, error() {} }
  });
  browser.load('config.js', 'features.js', 'community.js');
  browser.evaluate(`supabaseClient = client;
    sharingEnabled = true; currentPosition = { lat: 8.75, lng: -75.88 };
    lastSendTime = 0; sendWindowCount = 1; sendWindowEnergia = 1e5;`);
  /*
   * El espía se instala **después** de cargar los ficheros, no en el contexto de
   * arranque. `queueOfflineMeasurement` está definida en features.js, así que pasarla
   * como propiedad del contexto no servía: el `function` del fichero la pisa al
   * ejecutarse y el test espiaba una función que no era la que iba a correr.
   */
  browser.evaluate('window.encolados = []; queueOfflineMeasurement = async (m) => { window.encolados.push(m); }');
  return {
    browser,
    encolados: () => browser.evaluate('window.encolados.length'),
    estados
  };
}

test('un 23514 de Postgres no se encola y dice que falta la migración', async () => {
  /*
   * ## Lo que este test comprueba, y lo que no
   *
   * La primera versión de esta comprobación afirmaba que un 23514 no se encolaba, y
   * pasaba contra el código viejo **y contra el nuevo**. La razón: antes tampoco se
   * encolaba. `isOfflineError()` solo reconoce fallos de red, así que un 23514 caía
   * por el `if` sin hacer nada —se descartaba en silencio, que es el bug— y el test
   * veía exactamente lo mismo en las dos versiones.
   *
   * Lo que de verdad cambió no es el encolado: es el **aviso**. Antes salía
   * «No se confirmó el envío. Revisa la conexión y Supabase», que manda a mirar la red
   * cuando la red funciona perfectamente. Ahora dice que falta la migración.
   *
   * Así que lo que se afirma aquí es el aviso, que es la diferencia observable. Un
   * test que pasa contra las dos versiones no está probando el arreglo: está
   * describiendo algo que ya era cierto.
   */
  const { browser, encolados, estados } = envioCon({ code: '23514', message: 'new row violates check constraint' });
  await browser.evaluate('sendMeasurementIfDue()');
  assert.deepEqual(estados, ['schemaOutOfDate'],
    'un error de esquema se anuncia como tal, no como un problema de conexión');
  assert.equal(encolados(), 0,
    'encolarlo sería peor: la cola se sincroniza sola, volvería a fallar igual, y el '
    + 'mensaje de «guardado sin conexión» sería mentira');
  assert.equal(browser.evaluate('sendMeasurementIfDue.pending'), false,
    'la petición termina: si no, el resto de envíos quedan bloqueados para siempre');
});

test('un fallo de red sí se encola, como antes', async () => {
  // El camino bueno no debe romperse al añadir el malo: sin conexión sigue siendo
  // válido guardar para enviar más tarde.
  const { browser, encolados, estados } = envioCon({ code: '08006', message: 'TypeError: Failed to fetch' });
  await browser.evaluate('sendMeasurementIfDue()');
  assert.equal(encolados(), 1, 'un fallo de red se guarda en la cola');
  assert.ok(!estados.includes('schemaOutOfDate'),
    'y no se disfraza de problema de esquema');
});

test('isSchemaError reconoce los códigos de esquema y no confunde los de red', () => {
  const browser = createBrowserContext({ document: { documentElement: { lang: 'es' }, addEventListener() {}, getElementById: () => null } });
  browser.load('config.js', 'features.js');
  for (const code of ['23514', '42P01', '42703', '42883', '42501', 'PGRST202', 'PGRST204']) {
    assert.equal(browser.evaluate(`isSchemaError({ code: '${code}' })`), true, `${code} es de esquema`);
  }
  for (const message of ['TypeError: Failed to fetch', 'Network request failed', 'timeout']) {
    assert.equal(browser.evaluate(`isSchemaError({ message: '${message}' })`), false,
      `«${message}» es de red, no de esquema`);
  }
});

test('un PGRST204 se anuncia como esquema, y es el caso que se va a dar', async () => {
  /*
   * Es el fallo que habría ocurrido al publicar esto antes que la migración:
   * el formulario manda `kind`, la columna todavía no existe en producción, y
   * PostgREST contesta PGRST204.
   *
   * La gracia del código es que **no** es `42703`. PostgREST envuelve los errores de
   * Postgres en códigos propios, y quien busca el número de Postgres no lo encuentra en
   * la respuesta. Sin PGRST204 en la lista, un `isSchemaError()` que solo mirara
   * `42703` habría dado `false`, el reporte habría caído por el camino de la red y se
   * habría descartado en silencio —el mismo modo de fallo que costó las mediciones de
   * la v4, con otro código.
   */
  const { browser, estados, encolados } = envioCon({ code: 'PGRST204', message: 'Could not find the \'kind\' column' });
  await browser.evaluate('sendMeasurementIfDue()');
  assert.deepEqual(estados, ['schemaOutOfDate'],
    'columna ausente = esquema desactualizado, no problema de conexión');
  assert.equal(encolados(), 0, 'y no se manda a una cola que fallaría igual al sincronizar');
});

test('el aviso de esquema dice qué hacer, no que revise la conexión', () => {
  // «Revisa la conexión y Supabase» era lo que se veía con un 23514, y no llevaba a
  // ninguna parte: el problema no era la conexión.
  const browser = createBrowserContext({
    document: { documentElement: { lang: 'es' }, addEventListener() {}, getElementById: () => null },
    localStorage: { getItem: () => null },
    requestAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    window: { __ACOUSTIMAP_CONFIG__: {}, addEventListener() {} }
  });
  browser.load('config.js', 'app.js');
  const aviso = browser.evaluate("sharingText('schemaOutOfDate')");
  assert.ok(aviso && aviso.length > 0, 'el texto existe');
  assert.match(aviso, /migración/i);
  assert.doesNotMatch(aviso, /conexión/i, 'no es un problema de conexión');
});

test('el aviso de migración nombra la versión vigente, no una fija', () => {
  // Con «migración v3» escrito a mano, subir a la v4 dejó el aviso pidiendo una
  // migración ya aplicada mientras la que faltaba no se aplicaba nunca.
  const browser = createBrowserContext({ document: { documentElement: { lang: 'es' }, addEventListener() {}, getElementById: () => null } });
  browser.load('config.js', 'community.js');
  const version = browser.evaluate('MEASUREMENT_VERSION');
  // El aviso del mapa lo escribe `mapDataText()`, no `communityText()`: community.js
  // tiene dos tablas de texto distintas y se confunden con facilidad. Con la
  // equivocada el test pasa por `undefined` y no comprueba nada.
  assert.match(browser.evaluate("mapDataText('missingMethod')"), new RegExp(`migración v${version}\\b`));
});