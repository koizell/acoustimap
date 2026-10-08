/**
 * build-config.js
 * Genera la configuración pública que descargará el navegador.
 * Usar solo la clave anon/publicable; nunca service_role ni una clave secreta.
 * 
 * Uso:
 *   SUPABASE_URL=xxx SUPABASE_ANON_KEY=yyy node build-config.js
 * 
 * En GitHub Actions, las variables vienen de Secrets del repositorio.
 */

const fs = require('fs');
const path = require('path');
const { assertPublicSupabaseKey } = require('./scripts/public-config');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Faltan variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY');
  process.exit(1);
}

try { assertPublicSupabaseKey(SUPABASE_ANON_KEY); }
catch (error) { console.error(error.message); process.exit(1); }

const configContent = `/**
 * config.local.js - GENERADO AUTOMÁTICAMENTE EN BUILD
 * NO EDITAR MANUALMENTE - Se sobrescribe en cada deploy
 * Configuración pública generada desde variables de entorno (GitHub Secrets)
 */

window.__ACOUSTIMAP_CONFIG__ = ${JSON.stringify({ SUPABASE_URL, SUPABASE_ANON_KEY }, null, 2)};
`;

const outputPath = path.join(__dirname, 'js', 'config.local.js');

try {
  fs.writeFileSync(outputPath, configContent);
  console.log('✅ js/config.local.js generado correctamente');
} catch (err) {
  console.error('❌ Error escribiendo config.local.js:', err);
  process.exit(1);
}
