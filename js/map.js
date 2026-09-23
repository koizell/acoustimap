/**
 * map.js
 * Mapa Leaflet, capas, marcador personal, botón centrar y ResizeObserver.
 * Depende de: config.js, Leaflet.
 *
 * PRECISIÓN PROGRESIVA (estilo Google Maps):
 *   - Se mantiene un historial de las últimas lecturas GPS.
 *   - Si varias lecturas son cercanas entre sí, la posición es "estable"
 *     y el círculo de precisión se encoge automáticamente.
 *   - El círculo visual NUNCA excede MAX_VISUAL_ACCURACY_M metros.
 */

// ============================================
// MAPA Y CAPAS
// ============================================
const map = L.map('map', {
  zoomControl: false,
  zoomSnap: 0.25,
  zoomDelta: 0.25,
  wheelPxPerZoomLevel: 120
}).setView([8.75, -75.88], 14);

L.control.zoom({ position: 'topleft' }).addTo(map);

// ✅ detectRetina eliminado: causa que las etiquetas se vean más pequeñas
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

const communityLayer  = L.layerGroup().addTo(map);
const communityHeatLayer = L.heatLayer([], {
  radius: 35,
  blur: 25,
  maxZoom: 17,
  minOpacity: 0.15,
  gradient: {
    0.0: '#2563eb',
    0.35: '#10b981',
    0.55: '#f59e0b',
    0.75: '#ef4444',
    1.0: '#7f1d1d'
  }
});
const myLocationLayer = L.layerGroup().addTo(map);

function clearCommunityLayers() {
  communityLayer.clearLayers();
  communityHeatLayer.setLatLngs([]);
  if (map.hasLayer(communityHeatLayer)) map.removeLayer(communityHeatLayer);
}

function setCommunityHeatPoints(points) {
  const heatPoints = points.map((point) => [
    point.lat,
    point.lng,
    normalizeDbForHeatmap(point.db)
  ]);
  communityHeatLayer.setLatLngs(heatPoints);
  if (!map.hasLayer(communityHeatLayer)) communityHeatLayer.addTo(map);
}

function addCommunityHeatPoint(lat, lng, db) {
  communityHeatLayer.addLatLng([
    lat,
    lng,
    normalizeDbForHeatmap(db)
  ]);
  if (!map.hasLayer(communityHeatLayer)) communityHeatLayer.addTo(map);
}

// ============================================
// RESIZEOBSERVER: recalcular el mapa al cambiar de tamaño
// ============================================
const resizeObserver = new ResizeObserver(() => {
  setTimeout(() => map.invalidateSize(), 150);
});
resizeObserver.observe(document.getElementById('map'));

// También al cambiar de orientación en móvil
window.addEventListener('orientationchange', () => {
  setTimeout(() => map.invalidateSize(), 300);
});

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
// PROCESAR NUEVA POSICIÓN (con detección de estabilidad)
// ============================================
/**
 * Recibe una lectura cruda del GPS, la guarda en el historial,
 * detecta si la posición es estable, calcula la precisión efectiva
 * y actualiza el marcador.
 */
function processNewPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;

  // Guardar en el historial
  positionHistory.push({
    lat: latitude,
    lng: longitude,
    accuracy: accuracy,
    time: Date.now()
  });
  if (positionHistory.length > 10) positionHistory.shift();

  // Calcular precisión efectiva
  let effectiveAccuracy = accuracy;

  if (positionHistory.length >= STABILITY_MIN_SAMPLES) {
    const recent = positionHistory.slice(-STABILITY_MIN_SAMPLES);

    // Centroide de las últimas lecturas
    const centerLat = recent.reduce((s, p) => s + p.lat, 0) / recent.length;
    const centerLng = recent.reduce((s, p) => s + p.lng, 0) / recent.length;

    // Máxima distancia de cualquier lectura al centroide
    const maxSpread = Math.max(...recent.map(p =>
      haversineDistance(centerLat, centerLng, p.lat, p.lng)
    ));

    if (maxSpread < STABILITY_THRESHOLD_M) {
      // Posición estable → tomar la mejor precisión vista
      const bestAccuracy = Math.min(...recent.map(p => p.accuracy));
      effectiveAccuracy = Math.max(bestAccuracy, maxSpread, 5);
    }
  }

  // Actualizar estado global
  currentPosition = {
    lat: latitude,
    lng: longitude,
    accuracy: effectiveAccuracy
  };

  // Dibujar
  showMyLocation(latitude, longitude, effectiveAccuracy);
  updateGpsChip(true, effectiveAccuracy);
}

// ============================================
// MOSTRAR MI UBICACIÓN (estilo Google Maps)
// ============================================
function showMyLocation(lat, lng, accuracy) {
  myLocationLayer.clearLayers();

  // Cap visual: nunca dibujar círculos gigantes
  const visualAccuracy = Math.min(accuracy, MAX_VISUAL_ACCURACY_M);

  if (visualAccuracy > 0) {
    L.circle([lat, lng], {
      radius: visualAccuracy,
      color: '#2563eb',
      weight: 1,
      opacity: 0.35,
      fillColor: '#2563eb',
      fillOpacity: 0.1,
      interactive: false
    }).addTo(myLocationLayer);
  }

  // Punto azul pequeño (estilo Google Maps)
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
      `<small>Precisión: ±${Math.round(accuracy)} m</small><br>` +
      '<small>Solo tú puedes verla. No se comparte.</small>'
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