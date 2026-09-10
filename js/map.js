/**
 * map.js
 * Mapa Leaflet, capas, marcador personal, botón centrar y ResizeObserver.
 * Depende de: config.js, Leaflet.
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
// RESIZEOBSERVER: recalcular el mapa al cambiar de tamaño
// ============================================
const resizeObserver = new ResizeObserver(() => {
  // Se llama cada vez que el contenedor del mapa cambia de tamaño
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
// MOSTRAR MI UBICACIÓN
// ============================================
function showMyLocation(lat, lng, accuracy) {
  myLocationLayer.clearLayers();

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

  L.circleMarker([lat, lng], {
    radius: 18,
    color: '#2563eb',
    weight: 1,
    opacity: 0.35,
    fillColor: '#2563eb',
    fillOpacity: 0.15,
    interactive: false
  }).addTo(myLocationLayer);

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
// CENTRAR EN EL USUARIO
// ============================================
function centerOnUser() {
  if (currentPosition) {
    map.setView([currentPosition.lat, currentPosition.lng], 16);
    showMyLocation(currentPosition.lat, currentPosition.lng, currentPosition.accuracy);
    return;
  }

  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };
      showMyLocation(currentPosition.lat, currentPosition.lng, currentPosition.accuracy);
      map.setView([currentPosition.lat, currentPosition.lng], 16);

      if (geoWatchId === null) {
        geoWatchId = navigator.geolocation.watchPosition(
          (p) => {
            currentPosition = {
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              accuracy: p.coords.accuracy
            };
            showMyLocation(currentPosition.lat, currentPosition.lng, currentPosition.accuracy);
          },
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