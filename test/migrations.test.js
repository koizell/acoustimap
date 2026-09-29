const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationDir = path.join(root, 'migrations');

// El orden de aplicación real: setup.sql y luego migrations en orden de nombre.
const migrationFiles = [
  'setup.sql',
  ...fs.readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => `migrations/${name}`)
];

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

/** Divide SQL en sentencias sin puntos y comas, ignorando comentarios. */
function statements(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

test('ninguna restricción queda NOT VALID sin ser validada después', () => {
  // Regresión: 20260925_privacy_and_retention.sql declaraba ocho restricciones
  // como "not valid" pero su lista de "validate constraint" omitía
  // noise_confirmations_key_check, que quedó con convalidated = false en
  // producción sin que la verificación del README lo detectara.
  const pending = new Map();

  for (const file of migrationFiles) {
    for (const statement of statements(read(file))) {
      const added = statement.match(/\badd constraint\s+(\w+)\b[\s\S]*\bnot valid$/i);
      if (added) {
        assert.ok(!pending.has(added[1]), `${added[1]} ya estaba pendiente antes de ${file}`);
        pending.set(added[1], file);
        continue;
      }
      const validated = statement.match(/\bvalidate constraint\s+(\w+)/i);
      if (validated) {
        assert.ok(
          pending.has(validated[1]),
          `${file} valida ${validated[1]}, que no se declaró "not valid" en este repositorio`
        );
        pending.delete(validated[1]);
      }
    }
  }

  assert.deepEqual(
    [...pending.entries()].map(([name, file]) => `${name} (declarada en ${file})`),
    [],
    'restricciones declaradas NOT VALID y nunca validadas'
  );
});

test('toda función SECURITY DEFINER fija su search_path', () => {
  // El advisor de seguridad de Supabase标记ó aggregate_old_noise_data y
  // cleanup_old_noise_measurements por search_path mutable. Ninguna de las dos
  // estaba en el repositorio, pero el mismo defecto puede reintroducirse aquí.
  const offenders = [];
  for (const file of migrationFiles) {
    const sql = read(file);
    const blocks = sql.match(/create\s+(or\s+replace\s+)?function\b[\s\S]*?\$\$;/gi) || [];
    for (const block of blocks) {
      if (!/\bsecurity\s+definer\b/i.test(block)) continue;
      const name = block.match(/function\s+([\w.]+)/i)?.[1] || '(sin nombre)';
      if (!/\bset\s+search_path\b/i.test(block)) offenders.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [], 'funciones SECURITY DEFINER con search_path mutable');
});

// Único trabajo programado con potestad de retención. Cualquier otra función
// que borre mediciones necesita justificación explícita en este archivo.
const RETENTION_FUNCTION = 'cleanup_old_noise_data';

test('ninguna función de migración borra mediciones fuera de la retención', () => {
  // aggregate_old_noise_data —presente en producción pero nunca en el repo—
  // insertaba sesiones y acto seguido borraba mediciones de más de dos horas,
  // contradiciendo la retención de 90 días. La poda de datos pertenece al
  // trabajo programado, no a una migración.
  const offenders = [];
  for (const file of migrationFiles) {
    const sql = read(file);
    const blocks = sql.match(/create\s+(or\s+replace\s+)?function\b[\s\S]*?\$\$;/gi) || [];
    for (const block of blocks) {
      if (!/\bdelete\s+from\s+(public\.)?noise_measurements\b/i.test(block)) continue;
      const name = (block.match(/function\s+([\w.]+)/i)?.[1] || '(sin nombre)').replace(/^public\./, '');
      if (name === RETENTION_FUNCTION) continue;
      offenders.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(offenders, [], 'funciones que borran noise_measurements fuera de la retención');
});
