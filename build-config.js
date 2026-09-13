/**
 * build-config.js
 * Script de build para inyectar credenciales de Supabase en producción.
 * 
 * Uso:
 *   SUPABASE_URL=xxx SUPABASE_ANON_KEY=yyy node build-config.js
 * 
 * En GitHub Actions, las variables vienen de Secrets del repositorio.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Faltan variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY');
  process.exit(1);
}

const configContent = `/**
 * config.local.js - GENERADO AUTOMÁTICAMENTE EN BUILD
 * NO EDITAR MANUALMENTE - Se sobrescribe en cada deploy
 * Credenciales inyectadas desde variables de entorno (GitHub Secrets)
 */

window.__ACOUSTIMAP_CONFIG__ = {
  SUPABASE_URL: '${SUPABASE_URL.replace(/'/g, "\\'")}',
  SUPABASE_ANON_KEY: '${SUPABASE_ANON_KEY.replace(/'/g, "\\'")}'
};
`;

const outputPath = path.join(__dirname, 'js', 'config.local.js');

try {
  fs.writeFileSync(outputPath, configContent);
  console.log('✅ js/config.local.js generado correctamente');
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...`);
} catch (err) {
  console.error('❌ Error escribiendo config.local.js:', err);
  process.exit(1);
}