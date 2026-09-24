/**
 * map.js
 * Mapa Leaflet, capas, marcador personal, heatmap y botón centrar.
 * Depende de: config.js, Leaflet, leaflet.heat.
 */

// ============================================
// MAPA Y CAPAS
// ============================================
const map = L.map('map', {
  zoomControl: false,
  zoomSnap: 0.25,
  zoomDelta: 0.25
}).setView([8.75, -75.88], 14);

L.control.zoom({ position: 'topleft' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

const communityLayer  = L.layerGroup().addTo(map);
const myLocationLayer = L.layerGroup().addTo(map);

// ============================================
// HEATMAP: una sola instancia reutilizable
// ============================================
let communityHeatLayer = null;
let heatmapReady = false;

/** Espera a que el mapa tenga dimensiones > 0 antes de dibujar el heatmap */
function waitForMapSize(callback, attempts = 0) {
  const mapEl = document.getElementById('map');
  if (mapEl && mapEl.offsetWidth > 0 && mapEl.offsetHeight > 0) {
    heatmapReady = true;
    callback();
    return;
  }
  if (attempts > 20) {
    console.warn('Mapa sin dimensiones después de 20 intentos');
    return;
  }
  setTimeout(() => waitForMapSize(callback, attempts + 1), 150);
}

/** Crear la instancia del heatmap (una sola vez) */
function ensureHeatLayer() {
  if (communityHeatLayer) return communityHeatLayer;

  communityHeatLayer = L.heatLayer([], {
    radius: 35,
    blur: 25,
    maxZoom: 17,
    minOpacity: 0.22,
    gradient: {
      0.0: '#22c55e',
      0.35: '#84cc16',
      0.55: '#facc15',
      0.75: '#f97316',
      1.0: '#dc2626'
    }
  });

  return communityHeatLayer;
}

/** Asigna los puntos al heatmap (nunca lo recrea) */
function setCommunityHeatPoints(points) {
  // Limpiar capa de círculos
  if (communityLayer) communityLayer.clearLayers();

  // Crear heatmap si no existe
  const layer = ensureHeatLayer();

  if (!points || points.length === 0) {
    // Sin datos: ocultar el heatmap si está en el mapa
    if (map.hasLayer(layer)) map.removeLayer(layer);
    return;
  }

  // Preparar datos normalizados
  const heatData = points.map((p) => [
    p.lat,
    p.lng,
    typeof normalizeDbForHeatmap === 'function'
      ? normalizeDbForHeatmap(p.db)
      : Math.min(Math.max((p.db - 30) / 70, 0.05), 1.0)
  ]);

  // Esperar a que el mapa esté listo antes de añadir
  waitForMapSize(() => {
    try {
      layer.setLatLngs(heatData);
      if (!map.hasLayer(layer)) {
        layer.addTo(map);
      }
    } catch (e) {
      console.warn('Error actualizando heatmap:', e.message);
    }
  });
}

/** Añadir un punto individual al heatmap (sin recrear) */
function addCommunityHeatPoint(lat, lng, db) {
  const layer = ensureHeatLayer();
  const intensity = typeof normalizeDbForHeatmap === 'function'
    ? normalizeDbForHeatmap(db)
    : Math.min(Math.max((db - 30) / 70, 0.05), 1.0);

  waitForMapSize(() => {
    try {
      const current = layer._latlngs || [];
      current.push([lat, lng, intensity]);
      layer.setLatLngs(current);
      if (!map.hasLayer(layer)) layer.addTo(map);
    } catch (e) {
      console.warn('Error añadiendo punto al heatmap:', e.message);
    }
  });
}

/** Limpiar capas comunitarias */
function clearCommunityLayers() {
  if (communityLayer) communityLayer.clearLayers();
  if (communityHeatLayer && map.hasLayer(communityHeatLayer)) {
    map.removeLayer(communityHeatLayer);
  }
}

// ============================================
// BOTÓN "CENTRAR EN MÍ"
// ============================================
const LocateControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const link = L.DomUtil.create('a', 'locate-btn', container);
    link.href = '#';
    link.title = 'Centrar en mi ubicación';
    link.innerHTML = '📍';
    L.DomEvent.on(link, 'click', function (e) {
      L.DomEvent.stop(e);
      container.classList.add('locating');
      centerOnUser();
      setTimeout(() => container.classList.remove('locating'), 2000);
    });
    return container;
  }
});
map.addControl(new LocateControl());

