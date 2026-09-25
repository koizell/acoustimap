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

test('leaving the map detaches heat canvases before the map is hidden', () => {
  const attached = new Set();
  let mapVisible = true;
  const mapView = {
    classList: {
      remove() {
        assert.equal(attached.size, 0, 'heat layers must be detached before hiding the map');
        mapVisible = false;
      },
      add() { mapVisible = true; }
    }
  };
  const statsView = { classList: { remove() {}, add() {} } };
  const context = {
    document: {
      querySelectorAll: (selector) => selector === '.tab-content' ? [mapView, statsView] : [],
      getElementById: (id) => id === 'map-view' ? mapView : statsView
    },
    map: {
      hasLayer: (layer) => attached.has(layer),
      removeLayer: (layer) => attached.delete(layer)
    },
    setTimeout: (fn) => fn(),
    invalidateMapIfVisible: () => assert.equal(mapVisible, true),
    activateComparisonLayer: () => {},
    loadCommunityPoints: () => {}
  };
  vm.runInNewContext(`let communityHeatLayer = { name: 'community' };
let comparisonLayer = { name: 'previous' };
let currentComparisonLayer = { name: 'current' };
this.layers = [communityHeatLayer, comparisonLayer, currentComparisonLayer];
${functionSource('map.js', 'suspendMapHeatLayers')}
${functionSource('app.js', 'switchTab')}
this.run = switchTab;`, context);
  // Use the layers created in the VM, as those are the ones the functions see.
  attached.clear();
  context.layers.forEach((layer) => attached.add(layer));
  context.run('stats-view');
  assert.equal(attached.size, 0);
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

test('map period control selects history or live data and refreshes once', () => {
  const buttons = ['history', 'live'].map((mode) => ({
    id: `mode-${mode}`,
    classList: { active: false, toggle(_name, active) { this.active = active; } },
    setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; }
  }));
  let refreshes = 0;
  const context = {
    mapMode: 'history',
    document: { querySelectorAll: () => buttons },
    loadCommunityPoints: () => { refreshes++; }
  };
  vm.runInNewContext(`${functionSource('community.js', 'setMapMode')}\nthis.run = setMapMode;`, context);
  context.run('live');
  assert.equal(context.mapMode, 'live');
  assert.equal(buttons[0].pressed, 'false');
  assert.equal(buttons[1].pressed, 'true');
  assert.equal(refreshes, 1);
  context.run('invalid');
  assert.equal(context.mapMode, 'live');
  assert.equal(refreshes, 1);
});
