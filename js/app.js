/**
 * app.js
 * Pestañas, panel colapsable, compartir ubicación, GPS chip.
 * Depende de: todos los módulos anteriores.
 */

// ============================================
// NAVEGACIÓN ENTRE PESTAÑAS
// ============================================
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');

  if (tabId === 'map-view') {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

// ============================================
// COLAPSAR PANEL
// ============================================
function togglePanel() {
  const panel = document.getElementById('sensor-panel');
  const label = document.getElementById('handle-label');
  panel.classList.toggle('collapsed');
  label.innerText = panel.classList.contains('collapsed')
    ? 'Mostrar detalles'
    : 'Ocultar detalles';
}

// ============================================
// COMPARTIR UBICACIÓN
// ============================================
function toggleSharing() {
  const cb     = document.getElementById('share-toggle');
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
        currentPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        showMyLocation(currentPosition.lat, currentPosition.lng, currentPosition.accuracy);
        map.setView([currentPosition.lat, currentPosition.lng], 16);

        updateGpsChip(true);
        status.innerHTML = '✅ Compartiendo. Los demás ven una zona anclada a ~70 m.';
        lastSendTime = 0;

        loadCommunityPoints();

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
        status.innerText = '❌ Permiso de ubicación denegado.';
        cb.checked = false;
        sharingEnabled = false;
        updateGpsChip(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    status.innerHTML = '🔒 Compartir desactivado. Tus mediciones no salen de tu dispositivo.';
    updateGpsChip(false);
    hideMyLocation();
    currentPosition = null;
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    loadCommunityPoints();
  }
}

// ============================================
// CHIP DE GPS
// ============================================
function updateGpsChip(active) {
  const chip = document.getElementById('gps-chip');
  if (active) {
    chip.innerText = '📡 GPS: activo';
    chip.classList.add('ok');
  } else {
    chip.innerText = '📡 GPS: sin permisos';
    chip.classList.remove('ok');
  }
}