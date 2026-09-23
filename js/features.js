/**
 * features.js
 * Análisis espacial, participación, retos, PWA, tema e idioma.
 * Depende de: config.js, map.js, community.js y Leaflet.
 */

const featureClientId = localStorage.getItem('acoustimap-client-id') || crypto.randomUUID();
localStorage.setItem('acoustimap-client-id', featureClientId);

let featureRows = [];
let comparisonLayer = null;
let drawnZone = null;
let selectedMapPoint = null;
let currentLanguage = localStorage.getItem('acoustimap-language') || 'es';

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

function createFeatureUi() {
  const toolbar = document.createElement('div');
  toolbar.className = 'feature-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="feature-menu-toggle" aria-expanded="false" aria-label="${t('tools')}" title="${t('tools')}">⋯</button>
    <div class="feature-menu-items" hidden>
      <button type="button" data-feature="draw">⬡ ${t('draw')}</button>
      <button type="button" data-feature="clear-zone">⌫ Quitar zona</button>
      <button type="button" data-feature="theme">◐ ${t('theme')}</button>
      <button type="button" data-feature="language">🌐 ${t('language')}</button>
    </div>`;
  document.getElementById('map-view').appendChild(toolbar);

  const panel = document.createElement('aside');
  panel.className = 'feature-panel';
  panel.id = 'feature-panel';
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
    if (status && panel.dataset.view === 'confirm') status.textContent = `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
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
    button.classList.toggle('active', button.getAttribute('onclick')?.includes(`'${view}'`));
  });
  content.dataset.view = view;
  const renderers = { compare: renderComparisonPanel, report: renderReportPanel, stats: renderStatsPanel, challenges: renderChallengesPanel };
  (renderers[view] || renderStatsPanel)(content);
}

function closeFeaturePanel() {
  const panel = document.getElementById('feature-panel');
  const content = document.getElementById('stats-feature-content');
  const target = panel || content;
  if (!target) return;
  if (panel) panel.hidden = true;
  target.innerHTML = '';
  target.dataset.view = '';
}

function panelFrame(title, content) {
  const closeButton = document.getElementById('stats-feature-content')
    ? ''
    : `<div class="panel-actions"><button type="button" class="danger-action" data-close>${t('close')}</button></div>`;
  return `${closeButton}<h2>${title}</h2>${content}`;
}

async function fetchFeatureMeasurements(start, end) {
  if (!supabaseClient) throw new Error('Supabase no está configurado.');
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    let query = supabaseClient
      .from('noise_measurements')
      .select('latitude, longitude, db_level, category, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (start) query = query.gte('created_at', start.toISOString());
    if (end) query = query.lt('created_at', end.toISOString());
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
  panel.innerHTML = panelFrame(t('comparison'), `<p>${t('comparisonHelp')}</p><div class="feature-status">${t('loading')}</div>`);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
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
    const status = panel.querySelector('.feature-status');
    status.textContent = difference == null ? noDataMessage() : `${t('current')}: ${currentAvg} dB · ${t('previous')}: ${previousAvg} dB · ${t('difference')}: ${difference > 0 ? '+' : ''}${difference} dB`;
    const points = previous.map((row) => [row.latitude, row.longitude, normalizeDbForHeatmap(row.db_level)]);
    if (comparisonLayer) map.removeLayer(comparisonLayer);
    comparisonLayer = L.heatLayer(points, { radius: 24, blur: 18, maxZoom: 17, max: 1, minOpacity: 0.2, gradient: { 0.2: '#2563eb', 0.55: '#38bdf8', 1: '#1d4ed8' } }).addTo(map);
  } catch (error) {
    console.error('Error comparando periodos:', error);
    panel.querySelector('.feature-status').textContent = error.message || 'No se pudo cargar la comparación.';
  }
}

function enableZoneDrawing() {
  if (!window.L || !L.Draw) {
    alert('El dibujo de zonas no está disponible en este momento.');
    return;
  }
  const drawer = new L.Draw.Polygon(map, { shapeOptions: { color: '#2563eb', fillOpacity: 0.12 } });
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
  openStatsTab('stats');
  const panel = document.getElementById('stats-feature-content');
  panel.innerHTML = panelFrame(t('zone'), `<p>${t('zoneHelp')}</p><div class="feature-status">${t('loading')}</div>`);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  try {
    const rows = await fetchFeatureMeasurements();
    const selected = rows.filter((row) => pointInPolygon({ lat: row.latitude, lng: row.longitude }, polygon));
    panel.querySelector('.feature-status').textContent = selected.length ? `${t('average')}: ${averageDb(selected)} dB · ${selected.length} ${t('measurements')}` : noDataMessage();
  } catch (error) {
    console.error('Error analizando zona:', error);
    panel.querySelector('.feature-status').textContent = error.message || 'No se pudo analizar la zona.';
  }
}

