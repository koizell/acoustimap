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
  if (tabId !== 'map-view' && typeof revealUi === 'function') revealUi(tab?.querySelector?.('.info-wrapper, .stats-page'));
  if (btn) btn.classList.add('active');
  if (tabId === 'map-view') {
    setTimeout(() => {
      invalidateMapIfVisible();
      if (typeof renderCommunityPoints === 'function') renderCommunityPoints(lastAggregatedPoints);
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
  const collapsed = legend.classList.contains('collapsed');
  legend.inert = collapsed;
  const toggle = document.getElementById('legend-toggle');
  toggle?.setAttribute('aria-expanded', String(!collapsed));
  if (collapsed && legend.contains(document.activeElement)) toggle?.focus();
  if (!collapsed) revealUi(legend);
  if (!collapsed && typeof closeFeatureMenu === 'function') closeFeatureMenu();
  const filters = document.getElementById('map-filters');
  if (!collapsed && filters) filters.open = false;
}

function onMapFiltersToggle() {
  const filters = document.getElementById('map-filters');
  if (!filters?.open) return;
  if (typeof closeFeatureMenu === 'function') closeFeatureMenu();
  const legend = document.getElementById('map-legend');
  if (legend && !legend.classList.contains('collapsed')) toggleLegend();
  revealUi(filters.querySelector('.map-filters-body'));
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
  if (label) label.innerText = sharingText(isCollapsed ? 'showDetails' : 'hideDetails');
  const handle = panel.querySelector('.stats-handle');
  if (handle) handle.setAttribute('aria-expanded', String(!isCollapsed));
  const content = document.getElementById('stats-content');
  if (content) content.inert = isCollapsed;
  if (isCollapsed && content?.contains(document.activeElement)) handle?.focus();
  if (!isCollapsed) revealUi(content);
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
// Los avisos GPS y el diagnóstico también cambian la altura sin transición CSS.
const attributionPanel = document.getElementById('stats-panel');
if (attributionPanel && typeof ResizeObserver === 'function') {
  new ResizeObserver(updateMapAttributionClearance).observe(attributionPanel);
}

// ============================================
// MODALES
// ============================================
let privacyModalState = null;

function openPrivacyModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  if (privacyModalState) closePrivacyModal(privacyModalState.modal.id);
  const background = [...document.querySelectorAll('header, .tab-content')]
    .map((element) => [element, element.inert]);
  privacyModalState = { modal, trigger: document.activeElement, background };
  background.forEach(([element]) => { element.inert = true; });
  modal.inert = false;
  modal.classList.add('visible');
  revealUi(modal.querySelector('.modal-content'));
  modal.querySelector('.cancel')?.focus();
}

function closePrivacyModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('visible');
  modal.inert = true;
  if (privacyModalState?.modal !== modal) return;
  const { trigger, background } = privacyModalState;
  privacyModalState = null;
  background.forEach(([element, inert]) => { element.inert = inert; });
  if (trigger?.isConnected) trigger.focus();
}

function handlePrivacyModalKeydown(event) {
  const filters = document.getElementById('map-filters');
  if (!privacyModalState && event.key === 'Escape' && filters?.open) {
    filters.open = false;
    filters.querySelector('summary')?.focus();
    return;
  }
  const legend = document.getElementById('map-legend');
  if (!privacyModalState && event.key === 'Escape' && legend && !legend.classList.contains('collapsed')) {
    toggleLegend();
    document.getElementById('legend-toggle')?.focus();
    return;
  }
  if (!privacyModalState) return;
  const modal = privacyModalState.modal;
  if (event.key === 'Escape') {
    event.preventDefault();
    closePrivacyModal(modal.id);
  } else if (event.key === 'Tab') {
    const buttons = [...modal.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}

document.addEventListener('keydown', handlePrivacyModalKeydown);

document.addEventListener('pointerdown', (event) => {
  const legend = document.getElementById('map-legend');
  const toggle = document.getElementById('legend-toggle');
  if (legend && !legend.classList.contains('collapsed') && !legend.contains(event.target) && !toggle?.contains(event.target)) toggleLegend();
  const filters = document.getElementById('map-filters');
  if (filters?.open && !filters.contains(event.target)) filters.open = false;
});


function openShareModal() {
  if (sharingEnabled) { toggleSharing(); return; }
  openPrivacyModal('share-modal');
}
function closeShareModal() {
  closePrivacyModal('share-modal');
}
function confirmSharing() { closeShareModal(); toggleSharing(); }

function openMicModal() {
  if (isMonitoring) { toggleMonitoring(); return; }
  openPrivacyModal('mic-modal');
}
function closeMicModal() {
  closePrivacyModal('mic-modal');
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
    const state = sharingStatusKey === 'searching' ? 'locating'
      : sharingDeliveryState !== 'idle' ? sharingDeliveryState : !isMonitoring ? 'gpsReady' : 'waiting';
    btnShare.innerHTML = `<span class="action-icon">${actionIconMarkup(state === 'published' ? 'check' : 'location')}</span><span class="action-text">${sharingDeliveryText(state)}</span>`;
  } else {
    btnShare.classList.remove('active');
    btnShare.innerHTML = `<span class="action-icon">${actionIconMarkup('location')}</span><span class="action-text">${sharingText('share')}</span>`;
  }
  btnShare.setAttribute('aria-pressed', String(sharingEnabled));
}

// ============================================
// COMPARTIR UBICACIÓN
// ============================================
const sharingCopy = {
  es: { unsupported: 'Geolocalización no soportada.', searching: 'Buscando señal GPS…', sharing: 'Compartiendo.', denied: 'No se obtuvo la ubicación. Revisa el permiso y la señal GPS.', schemaOutOfDate: 'La base no acepta esta versión del método. Falta aplicar la migración.', disabled: 'Compartir desactivado.', noPermission: 'sin permiso', locating: 'buscando…', share: 'Compartir', shareActive: 'Compartiendo', showDetails: 'Detalles y ayuda', hideDetails: 'Ocultar detalles' },
  en: { unsupported: 'Geolocation is unavailable.', searching: 'Looking for a GPS signal…', sharing: 'Sharing.', denied: 'Location unavailable. Check your permission and GPS signal.', schemaOutOfDate: 'The database does not accept this method version yet. The migration is missing.', disabled: 'Sharing turned off.', noPermission: 'no permission', locating: 'locating…', share: 'Share', shareActive: 'Sharing', showDetails: 'Details and help', hideDetails: 'Hide details' },
  pt: { unsupported: 'Geolocalização indisponível.', searching: 'Procurando sinal GPS…', sharing: 'Compartilhando.', denied: 'Localização indisponível. Verifique a permissão e o sinal GPS.', schemaOutOfDate: 'O banco ainda não aceita esta versão do método. Falta a migração.', disabled: 'Compartilhamento desativado.', noPermission: 'sem permissão', locating: 'procurando…', share: 'Compartilhar', shareActive: 'Compartilhando', showDetails: 'Detalhes e ajuda', hideDetails: 'Ocultar detalhes' }
};

function sharingText(key) {
  const gpsErrors = {
    es: { timeout: 'La ubicación tardó demasiado. Activa la ubicación del dispositivo e inténtalo de nuevo.', unavailable: 'El dispositivo no pudo obtener la ubicación. Revisa la señal e inténtalo de nuevo.' },
    en: { timeout: 'Location timed out. Enable device location and try again.', unavailable: 'The device could not obtain a location. Check the signal and try again.' },
    pt: { timeout: 'A localização demorou demais. Ative a localização do dispositivo e tente novamente.', unavailable: 'O dispositivo não conseguiu obter a localização. Verifique o sinal e tente novamente.' }
  };
  const language = document.documentElement.lang;
  if ((gpsErrors[language] || gpsErrors.es)[key]) return (gpsErrors[language] || gpsErrors.es)[key];
  return (sharingCopy[document.documentElement.lang] || sharingCopy.es)[key];
}

let sharingStatusKey = null;

function sharingDeliveryText(key) {
  const copy = {
    es: { locating: 'Buscando GPS', gpsReady: 'GPS activo', waiting: 'Esperando lectura', sending: 'Enviando', queued: 'En cola local', published: 'Enviado', error: 'Error de envío', disconnected: 'Sin backend: se guarda en cola local, no en el mapa público.', queuedHelp: 'Pendiente de sincronizar; todavía no está publicado.', errorHelp: 'No se confirmó el envío. Revisa la conexión y Supabase.' },
    en: { locating: 'Locating', gpsReady: 'GPS enabled', waiting: 'Awaiting reading', sending: 'Sending', queued: 'Queued locally', published: 'Sent', error: 'Send failed', disconnected: 'No backend: saved in the local queue, not on the public map.', queuedHelp: 'Awaiting sync; not published yet.', errorHelp: 'Delivery not confirmed. Check the connection and Supabase.' },
    pt: { locating: 'Buscando GPS', gpsReady: 'GPS ativo', waiting: 'Aguardando leitura', sending: 'Enviando', queued: 'Na fila local', published: 'Enviado', error: 'Erro de envio', disconnected: 'Sem backend: salvo na fila local, não no mapa público.', queuedHelp: 'Aguardando sincronização; ainda não publicado.', errorHelp: 'Envio não confirmado. Verifique a conexão e o Supabase.' }
  };
  return (copy[document.documentElement.lang] || copy.es)[key];
}

function updateSharingDelivery(state, requestId = null) {
  if (!sharingEnabled || (requestId !== null && requestId !== sharingRequestId)) return;
  sharingDeliveryState = state;
  updateActionButtons();
  updateSharingStatus();
}

function updateSharingStatus(key = sharingStatusKey) {
  sharingStatusKey = key;
  const status = document.getElementById('share-status');
  if (status) status.innerText = sharingEnabled && key === 'sharing'
    ? sharingDeliveryState === 'error' ? sharingDeliveryText('errorHelp')
      : !supabaseClient ? sharingDeliveryText('disconnected')
      : sharingDeliveryState === 'queued' ? sharingDeliveryText('queuedHelp')
        : ''
    : key && !['sharing', 'disabled'].includes(key) ? sharingText(key) : '';
}

let sharingRequestId = 0;

function toggleSharing() {
  const requestId = ++sharingRequestId;
  sharingEnabled = !sharingEnabled;
  sharingDeliveryState = 'idle';

  if (sharingEnabled) {
    if (!navigator.geolocation) {
      updateSharingStatus('unsupported');
      sharingEnabled = false;
      updateActionButtons();
      return;
    }
    updateSharingStatus('searching');
    updateActionButtons();
    updateGpsChip(true);
    positionHistory = [];

    const onPosition = (pos) => {
      if (!sharingEnabled || requestId !== sharingRequestId) return;
      processNewPosition(pos);
      map.setView([currentPosition.lat, currentPosition.lng], 17);
      updateSharingStatus('sharing');
      updateActionButtons();
      lastSendTime = 0;
      loadCommunityPoints();

      if (geoWatchId === null) {
        geoWatchId = navigator.geolocation.watchPosition(
          (nextPosition) => {
            if (sharingEnabled && requestId === sharingRequestId) processNewPosition(nextPosition);
          },
          (err) => console.warn('watchPosition:', err),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
      }
    };
    let triedFallback = false;
    const onError = (err) => {
      if (!sharingEnabled || requestId !== sharingRequestId) return;
      // El GPS preciso puede tardar o no estar disponible en interiores/PC.
      // Reintentar una vez con ubicación de red; no reintentar permisos denegados.
      if (err.code !== 1 && !triedFallback) {
        triedFallback = true;
        navigator.geolocation.getCurrentPosition(onPosition, onError,
          { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 });
        return;
      }
      console.warn(err);
      updateSharingStatus(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable');
      sharingEnabled = false;
      updateActionButtons();
      updateGpsChip(false);
    };
    navigator.geolocation.getCurrentPosition(onPosition, onError,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  } else {
    updateSharingStatus('disabled');
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
    chip.innerText = { es: 'GPS apagado', en: 'GPS off', pt: 'GPS desligado' }[document.documentElement.lang] || 'GPS apagado';
    chip.classList.remove('ok', 'medium', 'poor');
    return;
  }

  const accText = accuracy ? `±${Math.round(accuracy)} m` : '';
  chip.classList.remove('ok', 'medium', 'poor');

  if (!accuracy || accuracy > 40) {
    chip.innerText = `GPS ${accText || sharingText('locating')}`;
    chip.classList.add('poor');
  } else if (accuracy > 15) {
    chip.innerText = `GPS ${accText}`;
    chip.classList.add('medium');
  } else {
    chip.innerText = `GPS ${accText}`;
    chip.classList.add('ok');
  }
}

// Motion es opcional: si el CDN falla, la UI conserva su estado final usable.
const uiMotionAnimations = new Map();
function revealUi(element) {
  if (!element || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    || typeof window.Motion?.animate !== 'function') return;
  uiMotionAnimations.get(element)?.cancel();
  const animation = window.Motion.animate(element, { opacity: [0, 1], y: [8, 0] }, {
    duration: 0.22, ease: [0.22, 1, 0.36, 1]
  });
  uiMotionAnimations.set(element, animation);
  animation.finished.then(() => {
    if (uiMotionAnimations.get(element) === animation) uiMotionAnimations.delete(element);
  }).catch(() => {});
}

window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener('change', (event) => {
  if (!event.matches) return;
  uiMotionAnimations.forEach((animation) => animation.cancel());
  uiMotionAnimations.clear();
});
requestAnimationFrame(() => revealUi(document.getElementById('stats-panel')));
