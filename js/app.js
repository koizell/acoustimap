/**
 * app.js
 * Pestañas, leyenda, modales, toggle del panel.
 */

// ============================================
// NAVEGACIÓN ENTRE PESTAÑAS
// ============================================
function switchTab(tabId, btn) {
  if (tabId !== 'map-view') suspendMapHeatLayers();
  document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  const tab = document.getElementById(tabId);
  if (tab) tab.classList.add('active');
  if (btn) btn.classList.add('active');
  if (tabId === 'map-view') {
    setTimeout(() => {
      invalidateMapIfVisible();
      if (typeof activateComparisonLayer === 'function') activateComparisonLayer();
      if (typeof loadCommunityPoints === 'function') loadCommunityPoints();
    }, 200);
  }
}

// ============================================
// LEYENDA
// ============================================
function toggleLegend() {
  const legend = document.getElementById('map-legend');
  if (!legend) return;
  legend.classList.toggle('collapsed');
  document.getElementById('legend-toggle')?.setAttribute('aria-expanded', String(!legend.classList.contains('collapsed')));
}

// ============================================
// TOGGLE PANEL DE ESTADÍSTICAS
// ============================================
function toggleStatsPanel() {
  const panel = document.getElementById('stats-panel');
  if (!panel) return;

  panel.classList.toggle('collapsed');
  const isCollapsed = panel.classList.contains('collapsed');

  const label = document.getElementById('stats-handle-label');
  if (label) label.innerText = isCollapsed ? 'Mostrar detalles' : 'Ocultar detalles';
  const handle = panel.querySelector('.stats-handle');
  if (handle) handle.setAttribute('aria-expanded', String(!isCollapsed));
}

function updateMapAttributionClearance() {
  const mapView = document.getElementById('map-view');
  const panel = document.getElementById('stats-panel');
  if (!mapView || !panel) return;

  if (window.matchMedia('(max-width: 719px)').matches) {
    mapView.style.setProperty(
      '--map-attribution-clearance',
      `${Math.ceil(panel.getBoundingClientRect().height + 18)}px`
    );
  } else {
    mapView.style.removeProperty('--map-attribution-clearance');
  }
}

window.addEventListener('resize', updateMapAttributionClearance);
document.getElementById('stats-panel')?.addEventListener('transitionend', (event) => {
  if (event.target === event.currentTarget && event.propertyName === 'max-height') {
    updateMapAttributionClearance();
  }
});
requestAnimationFrame(updateMapAttributionClearance);

// ============================================
// MODALES
// ============================================
function openShareModal() {
  if (sharingEnabled) { toggleSharing(); return; }
  const modal = document.getElementById('share-modal');
  if (modal) modal.classList.add('visible');
}
function closeShareModal() {
  const modal = document.getElementById('share-modal');
  if (modal) modal.classList.remove('visible');
}
function confirmSharing() { closeShareModal(); toggleSharing(); }

function openMicModal() {
  if (isMonitoring) { toggleMonitoring(); return; }
  const modal = document.getElementById('mic-modal');
  if (modal) modal.classList.add('visible');
}
function closeMicModal() {
  const modal = document.getElementById('mic-modal');
  if (modal) modal.classList.remove('visible');
}
function confirmMicActivation() { closeMicModal(); toggleMonitoring(); }

// ============================================
// BOTONES PRINCIPALES
// ============================================
function updateActionButtons() {
  const btnShare = document.getElementById('btn-share');
  if (!btnShare) return;

  if (sharingEnabled) {
    btnShare.classList.add('active');
    btnShare.innerHTML = '<span class="action-icon">✅</span><span class="action-text">Compartiendo</span>';
  } else {
    btnShare.classList.remove('active');
    btnShare.innerHTML = '<span class="action-icon">📡</span><span class="action-text">Compartir</span>';
  }
}

// ============================================
// COMPARTIR UBICACIÓN
// ============================================
const sharingCopy = {
  es: { unsupported: '❌ Geolocalización no soportada.', searching: '⏳ Buscando señal GPS…', sharing: '✅ Compartiendo.', denied: '❌ No se obtuvo la ubicación. Revisa el permiso y la señal GPS.', disabled: '🔒 Compartir desactivado.', noPermission: 'sin permiso', locating: 'buscando…' },
  en: { unsupported: '❌ Geolocation is unavailable.', searching: '⏳ Looking for a GPS signal…', sharing: '✅ Sharing.', denied: '❌ Location unavailable. Check your permission and GPS signal.', disabled: '🔒 Sharing turned off.', noPermission: 'no permission', locating: 'locating…' },
  pt: { unsupported: '❌ Geolocalização indisponível.', searching: '⏳ Procurando sinal GPS…', sharing: '✅ Compartilhando.', denied: '❌ Localização indisponível. Verifique a permissão e o sinal GPS.', disabled: '🔒 Compartilhamento desativado.', noPermission: 'sem permissão', locating: 'procurando…' }
};

function sharingText(key) {
  return (sharingCopy[document.documentElement.lang] || sharingCopy.es)[key];
}

function toggleSharing() {
  const status = document.getElementById('share-status');
  sharingEnabled = !sharingEnabled;

  if (sharingEnabled) {
    if (!navigator.geolocation) {
      if (status) status.innerText = sharingText('unsupported');
      sharingEnabled = false;
      updateActionButtons();
      return;
    }
    if (status) status.innerText = sharingText('searching');
    positionHistory = [];

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        processNewPosition(pos);
        map.setView([currentPosition.lat, currentPosition.lng], 17);
        if (status) status.innerText = sharingText('sharing');
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
        if (status) status.innerText = sharingText('denied');
        sharingEnabled = false;
        updateActionButtons();
        updateGpsChip(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    if (status) status.innerText = sharingText('disabled');
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
// CHIP GPS
// ============================================
function updateGpsChip(active, accuracy) {
  const chip = document.getElementById('gps-chip');
  if (!chip) return;

  if (!active) {
    chip.innerText = `📡 GPS: ${sharingText('noPermission')}`;
    chip.classList.remove('ok', 'medium', 'poor');
    return;
  }

  const accText = accuracy ? `±${Math.round(accuracy)} m` : '';
  chip.classList.remove('ok', 'medium', 'poor');

  if (!accuracy || accuracy > 40) {
    chip.innerText = `📡 GPS: ${accText || sharingText('locating')} ❌`;
    chip.classList.add('poor');
  } else if (accuracy > 15) {
    chip.innerText = `📡 GPS: ${accText} ⚠️`;
    chip.classList.add('medium');
  } else {
    chip.innerText = `📡 GPS: ${accText}`;
    chip.classList.add('ok');
  }
}
