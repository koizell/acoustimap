/**
 * features.js
 * Análisis espacial, participación, retos, PWA, tema e idioma.
 * Depende de: config.js, map.js, community.js y Leaflet.
 */

const featureClientId = (() => {
  try {
    const stored = localStorage.getItem('acoustimap-client-id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('acoustimap-client-id', id);
    return id;
  } catch (_) {
    return crypto.randomUUID();
  }
})();

let featureRows = [];
let comparisonLayer = null;
let currentComparisonLayer = null;
let comparisonRows = { current: [], previous: [] };
let comparisonMode = null;
let drawnZone = null;
let selectedMapPoint = null;
let currentLanguage = ['es', 'en', 'pt'].includes(localStorage.getItem('acoustimap-language'))
  ? localStorage.getItem('acoustimap-language') : 'es';
let pendingMapSelection = false;
let pendingTrendSelection = false;
let pendingReportSelection = false;

function panelIsCurrent(panel, view) {
  return Boolean(panel && panel.isConnected && (!view || panel.dataset.view === view));
}

function isOfflineError(error) {
  return !navigator.onLine || /failed to fetch|network|offline|timeout/i.test(error?.message || '');
}

const featureText = {
  es: {
    tools: 'Herramientas', compare: 'Comparar mes', draw: 'Dibujar zona', report: 'Reportar ruido', stats: 'Estadísticas', challenges: 'Retos', theme: 'Tema oscuro', language: 'English', close: 'Cerrar',
    comparison: 'Antes y después', comparisonHelp: 'La capa azul muestra el mes anterior. La capa actual conserva sus colores de intensidad.', loading: 'Cargando datos…', noData: 'No hay datos suficientes.', current: 'Ahora', previous: 'Hace un mes', average: 'Promedio', difference: 'Cambio',
    zone: 'Análisis de zona', zoneHelp: 'Dibuja un polígono sobre el mapa para calcular el promedio del área.', drawAction: 'Activar dibujo', clear: 'Limpiar zona', noZone: 'Aún no hay una zona seleccionada.', measurements: 'mediciones',
    reportTitle: 'Reportar contexto', reportHelp: 'Añade una nota breve sobre el origen del ruido. No se guarda audio ni ubicación exacta.', notePlaceholder: 'Ej.: obra en la calle', send: 'Enviar reporte', sent: 'Reporte enviado.',
    ranking: 'Ranking de zonas', loudest: 'Más ruidosas', quietest: 'Más tranquilas', alerts: 'Alertas persistentes', noAlerts: 'No se detectan zonas persistentes.', confirm: 'Confirmar ruido aquí', confirmed: 'Ruido confirmado.', confirmHelp: 'Pulsa el mapa para elegir una zona y confirma si también escuchas el ruido.',
    challengeTitle: 'Retos de medición', challengeHelp: 'Completa mediciones consistentes para mejorar la cobertura ciudadana.', challengeProgress: 'progreso', offline: 'Medición guardada sin conexión.'
  },
  en: {
    tools: 'Tools', compare: 'Compare month', draw: 'Draw zone', report: 'Report noise', stats: 'Statistics', challenges: 'Challenges', theme: 'Dark theme', language: 'Português', close: 'Close',
    comparison: 'Before and after', comparisonHelp: 'The blue layer shows the previous month. The current layer keeps its intensity colors.', loading: 'Loading data…', noData: 'Not enough data.', current: 'Now', previous: 'One month ago', average: 'Average', difference: 'Change',
    zone: 'Zone analysis', zoneHelp: 'Draw a polygon on the map to calculate the area average.', drawAction: 'Enable drawing', clear: 'Clear zone', noZone: 'No zone selected yet.', measurements: 'measurements',
    reportTitle: 'Context report', reportHelp: 'Add a short note about the noise source. No audio or exact location is stored.', notePlaceholder: 'E.g. road works', send: 'Send report', sent: 'Report sent.',
    ranking: 'Zone ranking', loudest: 'Loudest', quietest: 'Quietest', alerts: 'Persistent alerts', noAlerts: 'No persistent zones detected.', confirm: 'Confirm noise here', confirmed: 'Noise confirmed.', confirmHelp: 'Click the map to choose an area and confirm if you also hear the noise.',
    challengeTitle: 'Measurement challenges', challengeHelp: 'Complete consistent measurements to improve citizen coverage.', challengeProgress: 'progress', offline: 'Measurement saved offline.'
  },
  pt: {
    tools: 'Ferramentas', compare: 'Comparar mês', draw: 'Desenhar zona', report: 'Relatar ruído', stats: 'Estatísticas', challenges: 'Desafios', theme: 'Tema escuro', language: 'Español', close: 'Fechar',
    comparison: 'Antes e depois', comparisonHelp: 'A camada azul mostra o mês anterior. A camada atual mantém suas cores de intensidade.', loading: 'Carregando dados…', noData: 'Dados insuficientes.', current: 'Agora', previous: 'Há um mês', average: 'Média', difference: 'Mudança',
    zone: 'Análise da zona', zoneHelp: 'Desenhe um polígono no mapa para calcular a média da área.', drawAction: 'Ativar desenho', clear: 'Limpar zona', noZone: 'Nenhuma zona selecionada.', measurements: 'medições',
    reportTitle: 'Relato de contexto', reportHelp: 'Adicione uma nota breve sobre a origem do ruído. Áudio e localização exata não são armazenados.', notePlaceholder: 'Ex.: obra na rua', send: 'Enviar relato', sent: 'Relato enviado.',
    ranking: 'Ranking de zonas', loudest: 'Mais barulhentas', quietest: 'Mais silenciosas', alerts: 'Alertas persistentes', noAlerts: 'Nenhuma zona persistente detectada.', confirm: 'Confirmar ruído aqui', confirmed: 'Ruído confirmado.', confirmHelp: 'Clique no mapa para escolher uma zona e confirme se também ouve o ruído.',
    challengeTitle: 'Desafios de medição', challengeHelp: 'Complete medições consistentes para melhorar a cobertura cidadã.', challengeProgress: 'progresso', offline: 'Medição guardada offline.'
  }
};

function t(key) {
  return featureText[currentLanguage][key] || featureText.es[key] || key;
}

const interfaceCopy = {
  es: { noteLabel: 'Nota', photoLabel: 'Foto opcional (JPG, PNG o WebP; máximo 5 MB)', chooseLocation: 'Elegir ubicación en el mapa', sendReport: 'Enviar reporte', selectedLocation: 'Ubicación seleccionada para el reporte.', reportNeed: 'Escribe una nota y selecciona una ubicación.', photoError: 'La foto debe ser JPG, PNG o WebP y pesar menos de 5 MB.', sending: 'Enviando reporte…', queuedReport: 'Reporte guardado y pendiente de conexión.', queueError: 'No se pudo guardar el reporte sin conexión.', chooseArea: 'Elegir zona en el mapa', chooseConfirm: 'Elegir zona para confirmar', trendTitle: 'Evolución de una zona', trendHelp: 'Elige un punto del mapa para ver su tendencia de 7 días.', emptyTrend: 'No hay mediciones en esta zona durante el periodo.', last30: 'últimos 30 días', noZone: 'Sin zona seleccionada.', rushTitle: 'Hora punta', rushDetail: 'Mide la misma zona entre 07:00 y 09:00 durante 3 días.', quietTitle: 'Ruta tranquila', quietDetail: 'Registra 5 mediciones tranquilas en ubicaciones distintas.', nightTitle: 'Cobertura nocturna', nightDetail: 'Comparte 3 mediciones entre las 18:00 y las 06:00.', completed: 'Completado', chooseMapPoint: 'Toca el mapa para elegir una ubicación.' },
  en: { noteLabel: 'Note', photoLabel: 'Optional photo (JPG, PNG, or WebP; 5 MB max)', chooseLocation: 'Choose a location on the map', sendReport: 'Send report', selectedLocation: 'Location selected for the report.', reportNeed: 'Add a note and choose a location.', photoError: 'Photo must be JPG, PNG, or WebP and under 5 MB.', sending: 'Sending report…', queuedReport: 'Report saved and waiting for a connection.', queueError: 'Could not save the report offline.', chooseArea: 'Choose an area on the map', chooseConfirm: 'Choose an area to confirm', trendTitle: 'Area trend', trendHelp: 'Choose a map point to view its 7-day trend.', emptyTrend: 'No measurements in this area for this period.', last30: 'last 30 days', noZone: 'No area selected.', rushTitle: 'Rush hour', rushDetail: 'Measure the same area between 07:00 and 09:00 on 3 days.', quietTitle: 'Quiet route', quietDetail: 'Record 5 quiet measurements in different locations.', nightTitle: 'Night coverage', nightDetail: 'Share 3 measurements between 18:00 and 06:00.', completed: 'Completed', chooseMapPoint: 'Tap the map to choose a location.' },
  pt: { noteLabel: 'Nota', photoLabel: 'Foto opcional (JPG, PNG ou WebP; máximo 5 MB)', chooseLocation: 'Escolher local no mapa', sendReport: 'Enviar relato', selectedLocation: 'Local selecionado para o relato.', reportNeed: 'Escreva uma nota e escolha um local.', photoError: 'A foto deve ser JPG, PNG ou WebP e ter menos de 5 MB.', sending: 'Enviando relato…', queuedReport: 'Relato salvo e aguardando conexão.', queueError: 'Não foi possível salvar o relato offline.', chooseArea: 'Escolher área no mapa', chooseConfirm: 'Escolher área para confirmar', trendTitle: 'Tendência da área', trendHelp: 'Escolha um ponto no mapa para ver a tendência de 7 dias.', emptyTrend: 'Não há medições nesta área para o período.', last30: 'últimos 30 dias', noZone: 'Nenhuma área selecionada.', rushTitle: 'Hora de pico', rushDetail: 'Meça a mesma área entre 07:00 e 09:00 durante 3 dias.', quietTitle: 'Rota tranquila', quietDetail: 'Registre 5 medições tranquilas em locais diferentes.', nightTitle: 'Cobertura noturna', nightDetail: 'Compartilhe 3 medições entre 18:00 e 06:00.', completed: 'Concluído', chooseMapPoint: 'Toque no mapa para escolher um local.' }
};

function u(key) { return interfaceCopy[currentLanguage][key] || interfaceCopy.es[key] || key; }

function createFeatureUi() {
  const toolbar = document.createElement('div');
  toolbar.className = 'feature-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="feature-menu-toggle" aria-expanded="false" aria-controls="feature-menu-items" aria-label="${t('tools')}" title="${t('tools')}">⋯</button>
    <div class="feature-menu-items" id="feature-menu-items" hidden>
      <button type="button" data-feature="draw">⬡ ${t('draw')}</button>
      <button type="button" data-feature="clear-zone">⌫ Quitar zona</button>
      <button type="button" data-feature="theme">◐ ${t('theme')}</button>
      <button type="button" data-feature="language">🌐 ${t('language')}</button>
    </div>`;
  document.getElementById('map-view').appendChild(toolbar);

  const panel = document.createElement('aside');
  panel.className = 'feature-panel';
  panel.id = 'feature-panel';
  panel.setAttribute('aria-label', t('tools'));
  panel.hidden = true;
  document.getElementById('map-view').appendChild(panel);

  toolbar.querySelector('.feature-menu-toggle').addEventListener('click', () => {
    const menu = toolbar.querySelector('.feature-menu-items');
    const isOpen = !menu.hidden;
    menu.hidden = isOpen;
    toolbar.querySelector('.feature-menu-toggle').setAttribute('aria-expanded', String(!isOpen));
  });

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-feature]');
    if (!button) return;
    const feature = button.dataset.feature;
    toolbar.querySelector('.feature-menu-items').hidden = true;
    toolbar.querySelector('.feature-menu-toggle').setAttribute('aria-expanded', 'false');
    if (feature === 'theme') toggleTheme();
    else if (feature === 'language') rotateLanguage();
    else if (feature === 'draw') enableZoneDrawing();
    else if (feature === 'clear-zone') clearDrawnZone();
    else openFeaturePanel(feature);
  });

  map.on('click', (event) => {
    selectedMapPoint = event.latlng;
    const status = document.getElementById('feature-status');
    if (status) status.textContent = `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
    if (pendingMapSelection) {
      pendingMapSelection = false;
      const confirmStatus = document.getElementById('confirm-status');
      if (confirmStatus) confirmStatus.textContent = u('selectedLocation');
      loadZoneConfirmations(event.latlng);
    }
    if (pendingTrendSelection) {
      pendingTrendSelection = false;
      switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
      openStatsTab('stats');
      loadZoneTrend(event.latlng);
    }
    if (pendingReportSelection) {
      pendingReportSelection = false;
      switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
      const reportStatus = document.getElementById('stats-feature-content')?.querySelector('#feature-status');
      if (reportStatus) reportStatus.textContent = u('selectedLocation');
    }
    if (document.getElementById('stats-view')?.classList.contains('active')) loadZoneTrend(event.latlng);
  });

  return panel;
}

