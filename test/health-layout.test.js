const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/info.css'), 'utf8');
const features = fs.readFileSync(path.join(root, 'js/features.js'), 'utf8');

test('Salud: jerarquía h1 → h2 y tarjetas informativas sin controles falsos', () => {
  const health = html.slice(html.indexOf('id="health-view"'), html.indexOf('<!-- PESTAÑA: ESTADÍSTICAS -->'));
  assert.equal((health.match(/<h1>/g) || []).length, 1);
  assert.equal((health.match(/<h2[ >]/g) || []).length, 5);
  assert.doesNotMatch(health, /<h3|onclick=|<button/);
  assert.doesNotMatch(css, /\.info-card[^}]*:hover|cursor:\s*pointer/);
});

test('Salud: texto de 16 px en todos los tamaños y longitud de lectura acotada', () => {
  assert.match(css, /\.info-card p,\s*\.info-card small\s*\{[^}]*font-size:\s*1rem;[^}]*line-height:\s*1\.6/);
  assert.match(css, /#health-view \.info-copy\s*\{[^}]*max-width:\s*65ch;[^}]*font-size:\s*1rem/);
  assert.doesNotMatch(css.slice(css.indexOf('@media (max-width: 719px)')), /font-size:/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
});

test('Salud: iconos decorativos SVG no se destruyen ni duplican al traducir', () => {
  const health = html.slice(html.indexOf('id="health-view"'), html.indexOf('<!-- PESTAÑA: ESTADÍSTICAS -->'));
  assert.equal((health.match(/aria-hidden="true" focusable="false"/g) || []).length, 3);
  assert.equal((health.match(/class="badge-label"/g) || []).length, 3);
  assert.match(features, /querySelectorAll\('\.info-card \.badge-label'\)/);
  assert.match(features, /querySelectorAll\('\.info-card h2'\)/);
  assert.doesNotMatch(features, /querySelectorAll\('\.info-card \.badge'\)/);
});

test('Salud: una entrada sin ocultar texto, sin doble animación ni dependencia CDN', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(css, /#health-view\.active \.info-wrapper\s*\{\s*animation:\s*health-enter 220ms/);
  const animation = css.slice(css.indexOf('@keyframes health-enter'), css.indexOf('@media (max-width: 959px)'));
  assert.doesNotMatch(animation, /opacity|infinite|animation-delay/);
  assert.match(animation, /prefers-reduced-motion:\s*reduce[^]*animation:\s*none/);
  assert.match(app, /if \(tabId === 'stats-view' && typeof revealUi === 'function'\)/);
});
