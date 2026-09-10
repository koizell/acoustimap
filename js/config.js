/**
 * config.js
 * Credenciales, constantes, estado compartido y utilidades.
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
const CELL_SIZE_M             = 70;
const CIRCLE_VISUAL_RADIUS_M  = 50;
const AGG_GRID                = 0.0014;
const SEND_INTERVAL_MS        = 10000;
const REFRESH_INTERVAL_MS     = 30000;

// Precisión visual máxima (nunca dibujar un círculo mayor a esto)
const MAX_VISUAL_ACCURACY_M   = 40;
// Distancia bajo la cual consideramos la posición "estable"
const STABILITY_THRESHOLD_M   = 12;
// Cuántas lecturas necesitamos para considerar la posición estable
const STABILITY_MIN_SAMPLES   = 4;

// ============================================
// ESTADO COMPARTIDO
// ============================================
let mapMode         = 'live';
let isMonitoring    = false;
let sharingEnabled  = false;
let currentPosition = null;
let geoWatchId      = null;
let wakeLock        = null;

// ✅ NUEVO: historial de lecturas GPS para detectar estabilidad
let positionHistory = [];

let audioCtx, analyser, microphone, stream;
let rafId = null;

let session = { sum: 0, count: 0, min: Infinity, max: -Infinity, startTime: 0, timerId: null };
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

/**
 * Distancia entre dos coordenadas en metros (fórmula de Haversine).
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radio de la Tierra en metros
  const toRad = (x) => x * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================
// WAKE LOCK
// ============================================
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('🔒 Pantalla mantenida encendida');
    } catch (err) {
      console.warn('Wake Lock no disponible:', err.message);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
    console.log('🔓 Wake Lock liberado');
  }
}