function openFeaturePanel(view) {
  const panel = document.getElementById('feature-panel');
  panel.dataset.view = view;
  panel.hidden = false;
  const renderers = { compare: renderComparisonPanel, report: renderReportPanel, stats: renderStatsPanel, challenges: renderChallengesPanel };
  (renderers[view] || renderStatsPanel)(panel);
}

function openStatsTab(view) {
  const content = document.getElementById('stats-feature-content');
  if (!content) return;
  document.querySelectorAll('.stats-section-btn').forEach((button) => {
    const active = button.id === `stats-tab-${view}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  content.dataset.view = view;
  content.setAttribute('aria-labelledby', `stats-tab-${view}`);
  const renderers = { compare: renderComparisonPanel, report: renderReportPanel, stats: renderStatsPanel, challenges: renderChallengesPanel };
  (renderers[view] || renderStatsPanel)(content);
}

function closeFeaturePanel() {
  const panel = document.getElementById('feature-panel');
  const content = document.getElementById('stats-feature-content');
  if (document.getElementById('stats-view')?.classList.contains('active') && content) {
    content.innerHTML = '';
    content.dataset.view = '';
    return;
  }
  if (!panel) return;
  panel.hidden = true;
  panel.innerHTML = '';
  panel.dataset.view = '';
}

function panelFrame(title, content, panel) {
  const closeButton = panel?.id === 'feature-panel'
    ? `<div class="panel-actions"><button type="button" class="danger-action" data-close>${t('close')}</button></div>`
    : '';
  return `${closeButton}<h2>${title}</h2>${content}`;
}

async function fetchFeatureMeasurements(start, end, clientId = null) {
  if (!supabaseClient) throw new Error('Supabase no está configurado.');
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    let query = supabaseClient
      .from('noise_measurements')
      .select('latitude, longitude, db_level, category, created_at, client_id')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (start) query = query.gte('created_at', start.toISOString());
    if (end) query = query.lt('created_at', end.toISOString());
    if (clientId) query = query.eq('client_id', clientId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function averageDb(rows) {
  return rows.length ? Math.round(rows.reduce((sum, row) => sum + row.db_level, 0) / rows.length) : null;
}

function noDataMessage() {
  return supabaseClient
    ? 'No hay mediciones suficientes para este análisis.'
    : 'Conecta Supabase para cargar las mediciones reales.';
}

function renderComparisonPanel(panel) {
  panel.innerHTML = panelFrame(t('comparison'), `<p>${t('comparisonHelp')}</p><div class="feature-status" role="status" aria-live="polite">${t('loading')}</div><div class="panel-actions comparison-actions" hidden><button type="button" data-comparison="current">Ver últimas 4 semanas</button><button type="button" data-comparison="previous">Ver 4 semanas anteriores</button></div>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelectorAll('[data-comparison]').forEach((button) => button.addEventListener('click', () => showComparison(button.dataset.comparison)));
  comparePeriods(panel);
}

async function comparePeriods(panel) {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - 30);
  const previousEnd = new Date(currentStart);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - 30);
  try {
    const [current, previous] = await Promise.all([
      fetchFeatureMeasurements(currentStart, now),
      fetchFeatureMeasurements(previousStart, previousEnd)
    ]);
    const currentAvg = averageDb(current);
    const previousAvg = averageDb(previous);
    const difference = currentAvg == null || previousAvg == null ? null : currentAvg - previousAvg;
    if (!panelIsCurrent(panel, 'compare')) return;
    comparisonRows = { current, previous };
    const status = panel.querySelector('.feature-status');
    status.textContent = difference == null ? noDataMessage() : `${t('current')}: ${currentAvg} dB · ${t('previous')}: ${previousAvg} dB · ${t('difference')}: ${difference > 0 ? '+' : ''}${difference} dB`;
    panel.querySelector('.comparison-actions')?.removeAttribute('hidden');
  } catch (error) {
    console.error('Error comparando periodos:', error);
    if (panelIsCurrent(panel, 'compare')) panel.querySelector('.feature-status').textContent = error.message || 'No se pudo cargar la comparación.';
  }
}

