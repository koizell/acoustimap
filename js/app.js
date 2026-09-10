/**
 * app.js
 * Pestañas, panel colapsable, compartir ubicación, GPS chip.
 * Depende de: config.js, map.js, kalman.js.
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

    // Resetear filtro al iniciar nueva sesión
    gpsFilter.reset();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        processNewPosition(pos);
        map.setView([currentPosition.lat, currentPosition.lng], 16);

        const q = gpsQuality(currentPosition.accuracy);
        if (q === 'good') {
          status.innerHTML = '✅ Compartiendo. Señal GPS excelente (±' +
            Math.round(currentPosition.accuracy) + ' m).';
        } else if (q === 'medium') {
          status.innerHTML = '⚠️ Compartiendo. Señal GPS regular (±' +
            Math.round(currentPosition.accuracy) + ' m). <b>Calibra la brújula moviendo el teléfono en forma de 8.</b>';
        } else {
          status.innerHTML = '⚠️ Compartiendo. Señal GPS débil (±' +
            Math.round(currentPosition.accuracy) + ' m). <b>Sal a un espacio abierto y calibra moviendo el teléfono en forma de 8.</b>';
        }

        lastSendTime = 0;
        loadCommunityPoints();

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
    gpsFilter.reset();
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    loadCommunityPoints();
  }
}

// ============================================
// CHIP DE GPS (muestra precisión en metros)
// ============================================
function updateGpsChip(active, accuracy) {
  const chip = document.getElementById('gps-chip');

  if (!active) {
    chip.innerText = '📡 GPS: sin permisos';
    chip.classList.remove('ok', 'medium', 'poor');
    return;
  }

  const q = gpsQuality(accuracy);
  const accText = accuracy ? `±${Math.round(accuracy)} m` : '';

  chip.classList.remove('ok', 'medium', 'poor');

  if (q === 'good') {
    chip.innerText = `📡 GPS: ${accText}`;
    chip.classList.add('ok');
  } else if (q === 'medium') {
    chip.innerText = `📡 GPS: ${accText} ⚠️`;
    chip.classList.add('medium');
  } else {
    chip.innerText = `📡 GPS: ${accText} ❌`;
    chip.classList.add('poor');
  }
}