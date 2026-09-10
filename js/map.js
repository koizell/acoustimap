/**
 * map.js
 * Mapa Leaflet, capas, marcador personal, botón "centrar en mí" y filtro Kalman.
 * Depende de: config.js, kalman.js.
 */

// ============================================
// MAPA Y CAPAS
// ============================================
const map = L.map('map', { zoomControl: false }).setView([8.75, -75.88], 14);

L.control.zoom({ position: 'topleft' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
  detectRetina: true
}).addTo(map);

const communityLayer  = L.layerGroup().addTo(map);
const myLocationLayer = L.layerGroup().addTo(map);

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
// MOSTRAR MI UBICACIÓN (con precisión)
// ============================================
function showMyLocation(lat, lng, accuracy) {
  myLocationLayer.clearLayers();

  // Círculo de precisión (margen de error real del GPS)
  if (accuracy && accuracy > 0) {
    L.circle([lat, lng], {
      radius: accuracy,
      color: '#2563eb',
      weight: 1,
      opacity: 0.25,
      fillColor: '#2563eb',
      fillOpacity: 0.08,
      interactive: false
    }).addTo(myLocationLayer);
  }

  // Halo exterior
  L.circleMarker([lat, lng], {
    radius: 18,
    color: '#2563eb',
    weight: 1,
    opacity: 0.35,
    fillColor: '#2563eb',
    fillOpacity: 0.15,
    interactive: false
  }).addTo(myLocationLayer);

  // Punto central exacto
  L.circleMarker([lat, lng], {
    radius: 8,
    color: '#ffffff',
    weight: 3,
    fillColor: '#2563eb',
    fillOpacity: 1
  })
    .addTo(myLocationLayer)
    .bindPopup(
      '<b>📍 Tu ubicación exacta</b><br>' +
      `<small>Precisión: ±${Math.round(accuracy || 0)} m</small><br>` +
      '<small>Solo tú puedes verla. No se comparte.</small>'
    );
}

function hideMyLocation() {
  myLocationLayer.clearLayers();
}

// ============================================
// PROCESAR NUEVA POSICIÓN (con filtro Kalman)
// ============================================
/**
 * Recibe una posición cruda del GPS, la pasa por el filtro Kalman
 * y actualiza el marcador. También actualiza el chip de GPS.
 */
function processNewPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  const now = pos.timestamp || Date.now();

  // Filtro Kalman
  gpsFilter.process(latitude, longitude, accuracy, now);

  const filteredLat = gpsFilter.getLat();
  const filteredLng = gpsFilter.getLng();
  const filteredAcc = gpsFilter.getAccuracy();

  // Actualizar estado global
  currentPosition = {
    lat: filteredLat,
    lng: filteredLng,
    accuracy: filteredAcc
  };

  // Actualizar marcador y chip
  showMyLocation(filteredLat, filteredLng, filteredAcc);
  updateGpsChip(true, filteredAcc);
}

// ============================================
// CENTRAR EN EL USUARIO
// ============================================
function centerOnUser() {
  // Si ya tenemos posición, centramos directo
  if (currentPosition) {
    map.setView([currentPosition.lat, currentPosition.lng], 16);
    showMyLocation(currentPosition.lat, currentPosition.lng, currentPosition.accuracy);
    return;
  }

  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  // Resetear el filtro antes de una nueva sesión
  gpsFilter.reset();

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      processNewPosition(pos);
      map.setView([currentPosition.lat, currentPosition.lng], 16);

      // Activar watch si no está activo
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