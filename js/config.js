/**
 * config.js
 * Configuración pública, constantes, estado compartido y utilidades.
 * config.local.js define window.__ACOUSTIMAP_CONFIG__: se copia de la plantilla
 * en desarrollo o se genera con build-config.js en CI. Los placeholders permiten
 * abrir la interfaz sin configurar Supabase.
 */

// ============================================
// SUPABASE - Inicializar el cliente con la clave pública (RLS controla el acceso)
// ============================================
const _localConfig = window.__ACOUSTIMAP_CONFIG__ || {};
const SUPABASE_URL = _localConfig.SUPABASE_URL || 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = _localConfig.SUPABASE_ANON_KEY || 'TU_ANON_KEY_AQUI';

let supabaseClient = null;
try {
  if (window.supabase && !SUPABASE_URL.includes('TU-PROYECTO')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase conectado');
  } else {
    console.warn('⚠️ Supabase no configurado. Crea js/config.local.js copiando js/config.local.js.template');
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
let mapMode         = 'history';
let isMonitoring    = false;
let sharingEnabled  = false;
let currentPosition = null;
let geoWatchId      = null;
let wakeLock        = null;

// Historial de lecturas GPS para detectar estabilidad
let positionHistory = [];

let audioCtx, analyser, microphone, stream;
let rafId = null;

// Búfer del dominio temporal y media móvil del RMS. Se asignan al activar el
// micrófono para no crear un Float32Array por fotograma.
let timeDomainBuffer = null;
let smoothedRms = 0;

let session = { sum: 0, count: 0, min: Infinity, max: -Infinity, startTime: 0, timerId: null };
let lastStatTime = 0;

let sendWindowSum   = 0;
let sendWindowCount = 0;
let lastSendTime    = 0;

// ============================================
// UTILIDADES
// ============================================
/**
 * Clasifica el índice relativo en las tres categorías de la interfaz.
 * El nombre del parámetro se conserva por compatibilidad: no representa una
 * medición calibrada de presión sonora en dB(A).
 * @param {number} db Índice relativo, entre 30 y 95 (ver audio.js).
 * @returns {'bajo'|'moderado'|'alto'} 'bajo' por debajo de 55, 'moderado' hasta
 *   70 inclusive, 'alto' por encima.
 */
function classifyDb(db) {
  if (db < 55) return 'bajo';
  if (db <= 70) return 'moderado';
  return 'alto';
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(diff)) return '';
  const selectedLanguage = localStorage.getItem('acoustimap-language') || document.documentElement.lang;
  const locale = ['es', 'en', 'pt'].includes(selectedLanguage) ? selectedLanguage : 'es';
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (diff < 5) return relative.format(0, 'second');
  if (diff < 60) return relative.format(-Math.floor(diff), 'second');
  if (diff < 3600) return relative.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return relative.format(-Math.floor(diff / 3600), 'hour');
  if (diff < 2592000) return relative.format(-Math.floor(diff / 86400), 'day');
  return relative.format(-Math.floor(diff / 2592000), 'month');
}

/**
 * Aproxima la ubicación al centro de una celda de unos 70 m antes de compartirla.
 * La celda de privacidad se expresa en metros; AGG_GRID agrupa visualmente en grados.
 * @param {number} lat Latitud geográfica en grados.
 * @param {number} lng Longitud geográfica en grados.
 * @returns {{lat: number, lng: number}} Centro de celda; volver a anclarlo es idempotente.
 */
function snapToGrid(lat, lng) {
  const metersPerDegLat = 111000;
  const cellLat = CELL_SIZE_M / metersPerDegLat;
  const snappedLat = (Math.floor(lat / cellLat) + 0.5) * cellLat;
  const metersPerDegLng = 111000 * Math.cos(snappedLat * Math.PI / 180);
  const cellLng = CELL_SIZE_M / metersPerDegLng;
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


/**
 * Lleva el índice relativo a la escala 0-1 del gradiente del heatmap.
 * El rango útil es 30-95 (ver audio.js): 30 es silencio y 95 el tope del
 * analizador. Los stops del gradiente están en 0.385 y 0.615, que son
 * exactamente los umbrales 55 y 70 sobre ese rango, así que el ámbar empieza
 * donde empieza "moderado" y el naranja donde empieza "alto".
 * @param {number} db Índice relativo entre 30 y 95.
 * @returns {number} Posición en el gradiente, de 0 a 1.
 */
function normalizeDbForHeatmap(db) {
  return Math.min(Math.max((db - 30) / 65, 0.05), 1.0);
}

// Mediciones a partir de las cuales la confianza de una celda satura.
const DENSITY_REFERENCE = 30;

/**
 * Confianza de una celda, por cuántas mediciones sostienen su promedio.
 *
 * IMPORTANTE: solo modula el borde del círculo, nunca la intensidad del
 * heatmap ni el color. Un único ciudadano que reporta ruido extremo en su
 * calle aporta el dato más valioso de la app; atenuarlo por tener una sola
 * lectura escondería justo lo que la gente busca. La densidad se comunica en
 * el rótulo y en un borde más marcado, no apagando la celda.
 *
 * Se usa raíz y no logaritmo porque es lineal en el grosor: duplicar el borde
 * es duplicar la densidad, y eso se entiende sin explicación.
 * @param {number} sampleCount Mediciones de la celda.
 * @returns {number} Peso entre 0 y 1.
 */
function densityConfidence(sampleCount) {
  const n = Math.max(0, Number(sampleCount) || 0);
  return Math.min(1, Math.sqrt(n / DENSITY_REFERENCE));
}

/** Opacidad del borde de una celda: tenue si es una lectura suelta, marcada si está bien medida. */
function cellBorderOpacity(sampleCount) {
  return 0.3 + 0.5 * densityConfidence(sampleCount);
}
