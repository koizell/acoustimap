const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function functionSource(file, name) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
}

test('hidden or zero-size map does not invalidate the heat canvas', () => {
  let invalidations = 0;
  const mapEl = { offsetWidth: 0, offsetHeight: 600 };
  const mapView = { classList: { contains: () => true } };
  const context = {
    document: { getElementById: (id) => id === 'map' ? mapEl : mapView },
    map: { invalidateSize: () => { invalidations++; } }
  };
  vm.runInNewContext(`${functionSource('map.js', 'invalidateMapIfVisible')}\nthis.run = invalidateMapIfVisible;`, context);
  context.run();
  assert.equal(invalidations, 0);
  mapEl.offsetWidth = 400;
  context.run();
  assert.equal(invalidations, 1);
});

test('late statistics response cannot write into the replaced zone panel', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const panel = {
    isConnected: true,
    dataset: { view: 'stats', subview: 'overview' },
    querySelector: () => null
  };
  const errors = [];
  const context = {
    Date,
    panelIsCurrent: (node, view) => node.isConnected && node.dataset.view === view,
    fetchFeatureMeasurements: () => pending,
    aggregatePoints: () => { throw new Error('stale response continued'); },
    console: { error: (error) => errors.push(error) }
  };
  vm.runInNewContext(`${functionSource('features.js', 'loadStats')}\nthis.run = loadStats;`, context);
  const task = context.run(panel);
  panel.dataset.subview = 'zone';
  release([{ latitude: 8.75, longitude: -75.88, db_level: 55, created_at: new Date().toISOString() }]);
  await task;
  assert.equal(errors.length, 0);
});

test('comparison keeps map actions hidden when one period has no measurements', async () => {
  const status = { textContent: '' };
  const actions = { hidden: true, removeAttribute(name) { if (name === 'hidden') this.hidden = false; } };
  const panel = { querySelector: (selector) => selector === '.feature-status' ? status : actions };
  const context = {
    Date,
    Promise,
    fetchFeatureMeasurements: async () => [],
    averageDb: (rows) => rows.length ? 55 : null,
    panelIsCurrent: () => true,
    comparisonRows: {},
    noDataMessage: () => 'Faltan mediciones',
    t: (key) => key,
    console
  };
  vm.runInNewContext(`${functionSource('features.js', 'comparePeriods')}\nthis.run = comparePeriods;`, context);
  await context.run(panel);
  assert.match(status.textContent, /^Faltan mediciones/);
  assert.equal(actions.hidden, true);
});
