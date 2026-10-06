const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBrowserContext } = require('./helpers/browser-context');

function element() {
  return {
    textContent: '', innerHTML: '', hidden: false, dataset: {}, children: [], attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
    addEventListener() {}
  };
}

function summaryBrowser({ rows = [], error = null, connected = true } = {}) {
  const nodes = new Map();
  const panel = {
    ...element(), isConnected: true, dataset: { view: 'stats', subview: 'overview' },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    }
  };
  const queries = [];
  const browser = createBrowserContext({
    panel,
    document: {
      documentElement: { lang: 'es' }, addEventListener() {},
      getElementById: () => null, createElement: element
    },
    client: { from(table) {
      const query = { table, filters: [] }; queries.push(query);
      const chain = {
        select() { return this; }, order() { return this; },
        eq(key, value) { query.filters.push([key, value]); return this; },
        range() { return this; }, gte() { return this; }, lt() { return this; },
        then(resolve, reject) { return Promise.resolve({ data: rows, error }).then(resolve, reject); }
      };
      return chain;
    } }
  });
  browser.load('config.js', 'community.js', 'features.js');
  if (connected) browser.evaluate('supabaseClient = client');
  return { ...browser, panel, queries, node: (selector) => panel.querySelector(selector) };
}

test('resumen: la carga comunica actividad sin ceros ni rankings vacíos', () => {
  const browser = summaryBrowser();
  browser.evaluate("updateSummaryState(panel, 'loading')");
  assert.equal(browser.node('.summary-metrics').attributes['aria-busy'], 'true');
  assert.equal(browser.node('#metric-total').textContent, '--');
  assert.equal(browser.node('.summary-results').hidden, true);
  assert.equal(browser.node('.summary-state-actions').hidden, true);
});

test('resumen: cero aportes no se presenta como cero ruido ni ausencia de alertas', async () => {
  const browser = summaryBrowser();
  await browser.evaluate('loadStats(panel)');
  assert.equal(browser.node('.summary-overview').dataset.state, 'empty');
  assert.equal(browser.node('#metric-total').textContent, '0');
  assert.equal(browser.node('#metric-average').textContent, '--');
  assert.equal(browser.node('#metric-high').textContent, '--');
  assert.equal(browser.node('.summary-results').hidden, true);
  assert.equal(browser.node('#alerts-list').innerHTML, '');
  assert.equal(browser.node('#summary-state-action').textContent, 'Ir al mapa');
});

test('resumen: sin backend y error de red son estados distintos, sin HTML del servidor', async () => {
  for (const connected of [false, true]) {
    const browser = summaryBrowser({ connected, error: new Error('<img src=x onerror=alert(1)>') });
    await browser.evaluate('loadStats(panel)');
    assert.equal(browser.node('.summary-overview').dataset.state, connected ? 'error' : 'disconnected');
    assert.equal(browser.node('#metric-total').textContent, '--');
    assert.equal(browser.node('.summary-results').hidden, true);
    assert.equal(browser.node('#summary-state-action').textContent, connected ? 'Reintentar' : 'Ir al mapa');
    assert.doesNotMatch(browser.node('#summary-state-title').textContent, /<img/);
  }
});

test('resumen: conserva promedios, umbral >70, método vigente y acciones de rankings', async () => {
  const rows = [50, 60, 70, 80].map((db_level, index) => ({
    latitude: 8.75, longitude: -75.88, db_level,
    created_at: `2026-09-${25 - index}T15:00:00Z`
  }));
  const browser = summaryBrowser({ rows });
  await browser.evaluate('loadStats(panel)');
  assert.equal(browser.node('.summary-overview').dataset.state, 'ready');
  assert.equal(browser.node('.summary-results').hidden, false);
  assert.equal(browser.node('.summary-metrics').attributes['aria-busy'], 'false');
  assert.equal(browser.node('#metric-total').textContent, 4);
  // 50, 60, 70 y 80 dB. La media aritmética daba 65 y la de energía da 74: nueve
  // decibelios de diferencia en cuatro lecturas. Ese 65 era el bug —decía que una
  // calle con picos de 80 dB estaba a 65— y por eso el valor esperado es 74, no un
  // redondeo.
  assert.equal(browser.node('#metric-average').textContent, 74);
  assert.equal(browser.node('#metric-high').textContent, 1);
  assert.deepEqual(browser.queries[0].filters, [['measurement_version', 5]]);
  assert.equal(browser.node('#loudest-list').children.length, 1);
  assert.equal(browser.node('#quietest-list').children.length, 1);
  assert.equal(browser.node('#summary-state-title').textContent, '1 zona analizada');
});

test('resumen: copy disponible en es/en/pt y controles secundarios plegados', () => {
  const browser = summaryBrowser();
  for (const language of ['es', 'en', 'pt']) {
    browser.evaluate(`document.documentElement.lang = '${language}'`);
    for (const key of ['scope', 'emptyTitle', 'emptyHint', 'errorTitle', 'retry', 'community', 'reports']) {
      assert.equal(typeof browser.evaluate(`summaryText('${key}')`), 'string');
    }
  }
  const source = fs.readFileSync(path.join(__dirname, '../js/features.js'), 'utf8');
  assert.match(source, /<details class="summary-alerts"><summary>/);
  assert.match(source, /<details class="summary-reports"><summary>/);
  assert.doesNotMatch(source, /<details class="summary-(?:alerts|reports)" open/);
  assert.match(source, /class="summary-feedback" role="status" aria-live="polite"/);
});
