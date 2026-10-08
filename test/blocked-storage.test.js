const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowserContext } = require('./helpers/browser-context');

test('comunidad: carga completa y traducciones funcionan si getItem lanza SecurityError', () => {
  const browser = createBrowserContext({
    localStorage: { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } },
    document: { documentElement: { lang: 'en' }, getElementById: () => null, addEventListener() {} },
    map: { on() {} }, setInterval() {}
  });
  browser.load('config.js');
  assert.doesNotThrow(() => browser.load('community.js'));
  assert.equal(browser.evaluate('communityText("index")'), 'Index');
  assert.equal(browser.evaluate('communityInteractionText("details")'), 'View area details');
});
