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
let backendInitializationState = 'disconnected';
const APP_ASSET_VERSION = typeof document !== 'undefined'
  ? document.currentScript?.src?.match(/[?&]v=(\d+)/)?.[1] || '?' : '?';
try {
  if (!SUPABASE_URL.includes('TU-PROYECTO') && SUPABASE_ANON_KEY !== 'TU_ANON_KEY_AQUI') {
    if (typeof window.supabase?.createClient === 'function') {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('Configuración Supabase cargada; conexión pendiente de comprobar.');
    } else {
      backendInitializationState = 'sdkError';
      console.warn('No se cargó la biblioteca de Supabase.');
    }
  } else {
    console.warn('⚠️ Supabase no configurado. Crea js/config.local.js copiando js/config.local.js.template');
  }
} catch (e) {
  backendInitializationState = 'configError';
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
/*
 * v5: nivel digital ponderado A sobre el espectro y promedio energético de 3 s.
 *
 * ## Qué cambia respecto de la v4
 *
 * La v4 medía RMS sin ponderación frecuencial; la v5 pondera la energía por bin.
 *
 * FFT de 8192 muestras con Hann y solapamiento, normalización por Parseval.
 * Los golpes audibles sí contribuyen al promedio por su energía y duración.
 * El diagnóstico distingue el máximo espectral reciente del promedio móvil.
 *
 * ## Qué NO cambia
 *
 * La escala sigue siendo `dBFS + 100` acotada a 30-95, con los mismos umbrales. Lo
 * que cambia es qué energía se promedia. Los métodos anteriores no son equivalentes
 * ni se convierten: la RPC v5 solo muestra v5 para no mezclar métricas.
 *
 * ## Sigue sin ser un dB SPL calibrado
 *
 * Aplicar la curva A no calibra el micrófono ni certifica el dispositivo según IEC.
 * El offset +100 sigue siendo arbitrario: no permite comparar con límites legales.
 *
 * ## Por qué sube de versión
 *
 * Cambia el número guardado. Las filas antiguas permanecen con su versión original.
 */
const MEASUREMENT_VERSION     = 5;
let captureProfile            = 'unknown';

// Precisión visual máxima (nunca dibujar un círculo mayor a esto)
const MAX_VISUAL_ACCURACY_M   = 40;
// Distancia bajo la cual consideramos la posición "estable"
const STABILITY_THRESHOLD_M   = 12;
// Cuántas lecturas necesitamos para considerar la posición estable
const STABILITY_MIN_SAMPLES   = 4;

// ============================================
// FRANJAS HORARIAS (hora de Colombia, UTC−5)
// ============================================
// El mapa se filtra por hora de Colombia en el SERVIDOR: la RPC noise_map_cells
// usa extract(hour from created_at at time zone 'America/Bogota'). Los retos se
// calculan en el navegador, así que si usan getHours() cuentan la zona horaria
// del dispositivo y no la que anuncia la interfaz. Para alguien fuera de UTC−5
// el mapa podía decir "mañana" mientras el reto contaba "noche".
//
// Estas constantes reflejan noise_map_cells_v4. Si cambia un corte, añade una
// migración nueva para la RPC (no reescribas una ya aplicada) y actualiza el test
// que compara las horas del cliente y del SQL.
//
// Colombia no aplica horario de verano, así que el desfase es fijo.
const CO_UTC_OFFSET_MINUTES = -300;

// Una tabla y no varios "if" sueltos: los cortes viven en un solo sitio.
const CO_TIME_BANDS = {
  morning:   { from: 6,  to: 12 },   // 6:00–11:59
  afternoon: { from: 12, to: 18 },   // 12:00–17:59
  night:     { from: 18, to: 6 }     // 18:00–05:59: la noche envuelve medianoche
};

/** Milisegundos UNIX de un instante ISO, o null si no es una fecha válida. */
function coTimestamp(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Hora de un instante en hora de Colombia, 0–23.
 * Se desplaza el instante y se lee en UTC, no se usa getHours(): getHours()
 * devuelve la zona del dispositivo, que es justo lo que queremos evitar.
 */
function coHour(value) {
  const ms = coTimestamp(value);
  if (ms === null) return null;
  return new Date(ms + CO_UTC_OFFSET_MINUTES * 60000).getUTCHours();
}

/** Clave de día en hora de Colombia: 'AAAA-MM-DD'. Evita contar dos veces el mismo día. */
function coDayKey(value) {
  const ms = coTimestamp(value);
  if (ms === null) return null;
  const d = new Date(ms + CO_UTC_OFFSET_MINUTES * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * ¿Cae el instante dentro de la franja?
 * La noche tiene from > to porque arranca en la tarde y termina de madrugada:
 * por eso hay dos ramas en lugar de una sola comparación.
 */
function inCoTimeBand(value, band) {
  const hour = coHour(value);
  const range = CO_TIME_BANDS[band];
  if (hour === null || !range) return false;
  if (range.from < range.to) return hour >= range.from && hour < range.to;
  return hour >= range.from || hour < range.to;
}

// ============================================
// ESTADO COMPARTIDO
// ============================================
/** Iconos vectoriales locales, sin fuente de iconos ni dependencias de UI. */
function actionIconMarkup(name) {
  const paths = {
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="3"/>',
    location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    check: '<path d="m5 12 4 4L19 6"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.mic}</svg>`;
}

let mapMode         = 'history';
let isMonitoring    = false;
let sharingEnabled  = false;
let sharingDeliveryState = 'idle';
/**
 * Autorización explícita para publicar una medición pese al procesado del navegador.
 *
 * Por defecto `false`: si el navegador confirma ganancia automática o supresión de
 * ruido, la medición no entra al mapa para no mezclar escalas distintas. El usuario
 * puede habilitarlo desde el diagnóstico asumiendo esa limitación; nunca se activa solo.
 */
let forceProcessedPublish = false;
let currentPosition = null;
let geoWatchId      = null;
let wakeLock        = null;

// Historial de lecturas GPS para detectar estabilidad
let positionHistory = [];

let audioCtx, microphone, stream;

let session = { sum: 0, count: 0, min: Infinity, max: -Infinity, startTime: 0, timerId: null };

/*
 * Energia acumulada de la ventana de envio, no suma de dB. Ver `energiaDe()` en
 * este mismo fichero: promediar dB no es promediar un nivel.
 */
let sendWindowEnergia = 0;
let sendWindowCount   = 0;
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

/*
 * Promedio de energía, que es como se promedia el ruido.
 *
 * ## Por qué no se puede sumar dB
 *
 * Porque un promedio aritmético de dB **no es un dB**. Los decibelios son logarítmicos:
 * dos sonidos de 60 dB juntos no dan 60 dB, dan 63. La suma de intensidades es la que
 * se promedia, y solo al final se vuelve a logaritmo.
 *
 * ## Lo que costaba
 *
 * La app sumaba dB y dividía por la cantidad, en cuatro sitios de JavaScript y uno en
 * SQL. Con una señal estable no hay diferencia, y por eso el error pasó inadvertido: en
 * un ambiente constante la media aritmética y la de energía coinciden. El problema
 * aparece cuando el ruido **varía**, que es justo lo que pasa en una calle.
 *
 * Medido sobre el mismo ruido, con la variación que introduce el tráfico:
 *
 *   ambiente constante            media aritmética 58.0   energía 58.0   error  0.0 dB
 *   calle normal                  media aritmética 61.7   energía 61.9   error -0.3 dB
 *   un autobús cada 20 s          media aritmética 64.8   energía 71.7   error -6.9 dB
 *   obra intermitente             media aritmética 67.3   energía 71.7   error -4.4 dB
 *
 * El error va siempre **hacia abajo**, y crece con la variación. Eso significa que el
 * mapa marcaba como más tranquilas precisamente las calles más ruidosas, que son las
 * que más le importan a la app.
 *
 * ## Y se aplicaba dos veces
 *
 * La ventana de 10 s se promediaba en JavaScript antes de guardarse en `db_level`, y
 * las celdas del mapa promediaban esos `db_level` en SQL. Dos medias aritméticas
 * seguidas: el sesgo se componía en lugar de cancelarse.
 *
 * ## Por qué `Math.pow` y no `db ** 2`
 *
 * La energía de un sonido es proporcional a `10^(dB/10)`, que es la razón entre
 * intensidades. `10^(dB/20)` es la razón entre presiones, que es lo que usan las
 * amplitudes, y como valor de dB da otro número. El de la presión sirve para la
 * fórmula de LAeq en un sonómetro; aquí se promedia energía, que es `10`.
 *
 * ## El nombre
 *
 * `promedioEnergetico` y no `leq` a propósito: L_eq es el nombre normalizado del
 * indicador de la Directiva 2002/49/EC, y usarlo aquí afirmaría una conformidad que
 * esta app no tiene —no pondera A y no calibra—. La aritmética es la misma; el nombre
 * no reclama un certificado.
 */
function energiaDe(db) {
  return Math.pow(10, db / 10);
}

function promedioEnergetico(energiaTotal, cantidad) {
  if (!cantidad || !(energiaTotal > 0)) return 0;
  return 10 * Math.log10(energiaTotal / cantidad);
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
 * El rango útil es 30-95 (ver audio.js): son los límites del índice, no una
 * calibración del silencio ni un detector de recorte digital. Los stops están en 0.385 y 0.615, que son
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
