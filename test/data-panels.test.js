const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

function panelsBrowser() {
  const nodes = new Map();
  const panel = { isConnected: true, dataset: { view: 'compare' },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { textContent: '', hidden: false, dataset: {} });
      return nodes.get(selector);
    } };
  const browser = createBrowserContext({ panel });
  browser.load('config.js', 'features.js');
  return { ...browser, panel, node: selector => panel.querySelector(selector) };
}

test('Comparar: volver a la misma pestaña no acepta una respuesta anterior', async () => {
  for (const rejectOld of [false, true]) {
    const browser = panelsBrowser();
    browser.evaluate(`
      globalThis.pending = [];
      fetchFeatureMeasurements = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
    `);
    const old = browser.evaluate('comparePeriods(panel)');
    const latest = browser.evaluate('comparePeriods(panel)');
    browser.evaluate('pending[2].resolve([{db_level:80}]); pending[3].resolve([{db_level:50}])');
    await latest;
    assert.equal(browser.node('#comparison-current').textContent, 80);
    if (rejectOld) browser.evaluate('pending[0].reject(new Error("error antiguo")); pending[1].resolve([])');
    else browser.evaluate('pending[0].resolve([{db_level:40}]); pending[1].resolve([{db_level:30}])');
    await old;
    assert.equal(browser.node('#comparison-current').textContent, 80);
    assert.equal(browser.evaluate('comparisonRows.current[0].db_level'), 80);
    assert.doesNotMatch(browser.node('.feature-status').textContent, /error antiguo/);
  }
});

test('Tendencia: comparte el promedio energético y representa siete días con huecos', () => {
  const browser = panelsBrowser();
  const series = browser.evaluate(`buildTrendSeries([
    {db_level:50, created_at:'2026-09-26T10:00:00Z'},
    {db_level:80, created_at:'2026-09-26T11:00:00Z'},
    {db_level:60, created_at:'2026-09-24T10:00:00Z'}
  ])`);
  assert.equal(series.length, 7);
  assert.equal(series[6].db, 77);
  assert.equal(series[6].count, 2);
  assert.equal(series[5].db, null);
  assert.equal(series[5].count, 0);
  assert.equal(series[4].db, 60);
  for (const language of ['es', 'en', 'pt']) {
    assert.equal(typeof browser.evaluate(`currentLanguage='${language}'; dataUiText('trend')`), 'string');
  }
});

test('Ranking y capas comparativas: cada zona usa el mismo promedio que el resumen', () => {
  const browser = createBrowserContext();
  browser.load('config.js', 'community.js', 'features.js');
  browser.evaluate(`globalThis.rows = [50,80,60].map(db_level => ({
    latitude:8.75,longitude:-75.88,db_level,created_at:'2026-09-26T15:00:00Z'
  }))`);
  assert.equal(browser.evaluate('aggregatePoints(rows)[0].db'), 75);
  assert.equal(browser.evaluate('aggregatePoints(rows)[0].db'), browser.evaluate('averageDb(rows)'));
  assert.equal(browser.evaluate('aggregatePoints(rows)[0].sampleCount'), 3);
});

