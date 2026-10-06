const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/map.js'), 'utf8');
const match = source.match(/function buildRelativeHeatRaster\([^]*?\n\}/);
assert.ok(match);
const context = vm.createContext({});
vm.runInContext(`${match[0]}\nthis.raster = buildRelativeHeatRaster;`, context);
const gradient = new Uint8ClampedArray(1024);
for (let index = 0; index < 256; index++) gradient.set([index, index, index, 255], index * 4);
const normalize = index => (index - 30) / 65;
const render = (points, previous = null) => context.raster(20, 20, points, 7, gradient, previous);
const pixel = (raster, x = 10, y = 10) => Array.from(raster.pixels.slice((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 4));

test('calor relativo: repetir veinte celdas bajas no las convierte en altas', () => {
  const point = [10, 10, normalize(40)];
  const single = render([point]);
  const dense = render(Array.from({ length: 20 }, () => point));
  assert.deepEqual(pixel(single), pixel(dense));
  assert.equal(pixel(dense)[0], 39, 'color del índice 40, no 255 por densidad');
  assert.equal(pixel(dense)[3], 180, 'la opacidad tampoco se suma');
});

test('calor relativo: celdas próximas conservan el valor común al superponer halos', () => {
  const raster = render(Array.from({ length: 20 }, (_, index) => [9 + index / 20, 10, normalize(40)]));
  assert.equal(pixel(raster)[0], 39);
  assert.ok(raster.values[210] / raster.weights[210] < 0.16);
});

test('calor relativo: dos valores se promedian espacialmente, no se suman', () => {
  const raster = render([[10, 10, normalize(40)], [10, 10, normalize(90)]]);
  assert.ok(Math.abs(raster.values[210] / raster.weights[210] - normalize(65)) < 1e-6);
  assert.equal(pixel(raster)[0], Math.round(normalize(65) * 255));
});

test('calor relativo: el borde desvanece cobertura, no cambia un índice alto a bajo', () => {
  const raster = render([[10, 10, normalize(90)]]);
  assert.equal(pixel(raster, 14, 10)[0], pixel(raster)[0]);
  assert.ok(pixel(raster, 14, 10)[3] < pixel(raster)[3]);
  assert.deepEqual(pixel(raster, 0, 0), [0, 0, 0, 0]);
});

test('calor relativo: reutilizar o cambiar de tamaño elimina el conjunto anterior', () => {
  const first = render([[10, 10, 1]]);
  const empty = render([], first);
  assert.equal(empty, first);
  assert.deepEqual(pixel(empty), [0, 0, 0, 0]);
  const resized = context.raster(10, 10, [], 7, gradient, empty);
  assert.notEqual(resized, empty);
  assert.equal(resized.pixels.length, 400);
});

test('calor relativo: valores inválidos y celdas fuera de vista no pintan el mapa', () => {
  const raster = render([[NaN, 10, 1], [10, 10, Infinity], [10, 10, -1], [1000, 1000, 1]]);
  assert.ok(raster.pixels.every(value => value === 0));
});
