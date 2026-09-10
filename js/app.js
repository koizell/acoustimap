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

    status.innerHTML = '⏳ Buscando señal GPS…';

    // Resetear historial para nueva sesión
    positionHistory = [];

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        processNewPosition(pos);
        map.setView([currentPosition.lat, currentPosition.lng], 17);

        updateShareStatus();
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
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    loadCommunityPoints();
  }
}

// ============================================
// ESTADO DEL COMPARTIR (según precisión)
// ============================================
function updateShareStatus() {
  const status = document.getElementById('share-status');
  if (!sharingEnabled || !currentPosition) return;

  const acc = Math.round(currentPosition.accuracy);
  if (acc <= 10) {
    status.innerHTML = `✅ Compartiendo. Señal excelente (±${acc} m).`;
  } else if (acc <= 30) {
    status.innerHTML = `✅ Compartiendo. Señal buena (±${acc} m). Los demás ven una zona anclada a ~70 m.`;
  } else {
    status.innerHTML = `⚠️ Compartiendo. Señal regular (±${acc} m). <b>Calibra la brújula moviendo el teléfono en forma de 8.</b>`;
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

  const accText = accuracy ? `±${Math.round(accuracy)} m` : '';
  chip.classList.remove('ok', 'medium', 'poor');

  if (!accuracy || accuracy > 40) {
    chip.innerText = `📡 GPS: ${accText || 'buscando…'} ❌`;
    chip.classList.add('poor');
  } else if (accuracy > 15) {
    chip.innerText = `📡 GPS: ${accText} ⚠️`;
    chip.classList.add('medium');
  } else {
    chip.innerText = `📡 GPS: ${accText}`;
    chip.classList.add('ok');
  }
}