// ============================================
// RESIZEOBSERVER
// ============================================
const resizeObserver = new ResizeObserver(() => {
  setTimeout(() => {
    if (map && typeof map.invalidateSize === 'function') {
      map.invalidateSize();
    }
  }, 200);
});
const mapEl = document.getElementById('map');
if (mapEl) resizeObserver.observe(mapEl);

window.addEventListener('orientationchange', () => {
  setTimeout(() => map.invalidateSize(), 300);
});

// ============================================
// PROCESAR NUEVA POSICIÓN
// ============================================
function processNewPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;

  positionHistory.push({
    lat: latitude,
    lng: longitude,
    accuracy: accuracy,
    time: Date.now()
  });
  if (positionHistory.length > 10) positionHistory.shift();

  let effectiveAccuracy = accuracy;

  if (positionHistory.length >= STABILITY_MIN_SAMPLES) {
    const recent = positionHistory.slice(-STABILITY_MIN_SAMPLES);
    const centerLat = recent.reduce((s, p) => s + p.lat, 0) / recent.length;
    const centerLng = recent.reduce((s, p) => s + p.lng, 0) / recent.length;

    const maxSpread = Math.max(...recent.map(p =>
      haversineDistance(centerLat, centerLng, p.lat, p.lng)
    ));

    if (maxSpread < STABILITY_THRESHOLD_M) {
      const bestAccuracy = Math.min(...recent.map(p => p.accuracy));
      effectiveAccuracy = Math.max(bestAccuracy, maxSpread, 5);
    }
  }

  currentPosition = {
    lat: latitude,
    lng: longitude,
    accuracy: effectiveAccuracy
  };

  showMyLocation(latitude, longitude, effectiveAccuracy);
  updateGpsChip(true, effectiveAccuracy);
}

// ============================================
// MOSTRAR MI UBICACIÓN
// ============================================
function showMyLocation(lat, lng, accuracy) {
  myLocationLayer.clearLayers();

  const visualAccuracy = Math.min(accuracy, MAX_VISUAL_ACCURACY_M);

  if (visualAccuracy > 0) {
    L.circle([lat, lng], {
      radius: visualAccuracy,
      color: '#2563eb',
      weight: 1,
      opacity: 0.25,
      fillColor: '#2563eb',
      fillOpacity: 0.04,
      interactive: false
    }).addTo(myLocationLayer);
  }

  L.circleMarker([lat, lng], {
    radius: 7,
    color: '#ffffff',
    weight: 3,
    fillColor: '#2563eb',
    fillOpacity: 1
  })
    .addTo(myLocationLayer)
    .bindPopup(
      '<b>📍 Tu ubicación</b><br>' +
      `<small>Precisión: ±${Math.round(accuracy)} m</small>`
    );
}

function hideMyLocation() {
  myLocationLayer.clearLayers();
  positionHistory = [];
}

// ============================================
// CENTRAR EN EL USUARIO
// ============================================
function centerOnUser() {
  if (currentPosition) {
    map.setView([currentPosition.lat, currentPosition.lng], 17);
    showMyLocation(currentPosition.lat, currentPosition.lng, currentPosition.accuracy);
    return;
  }

  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      processNewPosition(pos);
      map.setView([currentPosition.lat, currentPosition.lng], 17);

      if (geoWatchId === null) {
        geoWatchId = navigator.geolocation.watchPosition(
          processNewPosition,
          (err) => console.warn('watchPosition:', err),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
      }
    },
    (err) => {
      console.warn(err);
      alert('No se pudo obtener tu ubicación: ' + err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}
