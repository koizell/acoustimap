/**
 * app.js
 * Pestañas, leyenda colapsable, modales, botones de acción.
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
// LEYENDA COLAPSABLE
// ============================================
function toggleLegend() {
  const legend = document.getElementById('map-legend');
  legend.classList.toggle('collapsed');
}

// ============================================
// MODAL DE CONFIRMACIÓN DE COMPARTIR
// ============================================
function openShareModal() {
  // Si ya está compartiendo, desactivar directamente
  if (sharingEnabled) {
    toggleSharing();
    return;
  }
  document.getElementById('share-modal').classList.add('visible');
}

function closeShareModal() {
  document.getElementById('share-modal').classList.remove('visible');
}

function confirmSharing() {
  closeShareModal();
  toggleSharing();
}

// ============================================
// MODAL DE CONFIRMACIÓN DE MICRÓFONO
// ============================================
function openMicModal() {
  // Si ya está monitoreando, detener directamente
  if (isMonitoring) {
    toggleMonitoring();
    return;
  }
  document.getElementById('mic-modal').classList.add('visible');
}

function closeMicModal() {
  document.getElementById('mic-modal').classList.remove('visible');
}

function confirmMicActivation() {
  closeMicModal();
  toggleMonitoring();
}

// ============================================
// BOTONES PRINCIPALES
// ============================================
function updateActionButtons() {
  const btnShare = document.getElementById('btn-share');

  if (sharingEnabled) {
    btnShare.classList.add('active');
    btnShare.innerHTML = '<span class="action-icon">✅</span><span class="action-text">Compartiendo</span>';
  } else {
    btnShare.classList.remove('active');
    btnShare.innerHTML = '<span class="action-icon">📡</span><span class="action-text">Compartir en mapa</span>';
  }
}

// ============================================
// COMPARTIR UBICACIÓN
// ============================================
function toggleSharing() {
  const status = document.getElementById('share-status');
  sharingEnabled = !sharingEnabled;

  if (sharingEnabled) {
    if (!navigator.geolocation) {
      if (status) status.innerText = '❌ Geolocalización no soportada.';
      sharingEnabled = false;
      updateActionButtons();
      return;
    }

    if (status) status.innerHTML = '⏳ Buscando señal GPS…';

    // Resetear historial de posiciones
    positionHistory = [];

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        processNewPosition(pos);
        map.setView([currentPosition.lat, currentPosition.lng], 17);

        if (status) {
          status.innerHTML = '✅ Compartiendo. Los demás ven una zona anclada a ~70 m.';
        }
        updateActionButtons();
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
        if (status) status.innerText = '❌ Permiso de ubicación denegado.';
        sharingEnabled = false;
        updateActionButtons();
        updateGpsChip(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    if (status) {
      status.innerHTML = '🔒 Compartir desactivado. Tus mediciones no salen de tu dispositivo.';
    }
    updateGpsChip(false);
    hideMyLocation();
    currentPosition = null;
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
    updateActionButtons();
    loadCommunityPoints();
  }
}

// ============================================
// CHIP DE GPS
// ============================================
function updateGpsChip(active, accuracy) {
  const chip = document.getElementById('gps-chip');
  if (!chip) return;

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