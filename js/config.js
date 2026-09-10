/**
 * config.js
 * Credenciales, constantes globales, estado compartido y utilidades.
 * Debe cargarse ANTES que cualquier otro módulo.
 */

// ============================================
// SUPABASE
// ============================================
const SUPABASE_URL = 'https://vskndeoqkjsxophwwwpe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZza25kZW9xa2pzeG9waHd3d3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjM0NzQsImV4cCI6MjEwNDYzOTQ3NH0.mto-be3VQFaXf5Gar8VIeV1bORbPNtLsa67SY6Adh-0';

let supabaseClient = null;
try {
  if (window.supabase && !SUPABASE_URL.includes('TU-PROYECTO')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase conectado');
  } else {
    console.warn('⚠️ Supabase no configurado.');
  }
} catch (e) {
  console.error('Error inicializando Supabase:', e);
}

// ============================================
// CONSTANTES
// ============================================
const COLOR_BY_CAT            = { bajo: '#10b981', moderado: '#f59e0b', alto: '#ef4444' };
const CELL_SIZE_M             = 70;       // Tamaño de la celda de anclaje en metros
const CIRCLE_VISUAL_RADIUS_M  = 50;       // Radio visual del círculo comunitario
const AGG_GRID                = 0.0014;   // Grid de agregación (~155 m)
const SEND_INTERVAL_MS        = 10000;    // Enviar a Supabase cada 10 s
const REFRESH_INTERVAL_MS     = 30000;    // Refrescar mapa cada 30 s

// ============================================
// ESTADO COMPARTIDO
// ============================================
let mapMode         = 'live';   // 'live' | 'history'
let isMonitoring    = false;
let sharingEnabled  = false;
let currentPosition = null;     // { lat, lng, accuracy }
let geoWatchId      = null;

let audioCtx, analyser, microphone, stream;
let rafId = null;

let session = {
  sum: 0,
  count: 0,
  min: Infinity,
  max: -Infinity,
  startTime: 0,
  timerId: null
};
let lastStatTime = 0;

let sendWindowSum   = 0;
let sendWindowCount = 0;
let lastSendTime    = 0;

// ============================================
// UTILIDADES
// ============================================
function classifyDb(db) {
  if (db < 55) return 'bajo';
  if (db <= 70) return 'moderado';
  return 'alto';
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5)       return 'ahora';
  if (diff < 60)      return `hace ${Math.floor(diff)}s`;
  if (diff < 3600)    return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400)   return `hace ${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `hace ${Math.floor(diff / 86400)}d`;
  return `hace ${Math.floor(diff / 2592000)}mes`;
}

/** Ancla una coordenada al centro de una celda fija de CELL_SIZE_M metros. */
function snapToGrid(lat, lng) {
  const latRad = lat * Math.PI / 180;
  const metersPerDegLat = 111000;
  const metersPerDegLng = 111000 * Math.cos(latRad);

  const cellLat = CELL_SIZE_M / metersPerDegLat;
  const cellLng = CELL_SIZE_M / metersPerDegLng;

  const snappedLat = (Math.floor(lat / cellLat) + 0.5) * cellLat;
  const snappedLng = (Math.floor(lng / cellLng) + 0.5) * cellLng;

  return { lat: snappedLat, lng: snappedLng };
}