function showComparison(mode) {
  comparisonMode = mode;
  if (document.getElementById('map-view')?.classList.contains('active')) activateComparisonLayer();
  else switchTab('map-view', document.querySelector('.tab-btn'));
}

function activateComparisonLayer() {
  if (!comparisonMode || !window.L?.heatLayer || !map) return;
  const rows = comparisonRows[comparisonMode] || [];
  const points = rows.map((row) => [row.latitude, row.longitude, normalizeDbForHeatmap(row.db_level)]);
  if (!comparisonLayer) comparisonLayer = L.heatLayer([], {
    radius: 28, blur: 20, maxZoom: 17, max: 1, minOpacity: 0.3,
    gradient: { 0.2: '#2563eb', 0.55: '#38bdf8', 1: '#1d4ed8' }
  });
  if (!currentComparisonLayer) currentComparisonLayer = L.heatLayer([], {
    radius: 28, blur: 20, maxZoom: 17, max: 1, minOpacity: 0.3,
    gradient: { 0.2: '#10b981', 0.55: '#f59e0b', 1: '#dc2626' }
  });
  communityLayer.clearLayers();
  if (communityHeatLayer && map.hasLayer(communityHeatLayer)) map.removeLayer(communityHeatLayer);
  if (map.hasLayer(comparisonLayer)) map.removeLayer(comparisonLayer);
  if (map.hasLayer(currentComparisonLayer)) map.removeLayer(currentComparisonLayer);
  const layer = mode === 'previous' ? comparisonLayer : currentComparisonLayer;
  layer.setLatLngs(points);
  layer.addTo(map);
}

function enableZoneDrawing() {
  if (!window.L || !L.Draw) {
    alert('El dibujo de zonas no está disponible en este momento.');
    return;
  }
  const drawer = new L.Draw.Polygon(map, { allowIntersection: false, showArea: true, shapeOptions: { color: '#2563eb', fillOpacity: 0.12 } });
  drawer.enable();
  map.once(L.Draw.Event.CREATED, (event) => {
    if (drawnZone) map.removeLayer(drawnZone);
    drawnZone = event.layer.addTo(map);
    analyzeDrawnZone(drawnZone.getLatLngs()[0]);
  });
}

