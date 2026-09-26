const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..', '..');

/**
 * Ejecuta los scripts clásicos completos con reloj y almacenamiento aislados.
 * Los dobles sustituyen solo las fronteras del navegador/red. No emulan Leaflet,
 * permisos, layout ni IndexedDB: esas comprobaciones requieren un navegador.
 */
function createBrowserContext(overrides = {}) {
  const now = Date.parse('2026-09-26T15:00:00.000Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const storage = new Map();
  const messages = [];
  const context = vm.createContext({
    Date: FixedDate,
    TextEncoder,
    crypto: webcrypto,
    navigator: { onLine: true },
    window: { __ACOUSTIMAP_CONFIG__: {}, addEventListener() {} },
    document: {
      documentElement: { lang: 'es' },
      addEventListener() {},
      getElementById: () => null
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    console: Object.fromEntries(['log', 'warn', 'error'].map((level) => [
      level, (...args) => messages.push({ level, args })
    ])),
    setInterval() {},
    clearInterval() {},
    map: { on() {} },
    ...overrides
  });
  return {
    context, storage, messages,
    load(...files) {
      for (const file of files) {
        const filename = path.join(projectRoot, 'js', file);
        vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
      }
    },
    evaluate(source) { return vm.runInContext(source, context); }
  };
}

module.exports = { createBrowserContext };
