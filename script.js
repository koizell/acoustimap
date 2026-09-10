/**
 * AcoustiMap - script.js
 * Monitoreo acústico en tiempo real + mapa comunitario con Supabase.
 *
 * PRIVACIDAD:
 *  - El audio NUNCA se graba ni se transmite: solo se calcula la intensidad (dB).
 *  - La ubicación se difumina (~150 m) antes de enviarse a Supabase.
 *  - El envío requiere consentimiento explícito del usuario (checkbox).
 */

// ==========================================
// 0. CONFIGURACIÓN DE SUPABASE
// ==========================================
// 🔧 Reemplaza estos valores con los de tu proyecto en https://supabase.com
const SUPABASE_URL = "https://vskndeoqkjsxophwwwpe.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZza25kZW9xa2pzeG9waHd3d3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjM0NzQsImV4cCI6MjEwNDYzOTQ3NH0.mto-be3VQFaXf5Gar8VIeV1bORbPNtLsa67SY6Adh-0";

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

// ==========================================
// 1. MAPA
// ==========================================
const map = L.map('map', { zoomControl: false }).setView([8.75, -75.88], 14);
L.control.zoom({ position: 'topleft' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

// Controles
L.control.locate({
  position: 'topleft',
  setView: 'untilPan',
  icon: 'leaflet-control-locate',
  locateOptions: { enableHighAccuracy: true }
}).addTo(map);

// Capas separadas
const communityLayer = L.layerGroup().addTo(map);   // Puntos difuminados (comunidad)
const myLocationLayer = L.layerGroup().addTo(map);  // Mi ubicación exacta

// ==========================================
// 2. ESTADO Y CONSTANTES
// ==========================================
const COLOR_BY_CAT = { bajo: '#10b981', moderado: '#f59e0b', alto: '#ef4444' };

// Radio de difuminación (metros). ~150 m por defecto.
const BLUR_RADIUS_M = 150;
// Radio visual del círculo en el mapa (en metros, para escalado)
const CIRCLE_VISUAL_RADIUS_M = 50;
// Intervalo de envío
const SEND_INTERVAL_MS = 10000;
// Intervalo de refresco del mapa
const REFRESH_INTERVAL_MS = 30000;
// Grid de agregación (~150 m)
const AGG_GRID = 0.0015;

// Modo: 'live' o 'history'
let mapMode = 'live';

let isMonitoring = false;
let audioCtx, analyser, microphone, stream;
let rafId = null;

let session = { sum: 0, count: 0, min: Infinity, max: -Infinity, startTime: 0, timerId: null };
let lastStatTime = 0;

let sharingEnabled = false;
let currentPosition = null;
let geoWatchId = null;

let sendWindowSum = 0;
let sendWindowCount = 0;
let lastSendTime = 0;

// Identificador único de esta sesión (para no mostrar mi punto difuminado a mí mismo)
const sessionId = Math.random().toString(36).substring(2, 10);

// ==========================================
// 3. CLASIFICACIÓN Y UTILIDADES
// ==========================================
function classifyDb(db) {
  if (db < 55) return 'bajo';
  if (db <= 70) return 'moderado';
  return 'alto';
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hace unos segundos';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

// ==========================================
// 4. DIFUMINACIÓN DE COORDENADAS
// ==========================================
/**
 * Difumina una coordenada a ~150 m de precisión.
 * Usa desplazamiento aleatorio dentro de un radio.
 */
function blurLocation(lat, lng) {
  // 1 grado lat ≈ 111 000 m
  // 1 grado lng ≈ 111 000 * cos(lat) m
  const latRad = lat * Math.PI / 180;
  const metersPerDegLat = 111000;
  const metersPerDegLng = 111000 * Math.cos(latRad);

  // Ángulo y distancia aleatorios dentro del radio de difuminado
  const angle = Math.random() * 2 * Math.PI;
  const dist = Math.sqrt(Math.random()) * BLUR_RADIUS_M;

  const dLat = (dist * Math.cos(angle)) / metersPerDegLat;
  const dLng = (dist * Math.sin(angle)) / metersPerDegLng;

  return { lat: lat + dLat, lng: lng + dLng };
}

// ==========================================
// 5. MOSTRAR MI UBICACIÓN EXACTA (solo visible para mí)
// ==========================================
/**
 * Dibuja un marcador azul con la ubicación exacta del usuario.
 * Este marcador NO se envía a Supabase y NO se comparte con nadie.
 */
function showMyLocation(lat, lng) {
  myLocationLayer.clearLayers();

  // Halo exterior (pulso visual)
  L.circleMarker([lat, lng], {
    radius: 18,
    color: '#2563eb',
    weight: 1,
    opacity: 0.3,
    fillColor: '#2563eb',
    fillOpacity: 0.15,
    interactive: false
  }).addTo(myLocationLayer);

  // Punto azul central (mi posición exacta)
  L.circleMarker([lat, lng], {
    radius: 8,
    color: '#ffffff',
    weight: 3,
    fillColor: '#2563eb',
    fillOpacity: 1
  })
    .addTo(myLocationLayer)
    .bindPopup('<b>📍 Tu ubicación exacta</b><br><small>Solo tú puedes verla. No se comparte.</small>');
}

function hideMyLocation() {
  myLocationLayer.clearLayers();
}

// ==========================================
// 6. PUNTOS COMUNITARIOS (difuminados)
// ==========================================
function addCommunityPoint(lat, lng, db, category, createdAt, sampleCount = 1) {
  const color = COLOR_BY_CAT[category] || COLOR_BY_CAT[classifyDb(db)];
  const when = createdAt ? timeAgo(createdAt) : 'ahora';

  // Punto central blanco
  L.circleMarker([lat, lng], {
    radius: 3,
    color: '#ffffff',
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
    interactive: false
  }).addTo(communityLayer);

  // Círculo de zona
  L.circle([lat, lng], {
    color,
    fillColor: color,
    fillOpacity: 0.25,
    weight: 1.5,
    radius: CIRCLE_VISUAL_RADIUS_M,
    opacity: 0.8
  })
    .addTo(communityLayer)
    .bindPopup(
      `<b>${db} dB</b><br>
       Categoría: <b>${category}</b><br>
       ${sampleCount > 1 ? `<small>Promedio de ${sampleCount} mediciones</small><br>` : ''}
       <small>${when}</small>`
    );
}

function aggregatePoints(rows) {
  const buckets = new Map();

  rows.forEach((r) => {
    const key = `${Math.round(r.latitude / AGG_GRID)}_${Math.round(r.longitude / AGG_GRID)}`;
    if (!buckets.has(key)) {
      buckets.set(key, { lat: r.latitude, lng: r.longitude, sumDb: 0, count: 0, latest: r.created_at });
    }
    const b = buckets.get(key);
    b.sumDb += r.db_level;
    b.count += 1;
    if (new Date(r.created_at) > new Date(b.latest)) b.latest = r.created_at;
  });

  return Array.from(buckets.values()).map((b) => {
    const avg = Math.round(b.sumDb / b.count);
    return {
      lat: b.lat, lng: b.lng, db: avg,
      category: classifyDb(avg),
      createdAt: b.latest,
      sampleCount: b.count
    };
  });
}

async function loadCommunityPoints() {
  const counter = document.getElementById('community-count');
  if (!supabaseClient) {
    counter.innerText = 'Sin datos comunitarios aún';
    return;
  }

  try {
    // En modo live: últimas 24h. En modo history: todo.
    let query = supabaseClient
      .from('noise_measurements')
      .select('latitude, longitude, db_level, category, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (mapMode === 'live') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    const { data, error } = await query;
    if (error) throw error;

    communityLayer.clearLayers();

    if (!data || data.length === 0) {
      counter.innerText = 'Aún no hay mediciones. ¡Sé el primero!';
      return;
    }

    const aggregated = aggregatePoints(data);
    aggregated.forEach((p) =>
      addCommunityPoint(p.lat, p.lng, p.db, p.category, p.createdAt, p.sampleCount)
    );

    counter.innerText = `${aggregated.length} zonas · ${data.length} mediciones`;
  } catch (err) {
    console.error('Error cargando mediciones:', err);
    counter.innerText = 'Error al cargar datos';
  }
}

// Refresco automático
loadCommunityPoints();
setInterval(loadCommunityPoints, REFRESH_INTERVAL_MS);

// ==========================================
// 7. TOGGLE EN VIVO / HISTORIAL
// ==========================================
function setMapMode(mode) {
  mapMode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById(`mode-${mode}`).classList.add('active');
  loadCommunityPoints();
}

// ==========================================
// 8. NAVEGACIÓN ENTRE PESTAÑAS
// ==========================================
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
  if (tabId === 'map-view') {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

// ==========================================
// 9. COLAPSAR PANEL
// ==========================================
function togglePanel() {
  const panel = document.getElementById('sensor-panel');
  const label = document.getElementById('handle-label');
  panel.classList.toggle('collapsed');
  label.innerText = panel.classList.contains('collapsed') ? 'Mostrar detalles' : 'Ocultar detalles';
}

// ==========================================
// 10. CAPTURA Y PROCESAMIENTO DE AUDIO
// ==========================================
async function toggleMonitoring() {
  const btn = document.getElementById('btn-toggle');
  const badge = document.getElementById('status-badge');
  const pulse = document.getElementById('pulse-dot');
  const statusText = document.getElementById('status-text');

  if (!isMonitoring) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      microphone = audioCtx.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;

      isMonitoring = true;
      btn.innerText = 'Detener Monitoreo';
      btn.style.background = '#dc2626';
      badge.classList.add('active');
      pulse.style.display = 'inline-block';
      statusText.innerText = 'Midiendo en Vivo';

      startSession();
      updateMeter();
    } catch (err) {
      console.error(err);
      alert('Permiso de micrófono denegado o no soportado.');
    }
  } else {
    isMonitoring = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    btn.innerText = 'Activar Micrófono';
    btn.style.background = 'var(--primary)';
    badge.classList.remove('active');
    pulse.style.display = 'none';
    statusText.innerText = 'Inactivo';
    document.getElementById('db-number').innerText = '--';
    document.getElementById('db-bar').style.width = '0%';
    document.getElementById('db-status-text').innerText = 'Presiona Iniciar';
    stopSession();
  }
}

function startSession() {
  session = { sum: 0, count: 0, min: Infinity, max: -Infinity, startTime: Date.now(), timerId: null };
  sendWindowSum = 0;
  sendWindowCount = 0;
  lastSendTime = Date.now();
  updateAvgUI();
  document.getElementById('avg-time').innerText = '00:00';
  if (session.timerId) clearInterval(session.timerId);
  session.timerId = setInterval(updateTimer, 1000);
}

function stopSession() {
  if (session.timerId) clearInterval(session.timerId);
  session.timerId = null;
}

function updateTimer() {
  if (!isMonitoring) return;
  const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  document.getElementById('avg-time').innerText = `${mm}:${ss}`;
}

function updateAvgUI() {
  const avgEl = document.getElementById('avg-number');
  const tagEl = document.getElementById('avg-tag');
  const minEl = document.getElementById('min-db');
  const maxEl = document.getElementById('max-db');
  const cntEl = document.getElementById('sample-count');

  if (session.count === 0) {
    avgEl.innerText = '--';
    tagEl.innerText = 'Sin datos';
    tagEl.className = 'avg-tag';
    minEl.innerText = '--';
    maxEl.innerText = '--';
    cntEl.innerText = '0';
    return;
  }

  const avg = Math.round(session.sum / session.count);
  avgEl.innerText = avg;

  const cat = classifyDb(avg);
  tagEl.innerText = cat === 'bajo' ? '🟢 Bajo' : cat === 'moderado' ? '🟡 Moderado' : '🔴 Alto';
  tagEl.className = 'avg-tag ' + cat;
  minEl.innerText = session.min;
  maxEl.innerText = session.max;
  cntEl.innerText = session.count;
}

function updateMeter() {
  if (!isMonitoring) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
  const average = sum / dataArray.length;

  let db = Math.round(20 * Math.log10(average || 1) + 25);
  if (db < 30) db = 35;

  document.getElementById('db-number').innerText = `${db} dB`;
  const percent = Math.min(100, Math.max(0, (db / 100) * 100));
  const dbBar = document.getElementById('db-bar');
  dbBar.style.width = `${percent}%`;

  const dbStatus = document.getElementById('db-status-text');
  if (db < 55) {
    dbBar.style.backgroundColor = 'var(--green)';
    dbStatus.innerText = '🟢 Bajo (Confortable)';
  } else if (db <= 70) {
    dbBar.style.backgroundColor = 'var(--yellow)';
    dbStatus.innerText = '🟡 Moderado (Tráfico/Ocupado)';
  } else {
    dbBar.style.backgroundColor = 'var(--red)';
    dbStatus.innerText = '🔴 Alto (Ruido Molesto)';
  }

  const now = performance.now();
  if (now - lastStatTime > 200) {
    lastStatTime = now;
    session.sum += db;
    session.count += 1;
    if (db < session.min) session.min = db;
    if (db > session.max) session.max = db;
    updateAvgUI();

    sendWindowSum += db;
    sendWindowCount += 1;
    sendMeasurementIfDue();
  }

  rafId = requestAnimationFrame(updateMeter);
}

// ==========================================
// 11. ENVÍO A SUPABASE
// ==========================================
async function sendMeasurementIfDue() {
  const now = Date.now();
  if (!sharingEnabled || !currentPosition) return;
  if (now - lastSendTime < SEND_INTERVAL_MS) return;
  if (sendWindowCount === 0) return;

  const avg = Math.round(sendWindowSum / sendWindowCount);
  sendWindowSum = 0;
  sendWindowCount = 0;
  lastSendTime = now;

  const blurred = blurLocation(currentPosition.lat, currentPosition.lng);
  const category = classifyDb(avg);
  const createdAt = new Date().toISOString();

  // ⚠️ NO añadimos el punto a la capa comunitaria local.
  // El punto aparecerá en el próximo refresco (30 s) desde Supabase.
  // Así evitamos duplicar "mi punto difuminado" con "mi ubicación exacta".

  if (supabaseClient) {
    const { error } = await supabaseClient.from('noise_measurements').insert({
      latitude: blurred.lat,
      longitude: blurred.lng,
      db_level: avg,
      category
    });
    if (error) console.error('Supabase insert error:', error);
  }
}

// ==========================================
// 12. COMPARTIR UBICACIÓN
// ==========================================
function toggleSharing() {
  const cb = document.getElementById('share-toggle');
  const status = document.getElementById('share-status');
  sharingEnabled = cb.checked;

  if (sharingEnabled) {
    if (!navigator.geolocation) {
      status.innerText = '❌ Geolocalización no soportada.';
      cb.checked = false;
      sharingEnabled = false;
      return;
    }

    status.innerHTML = '⏳ Solicitando permiso de ubicación…';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };

        // ✅ Mostrar MI ubicación exacta (azul, solo visible para mí)
        showMyLocation(currentPosition.lat, currentPosition.lng);
        map.setView([currentPosition.lat, currentPosition.lng], 16);

        updateGpsChip(true);
        status.innerHTML = '✅ Compartiendo. Los demás ven una zona difuminada ~150 m.';
        lastSendTime = 0;

        if (geoWatchId === null) {
          geoWatchId = navigator.geolocation.watchPosition(
            (p) => {
              currentPosition = { lat: p.coords.latitude, lng: p.coords.longitude };
              // Actualizar mi marcador en tiempo real
              showMyLocation(currentPosition.lat, currentPosition.lng);
            },
            (err) => console.warn('watchPosition:', err),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
          );
        }
      },
      (err) => {
        console.warn(err);
        status.innerText = '❌ Permiso de ubicación denegado.';
        cb.checked = false;
        sharingEnabled = false;
        updateGpsChip(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  } else {
    status.innerHTML = '🔒 Compartir desactivado.';
    updateGpsChip(false);
    hideMyLocation();
    currentPosition = null;
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
  }
}

function updateGpsChip(active) {
  const chip = document.getElementById('gps-chip');
  if (active) {
    chip.innerText = '📡 GPS: activo';
    chip.classList.add('ok');
  } else {
    chip.innerText = '📡 GPS: sin permiso';
    chip.classList.remove('ok');
  }
}

// ==========================================
// 13. CENTRAR EN EL USUARIO
// ==========================================
function centerOnUser() {
  if (currentPosition) {
    map.setView([currentPosition.lat, currentPosition.lng], 16);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      showMyLocation(currentPosition.lat, currentPosition.lng);
      map.setView([currentPosition.lat, currentPosition.lng], 16);
    },
    (err) => alert('No se pudo obtener tu ubicación. Verifica los permisos.'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