function clearDrawnZone() {
  if (!drawnZone) return;
  map.removeLayer(drawnZone);
  drawnZone = null;
  if (comparisonLayer && map.hasLayer(comparisonLayer)) map.removeLayer(comparisonLayer);
  if (currentComparisonLayer && map.hasLayer(currentComparisonLayer)) map.removeLayer(currentComparisonLayer);
  comparisonMode = null;
  closeFeaturePanel();
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;
    const intersects = ((yi > point.lng) !== (yj > point.lng)) && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

async function analyzeDrawnZone(polygon) {
  switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
  openStatsTab('stats');
  const panel = document.getElementById('stats-feature-content');
  panel.innerHTML = panelFrame(t('zone'), `<p>${t('zoneHelp')} (últimos 30 días)</p><div class="feature-status">${t('loading')}</div><div id="zone-trend" class="feature-status"></div>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const rows = await fetchFeatureMeasurements(start, end);
    const selected = rows.filter((row) => pointInPolygon({ lat: row.latitude, lng: row.longitude }, polygon));
    if (!panelIsCurrent(panel, 'stats')) return;
    panel.querySelector('.feature-status').textContent = selected.length ? `${t('average')}: ${averageDb(selected)} dB · ${selected.length} ${t('measurements')} (30 días)` : noDataMessage();
    renderTrendChart(panel, selected);
  } catch (error) {
    console.error('Error analizando zona:', error);
    if (panelIsCurrent(panel, 'stats')) panel.querySelector('.feature-status').textContent = error.message || 'No se pudo analizar la zona.';
  }
}

function renderReportPanel(panel) {
  panel.innerHTML = panelFrame(t('reportTitle'), `<p>${t('reportHelp')}</p><label for="report-note">${u('noteLabel')}</label><textarea id="report-note" maxlength="280" placeholder="${t('notePlaceholder')}" required></textarea><label for="report-photo">${u('photoLabel')}</label><input id="report-photo" type="file" accept="image/jpeg,image/png,image/webp" /><div class="panel-actions"><button type="button" id="select-report-location">${u('chooseLocation')}</button></div><div class="feature-status" id="feature-status" role="status" aria-live="polite"></div><div class="panel-actions"><button type="button" class="primary-action" id="send-report">${u('sendReport')}</button></div>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#select-report-location').addEventListener('click', () => {
    pendingReportSelection = true;
    switchTab('map-view', document.querySelector('.tab-btn'));
  });
  panel.querySelector('#send-report').addEventListener('click', submitReport);
}

async function loadCitizenReports(panel) {
  if (!panel) return;
  const list = panel.querySelector('#citizen-reports-list');
  if (!list) return;
  if (!supabaseClient) {
    list.innerHTML = `<li>${noDataMessage()}</li>`;
    return;
  }
  const { data, error } = await supabaseClient
    .from('noise_reports')
    .select('db_level, note, photo_path, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    list.innerHTML = '<li>No se pudieron cargar los reportes.</li>';
    return;
  }
  if (!data?.length) {
    list.innerHTML = '<li>Aún no hay reportes ciudadanos.</li>';
    return;
  }
  list.innerHTML = '';
  data.forEach((report) => {
    const item = document.createElement('li');
    const detail = document.createElement('span');
    detail.textContent = `${report.db_level == null ? 'Sin medición' : `${report.db_level} dB`} · ${report.note} · ${timeAgo(report.created_at)}`;
    item.appendChild(detail);
    if (report.photo_path) {
      const { data: photo } = supabaseClient.storage.from('noise-report-photos').getPublicUrl(report.photo_path);
      const image = document.createElement('img');
      image.src = photo.publicUrl;
      image.alt = 'Foto adjunta al reporte';
      image.loading = 'lazy';
      item.appendChild(image);
    }
    list.appendChild(item);
  });
}

