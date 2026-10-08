/** Evita publicar por accidente una clave privilegiada de Supabase. */
function assertPublicSupabaseKey(key) {
  const value = String(key || '').trim();
  if (value.startsWith('sb_secret_')) throw new Error('La configuración pública requiere una clave anon o publicable, nunca una clave secreta.');
  const parts = value.split('.');
  if (parts.length !== 3) return;
  let role;
  try { role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role; }
  catch (_) { throw new Error('La configuración pública contiene una clave JWT inválida.'); }
  // No verifica firmas ni permisos remotos: es una barrera contra exposición
  // accidental. Solo anon es admisible en una clave JWT del artefacto público.
  if (role !== 'anon') throw new Error('La configuración pública requiere una clave JWT con rol anon.');
}

module.exports = { assertPublicSupabaseKey };
