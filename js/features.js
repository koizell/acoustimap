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
    <button type="button" data-feature="compare">📊 ${t('compare')}</button>
    <button type="button" data-feature="draw">⬡ ${t('draw')}</button>
    <button type="button" data-feature="report">📝 ${t('report')}</button>
    <button type="button" data-feature="stats">📈 ${t('stats')}</button>
    <button type="button" data-feature="challenges">🎯 ${t('challenges')}</button>
    <button type="button" data-feature="theme">◐ ${t('theme')}</button>
    <button type="button" data-feature="language">🌐 ${t('language')}</button>`;
  document.getElementById('map-view').appendChild(toolbar);

  const panel = document.createElement('aside');
  panel.className = 'feature-panel';
  panel.id = 'feature-panel';
  panel.hidden = true;
  document.getElementById('map-view').appendChild(panel);

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-feature]');
    if (!button) return;
    const feature = button.dataset.feature;
    if (feature === 'theme') toggleTheme();
    else if (feature === 'language') rotateLanguage();
    else if (feature === 'draw') enableZoneDrawing();
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

function closeFeaturePanel() {
  const panel = document.getElementById('feature-panel');
  panel.hidden = true;
  panel.innerHTML = '';
  panel.dataset.view = '';
}

function panelFrame(title, content) {
  return `<div class="panel-actions"><button type="button" class="danger-action" data-close>${t('close')}</button></div><h2>${title}</h2>${content}`;
}

async function fetchFeatureMeasurements(start, end) {
  if (!supabaseClient) return [];
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

function renderComparisonPanel(panel) {
  panel.innerHTML = panelFrame(t('comparison'), `<p>${t('comparisonHelp')}</p><div class="feature-status">${t('loading')}</div>`);
  panel.querySelector('[data-close]').addEventListener('click', closeFeaturePanel);
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
    status.textContent = difference == null ? t('noData') : `${t('current')}: ${currentAvg} dB · ${t('previous')}: ${previousAvg} dB · ${t('difference')}: ${difference > 0 ? '+' : ''}${difference} dB`;
    const points = previous.map((row) => [row.latitude, row.longitude, normalizeDbForHeatmap(row.db_level)]);
    if (comparisonLayer) map.removeLayer(comparisonLayer);
    comparisonLayer = L.heatLayer(points, { radius: 35, blur: 25, maxZoom: 17, minOpacity: 0.2, gradient: { 0.2: '#2563eb', 0.55: '#38bdf8', 1: '#1d4ed8' } }).addTo(map);
  } catch (error) {
    console.error('Error comparando periodos:', error);
    panel.querySelector('.feature-status').textContent = 'No se pudo cargar la comparación.';
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
  openFeaturePanel('stats');
  const panel = document.getElementById('feature-panel');
  panel.innerHTML = panelFrame(t('zone'), `<p>${t('zoneHelp')}</p><div class="feature-status">${t('loading')}</div>`);
  panel.querySelector('[data-close]').addEventListener('click', closeFeaturePanel);
  try {
    const rows = await fetchFeatureMeasurements();
    const selected = rows.filter((row) => pointInPolygon({ lat: row.latitude, lng: row.longitude }, polygon));
    panel.querySelector('.feature-status').textContent = selected.length ? `${t('average')}: ${averageDb(selected)} dB · ${selected.length} ${t('measurements')}` : t('noData');
  } catch (error) {
    console.error('Error analizando zona:', error);
    panel.querySelector('.feature-status').textContent = 'No se pudo analizar la zona.';
  }
}

function renderReportPanel(panel) {
  panel.innerHTML = panelFrame(t('reportTitle'), `<p>${t('reportHelp')}</p><textarea id="report-note" maxlength="280" placeholder="${t('notePlaceholder')}"></textarea><div class="feature-status" id="feature-status"></div><div class="panel-actions"><button type="button" class="primary-action" id="send-report">${t('send')}</button></div>`);
  panel.querySelector('[data-close]').addEventListener('click', closeFeaturePanel);
  panel.querySelector('#send-report').addEventListener('click', submitReport);
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
  panel.innerHTML = panelFrame(t('ranking'), `<div class="feature-status">${t('loading')}</div><h2>${t('loudest')}</h2><ul class="feature-list" id="loudest-list"></ul><h2>${t('quietest')}</h2><ul class="feature-list" id="quietest-list"></ul><h2>${t('alerts')}</h2><ul class="feature-list" id="alerts-list"></ul><div class="panel-actions"><button type="button" id="confirm-noise">🔊 ${t('confirm')}</button></div><p>${t('confirmHelp')}</p>`);
  panel.querySelector('[data-close]').addEventListener('click', closeFeaturePanel);
  panel.querySelector('#confirm-noise').addEventListener('click', confirmNoise);
  loadStats(panel);
}

function appendRanking(list, rows) {
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
    panel.querySelector('.feature-status').textContent = `${featureRows.length} ${t('measurements')}`;
  } catch (error) {
    console.error('Error cargando estadísticas:', error);
    panel.querySelector('.feature-status').textContent = t('noData');
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
  panel.querySelector('[data-close]').addEventListener('click', closeFeaturePanel);
  const list = panel.querySelector('#challenge-list');
  challenges.forEach((challenge) => {
    const progress = Number(localStorage.getItem(`challenge-${challenge.key}`) || 0);
    const item = document.createElement('li');
    item.textContent = `${challenge.title}: ${challenge.detail} ${Math.min(progress, challenge.target)}/${challenge.target} ${t('challengeProgress')}`;
    list.appendChild(item);
  });
}

function recordChallengeProgress(db, date = new Date()) {
  const hour = date.getHours();
  const challenges = hour >= 7 && hour <= 9 ? ['rush-hour'] : hour >= 18 || hour < 6 ? ['night-cover'] : [];
  if (db < 55) challenges.push('quiet-route');
  challenges.forEach((key) => localStorage.setItem(`challenge-${key}`, String(Number(localStorage.getItem(`challenge-${key}`) || 0) + 1)));
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
