const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/features.js'), 'utf8');
const configure = source.match(/async function configureServiceWorker\([^]*?\n\}/)[0];

test('PWA local: retira solo su registro y cachés, sin borrar datos offline ni otros proyectos', async () => {
  const deleted = [], removed = [];
  let reloads = 0;
  const context = {
    URL, console: { log() {} },
    window: { location: { hostname: 'localhost', href: 'http://localhost:3000/acoustimap/', reload() { reloads++; } },
      caches: { keys: async () => ['acoustimap-shell-v42', 'another-app'], delete: async key => deleted.push(key) } },
    navigator: { serviceWorker: { controller: {},
      register: () => assert.fail('no instalar PWA local'),
      getRegistrations: async () => [
        { scope: 'http://localhost:3000/acoustimap/', active: { scriptURL: 'http://localhost:3000/acoustimap/sw.js' }, unregister: async () => { removed.push('own'); return true; } },
        { scope: 'http://localhost:3000/another/', active: { scriptURL: 'http://localhost:3000/another/sw.js' }, unregister: () => assert.fail('registro ajeno') }
      ] } }
  };
  vm.runInNewContext(`${configure}\nthis.run = configureServiceWorker;`, context);
  await context.run();
  assert.deepEqual(deleted, ['acoustimap-shell-v42']);
  assert.deepEqual(removed, ['own']);
  assert.equal(reloads, 1);
});

test('PWA publicada: registra una vez y conserva la actualización del controlador', async () => {
  const registrations = [], events = new Map();
  let reloads = 0;
  const context = {
    window: { location: { hostname: 'koizell.github.io', reload: () => { reloads++; } } },
    navigator: { serviceWorker: {
      addEventListener: (name, handler) => events.set(name, handler),
      register: async (...args) => registrations.push(args)
    } }
  };
  vm.runInNewContext(`${configure}\nthis.run = configureServiceWorker;`, context);
  await context.run();
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0][0], './sw.js');
  events.get('controllerchange')(); events.get('controllerchange')();
  assert.equal(reloads, 1);
});

test('PWA: configuración de red sustituye caché antigua y placeholders nunca se almacenan', async () => {
  const handlers = new Map(), entries = new Map();
  const request = new Request('https://fixture.test/js/config.local.js?v=44');
  entries.set(request.url, new Response('old-placeholder'));
  const cache = {
    put: async (key, response) => entries.set(key.url, response),
    match: async key => entries.get(key.url)?.clone(),
    delete: async key => entries.delete(key.url)
  };
  let offline = false, placeholder = false;
  const context = {
    URL, Response,
    self: { location: { origin: 'https://fixture.test' }, addEventListener: (name, handler) => handlers.set(name, handler) },
    caches: { open: async () => cache },
    fetch: async (_, options) => {
      assert.equal(options.cache, 'no-store');
      if (offline) throw new Error('offline');
      return new Response(placeholder ? 'window.__ACOUSTIMAP_CONFIG__ = { SUPABASE_URL: "https://TU-PROYECTO.supabase.co" };'
        : 'window.__ACOUSTIMAP_CONFIG__ = { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_ANON_KEY: "public-fixture" };');
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
  async function requestConfig() {
    let pending;
    handlers.get('fetch')({ request, respondWith: promise => { pending = promise; } });
    return pending;
  }
  assert.match(await (await requestConfig()).text(), /public-fixture/);
  offline = true;
  assert.match(await (await requestConfig()).text(), /public-fixture/);
  offline = false; placeholder = true;
  await requestConfig();
  assert.equal(entries.size, 0);
  offline = true;
  assert.equal((await requestConfig()).type, 'error');
});