function renderReportPanel(panel) {
  panel.innerHTML = panelFrame(t('reportTitle'), `<p>${t('reportHelp')}</p><textarea id="report-note" maxlength="280" placeholder="${t('notePlaceholder')}"></textarea><div class="feature-status" id="feature-status"></div><div class="panel-actions"><button type="button" class="primary-action" id="send-report">${t('send')}</button></div>`);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#send-report').addEventListener('click', submitReport);
}

async function loadCitizenReports(panel) {
  const list = panel.querySelector('#citizen-reports-list');
  if (!list) return;
  if (!supabaseClient) {
    list.innerHTML = `<li>${noDataMessage()}</li>`;
    return;
  }
  const { data, error } = await supabaseClient
    .from('noise_reports')
    .select('db_level, note, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    list.innerHTML = '<li>No se pudieron cargar los reportes.</li>';
    return;
  }
  if (!data.length) {
    list.innerHTML = '<li>Aún no hay reportes ciudadanos.</li>';
    return;
  }
  list.innerHTML = '';
  data.forEach((report) => {
    const item = document.createElement('li');
    item.textContent = `${report.db_level} dB · ${report.note} · ${timeAgo(report.created_at)}`;
    list.appendChild(item);
  });
}

async function submitReport() {
  const note = document.getElementById('report-note').value.trim();
  const position = selectedMapPoint || currentPosition;
  const status = document.getElementById('feature-status');
  if (!note || !position) { status.textContent = 'Selecciona una ubicación y escribe una nota.'; return; }
  if (!supabaseClient) { status.textContent = 'Supabase no está configurado.'; return; }
  const snapped = snapToGrid(position.lat, position.lng);
  const db = Number.parseInt(document.getElementById('db-number').innerText, 10) || 0;
  const { error } = await supabaseClient.from('noise_reports').insert({ latitude: snapped.lat, longitude: snapped.lng, db_level: db, note, client_id: featureClientId });
  status.textContent = error ? 'No se pudo enviar el reporte.' : t('sent');
}