test('Retos: obras requieren zonas distintas; basura requiere zonas y días distintos', () => {
  const browser = panelsBrowser();
  assert.equal(browser.evaluate("CHALLENGE_DEFS.find(item => item.key === 'litter-pickup').distinctDays"), true);
  browser.evaluate(`
    globalThis.challengeReports = (positions, days, kind) => positions.map((latitude, index) => ({
      latitude, longitude:-75.88, kind, withPhoto:1, created_at:'2026-09-'+days[index]+'T15:00:00Z'
    }));
    globalThis.progressFor = (rows, kind, distinctDays) => {
      localStorage.setItem(REPORT_CHALLENGE_STORE, JSON.stringify(rows));
      return reportChallengeProgress([{key:'test',type:'report',kind,needsPhoto:kind==='basura',distinctDays}]).get('test');
    };
  `);
  assert.equal(browser.evaluate("progressFor(challengeReports([8.75,8.75,8.75],['24','25','26'],'obra'),'obra',false)"), 1);
  assert.equal(browser.evaluate("progressFor(challengeReports([8.75,8.76],['26','26'],'obra'),'obra',false)"), 2);
  assert.equal(browser.evaluate("progressFor(challengeReports([8.75,8.75,8.75],['24','25','26'],'basura'),'basura',true)"), 1);
  assert.equal(browser.evaluate("progressFor(challengeReports([8.75,8.76,8.77],['26','26','26'],'basura'),'basura',true)"), 1);
  assert.equal(browser.evaluate("progressFor(challengeReports([8.75,8.76,8.77],['24','25','26'],'basura'),'basura',true)"), 3);
  // Tres zonas y tres días en total no bastan si no hay tres pares independientes.
  assert.equal(browser.evaluate("progressFor(challengeReports([8.75,8.75,8.76,8.77],['24','25','26','26'],'basura'),'basura',true)"), 2);
});

test('Comparar: error y vacío ofrecen recuperación sin habilitar mapas inexistentes', async () => {
  const browser = panelsBrowser();
  browser.evaluate('fetchFeatureMeasurements = async () => []');
  await browser.evaluate('comparePeriods(panel)');
  assert.equal(browser.node('.feature-status').dataset.state, 'empty');
  assert.equal(browser.node('.comparison-actions').hidden, true);
  assert.equal(browser.node('.comparison-feedback-actions').hidden, false);
  assert.equal(browser.node('.comparison-retry').disabled, false);
  assert.match(browser.node('.comparison-periods').textContent, /2026-08-27/);
  browser.evaluate('supabaseClient = {}; fetchFeatureMeasurements = async () => {throw new Error("error técnico") }');
  await browser.evaluate('comparePeriods(panel)');
  assert.equal(browser.node('.feature-status').dataset.state, 'error');
  assert.equal(browser.node('.comparison-actions').hidden, true);
  assert.equal(browser.node('.comparison-feedback-actions').hidden, false);
  assert.doesNotMatch(browser.node('.feature-status').textContent, /error técnico/);
});

test('Retos: la acción prepara la categoría o el mapa, sin activar permisos ni enviar', () => {
  const calls = [], kind = { dispatchEvent: () => calls.push('change') };
  const browser = createBrowserContext({
    Event: class {},
    document: { addEventListener() {}, querySelector: () => null,
      getElementById: id => id === 'report-kind' ? kind : { focus: () => calls.push(`focus:${id}`) } },
    switchTab: view => calls.push(view)
  });
  browser.load('config.js', 'features.js');
  browser.context.openStatsTab = view => calls.push(view);
  browser.evaluate("startChallenge('litter-pickup')");
  assert.equal(kind.value, 'basura');
  assert.deepEqual(calls, ['report', 'change', 'focus:report-note']);
  calls.length = 0;
  browser.evaluate("startChallenge('quiet-route')");
  assert.deepEqual(calls, ['map-view', 'focus:btn-toggle']);
});

test('Selección: iniciar otra acción y cancelar no dejan selecciones pendientes', () => {
  const selection = { hidden: true };
  const wrapper = { setAttribute() {}, removeAttribute() {} };
  const browser = createBrowserContext({
    document: { addEventListener() {}, querySelector: () => null,
      getElementById: id => id === 'map-selection' ? selection : id === 'map-view' ? wrapper : null },
    map: { on() {}, getContainer: () => ({ focus() {} }) }, switchTab() {}
  });
  browser.load('config.js', 'features.js');
  browser.evaluate("beginMapSelection('trend'); beginMapSelection('report')");
  assert.equal(browser.evaluate('pendingTrendSelection'), false);
  assert.equal(browser.evaluate('pendingReportSelection'), true);
  assert.equal(selection.hidden, false);
  browser.evaluate('cancelMapSelection()');
  assert.equal(browser.evaluate('pendingMapSelection || pendingTrendSelection || pendingReportSelection'), false);
  assert.equal(selection.hidden, true);
});
