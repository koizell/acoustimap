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
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZza25kZW9xa2pzeG9waHd3d3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjM0NzQsImV4cCI6MjEwNDYzOTQ3NH0.mto-be3VQFaXf5Gar8VIeV1bORbPNtLsa67SY6Adh-0";

let supabaseClient = null;
try {
  if (window.supabase && !SUPABASE_URL.includes("TU-PROYECTO")) {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );
    console.log("✅ Supabase conectado");
  } else {
    console.warn(
      "⚠️ Supabase no configurado. El mapa comunitario estará vacío.",
    );
  }
} catch (e) {
  console.error("Error inicializando Supabase:", e);
}

// ==========================================
// 1. MAPA
// ==========================================
const map = L.map('map', {
  zoomControl: false // lo añadimos después en otra posición
}).setView([8.75, -75.88], 14);

// Zoom control arriba a la izquierda (el CSS lo empuja debajo del header)
L.control.zoom({ position: 'topleft' }).addTo(map);

// Control personalizado para centrar en la ubicación del usuario
const LocateControl = L.Control.extend({
  options: {
    position: 'topleft'
  },
  onAdd: function (map) {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-locate');
    const btn = L.DomUtil.create('a', '', container);
    btn.innerHTML = '📍';
    btn.href = '#';
    btn.title = 'Centrarse en mi ubicación';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', 'Centrarse en mi ubicación');

    L.DomEvent.on(btn, 'click', function (e) {
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      centerOnUser();
    });

    return container;
  }
});
map.addControl(new LocateControl());

function centerOnUser() {
  if (currentPosition) {
    map.setView([currentPosition.lat, currentPosition.lng], 16);
  } else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        map.setView([currentPosition.lat, currentPosition.lng], 16);
        updateGpsChip(true);
      },
      (err) => {
        console.warn(err);
        alert("No se pudo obtener tu ubicación actual. Asegúrate de permitir el acceso al GPS.");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  } else {
    alert("Geolocalización no soportada por el navegador.");
  }
}

L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 19,
  },
).addTo(map);

// Capa de puntos comunitarios
const communityLayer = L.layerGroup().addTo(map);

const COLOR_BY_CAT = { bajo: "#10b981", moderado: "#f59e0b", alto: "#ef4444" };

/** Clasifica un nivel de dB en categoría de riesgo. */
function classifyDb(db) {
  if (db < 55) return "bajo";
  if (db <= 70) return "moderado";
  return "alto";
}