async function submitReport() {
  const panel = document.getElementById('stats-view')?.classList.contains('active')
    ? document.getElementById('stats-feature-content') : document.getElementById('feature-panel');
  const noteInput = panel?.querySelector('#report-note');
  const photoInput = panel?.querySelector('#report-photo');
  const note = noteInput?.value.trim() || '';
  const position = selectedMapPoint || currentPosition;
  const status = panel?.querySelector('#feature-status');
  if (!status) return;
  if (!note || !position) { status.textContent = u('reportNeed'); return; }
  if (!supabaseClient && navigator.onLine) { status.textContent = 'Supabase no está configurado.'; return; }
  const photo = photoInput?.files?.[0] || null;
  if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
    status.textContent = u('photoError');
    return;
  }
  const snapped = snapToGrid(position.lat, position.lng);
  const parsedDb = Number.parseInt(document.getElementById('db-number')?.innerText, 10);
  const db = Number.isInteger(parsedDb) && parsedDb >= 20 && parsedDb <= 140 ? parsedDb : null;
  const reportId = crypto.randomUUID();
  const button = panel.querySelector('#send-report');
  button.disabled = true;
  status.textContent = u('sending');
  let photoPath = null;
  try {
    if (photo) {
      photoPath = `${featureClientId}/${reportId}.${photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error: uploadError } = await supabaseClient.storage.from('noise-report-photos').upload(photoPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw uploadError;
    }
    const { error } = await supabaseClient.from('noise_reports').insert({ id: reportId, latitude: snapped.lat, longitude: snapped.lng, db_level: db, note, client_id: featureClientId, photo_path: photoPath });
    if (error) throw error;
    status.textContent = t('sent');
    noteInput.value = '';
    if (photoInput) photoInput.value = '';
    loadCitizenReports(document.getElementById('stats-feature-content'));
  } catch (error) {
    if (isOfflineError(error) && typeof enqueueOfflineRecord === 'function') {
      try {
        await enqueueOfflineRecord('noise_reports', { id: reportId, latitude: snapped.lat, longitude: snapped.lng, db_level: db, note, client_id: featureClientId, photo_path: null }, photo);
        status.textContent = u('queuedReport');
        noteInput.value = '';
        if (photoInput) photoInput.value = '';
      } catch (_) {
        status.textContent = u('queueError');
      }
    } else {
      status.textContent = error.message || 'No se pudo enviar el reporte. Comprueba la conexión y la configuración de Supabase.';
    }
    if (photoPath) await supabaseClient.storage.from('noise-report-photos').remove([photoPath]).catch(() => {});
    console.error('Error enviando reporte:', error);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function renderStatsPanel(panel) {
  panel.innerHTML = panelFrame(t('stats'), `<div class="feature-status" role="status" aria-live="polite">${t('loading')}</div><div class="stats-metrics"><div><strong id="metric-total">--</strong><span>${t('measurements')} · ${u('last30')}</span></div><div><strong id="metric-average">--</strong><span>${t('average')} dB</span></div><div><strong id="metric-high">--</strong><span>&gt; 70 dB</span></div></div><div class="stats-columns"><section><h2>${t('loudest')}</h2><ul class="feature-list" id="loudest-list"></ul></section><section><h2>${t('quietest')}</h2><ul class="feature-list" id="quietest-list"></ul></section></div><h2>${t('alerts')}</h2><ul class="feature-list" id="alerts-list"></ul><h2>${u('trendTitle')}</h2><p>${u('trendHelp')}</p><div class="panel-actions"><button type="button" id="select-trend-location">${u('chooseArea')}</button></div><div id="zone-trend" class="feature-status">${u('noZone')}</div><h2>Reportes ciudadanos</h2><ul class="feature-list" id="citizen-reports-list"><li>${t('loading')}</li></ul><div class="panel-actions"><button type="button" id="select-confirm-location">${u('chooseConfirm')}</button><button type="button" id="confirm-noise">🔊 ${t('confirm')}</button></div><p id="confirm-status" role="status" aria-live="polite">${t('confirmHelp')}</p>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#confirm-noise').addEventListener('click', confirmNoise);
  panel.querySelector('#select-confirm-location').addEventListener('click', () => {
    pendingMapSelection = true;
    switchTab('map-view', document.querySelector('.tab-btn'));
    const status = document.getElementById('confirm-status');
    if (status) status.textContent = 'Toca una zona del mapa para seleccionarla y vuelve a Estadísticas para confirmar.';
  });
  panel.querySelector('#select-trend-location').addEventListener('click', () => {
    pendingTrendSelection = true;
    switchTab('map-view', document.querySelector('.tab-btn'));
  });
  loadStats(panel);
  loadCitizenReports(panel);
}

function appendRanking(list, rows) {
  if (!rows.length) {
    list.innerHTML = `<li>${noDataMessage()}</li>`;
    return;
  }
  rows.forEach((row) => {
    const item = document.createElement('li');
    item.textContent = `${row.db} dB · ${row.count} ${t('measurements')} · ${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}`;
    list.appendChild(item);
  });
}

async function loadStats(panel) {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const rows = await fetchFeatureMeasurements(start, end);
    if (!panelIsCurrent(panel, 'stats')) return;
    featureRows = rows;
    const zones = aggregatePoints(featureRows).map((point) => ({ ...point, count: point.sampleCount }));
    panel.querySelector('#metric-total').textContent = featureRows.length;
    panel.querySelector('#metric-average').textContent = averageDb(featureRows) ?? '--';
    panel.querySelector('#metric-high').textContent = featureRows.filter((row) => row.db_level > 70).length;
    appendRanking(panel.querySelector('#loudest-list'), [...zones].sort((a, b) => b.db - a.db).slice(0, 3));
    appendRanking(panel.querySelector('#quietest-list'), [...zones].sort((a, b) => a.db - b.db).slice(0, 3));
    const byZone = new Map();
    featureRows.forEach((row) => {
      const key = `${Math.round(row.latitude / AGG_GRID)}_${Math.round(row.longitude / AGG_GRID)}`;
      if (!byZone.has(key)) byZone.set(key, { latest: row, days: new Set(), dailyLevels: new Map() });
      const zone = byZone.get(key);
      const day = row.created_at.slice(0, 10);
      zone.days.add(day);
      zone.dailyLevels.set(day, (zone.dailyLevels.get(day) || []).concat(row.db_level));
      if (new Date(row.created_at) > new Date(zone.latest.created_at)) zone.latest = row;
    });
    const alerts = [...byZone.values()].filter((zone) => {
      const days = [...zone.dailyLevels.keys()].sort();
      const recentDays = days.slice(-3);
      if (recentDays.length !== 3) return false;
      const consecutive = recentDays.every((day, index) => index === 0 ||
        (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${recentDays[index - 1]}T00:00:00Z`)) === 86400000);
      return consecutive && recentDays.every((day) => averageDb(zone.dailyLevels.get(day).map((db_level) => ({ db_level }))) > 70);
    }).slice(0, 3);
    const alertList = panel.querySelector('#alerts-list');
    if (!alerts.length) alertList.innerHTML = `<li>${t('noAlerts')}</li>`;
    alerts.forEach((zone) => { const item = document.createElement('li'); item.textContent = `⚠️ ${averageDb(zone.dailyLevels.get([...zone.days].sort().at(-1)).map((db_level) => ({ db_level })))} dB · 3 días consecutivos`; alertList.appendChild(item); });
    panel.querySelector('.feature-status').textContent = featureRows.length ? `${zones.length} zonas analizadas` : noDataMessage();
  } catch (error) {
    console.error('Error cargando estadísticas:', error);
    if (!panelIsCurrent(panel, 'stats')) return;
    panel.querySelector('.feature-status').textContent = error.message || noDataMessage();
    panel.querySelector('#loudest-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
    panel.querySelector('#quietest-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
    panel.querySelector('#alerts-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
  }
}

async function confirmNoise() {
  const position = selectedMapPoint || currentPosition;
  const status = document.getElementById('confirm-status');
  if (!position || (!supabaseClient && navigator.onLine)) { if (status) status.textContent = !position ? u('chooseMapPoint') : 'Supabase no está configurado.'; return; }
  const snapped = snapToGrid(position.lat, position.lng);
  const keyTime = new Date();
  keyTime.setMinutes(0, 0, 0);
  const measurementTime = keyTime.toISOString();
  const confirmation = {
    id: crypto.randomUUID(), latitude: snapped.lat, longitude: snapped.lng,
    measurement_time: measurementTime, client_id: featureClientId,
    confirmation_key: `${featureClientId}:${snapped.lat.toFixed(5)}:${snapped.lng.toFixed(5)}:${measurementTime}`
  };
  try {
    const { error } = await supabaseClient.from('noise_confirmations').insert(confirmation);
    if (error && error.code === '23505') {
      if (status) status.textContent = 'Ya confirmaste el ruido en esta zona durante esta hora.';
      return;
    }
    if (error) throw error;
    if (status) status.textContent = t('confirmed');
    await loadZoneConfirmations(position);
  } catch (error) {
    if (isOfflineError(error) && typeof enqueueOfflineRecord === 'function') {
      await enqueueOfflineRecord('noise_confirmations', confirmation);
      if (status) status.textContent = 'Confirmación guardada y pendiente de conexión.';
    } else if (status) status.textContent = error.message || 'No se pudo confirmar el ruido.';
  }
}

async function loadZoneConfirmations(position) {
  const status = document.getElementById('confirm-status');
  if (!status || !supabaseClient || !position) return;
  const snapped = snapToGrid(position.lat, position.lng);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseClient.from('noise_confirmations').select('id', { count: 'exact', head: true })
    .eq('latitude', snapped.lat).eq('longitude', snapped.lng).gte('created_at', since);
  if (!error) status.textContent = `${count || 0} confirmaciones en esta zona durante las últimas 24 horas.`;
}

function renderTrendChart(container, rows) {
  const target = container.querySelector('#zone-trend') || container.querySelector('.feature-status');
  if (!target) return;
  const days = new Map();
  rows.forEach((row) => {
    const date = row.created_at.slice(0, 10);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(row.db_level);
  });
  const series = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, values]) => ({ date, db: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) }));
  if (!series.length) { target.textContent = u('emptyTrend'); return; }
  const min = Math.min(...series.map((item) => item.db));
  const max = Math.max(...series.map((item) => item.db));
  const range = Math.max(max - min, 1);
  const coords = series.map((item, index) => `${20 + index * (260 / Math.max(series.length - 1, 1))},${100 - ((item.db - min) / range) * 70}`).join(' ');
  target.textContent = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 300 120'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Tendencia de ruido: ${series.map((item) => `${item.date}: ${item.db} dB`).join(', ')}`);
  const polyline = document.createElementNS(svg.namespaceURI, 'polyline');
  polyline.setAttribute('points', coords); polyline.setAttribute('fill', 'none'); polyline.setAttribute('stroke', '#2563eb'); polyline.setAttribute('stroke-width', '4'); polyline.setAttribute('stroke-linecap', 'round'); polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline); target.appendChild(svg);
  const caption = document.createElement('p'); caption.textContent = `${series[0].date} – ${series.at(-1).date} · ${min}–${max} dB`; target.appendChild(caption);
}

async function loadZoneTrend(position) {
  const target = document.getElementById('zone-trend');
  if (!target || !supabaseClient) return;
  const center = snapToGrid(position.lat, position.lng);
  const start = new Date(); start.setDate(start.getDate() - 7);
  target.textContent = 'Cargando tendencia…';
  try {
    const rows = await fetchFeatureMeasurements(start, new Date());
    if (!target.isConnected || document.getElementById('zone-trend') !== target) return;
    const selected = rows.filter((row) => haversineDistance(center.lat, center.lng, row.latitude, row.longitude) <= 90);
    renderTrendChart(target.parentElement, selected);
  } catch (error) {
    if (target.isConnected) target.textContent = error.message || 'No se pudo cargar la tendencia.';
  }
}

function renderChallengesPanel(panel) {
  const challenges = [
    { title: u('rushTitle'), detail: u('rushDetail'), key: 'rush-hour', target: 3 },
    { title: u('quietTitle'), detail: u('quietDetail'), key: 'quiet-route', target: 5 },
    { title: u('nightTitle'), detail: u('nightDetail'), key: 'night-cover', target: 3 }
  ];
  panel.innerHTML = panelFrame(t('challengeTitle'), `<p>${t('challengeHelp')}</p><ul class="feature-list" id="challenge-list"></ul>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  const list = panel.querySelector('#challenge-list');
  loadChallengeProgress(list, challenges);
}

async function loadChallengeProgress(list, challenges) {
  try {
    const start = new Date(); start.setDate(start.getDate() - 30);
    const rows = await fetchFeatureMeasurements(start, new Date(), featureClientId);
    const rushByZone = new Map();
    const nightRows = [];
    const quietLocations = new Set();
    rows.forEach((row) => {
      const date = new Date(row.created_at);
      const hour = date.getHours();
      const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const challengeCell = `${Math.round(row.latitude / AGG_GRID)}_${Math.round(row.longitude / AGG_GRID)}`;
      if (hour >= 7 && hour < 9) {
        if (!rushByZone.has(challengeCell)) rushByZone.set(challengeCell, new Set());
        rushByZone.get(challengeCell).add(day);
      }
      if (hour >= 18 || hour < 6) nightRows.push(row);
      if (row.db_level < 55) quietLocations.add(challengeCell);
    });
    const progress = {
      'rush-hour': Math.max(0, ...[...rushByZone.values()].map((days) => days.size)),
      'quiet-route': quietLocations.size,
      'night-cover': nightRows.length
    };
    list.innerHTML = '';
    challenges.forEach((challenge) => {
      const item = document.createElement('li');
      const current = Math.min(progress[challenge.key], challenge.target);
      const percentage = Math.round((current / challenge.target) * 100);
      item.className = 'challenge-item';
      item.style.setProperty('--challenge-progress', `${percentage}%`);
      item.innerHTML = `
        <div class="challenge-topline">
          <strong>${challenge.title}</strong>
          <span class="challenge-count">${current}/${challenge.target}</span>
        </div>
        <span class="challenge-detail">${challenge.detail}</span>
        <div class="challenge-track" aria-label="${percentage}% ${t('challengeProgress')}">
          <span class="challenge-fill"></span>
        </div>
        <span class="challenge-state">${percentage === 100 ? `✓ ${u('completed')}` : `${percentage}% ${t('challengeProgress')}`}</span>`;
      if (percentage === 100) item.classList.add('completed');
      list.appendChild(item);
    });
  } catch (error) {
    list.innerHTML = `<li>${error.message || noDataMessage()}</li>`;
  }
}

function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  localStorage.setItem('acoustimap-theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
}

function rotateLanguage() {
  const languages = ['es', 'en', 'pt'];
  currentLanguage = languages[(languages.indexOf(currentLanguage) + 1) % languages.length];
  localStorage.setItem('acoustimap-language', currentLanguage);
  document.documentElement.lang = currentLanguage;
  const toolbar = document.querySelector('.feature-toolbar');
  const activeStatsView = document.getElementById('stats-feature-content')?.dataset.view;
  const activeMapView = document.getElementById('feature-panel')?.dataset.view;
  if (toolbar) { toolbar.remove(); document.getElementById('feature-panel')?.remove(); createFeatureUi(); }
  updateStaticLanguage();
  if (activeStatsView) openStatsTab(activeStatsView);
  if (activeMapView) openFeaturePanel(activeMapView);
}

function updateStaticLanguage() {
  const details = {
    es: { intro: 'Entiende el impacto del ruido y cómo los datos ciudadanos ayudan a mejorar la ciudad.', cardDescriptions: ['La exposición prolongada al ruido puede afectar el sueño, la concentración y la salud cardiovascular.', 'AcoustiMap ayuda a identificar zonas de riesgo acústico para orientar decisiones de prevención.', 'Las mediciones anónimas aportan evidencia ciudadana para una planificación urbana más sostenible.'], badges: ['Salud', 'ODS 3', 'ODS 11'], cardLabels: ['Bienestar', 'Salud', 'Ciudad'], legend: 'Información' },
    en: { intro: 'Understand how noise affects health and how citizen data can improve the city.', cardDescriptions: ['Long-term noise exposure can affect sleep, concentration, and cardiovascular health.', 'AcoustiMap helps identify noise risk areas to guide prevention.', 'Anonymous measurements provide evidence for more sustainable urban planning.'], badges: ['Health', 'SDG 3', 'SDG 11'], cardLabels: ['Wellbeing', 'Health', 'City'], legend: 'Map information' },
    pt: { intro: 'Entenda o impacto do ruído e como os dados cidadãos podem melhorar a cidade.', cardDescriptions: ['A exposição prolongada ao ruído pode afetar o sono, a concentração e a saúde cardiovascular.', 'O AcoustiMap ajuda a identificar áreas de risco acústico para orientar a prevenção.', 'Medições anônimas fornecem evidências para um planejamento urbano mais sustentável.'], badges: ['Saúde', 'ODS 3', 'ODS 11'], cardLabels: ['Bem-estar', 'Saúde', 'Cidade'], legend: 'Informações do mapa' }
  }[currentLanguage];
  const copy = {
    es: { map: 'Mapa', health: 'Salud + ODS', healthShort: 'Salud', stats: 'Estadísticas', statsShort: 'Stats', title: 'Salud y ODS', intro: 'Entiende el impacto del ruido y cómo los datos ciudadanos ayudan a mejorar la ciudad.', detail: 'Mostrar detalles', hide: 'Ocultar detalles', all: 'Todo', morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', exportCsv: 'Exportar CSV', exportGeo: 'Exportar GeoJSON', statsTitle: 'Estadísticas del ruido', statsIntro: 'Explora tendencias, reportes y zonas persistentes sin salir de la aplicación.', back: 'Volver al mapa', tabs: ['Resumen', 'Reportar ruido', 'Comparar meses', 'Retos'], privacy: 'Privacidad por diseño', privacyCopy: 'AcoustiMap no graba audio, no requiere login y guarda las coordenadas ancladas a una cuadrícula aproximada de 70 m.', mapHelp: 'Cómo interpretar el mapa', mapHelpCopy: 'Verde indica niveles bajos, amarillo niveles moderados y rojo niveles altos. El heatmap muestra patrones, no la ubicación exacta de las personas.', cardTitles: ['Menos ruido, más descanso', 'Ciudades más saludables', 'Participación local'] },
    en: { map: 'Map', health: 'Health + SDGs', healthShort: 'Health', stats: 'Statistics', statsShort: 'Stats', title: 'Health and SDGs', intro: 'Understand how noise affects health and how citizen data can improve the city.', detail: 'Show details', hide: 'Hide details', all: 'All', morning: 'Morning', afternoon: 'Afternoon', night: 'Night', exportCsv: 'Export CSV', exportGeo: 'Export GeoJSON', statsTitle: 'Noise statistics', statsIntro: 'Explore trends, reports, and persistent areas without leaving the app.', back: 'Back to map', tabs: ['Summary', 'Report noise', 'Compare months', 'Challenges'], privacy: 'Privacy by design', privacyCopy: 'AcoustiMap does not record audio, requires no login, and stores coordinates snapped to an approximate 70 m grid.', mapHelp: 'How to read the map', mapHelpCopy: 'Green indicates low levels, yellow moderate levels, and red high levels. The heatmap shows patterns, not people’s exact locations.', cardTitles: ['Less noise, better rest', 'Healthier cities', 'Local participation'] },
    pt: { map: 'Mapa', health: 'Saúde + ODS', healthShort: 'Saúde', stats: 'Estatísticas', statsShort: 'Stats', title: 'Saúde e ODS', intro: 'Entenda o impacto do ruído e como os dados cidadãos podem melhorar a cidade.', detail: 'Mostrar detalhes', hide: 'Ocultar detalhes', all: 'Tudo', morning: 'Manhã', afternoon: 'Tarde', night: 'Noite', exportCsv: 'Exportar CSV', exportGeo: 'Exportar GeoJSON', statsTitle: 'Estatísticas de ruído', statsIntro: 'Explore tendências, relatos e áreas persistentes sem sair do aplicativo.', back: 'Voltar ao mapa', tabs: ['Resumo', 'Relatar ruído', 'Comparar meses', 'Desafios'], privacy: 'Privacidade desde o início', privacyCopy: 'O AcoustiMap não grava áudio, não exige login e salva coordenadas em uma grade aproximada de 70 m.', mapHelp: 'Como interpretar o mapa', mapHelpCopy: 'Verde indica níveis baixos, amarelo moderados e vermelho altos. O mapa de calor mostra padrões, não a localização exata das pessoas.', cardTitles: ['Menos ruído, mais descanso', 'Cidades mais saudáveis', 'Participação local'] }
  }[currentLanguage];
  const nav = document.querySelectorAll('.tab-btn');
  if (nav[0]) nav[0].textContent = `🗺️ ${copy.map}`;
  if (nav[1]) nav[1].innerHTML = `📚 <span class="tab-long">${copy.health}</span><span class="tab-short">${copy.healthShort}</span>`;
  if (nav[2]) nav[2].innerHTML = `📊 <span class="tab-long">${copy.stats}</span><span class="tab-short">${copy.statsShort}</span>`;
  const title = document.querySelector('.info-header h1'); if (title) title.textContent = copy.title;
  const intro = document.querySelector('.info-header p'); if (intro) intro.textContent = details.intro;
  const cards = document.querySelectorAll('.info-card h3'); cards.forEach((element, index) => { if (copy.cardTitles[index]) element.textContent = copy.cardTitles[index]; });
  document.querySelectorAll('.info-card p').forEach((element, index) => { element.textContent = details.cardDescriptions[index] || ''; });
  document.querySelectorAll('.info-card .badge').forEach((element, index) => { const emoji = element.textContent.match(/^\S+\s*/)?.[0] || ''; element.textContent = `${emoji}${details.badges[index] || ''}`; });
  document.querySelectorAll('.info-card .card-header strong').forEach((element, index) => { element.textContent = details.cardLabels[index] || ''; });
  const sectionTitles = document.querySelectorAll('.info-wrapper > .section-title');
  if (sectionTitles[0]) sectionTitles[0].textContent = copy.privacy;
  if (sectionTitles[1]) sectionTitles[1].textContent = copy.mapHelp;
  const infoCopy = document.querySelectorAll('.info-wrapper > .info-copy');
  if (infoCopy[0]) infoCopy[0].textContent = copy.privacyCopy;
  if (infoCopy[1]) infoCopy[1].textContent = copy.mapHelpCopy;
  const statsTitle = document.querySelector('.stats-page-header h1'); if (statsTitle) statsTitle.textContent = copy.statsTitle;
  const statsIntro = document.querySelector('.stats-page-header p'); if (statsIntro) statsIntro.textContent = copy.statsIntro;
  const back = document.querySelector('.stats-back-btn'); if (back) back.textContent = `🗺️ ${copy.back}`;
  document.querySelectorAll('.stats-section-btn').forEach((button, index) => { if (copy.tabs[index]) button.textContent = `${['📈', '📝', '↔️', '🎯'][index]} ${copy.tabs[index]}`; });
  const handle = document.getElementById('stats-handle-label');
  if (handle) handle.textContent = document.getElementById('stats-panel')?.classList.contains('collapsed') ? copy.detail : copy.hide;
  [['time-all', copy.all], ['time-morning', copy.morning], ['time-afternoon', copy.afternoon], ['time-night', copy.night]].forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
  const csv = document.getElementById('export-csv-btn'); if (csv) csv.textContent = copy.exportCsv;
  const geo = document.getElementById('export-geojson-btn'); if (geo) geo.textContent = copy.exportGeo;
  const legendTitle = document.querySelector('.legend-header span'); if (legendTitle) legendTitle.textContent = details.legend;
  const legendButton = document.getElementById('legend-toggle'); if (legendButton) legendButton.setAttribute('aria-label', details.legend);
  document.title = `AcoustiMap — ${copy.title}`;
}

const OFFLINE_DB_NAME = 'acoustimap-offline-v2';
const OFFLINE_STORE = 'outbox';
let offlineDbPromise;

function openOfflineDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (!offlineDbPromise) offlineDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(OFFLINE_STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return offlineDbPromise;
}

async function enqueueOfflineRecord(table, payload, photo = null) {
  const recordId = payload.id || crypto.randomUUID();
  const record = { id: recordId, table, payload: { ...payload, id: recordId }, photo, queuedAt: new Date().toISOString() };
  try {
    const db = await openOfflineDb();
    if (db) await new Promise((resolve, reject) => {
      const tx = db.transaction(OFFLINE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_STORE).put(record);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    else {
      if (photo) throw new Error('Este navegador no permite guardar fotos sin conexión.');
      const records = JSON.parse(localStorage.getItem('acoustimap-offline-outbox') || '[]');
      if (!records.some((item) => item.id === record.id)) records.push(record);
      localStorage.setItem('acoustimap-offline-outbox', JSON.stringify(records.slice(-100)));
    }
    return record.id;
  } catch (error) {
    console.error('No se pudo guardar en la cola offline:', error);
    throw error;
  }
}

function queueOfflineMeasurement(measurement) {
  return enqueueOfflineRecord('noise_measurements', measurement);
}

async function getOfflineRecords() {
  const db = await openOfflineDb();
  if (!db) return JSON.parse(localStorage.getItem('acoustimap-offline-outbox') || '[]');
  return new Promise((resolve, reject) => {
    const request = db.transaction(OFFLINE_STORE, 'readonly').objectStore(OFFLINE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function removeOfflineRecord(id) {
  const db = await openOfflineDb();
  if (!db) {
    const records = JSON.parse(localStorage.getItem('acoustimap-offline-outbox') || '[]').filter((item) => item.id !== id);
    localStorage.setItem('acoustimap-offline-outbox', JSON.stringify(records));
    return;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_STORE).delete(id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

async function flushOfflineMeasurements() {
  if (!supabaseClient || !navigator.onLine || flushOfflineMeasurements.running) return;
  flushOfflineMeasurements.running = true;
  try {
    const records = (await getOfflineRecords()).sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
    for (const record of records) {
      try {
        let payload = record.payload;
        if (record.table === 'noise_reports' && record.photo) {
          const photoPath = `${featureClientId}/${payload.id}.${record.photo.type === 'image/png' ? 'png' : record.photo.type === 'image/webp' ? 'webp' : 'jpg'}`;
          const { error: uploadError } = await supabaseClient.storage.from('noise-report-photos').upload(photoPath, record.photo, { contentType: record.photo.type, upsert: false });
          if (uploadError && uploadError.statusCode !== '409' && uploadError.status !== 409 && uploadError.code !== 'Duplicate') throw uploadError;
          payload = { ...payload, photo_path: photoPath };
        }
        const { error } = await supabaseClient.from(record.table).insert(payload);
        if (error && error.code !== '23505') throw error;
        await removeOfflineRecord(record.id);
      } catch (error) {
        console.warn(`Sincronización pendiente (${record.table}):`, error.message || error);
        break;
      }
    }
  } catch (error) {
    console.warn('No se pudo leer la cola offline:', error);
  } finally {
    flushOfflineMeasurements.running = false;
  }
}

window.addEventListener('online', flushOfflineMeasurements);

document.addEventListener('DOMContentLoaded', async () => {
  if (localStorage.getItem('acoustimap-theme') === 'dark') document.body.classList.add('dark-theme');
  document.documentElement.lang = currentLanguage;
  updateStaticLanguage();
  createFeatureUi();
  document.querySelector('.stats-section-nav')?.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('.stats-section-btn')];
    const index = tabs.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
    event.preventDefault();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('PWA no disponible:', error));
  try {
    const legacy = JSON.parse(localStorage.getItem('acoustimap-pending-measurements') || '[]');
    const migration = await Promise.allSettled(legacy.map((measurement) => queueOfflineMeasurement({ ...measurement, id: measurement.id || crypto.randomUUID(), client_id: measurement.client_id || featureClientId })));
    if (legacy.length && migration.every((result) => result.status === 'fulfilled')) localStorage.removeItem('acoustimap-pending-measurements');
  } catch (error) { console.warn('No se pudo migrar la cola local antigua:', error); }
  flushOfflineMeasurements();
});
