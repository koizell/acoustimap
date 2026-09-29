const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssDir = path.join(root, 'css');

const hojas = fs.readdirSync(cssDir)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => ({ name, texto: fs.readFileSync(path.join(cssDir, name), 'utf8') }));

const indice = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const manifiesto = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

test('ninguna hoja usa transition: all', () => {
  // transition: all anima tambien el layout y dispara transiciones que el
  // navegador no puede componer en el hilo principal. Se sustituyo por listas
  // explicitas el 2026-09-29 en layout.css, map.css y panel.css.
  const infractores = [];
  for (const { name, texto } of hojas) {
    const lineas = texto.split('\n');
    lineas.forEach((linea, indiceLinea) => {
      if (/transition\s*:\s*all\b/i.test(linea)) {
        infractores.push(`${name}:${indiceLinea + 1}  ${linea.trim()}`);
      }
    });
  }
  assert.deepEqual(infractores, [], 'declaraciones transition: all restantes');
});

test('el tema oscuro declara color-scheme en la raiz', () => {
  // El tema se activa con una clase en body, no con la preferencia del sistema,
  // asi que sin esto la barra de desplazamiento y los controles nativos se
  // quedan en claro sobre un fondo oscuro.
  const base = hojas.find((hoja) => hoja.name === 'base.css').texto;
  assert.match(base, /:root\s*\{[^}]*color-scheme\s*:\s*light/i,
    ':root declara color-scheme: light');
  assert.match(base, /html:has\(body\.dark-theme\)\s*\{\s*color-scheme\s*:\s*dark/i,
    'el tema oscuro declara color-scheme: dark en la raiz');
});

test('prefers-reduced-motion detiene las animaciones en bucle', () => {
  // map.css y panel.css tienen dos animaciones "infinite". La regla global debe
  // neutralizarlas, no solo acortar la duracion.
  const conReduce = hojas.filter((hoja) => /prefers-reduced-motion/.test(hoja.texto));
  assert.ok(conReduce.length > 0, 'existe una regla prefers-reduced-motion');
  const regla = conReduce.map((hoja) => hoja.texto).join('\n');
  assert.match(regla, /transition-duration\s*:\s*0\.01ms\s*!important/i);
  assert.match(regla, /animation-iteration-count\s*:\s*1\s*!important/i);

  const infinitas = hojas.flatMap(({ name, texto }) =>
    (texto.match(/animation:[^;]*infinite/g) || []).map((m) => `${name}: ${m.trim()}`));
  assert.ok(infinitas.length > 0, 'la comprobacion tiene sentido: hay animaciones infinitas');
});

test('el color de tema declarado coincide con el fondo real', () => {
  const fondo = hojas.find((hoja) => hoja.name === 'base.css').texto
    .match(/--bg-dark:\s*(#[0-9a-f]{3,8})/i);
  assert.ok(fondo, 'base.css declara --bg-dark');

  const meta = indice.match(/<meta\s+name="theme-color"\s+content="(#[0-9a-f]{3,8})"/i);
  assert.ok(meta, 'index.html declara meta theme-color');
  assert.equal(meta[1].toLowerCase(), fondo[1].toLowerCase(),
    'el meta theme-color debe coincidir con --bg-dark');

  assert.equal(manifiesto.background_color.toLowerCase(), fondo[1].toLowerCase());
  assert.equal(manifiesto.theme_color.toLowerCase(), fondo[1].toLowerCase());
});

test('el zoom no esta bloqueado en el viewport', () => {
  assert.doesNotMatch(indice, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(indice, /maximum-scale\s*=\s*1\b/i);
});