function colorForDb(db) {
  return COLOR_BY_CAT[classifyDb(db)];
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "hace unos segundos";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

/**
 * Dibuja un círculo comunitario en el mapa.
 * Radio pequeño + opacidad baja = mapa legible, sin manchas enormes.
 */
function addCommunityPoint(lat, lng, db, category, createdAt, sampleCount = 1) {
  const color = COLOR_BY_CAT[category] || colorForDb(db);
  const when = createdAt ? timeAgo(createdAt) : 'ahora';

  // Punto central sutil (marca el centro del área difuminada)
  L.circleMarker([lat, lng], {
    radius: 3,
    color: '#ffffff',
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
    interactive: false
  }).addTo(communityLayer);

  // Círculo de "zona" pequeño y translúcido
  L.circle([lat, lng], {
    color,
    fillColor: color,
    fillOpacity: 0.25,
    weight: 1.5,
    radius: 40, // ~40 m visuales en el mapa
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

/**
 * Agrupa mediciones muy cercanas (grid ~100 m) para evitar círculos apilados.
 */
function aggregatePoints(rows) {
  const gridSize = 0.001; // ~111 m
  const buckets = new Map();

  rows.forEach((r) => {
    const key = `${Math.round(r.latitude / gridSize)}_${Math.round(r.longitude / gridSize)}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        lat: r.latitude,
        lng: r.longitude,
        sumDb: 0,
        count: 0,
        latest: r.created_at
      });
    }
    const b = buckets.get(key);
    b.sumDb += r.db_level;
    b.count += 1;
    if (new Date(r.created_at) > new Date(b.latest)) b.latest = r.created_at;
  });

  return Array.from(buckets.values()).map((b) => ({
    lat: b.lat,
    lng: b.lng,
    db: Math.round(b.sumDb / b.count),
    category: classifyDb(Math.round(b.sumDb / b.count)),
    createdAt: b.latest,
    sampleCount: b.count
  }));
}


/**
 * Carga las últimas mediciones comunitarias desde Supabase.
 */
async function loadCommunityPoints() {
  const counter = document.getElementById('community-count');

  if (!supabaseClient) {
    counter.innerText = 'Sin datos comunitarios aún';
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('noise_measurements')
      .select('latitude, longitude, db_level, category, created_at')
      .order('created_at', { ascending: false })
      .limit(500);

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

// Carga inicial + refresco cada 60 s
loadCommunityPoints();
setInterval(loadCommunityPoints, 60000);

// ==========================================
// 2. NAVEGACIÓN ENTRE PESTAÑAS
// ==========================================
function switchTab(tabId, btn) {
  document
    .querySelectorAll(".tab-content")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(tabId).classList.add("active");
  btn.classList.add("active");

  if (tabId === "map-view") {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

// ==========================================
// 3. COLAPSAR / EXPANDIR PANEL (MÓVIL)
// ==========================================
function togglePanel() {
  const panel = document.getElementById("sensor-panel");
  const label = document.getElementById("handle-label");
  panel.classList.toggle("collapsed");
  label.innerText = panel.classList.contains("collapsed")
    ? "Mostrar detalles"
    : "Ocultar detalles";
}

// ==========================================
// 4. ESTADO GLOBAL
// ==========================================
let isMonitoring = false;
let audioCtx, analyser, microphone, stream;
let rafId = null;

let session = {
  sum: 0,
  count: 0,
  min: Infinity,
  max: -Infinity,
  startTime: 0,
  timerId: null,
};
let lastStatTime = 0;

let sharingEnabled = false;
let currentPosition = null;
let geoWatchId = null;
let blurOffset = { lat: 0, lng: 0 };

let sendWindowSum = 0;
let sendWindowCount = 0;
let lastSendTime = 0;
const SEND_INTERVAL_MS = 10000; // Enviar promedio cada 10 s

// ==========================================
// 5. CAPTURA Y PROCESAMIENTO DE AUDIO
// ==========================================
async function toggleMonitoring() {
  const btn = document.getElementById("btn-toggle");
  const badge = document.getElementById("status-badge");
  const pulse = document.getElementById("pulse-dot");
  const statusText = document.getElementById("status-text");

  if (!isMonitoring) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      microphone = audioCtx.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;

      isMonitoring = true;
      btn.innerText = "Detener Monitoreo";
      btn.style.background = "#dc2626";
      badge.classList.add("active");
      pulse.style.display = "inline-block";
      statusText.innerText = "Midiendo en Vivo";

      startSession();
      updateMeter();
    } catch (err) {
      console.error(err);
      alert("Permiso de micrófono denegado o no soportado.");
    }
  } else {
    isMonitoring = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    btn.innerText = "Activar Micrófono";
    btn.style.background = "var(--primary)";
    badge.classList.remove("active");
    pulse.style.display = "none";
    statusText.innerText = "Inactivo";
    document.getElementById("db-number").innerText = "--";
    document.getElementById("db-bar").style.width = "0%";
    document.getElementById("db-status-text").innerText = "Presiona Iniciar";
    stopSession();
  }
}

function startSession() {
  session = {
    sum: 0,
    count: 0,
    min: Infinity,
    max: -Infinity,
    startTime: Date.now(),
    timerId: null,
  };
  sendWindowSum = 0;
  sendWindowCount = 0;
  lastSendTime = Date.now();
  updateAvgUI();
  document.getElementById("avg-time").innerText = "00:00";

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
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  document.getElementById("avg-time").innerText = `${mm}:${ss}`;
}

function updateAvgUI() {
  const avgEl = document.getElementById("avg-number");
  const tagEl = document.getElementById("avg-tag");
  const minEl = document.getElementById("min-db");
  const maxEl = document.getElementById("max-db");
  const cntEl = document.getElementById("sample-count");

  if (session.count === 0) {
    avgEl.innerText = "--";
    tagEl.innerText = "Sin datos";
    tagEl.className = "avg-tag";
    minEl.innerText = "--";
    maxEl.innerText = "--";
    cntEl.innerText = "0";
    return;
  }

  const avg = Math.round(session.sum / session.count);
  avgEl.innerText = avg;

  const cat = classifyDb(avg);
  tagEl.innerText =
    cat === "bajo" ? "🟢 Bajo" : cat === "moderado" ? "🟡 Moderado" : "🔴 Alto";
  tagEl.className = "avg-tag " + cat;

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

  document.getElementById("db-number").innerText = `${db} dB`;
  const percent = Math.min(100, Math.max(0, (db / 100) * 100));
  const dbBar = document.getElementById("db-bar");
  dbBar.style.width = `${percent}%`;

  const dbStatus = document.getElementById("db-status-text");
  if (db < 55) {
    dbBar.style.backgroundColor = "var(--green)";
    dbStatus.innerText = "🟢 Bajo (Confortable)";
  } else if (db <= 70) {
    dbBar.style.backgroundColor = "var(--yellow)";
    dbStatus.innerText = "🟡 Moderado (Tráfico/Ocupado)";
  } else {
    dbBar.style.backgroundColor = "var(--red)";
    dbStatus.innerText = "🔴 Alto (Ruido Molesto)";
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
// 6. PRIVACIDAD + ENVÍO A SUPABASE
// ==========================================
function blurLocation(lat, lng) {
  const step = 0.001; // ~111 m
  const bLat = Math.round(lat / step) * step + blurOffset.lat;
  const bLng = Math.round(lng / step) * step + blurOffset.lng;
  return { lat: bLat, lng: bLng };
}

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

  addCommunityPoint(blurred.lat, blurred.lng, avg, category, createdAt);

  if (supabaseClient) {
    const { error } = await supabaseClient.from("noise_measurements").insert({
      latitude: blurred.lat,
      longitude: blurred.lng,
      db_level: avg,
      category,
    });
    if (error) console.error("Supabase insert error:", error);
  }
}

function toggleSharing() {
  const cb = document.getElementById("share-toggle");
  const status = document.getElementById("share-status");
  sharingEnabled = cb.checked;

  if (sharingEnabled) {
    if (!navigator.geolocation) {
      status.innerText = "❌ Geolocalización no soportada por el navegador.";
      cb.checked = false;
      sharingEnabled = false;
      return;
    }

    status.innerHTML = "⏳ Solicitando permiso de ubicación…";

    blurOffset = {
      lat: (Math.random() - 0.5) * 0.0014,
      lng: (Math.random() - 0.5) * 0.0014,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        updateGpsChip(true);
        status.innerHTML =
          "✅ Compartiendo en el mapa (ubicación difuminada ~150 m).";
        lastSendTime = 0;

        if (geoWatchId === null) {
          geoWatchId = navigator.geolocation.watchPosition(
            (p) => {
              currentPosition = {
                lat: p.coords.latitude,
                lng: p.coords.longitude,
              };
            },
            (err) => console.warn("watchPosition:", err),
            { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
          );
        }
      },
      (err) => {
        console.warn(err);
        status.innerText = "❌ Permiso de ubicación denegado.";
        cb.checked = false;
        sharingEnabled = false;
        updateGpsChip(false);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  } else {
    status.innerHTML =
      "🔒 Compartir desactivado. Tus mediciones no salen de tu dispositivo.";
    updateGpsChip(false);
    currentPosition = null;
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
  }
}

function updateGpsChip(active) {
  const chip = document.getElementById("gps-chip");
  if (active) {
    chip.innerText = "📡 GPS: activo (difuminado)";
    chip.classList.add("ok");
  } else {
    chip.innerText = "📡 GPS: sin permiso";
    chip.classList.remove("ok");
  }
}
