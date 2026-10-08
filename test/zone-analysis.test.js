const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createBrowserContext } = require('./helpers/browser-context');

function source(name) {
  const text = fs.readFileSync(path.join(__dirname, '../js/features.js'), 'utf8');
  const match = text.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} conserva su declaración`);
  return match[0];
}

function browser() {
  const result = createBrowserContext();
  result.load('config.js', 'community.js', 'features.js');
  return result;
}

function selectionChart() {
  const node = () => ({ attributes: {}, classList: { toggle(_key, value) { this.selected = value; } },
    setAttribute(key, value) { this.attributes[key] = value; }, focus() { this.focused = true; } });
  const selected = { date: node(), value: node(), count: node(), plot: node(), crosshair: { style: {} } };
  const buttons = Array.from({ length: 7 }, node), table = Array.from({ length: 7 }, node);
  const dots = [0, 3, 6].map(day => ({ ...node(), dataset: { day: String(day) } }));
  const chart = {
    dataset: {},
    querySelector(selector) {
      return { '.trend-selected-date': selected.date, '.trend-selected-value': selected.value,
        '.trend-selected-count': selected.count, '.trend-plot': selected.plot, '.trend-crosshair': selected.crosshair }[selector];
    },
    querySelectorAll(selector) {
      return { '.trend-day-button': buttons, '.trend-chart-dot': dots, '.trend-table tbody tr': table }[selector];
    }
  };
  return { chart, buttons, table, dots, selected };
}

test('gráfica: eje fijo 30–95 sin amplificar variaciones pequeñas', () => {
  const context = {};
  vm.runInNewContext(source('buildTrendGeometry'), context);
  const geometry = context.buildTrendGeometry([30, 60, 61, 95].map(db => ({ db, count: 1 })));
  assert.equal(geometry.points[0].y, 100);
  assert.equal(geometry.points[3].y, 0);
  assert.ok(Math.abs(geometry.points[1].y - geometry.points[2].y) < 2);
  assert.equal(geometry.segments.length, 3);
});

test('gráfica: los huecos no se convierten en cero ni se unen por líneas', () => {
  const context = {};
  vm.runInNewContext(source('buildTrendGeometry'), context);
  const geometry = context.buildTrendGeometry([
    { db: 60, count: 2 }, { db: 70, count: 1 }, { db: null, count: 0 },
    { db: 80, count: 1 }, { db: null, count: 1 }
  ]);
  assert.equal(geometry.points[2], null);
  assert.equal(geometry.points[4], null);
  assert.equal(geometry.segments.length, 1);
  assert.equal(geometry.segments[0][0].index, 0);
  assert.equal(geometry.segments[0][1].index, 1);
});

test('zona: las tarjetas conservan el promedio energético y cuentan solo las filas recibidas', () => {
  const app = browser();
  const html = app.evaluate(`zoneSummaryHtml([
    { latitude:8.75, longitude:-75.88, db_level:50, created_at:'2026-09-26T10:00:00Z' },
    { latitude:8.76, longitude:-75.88, db_level:80, created_at:'2026-09-26T11:00:00Z' }
  ], new Date('2026-08-27T15:00:00Z'), new Date('2026-09-26T15:00:00Z'))`);
  assert.match(html, /data-zone-metric="average">77</);
  assert.match(html, /data-zone-metric="readings">2</);
  assert.match(html, /data-zone-metric="zones">2</);
  assert.match(html, /Resumen de 30 días/);
  assert.match(html, /UTC/);
});

test('zona vacía: cero aportes no se presenta como promedio cero', () => {
  const app = browser();
  const html = app.evaluate('zoneSummaryHtml([], new Date(), new Date())');
  assert.match(html, /data-zone-metric="average">—</);
  assert.match(html, /data-zone-metric="readings">0</);
  assert.match(html, /data-zone-metric="zones">0</);
});

test('gráfica: coordenadas de ratón/tacto se adaptan al ancho y quedan dentro de siete días', () => {
  const context = {};
  vm.runInNewContext(source('trendIndexFromPointer'), context);
  assert.equal(context.trendIndexFromPointer(90, 100, 600), 0);
  assert.equal(context.trendIndexFromPointer(400, 100, 600), 3);
  assert.equal(context.trendIndexFromPointer(800, 100, 600), 6);
  assert.equal(context.trendIndexFromPointer(200, 100, 200), 3);
  assert.equal(context.trendIndexFromPointer(200, 100, 0), 6);
});

test('selección diaria: lectura, cursor, tabla y controles accesibles se sincronizan', () => {
  const app = browser();
  const fake = selectionChart();
  app.context.chart = fake.chart;
  app.evaluate(`globalThis.series = buildTrendSeries([
    { db_level:60, created_at:'2026-09-23T10:00:00Z' }
  ]); selectTrendDay(chart, series, 3, true);`);
  assert.equal(fake.selected.value.textContent, '60');
  assert.equal(fake.selected.count.textContent, 'Mediciones: 1');
  assert.equal(fake.selected.plot.attributes['aria-valuenow'], '4');
  assert.match(fake.selected.plot.attributes['aria-valuetext'], /60.*Mediciones: 1/);
  assert.equal(fake.selected.crosshair.style.left, '50%');
  assert.equal(fake.buttons[3].attributes['aria-pressed'], 'true');
  assert.equal(fake.buttons.filter(button => button.tabIndex === 0).length, 1);
  assert.equal(fake.buttons[3].focused, true);
  assert.equal(fake.table[3].classList.selected, true);
  assert.equal(fake.dots[1].classList.selected, true);
});

test('selección diaria: un día vacío anuncia la ausencia, no 0 dB', () => {
  const app = browser();
  const fake = selectionChart();
  app.context.chart = fake.chart;
  app.evaluate(`selectTrendDay(chart, buildTrendSeries([]), 5);`);
  assert.equal(fake.selected.value.textContent, 'Sin mediciones');
  assert.equal(fake.selected.count.textContent, 'Mediciones: 0');
  assert.doesNotMatch(fake.selected.plot.attributes['aria-valuetext'], /0 dB/);
  assert.equal(fake.dots.some(dot => dot.classList.selected), false);
});

test('zona y tendencia: fechas UTC y mensajes disponibles en es/en/pt', () => {
  const app = browser();
  for (const language of ['es', 'en', 'pt']) {
    app.evaluate(`currentLanguage = '${language}'`);
    for (const key of ['polygonScope', 'backMap', 'summaryTitle', 'average', 'readings', 'zones',
      'relative', 'method', 'trendTitle', 'trendPeriod', 'trendHelp', 'explore', 'chooseDay', 'table', 'gaps', 'axis']) {
      assert.equal(typeof app.evaluate(`zoneUiText('${key}')`), 'string');
    }
    assert.match(app.evaluate(`formatTrendDate('2026-10-07T03:00:00Z')`), /7/);
    assert.match(app.evaluate(`trendReadingText({date:'2026-10-07',db:null,count:0})`), /UTC/);
  }
});

test('tendencia: respuesta o error anteriores no reemplazan la zona más reciente', async () => {
  for (const rejectOld of [false, true]) {
    const target = { isConnected: true, parentElement: {}, classList: { remove() {} }, setAttribute() {} };
    const pending = [], rendered = [];
    const context = {
      Date, Math,
      document: { getElementById: () => target }, supabaseClient: {},
      snapToGrid: (lat, lng) => ({ lat, lng }), haversineDistance: () => 0,
      fetchFeatureMeasurements: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
      renderTrendChart: (_, rows) => rendered.push(rows), m: key => key
    };
    vm.runInNewContext(source('loadZoneTrend'), context);
    const old = context.loadZoneTrend({ lat: 8.75, lng: -75.88 });
    const latest = context.loadZoneTrend({ lat: 8.76, lng: -75.88 });
    pending[1].resolve([{ db_level: 80 }]);
    await latest;
    if (rejectOld) pending[0].reject(new Error('error anterior'));
    else pending[0].resolve([{ db_level: 40 }]);
    await old;
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0][0].db_level, 80);
    assert.notEqual(target.textContent, 'trendError');
  }
});

test('zona: una respuesta tardía de otro polígono no sobrescribe las tarjetas', async () => {
  const pending = [], rendered = [];
  let nodes;
  const panel = {
    dataset: { view: 'stats' },
    set innerHTML(_value) {
      const button = () => ({ addEventListener() {} });
      nodes = {
        '#zone-trend': {}, '.zone-analysis-status': { dataset: {}, setAttribute() {} },
        '.zone-back-map': button(), '.zone-analysis-retry': button(), '.zone-analysis-summary': {}
      };
    },
    querySelector: selector => nodes[selector] || null
  };
  const context = {
    Date, console: { error() {} },
    switchTab() {}, openStatsTab() {},
    document: { querySelectorAll: () => [], getElementById: () => panel },
    t: key => key, zoneUiText: key => key, dataUiText: key => key,
    panelFrame: (_title, html) => html, closeFeaturePanel() {},
    fetchFeatureMeasurements: () => new Promise(resolve => pending.push(resolve)),
    pointInPolygon: () => true, panelIsCurrent: () => true,
    zoneSummaryHtml: rows => String(rows[0].db_level),
    renderTrendChart: (_, rows) => rendered.push(rows), supabaseClient: {}
  };
  vm.runInNewContext(source('analyzeDrawnZone'), context);
  const old = context.analyzeDrawnZone([]);
  const latest = context.analyzeDrawnZone([]);
  pending[1]([{ db_level: 80 }]); await latest;
  pending[0]([{ db_level: 40 }]); await old;
  assert.equal(nodes['.zone-analysis-summary'].innerHTML, '80');
  assert.equal(rendered.length, 1);
});

test('tendencia sin conexión: cancela la consulta anterior y retira el estado ocupado', async () => {
  let release;
  const target = { isConnected: true, parentElement: {}, attributes: {},
    classList: { remove() {} }, setAttribute(key, value) { this.attributes[key] = value; } };
  const context = {
    Date, document: { getElementById: () => target }, supabaseClient: {},
    snapToGrid: (lat, lng) => ({ lat, lng }),
    fetchFeatureMeasurements: () => new Promise(resolve => { release = resolve; }),
    m: key => key, noDataMessage: () => 'Sin conexión',
    renderTrendChart: () => assert.fail('Una respuesta anterior no puede reemplazar la desconexión')
  };
  vm.runInNewContext(source('loadZoneTrend'), context);
  const old = context.loadZoneTrend({ lat: 8.75, lng: -75.88 });
  context.supabaseClient = null;
  await context.loadZoneTrend({ lat: 8.75, lng: -75.88 });
  release([]); await old;
  assert.equal(target.attributes['aria-busy'], 'false');
  assert.equal(target.textContent, 'Sin conexión');
});
