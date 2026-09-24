const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
const context = {
  window: { __ACOUSTIMAP_CONFIG__: {} },
  console: { log() {}, warn() {}, error() {} },
  navigator: {},
  Math,
  Date
};
vm.runInNewContext(`${source}\nthis.testApi = { classifyDb, snapToGrid, haversineDistance, normalizeDbForHeatmap };`, context);
const communitySource = fs.readFileSync(path.join(__dirname, '..', 'js', 'community.js'), 'utf8');
const timeFilterSource = communitySource.match(/function getTimeFilterRange\(filter\) \{[\s\S]*?\n\}/)[0];
const timeContext = { Date };
vm.runInNewContext(`${timeFilterSource}\nthis.getTimeFilterRange = getTimeFilterRange;`, timeContext);

test('clasifica los límites de ruido sin solaparlos', () => {
  const { classifyDb } = context.testApi;
  assert.equal(classifyDb(54), 'bajo');
  assert.equal(classifyDb(55), 'moderado');
  assert.equal(classifyDb(70), 'moderado');
  assert.equal(classifyDb(71), 'alto');
});

test('ancla coordenadas a una celda de aproximadamente 70 m', () => {
  const { snapToGrid, haversineDistance } = context.testApi;
  const origin = { lat: 8.75, lng: -75.88 };
  const snapped = snapToGrid(origin.lat, origin.lng);
  assert.ok(haversineDistance(origin.lat, origin.lng, snapped.lat, snapped.lng) <= 55);
  assert.ok(snapped.lat >= 8.74 && snapped.lat <= 8.76);
  assert.ok(snapped.lng >= -75.89 && snapped.lng <= -75.87);
});

test('normaliza el heatmap dentro del rango permitido', () => {
  const { normalizeDbForHeatmap } = context.testApi;
  assert.equal(normalizeDbForHeatmap(0), 0.05);
  assert.equal(normalizeDbForHeatmap(100), 1);
  assert.equal(normalizeDbForHeatmap(200), 1);
});

test('los filtros horarios devuelven intervalos completos y el nocturno cruza medianoche', () => {
  const { getTimeFilterRange } = timeContext;
  assert.equal(getTimeFilterRange('all'), null);
  const morning = getTimeFilterRange('morning');
  assert.equal(new Date(morning.end) - new Date(morning.start), 6 * 60 * 60 * 1000);
  assert.equal(new Date(morning.start).getHours(), 6);
  const night = getTimeFilterRange('night');
  assert.equal(new Date(night.end) - new Date(night.start), 12 * 60 * 60 * 1000);
  assert.equal(new Date(night.start).getHours(), 18);
  assert.equal(new Date(night.end).getHours(), 6);
});
