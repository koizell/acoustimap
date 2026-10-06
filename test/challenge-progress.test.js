const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

function measurement(created_at, latitude = 8.75) {
  return {
    latitude,
    longitude: -75.88,
    db_level: 60,
    created_at
  };
}

async function nightCount(rows) {
  const items = [];
  const browser = createBrowserContext({
    document: {
      documentElement: { lang: 'es' },
      addEventListener() {},
      getElementById: () => null,
      createElement: () => ({
        innerHTML: '',
        style: { setProperty() {} },
        classList: { add() {} }
      })
    }
  });

  browser.load('config.js', 'features.js');
  browser.context.rows = rows;
  browser.evaluate('localStorage.setItem(CHALLENGE_STORE, JSON.stringify(rows))');
  browser.context.list = {
    innerHTML: '',
    appendChild(item) { items.push(item); }
  };

  await browser.evaluate(`
    loadChallengeProgress(list, [{
      key: 'night-cover',
      title: 'Cobertura nocturna',
      detail: '',
      target: 3
    }])
  `);

  assert.equal(items.length, 1, 'debe renderizar el reto nocturno');
  const count = items[0].innerHTML.match(/class="challenge-count">(\d+)\/3</);
  assert.ok(count, 'debe mostrar el contador del reto');
  return Number(count[1]);
}

test('repetir lecturas nocturnas en una zona y día cuenta una sola vez', async () => {
  const count = await nightCount([
    measurement('2026-09-25T23:00:00Z'),
    measurement('2026-09-25T23:10:00Z'),
    measurement('2026-09-25T23:20:00Z')
  ]);
  assert.equal(count, 1);
});

test('otra zona o día aporta progreso nocturno adicional', async () => {
  const count = await nightCount([
    measurement('2026-09-24T23:00:00Z'),
    measurement('2026-09-25T23:00:00Z'),
    measurement('2026-09-25T23:00:00Z', 8.76)
  ]);
  assert.equal(count, 3);
});

test('cruzar medianoche UTC no cambia el día de Colombia', async () => {
  const count = await nightCount([
    // Ambos instantes corresponden al 25 de septiembre en Colombia.
    measurement('2026-09-25T23:00:00Z'),
    measurement('2026-09-26T04:00:00Z')
  ]);
  assert.equal(count, 1);
});

test('las lecturas diurnas y las anteriores a 30 días no cuentan', async () => {
  const count = await nightCount([
    // 10:00 en Colombia: fuera de la franja nocturna.
    measurement('2026-09-25T15:00:00Z'),
    // Nocturna, pero fuera de la ventana del almacenamiento local.
    measurement('2026-08-01T23:00:00Z')
  ]);
  assert.equal(count, 0);
});