function renderStatsPanel(panel) {
  panel.innerHTML = panelFrame('Resumen del ruido', `<div class="feature-status">${t('loading')}</div><div class="stats-metrics"><div><strong id="metric-total">--</strong><span>mediciones</span></div><div><strong id="metric-average">--</strong><span>promedio dB</span></div><div><strong id="metric-high">--</strong><span>niveles altos</span></div></div><div class="stats-columns"><section><h2>${t('loudest')}</h2><ul class="feature-list" id="loudest-list"></ul></section><section><h2>${t('quietest')}</h2><ul class="feature-list" id="quietest-list"></ul></section></div><h2>${t('alerts')}</h2><ul class="feature-list" id="alerts-list"></ul><h2>Reportes ciudadanos</h2><ul class="feature-list" id="citizen-reports-list"><li>${t('loading')}</li></ul><div class="panel-actions"><button type="button" id="confirm-noise">🔊 ${t('confirm')}</button></div><p>${t('confirmHelp')}</p>`);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#confirm-noise').addEventListener('click', confirmNoise);
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
    featureRows = await fetchFeatureMeasurements();
    const zones = aggregatePoints(featureRows).map((point) => ({ ...point, count: point.sampleCount }));
    panel.querySelector('#metric-total').textContent = featureRows.length;
    panel.querySelector('#metric-average').textContent = averageDb(featureRows) ?? '--';
    panel.querySelector('#metric-high').textContent = featureRows.filter((row) => row.db_level > 70).length;
    appendRanking(panel.querySelector('#loudest-list'), [...zones].sort((a, b) => b.db - a.db).slice(0, 3));
    appendRanking(panel.querySelector('#quietest-list'), [...zones].sort((a, b) => a.db - b.db).slice(0, 3));
    const byZone = new Map();
    featureRows.forEach((row) => {
      const key = `${Math.round(row.latitude / AGG_GRID)}_${Math.round(row.longitude / AGG_GRID)}`;
      if (!byZone.has(key)) byZone.set(key, { row, days: new Set() });
      byZone.get(key).days.add(row.created_at.slice(0, 10));
    });
    const alerts = [...byZone.values()].filter((zone) => zone.days.size >= 3 && zone.row.db_level > 70).slice(0, 3);
    const alertList = panel.querySelector('#alerts-list');
    if (!alerts.length) alertList.innerHTML = `<li>${t('noAlerts')}</li>`;
    alerts.forEach((zone) => { const item = document.createElement('li'); item.textContent = `⚠️ ${zone.row.db_level} dB · ${zone.days.size} días`; alertList.appendChild(item); });
    panel.querySelector('.feature-status').textContent = featureRows.length ? `${zones.length} zonas analizadas` : noDataMessage();
  } catch (error) {
    console.error('Error cargando estadísticas:', error);
    panel.querySelector('.feature-status').textContent = error.message || noDataMessage();
    panel.querySelector('#loudest-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
    panel.querySelector('#quietest-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
    panel.querySelector('#alerts-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
  }
}

async function confirmNoise() {
  const position = selectedMapPoint || currentPosition;
  if (!position || !supabaseClient) { alert('Selecciona una zona y verifica la conexión.'); return; }
  const snapped = snapToGrid(position.lat, position.lng);
  const { error } = await supabaseClient.from('noise_confirmations').insert({ latitude: snapped.lat, longitude: snapped.lng, measurement_time: new Date().toISOString(), client_id: featureClientId });
  alert(error ? 'No se pudo confirmar el ruido.' : t('confirmed'));
}

function renderChallengesPanel(panel) {
  const challenges = [
    { title: 'Hora punta', detail: 'Mide tu calle a las 08:00 durante 3 días.', key: 'rush-hour', target: 3 },
    { title: 'Ruta tranquila', detail: 'Registra 5 mediciones en parques o zonas residenciales.', key: 'quiet-route', target: 5 },
    { title: 'Cobertura nocturna', detail: 'Comparte 3 mediciones entre las 18:00 y las 06:00.', key: 'night-cover', target: 3 }
  ];
  panel.innerHTML = panelFrame(t('challengeTitle'), `<p>${t('challengeHelp')}</p><ul class="feature-list" id="challenge-list"></ul>`);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  const list = panel.querySelector('#challenge-list');
  loadChallengeProgress(list, challenges);
}

async function loadChallengeProgress(list, challenges) {
  try {
    const rows = await fetchFeatureMeasurements();
    const rushDays = new Set();
    const nightRows = [];
    const quietRows = [];
    rows.forEach((row) => {
      const date = new Date(row.created_at);
      const hour = date.getHours();
      if (hour >= 7 && hour <= 9) rushDays.add(row.created_at.slice(0, 10));
      if (hour >= 18 || hour < 6) nightRows.push(row);
      if (row.db_level < 55) quietRows.push(row);
    });
    const progress = {
      'rush-hour': rushDays.size,
      'quiet-route': quietRows.length,
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
        <span class="challenge-state">${percentage === 100 ? '✓ Completado' : `${percentage}% ${t('challengeProgress')}`}</span>`;
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
  if (toolbar) { toolbar.remove(); document.getElementById('feature-panel')?.remove(); createFeatureUi(); }
}

function queueOfflineMeasurement(measurement) {
  const pending = JSON.parse(localStorage.getItem('acoustimap-pending-measurements') || '[]');
  pending.push(measurement);
  localStorage.setItem('acoustimap-pending-measurements', JSON.stringify(pending.slice(-100)));
}

async function flushOfflineMeasurements() {
  if (!supabaseClient) return;
  const pending = JSON.parse(localStorage.getItem('acoustimap-pending-measurements') || '[]');
  if (!pending.length) return;
  const { error } = await supabaseClient.from('noise_measurements').insert(pending);
  if (!error) localStorage.removeItem('acoustimap-pending-measurements');
}

window.addEventListener('online', flushOfflineMeasurements);

document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('acoustimap-theme') === 'dark') document.body.classList.add('dark-theme');
  document.documentElement.lang = currentLanguage;
  createFeatureUi();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('PWA no disponible:', error));
  flushOfflineMeasurements();
});
