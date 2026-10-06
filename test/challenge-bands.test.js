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
  `${source}\nthis.api = { CO_TIME_BANDS, coHour, coDayKey, inCoTimeBand };`,
  context
);
const { CO_TIME_BANDS, coHour, coDayKey, inCoTimeBand } = context.api;

/** Construye un instante UTC que en Colombia cae en la hora dada. */
const utcParaCoHour = (hour) =>
  `2026-09-26T${String((hour + 5) % 24).padStart(2, '0')}:00:00.000Z`;

test('la hora del reto es la de Colombia, no la del dispositivo', () => {
  // 15:00 UTC son las 10:00 en Colombia. Con getHours() un navegador en otra
  // zona habría contado otra cosa, y el mapa nunca habría coincidido con el reto.
  assert.equal(coHour('2026-09-26T15:00:00.000Z'), 10);
  // De madrugada el día local puede ser el anterior: por eso existe coDayKey.
  assert.equal(coHour('2026-09-26T02:00:00.000Z'), 21);
  assert.equal(coDayKey('2026-09-26T02:00:00.000Z'), '2026-09-25');
  assert.equal(coDayKey('2026-09-26T15:00:00.000Z'), '2026-09-26');
  assert.equal(coHour('no es una fecha'), null);
  assert.equal(coDayKey('no es una fecha'), null);
});

test('las franjas del cliente cubren las mismas horas que las del SQL', () => {
  // El servidor decide con extract(hour from created_at at time zone
  // 'America/Bogota'). Si alguien cambia un corte en SQL y no en config.js, el
  // mapa y los retos empiezan a discrepar y nada más lo nota.
  const sql = fs.readFileSync(
    path.join(root, 'migrations', '20261005_audio_measurement_v2.sql'), 'utf8');

  const morning = sql.match(/p_time_filter = 'morning'[\s\S]{0,200}?between (\d+) and (\d+)/);
  const afternoon = sql.match(/p_time_filter = 'afternoon'[\s\S]{0,200}?between (\d+) and (\d+)/);
  const night = sql.match(/p_time_filter = 'night'[\s\S]{0,300}?>= (\d+)[\s\S]{0,120}?< (\d+)/);
  assert.ok(morning && afternoon && night, 'no se encontraron las tres franjas en el SQL');

  // BETWEEN incluye ambos extremos; el cliente usa un límite superior exclusivo.
  // Comparamos el comportamiento, no los números de las dos representaciones.
  const sqlEntre = (hora, desde, hasta) => hora >= desde && hora <= hasta;
  const sqlNoche = (hora, desde, hasta) => hora >= desde || hora < hasta;

  for (let hora = 0; hora < 24; hora += 1) {
    const instante = utcParaCoHour(hora);
    assert.equal(
      inCoTimeBand(instante, 'morning'),
      sqlEntre(hora, Number(morning[1]), Number(morning[2])),
      `la franja morning no coincide a las ${hora}:00`);
    assert.equal(
      inCoTimeBand(instante, 'afternoon'),
      sqlEntre(hora, Number(afternoon[1]), Number(afternoon[2])),
      `la franja afternoon no coincide a las ${hora}:00`);
    assert.equal(
      inCoTimeBand(instante, 'night'),
      sqlNoche(hora, Number(night[1]), Number(night[2])),
      `la franja night no coincide a las ${hora}:00`);
  }
});

test('las tres franjas reparten las 24 horas sin huecos ni solapes', () => {
  const franjas = ['morning', 'afternoon', 'night'];
  for (let hora = 0; hora < 24; hora += 1) {
    const instante = utcParaCoHour(hora);
    const cuantas = franjas.filter((franja) => inCoTimeBand(instante, franja)).length;
    assert.equal(cuantas, 1, `las ${hora}:00 deben pertenecer a una sola franja`);
  }
});

test('la noche cubre las dos madrugadas', () => {
  assert.equal(inCoTimeBand(utcParaCoHour(18), 'night'), true);
  assert.equal(inCoTimeBand(utcParaCoHour(23), 'night'), true);
  assert.equal(inCoTimeBand(utcParaCoHour(0), 'night'), true);
  assert.equal(inCoTimeBand(utcParaCoHour(5), 'night'), true);
  assert.equal(inCoTimeBand(utcParaCoHour(6), 'night'), false);
  assert.equal(inCoTimeBand(utcParaCoHour(17), 'night'), false);
  assert.equal(inCoTimeBand(utcParaCoHour(11), 'morning'), true);
  assert.equal(inCoTimeBand(utcParaCoHour(12), 'morning'), false);
  assert.equal(inCoTimeBand(utcParaCoHour(12), 'afternoon'), true);
  assert.equal(inCoTimeBand('no es una fecha', 'night'), false);
  assert.equal(inCoTimeBand('2026-09-26T15:00:00.000Z', 'no-existe'), false);
});

test('la hora punta es una sub-ventana de la mañana, no una franja nueva', () => {
  // Si algún día "morning" deja de cubrir las 7:00, el reto de hora punta
  // quedaría fuera de la franja que el mapa llama mañana, y habría que
  // replantearlo en lugar de dejar dos horarios sin relación.
  assert.ok(CO_TIME_BANDS.morning.from <= 7, 'la franja mañana debe empezar a las 7 o antes');
  assert.ok(9 <= CO_TIME_BANDS.morning.to, 'la franja mañana debe terminar a las 9 o después');
});
