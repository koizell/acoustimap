const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('el repositorio publica su licencia', () => {
  // Regresión: origin/main traía "LICENSE.,MD", con una coma en el nombre, y el
  // commit b71346f lo eliminó sin dejar sustituto. Un repositorio público sin
  // licencia significa que legalmente nadie puede usarlo ni reutilizarlo.
  const existe = fs.existsSync(path.join(root, 'LICENSE'));
  assert.ok(existe, 'debe existir un fichero LICENSE en la raiz');

  const texto = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(texto, /MIT License/);
  assert.match(texto, /Copyright \(c\) 2026 Koizell/);
  assert.match(texto, /WITHOUT WARRANTY OF ANY KIND/);

  const paquete = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(paquete.license, 'MIT', 'package.json debe declarar la misma licencia');
});

test('el aviso de privacidad existe y coincide con la retencion real', () => {
  // Regresión: b71346f borró SECURITY.md sin sustituto. Además, la versión
  // anterior afirmaba "mediciones 24 h" y "sesiones 7 días", reglas que la
  // migración de privacidad sustituyó por 90 días.
  const existe = fs.existsSync(path.join(root, 'SECURITY.md'));
  assert.ok(existe, 'debe existir SECURITY.md');

  const texto = fs.readFileSync(path.join(root, 'SECURITY.md'), 'utf8');

  // Retención vigente según migrations/20260928 y cleanup_old_noise_data().
  assert.match(texto, /Mediciones \| 90 d/);
  assert.match(texto, /Sesiones \| 90 d/);
  assert.match(texto, /Confirmaciones \| 24 horas/);
  assert.match(texto, /Reportes \| 30 d/);

  // Y no debe affirms las reglas antiguas.
  assert.doesNotMatch(texto, /Mediciones \| 24 h/,
    'las mediciones ya no se borran a las 24 horas');
  assert.doesNotMatch(texto, /Sesiones \| 7 d/,
    'las sesiones ya no se borran a los 7 días');

  // Datos que la app sí expone, documentados sin afirmaciones no verificadas.
  assert.match(texto, /70/);
  assert.match(texto, /no tiene usuarios registrados/i);
});

test('ningún documento afirma que el indice sean decibelios calibrados', () => {
  // El README lo dice, pero SECURITY.md repetía "nivel de ruido (dB)" en su
  // tabla de datos guardados, lo que contradice el resto del proyecto.
  const texto = fs.readFileSync(path.join(root, 'SECURITY.md'), 'utf8');
  assert.doesNotMatch(texto, /nivel de ruido \(dB\)/i);
  assert.match(texto, /no es dB SPL calibrado/i);
});
