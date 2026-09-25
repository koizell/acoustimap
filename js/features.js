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

const CHALLENGE_STORE = 'acoustimap-local-challenge-measurements';

function getLocalChallengeMeasurements() {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rows = JSON.parse(localStorage.getItem(CHALLENGE_STORE) || '[]');
    return rows.filter((row) => Date.parse(row.created_at) >= cutoff);
  } catch (_) {
    return [];
  }
}

function recordLocalChallengeMeasurement(measurement) {
  try {
    const rows = getLocalChallengeMeasurements();
    rows.push({
      latitude: measurement.latitude,
      longitude: measurement.longitude,
      db_level: measurement.db_level,
      created_at: measurement.created_at
    });
    localStorage.setItem(CHALLENGE_STORE, JSON.stringify(rows.slice(-5000)));
  } catch (error) {
    console.warn('No se pudo guardar el progreso local:', error);
  }
}

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
    comparison: 'Antes y después', comparisonHelp: 'Compara los últimos 30 días con los 30 anteriores. Elige un periodo para verlo en el mapa.', loading: 'Cargando datos…', noData: 'No hay datos suficientes.', current: 'Últimos 30 días', previous: '30 días anteriores', average: 'Promedio del índice', difference: 'Cambio', index: 'índice', sector: 'sector', viewMap: 'Ver en mapa', viewCurrent: 'Ver periodo actual', viewPrevious: 'Ver periodo anterior', indexPoints: 'puntos del índice', summaryTitle: 'Resumen de 30 días',
    zone: 'Análisis de zona', zoneHelp: 'Dibuja un polígono sobre el mapa para calcular el promedio del área.', drawAction: 'Activar dibujo', clear: 'Limpiar zona', noZone: 'Aún no hay una zona seleccionada.', measurements: 'mediciones',
    reportTitle: 'Reportar contexto', reportHelp: 'Añade una nota breve sobre el origen del ruido. No se guarda audio ni ubicación exacta.', notePlaceholder: 'Ej.: obra en la calle', send: 'Enviar reporte', sent: 'Reporte enviado.',
    ranking: 'Ranking de zonas', loudest: 'Más ruidosas', quietest: 'Más tranquilas', alerts: 'Alertas persistentes', noAlerts: 'No se detectan zonas persistentes.', confirm: 'Confirmar ruido aquí', confirmed: 'Ruido confirmado.', confirmHelp: 'Pulsa el mapa para elegir una zona y confirma si también escuchas el ruido.',
    challengeTitle: 'Retos de medición', challengeHelp: 'Completa mediciones consistentes para mejorar la cobertura ciudadana.', challengeProgress: 'progreso', offline: 'Medición guardada sin conexión.'
  },
  en: {
    tools: 'Tools', compare: 'Compare month', draw: 'Draw zone', report: 'Report noise', stats: 'Statistics', challenges: 'Challenges', theme: 'Dark theme', language: 'Português', close: 'Close',
    comparison: 'Before and after', comparisonHelp: 'Compare the last 30 days with the 30 days before. Choose a period to see it on the map.', loading: 'Loading data…', noData: 'Not enough data.', current: 'Last 30 days', previous: 'Previous 30 days', average: 'Average index', difference: 'Change', index: 'index', sector: 'area', viewMap: 'View on map', viewCurrent: 'View current period', viewPrevious: 'View previous period', indexPoints: 'index points', summaryTitle: '30-day summary',
    zone: 'Zone analysis', zoneHelp: 'Draw a polygon on the map to calculate the area average.', drawAction: 'Enable drawing', clear: 'Clear zone', noZone: 'No zone selected yet.', measurements: 'measurements',
    reportTitle: 'Context report', reportHelp: 'Add a short note about the noise source. No audio or exact location is stored.', notePlaceholder: 'E.g. road works', send: 'Send report', sent: 'Report sent.',
    ranking: 'Zone ranking', loudest: 'Loudest', quietest: 'Quietest', alerts: 'Persistent alerts', noAlerts: 'No persistent zones detected.', confirm: 'Confirm noise here', confirmed: 'Noise confirmed.', confirmHelp: 'Click the map to choose an area and confirm if you also hear the noise.',
    challengeTitle: 'Measurement challenges', challengeHelp: 'Complete consistent measurements to improve citizen coverage.', challengeProgress: 'progress', offline: 'Measurement saved offline.'
  },
  pt: {
    tools: 'Ferramentas', compare: 'Comparar mês', draw: 'Desenhar zona', report: 'Relatar ruído', stats: 'Estatísticas', challenges: 'Desafios', theme: 'Tema escuro', language: 'Español', close: 'Fechar',
    comparison: 'Antes e depois', comparisonHelp: 'Compare os últimos 30 dias com os 30 dias anteriores. Escolha um período para ver no mapa.', loading: 'Carregando dados…', noData: 'Dados insuficientes.', current: 'Últimos 30 dias', previous: '30 dias anteriores', average: 'Média do índice', difference: 'Mudança', index: 'índice', sector: 'setor', viewMap: 'Ver no mapa', viewCurrent: 'Ver período atual', viewPrevious: 'Ver período anterior', indexPoints: 'pontos do índice', summaryTitle: 'Resumo de 30 dias',
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
  es: { noteLabel: 'Nota', photoLabel: 'Foto opcional (JPG, PNG o WebP; máximo 5 MB)', selectPhoto: 'Seleccionar foto', chooseLocation: 'Elegir ubicación en el mapa', sendReport: 'Enviar reporte', selectedLocation: 'Ubicación seleccionada para el reporte.', reportNeed: 'Escribe una nota y selecciona una ubicación.', photoError: 'La foto debe ser JPG, PNG o WebP y pesar menos de 5 MB.', sending: 'Enviando reporte…', queuedReport: 'Reporte guardado y pendiente de conexión.', queueError: 'No se pudo guardar el reporte sin conexión.', chooseArea: 'Elegir zona en el mapa', chooseConfirm: 'Elegir zona para confirmar', trendTitle: 'Evolución de una zona', trendHelp: 'Elige un punto del mapa para ver su tendencia de 7 días.', emptyTrend: 'No hay mediciones en esta zona durante el periodo.', last30: 'últimos 30 días', noZone: 'Sin zona seleccionada.', rushTitle: 'Hora punta', rushDetail: 'Mide la misma zona entre 07:00 y 09:00 durante 3 días.', quietTitle: 'Ruta tranquila', quietDetail: 'Registra 5 mediciones tranquilas en ubicaciones distintas.', nightTitle: 'Cobertura nocturna', nightDetail: 'Comparte 3 mediciones entre las 18:00 y las 06:00.', completed: 'Completado', chooseMapPoint: 'Toca el mapa para elegir una ubicación.' },
  en: { noteLabel: 'Note', photoLabel: 'Optional photo (JPG, PNG, or WebP; 5 MB max)', selectPhoto: 'Choose photo', chooseLocation: 'Choose a location on the map', sendReport: 'Send report', selectedLocation: 'Location selected for the report.', reportNeed: 'Add a note and choose a location.', photoError: 'Photo must be JPG, PNG, or WebP and under 5 MB.', sending: 'Sending report…', queuedReport: 'Report saved and waiting for a connection.', queueError: 'Could not save the report offline.', chooseArea: 'Choose an area on the map', chooseConfirm: 'Choose an area to confirm', trendTitle: 'Area trend', trendHelp: 'Choose a map point to view its 7-day trend.', emptyTrend: 'No measurements in this area for this period.', last30: 'last 30 days', noZone: 'No area selected.', rushTitle: 'Rush hour', rushDetail: 'Measure the same area between 07:00 and 09:00 on 3 days.', quietTitle: 'Quiet route', quietDetail: 'Record 5 quiet measurements in different locations.', nightTitle: 'Night coverage', nightDetail: 'Share 3 measurements between 18:00 and 06:00.', completed: 'Completed', chooseMapPoint: 'Tap the map to choose a location.' },
  pt: { noteLabel: 'Nota', photoLabel: 'Foto opcional (JPG, PNG ou WebP; máximo 5 MB)', selectPhoto: 'Escolher foto', chooseLocation: 'Escolher local no mapa', sendReport: 'Enviar relato', selectedLocation: 'Local selecionado para o relato.', reportNeed: 'Escreva uma nota e escolha um local.', photoError: 'A foto deve ser JPG, PNG ou WebP e ter menos de 5 MB.', sending: 'Enviando relato…', queuedReport: 'Relato salvo e aguardando conexão.', queueError: 'Não foi possível salvar o relato offline.', chooseArea: 'Escolher área no mapa', chooseConfirm: 'Escolher área para confirmar', trendTitle: 'Tendência da área', trendHelp: 'Escolha um ponto no mapa para ver a tendência de 7 dias.', emptyTrend: 'Não há medições nesta área para o período.', last30: 'últimos 30 dias', noZone: 'Nenhuma área selecionada.', rushTitle: 'Hora de pico', rushDetail: 'Meça a mesma área entre 07:00 e 09:00 durante 3 dias.', quietTitle: 'Rota tranquila', quietDetail: 'Registre 5 medições tranquilas em locais diferentes.', nightTitle: 'Cobertura noturna', nightDetail: 'Compartilhe 3 medições entre 18:00 e 06:00.', completed: 'Concluído', chooseMapPoint: 'Toque no mapa para escolher um local.' }
};

function u(key) { return interfaceCopy[currentLanguage][key] || interfaceCopy.es[key] || key; }

function noPhotoLabel() {
  return { es: 'Ninguna foto seleccionada', en: 'No photo selected', pt: 'Nenhuma foto selecionada' }[currentLanguage];
}

const featureMessages = {
  es: { noData: 'No hay mediciones suficientes para este análisis.', connect: 'Conecta Supabase para cargar las mediciones reales.', reportHeading: 'Reportes ciudadanos', noReports: 'Aún no hay reportes ciudadanos.', reportsError: 'No se pudieron cargar los reportes.', zonesAnalyzed: 'zonas analizadas', noMeasurement: 'Sin medición', alertDays: '3 días consecutivos', alreadyConfirmed: 'Ya confirmaste el ruido en esta zona durante esta hora.', queuedConfirmation: 'Confirmación guardada y pendiente de conexión.', confirmations: 'confirmaciones en esta zona durante las últimas 24 horas.', statsTabLabel: 'Secciones de estadísticas', periods: 'mediciones entre ambos periodos.', supabaseMissing: 'Supabase no está configurado.', attachedPhoto: 'Foto adjunta al reporte', selectConfirmHint: 'Toca una zona del mapa para seleccionarla y vuelve a Datos para confirmar.', loadingTrend: 'Cargando tendencia…', trendError: 'No se pudo cargar la tendencia.', analyzingError: 'No se pudo analizar la zona.', comparisonError: 'No se pudo cargar la comparación.' },
  en: { noData: 'There are not enough measurements for this analysis.', connect: 'Connect Supabase to load real measurements.', reportHeading: 'Citizen reports', noReports: 'No citizen reports yet.', reportsError: 'Reports could not be loaded.', zonesAnalyzed: 'areas analyzed', noMeasurement: 'No measurement', alertDays: '3 consecutive days', alreadyConfirmed: 'You already confirmed noise in this area this hour.', queuedConfirmation: 'Confirmation saved until you are online.', confirmations: 'confirmations in this area during the last 24 hours.', statsTabLabel: 'Statistics sections', periods: 'measurements across both periods.', supabaseMissing: 'Supabase is not configured.', attachedPhoto: 'Photo attached to report', selectConfirmHint: 'Tap an area on the map, then return to Data to confirm it.', loadingTrend: 'Loading trend…', trendError: 'Could not load the trend.', analyzingError: 'Could not analyze this area.', comparisonError: 'Could not load the comparison.' },
  pt: { noData: 'Não há medições suficientes para esta análise.', connect: 'Conecte o Supabase para carregar medições reais.', reportHeading: 'Relatos cidadãos', noReports: 'Ainda não há relatos cidadãos.', reportsError: 'Não foi possível carregar os relatos.', zonesAnalyzed: 'áreas analisadas', noMeasurement: 'Sem medição', alertDays: '3 dias consecutivos', alreadyConfirmed: 'Você já confirmou o ruído nesta área nesta hora.', queuedConfirmation: 'Confirmação salva até a conexão voltar.', confirmations: 'confirmações nesta área nas últimas 24 horas.', statsTabLabel: 'Seções de estatísticas', periods: 'medições nos dois períodos.', supabaseMissing: 'O Supabase não está configurado.', attachedPhoto: 'Foto anexada ao relato', selectConfirmHint: 'Toque em uma área do mapa e volte a Dados para confirmar.', loadingTrend: 'Carregando tendência…', trendError: 'Não foi possível carregar a tendência.', analyzingError: 'Não foi possível analisar a área.', comparisonError: 'Não foi possível carregar a comparação.' }
};

function m(key) { return featureMessages[currentLanguage][key] || featureMessages.es[key] || key; }

function createFeatureUi() {
  const toolbar = document.createElement('div');
  toolbar.className = 'feature-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="feature-menu-toggle" aria-expanded="false" aria-controls="feature-menu-items" aria-label="${t('tools')}" title="${t('tools')}">⋯</button>
    <div class="feature-menu-items" id="feature-menu-items" hidden>
      <button type="button" data-feature="draw">⬡ ${t('draw')}</button>
      <button type="button" data-feature="clear-zone">⌫ ${t('clear')}</button>
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
      switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
      openStatsTab('stats');
      const confirmStatus = document.getElementById('confirm-status');
      if (confirmStatus) confirmStatus.textContent = u('selectedLocation');
      loadZoneConfirmations(event.latlng);
      return;
    }
    if (pendingTrendSelection) {
      pendingTrendSelection = false;
      switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
      openStatsTab('stats');
      loadZoneTrend(event.latlng);
      return;
    }
    if (pendingReportSelection) {
      pendingReportSelection = false;
      switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
      const reportStatus = document.getElementById('stats-feature-content')?.querySelector('#feature-status');
      if (reportStatus) reportStatus.textContent = u('selectedLocation');
      return;
    }
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

function openStatsTab(view, render = true) {
  const content = document.getElementById('stats-feature-content');
  if (!content) return;
  document.querySelectorAll('.stats-section-btn').forEach((button) => {
    const active = button.id === `stats-tab-${view}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  content.dataset.view = view;
  content.setAttribute('aria-labelledby', `stats-tab-${view}`);
  const page = document.getElementById('stats-view');
  if (page) page.scrollTop = 0;
  const renderers = { compare: renderComparisonPanel, report: renderReportPanel, stats: renderStatsPanel, challenges: renderChallengesPanel };
  if (render) (renderers[view] || renderStatsPanel)(content);
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

async function fetchFeatureMeasurements(start, end) {
  if (!supabaseClient) throw new Error(m('connect'));
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
    ? m('noData')
    : m('connect');
}

function renderComparisonPanel(panel) {
  panel.innerHTML = panelFrame(t('comparison'), `<p>${t('comparisonHelp')}</p><div class="feature-status" role="status" aria-live="polite">${t('loading')}</div><div class="comparison-summary" hidden><div><span>${t('previous')}</span><strong id="comparison-previous">--</strong><small>${t('average')}</small></div><div><span>${t('current')}</span><strong id="comparison-current">--</strong><small>${t('average')}</small></div><div><span>${t('difference')}</span><strong id="comparison-difference">--</strong><small>${t('indexPoints')}</small></div></div><div class="panel-actions comparison-actions" hidden><button type="button" data-comparison="previous">${t('viewPrevious')}</button><button type="button" data-comparison="current">${t('viewCurrent')}</button></div>`, panel);
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
    status.textContent = difference == null
      ? `${noDataMessage()} ${t('previous')}: ${previous.length} · ${t('current')}: ${current.length}.`
      : `${previous.length + current.length} ${m('periods')}`;
    const summary = panel.querySelector('.comparison-summary');
    if (summary) summary.hidden = difference == null;
    if (difference != null) {
      panel.querySelector('#comparison-previous').textContent = previousAvg;
      panel.querySelector('#comparison-current').textContent = currentAvg;
      panel.querySelector('#comparison-difference').textContent = `${difference > 0 ? '+' : ''}${difference}`;
    }
    const actions = panel.querySelector('.comparison-actions');
    if (actions) actions.hidden = difference == null;
    if (difference == null) comparisonMode = null;
  } catch (error) {
    if (supabaseClient) console.error('Error comparando periodos:', error);
    if (panelIsCurrent(panel, 'compare')) panel.querySelector('.feature-status').textContent = error.message || m('comparisonError');
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
    radius: 42, blur: 30, maxZoom: 17, max: 1, minOpacity: 0.3,
    gradient: { 0.2: '#2563eb', 0.55: '#38bdf8', 1: '#1d4ed8' }
  });
  if (!currentComparisonLayer) currentComparisonLayer = L.heatLayer([], {
    radius: 42, blur: 30, maxZoom: 17, max: 1, minOpacity: 0.3,
    gradient: { 0.2: '#10b981', 0.55: '#f59e0b', 1: '#dc2626' }
  });
  communityLayer.clearLayers();
  if (communityHeatLayer && map.hasLayer(communityHeatLayer)) map.removeLayer(communityHeatLayer);
  if (map.hasLayer(comparisonLayer)) map.removeLayer(comparisonLayer);
  if (map.hasLayer(currentComparisonLayer)) map.removeLayer(currentComparisonLayer);
  const layer = comparisonMode === 'previous' ? comparisonLayer : currentComparisonLayer;
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
  openStatsTab('stats', false);
  const panel = document.getElementById('stats-feature-content');
  panel.dataset.subview = 'zone';
  panel.innerHTML = panelFrame(t('zone'), `<p>${t('zoneHelp')} (${u('last30')})</p><div class="feature-status">${t('loading')}</div><div id="zone-trend" class="feature-status"></div>`, panel);
  const zoneTrend = panel.querySelector('#zone-trend');
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const rows = await fetchFeatureMeasurements(start, end);
    const selected = rows.filter((row) => pointInPolygon({ lat: row.latitude, lng: row.longitude }, polygon));
    if (!panelIsCurrent(panel, 'stats') || panel.dataset.subview !== 'zone' || panel.querySelector('#zone-trend') !== zoneTrend) return;
    panel.querySelector('.feature-status').textContent = selected.length ? `${t('average')}: ${averageDb(selected)} · ${selected.length} ${t('measurements')} (${u('last30')})` : noDataMessage();
    renderTrendChart(panel, selected);
  } catch (error) {
    if (supabaseClient) console.error('Error analizando zona:', error);
    if (panelIsCurrent(panel, 'stats') && panel.dataset.subview === 'zone' && panel.querySelector('#zone-trend') === zoneTrend) {
      panel.querySelector('.feature-status').textContent = error.message || m('analyzingError');
    }
  }
}

function renderReportPanel(panel) {
  panel.innerHTML = panelFrame(t('reportTitle'), `
    <p>${t('reportHelp')}</p>
    <label for="report-note">${u('noteLabel')}</label>
    <textarea id="report-note" maxlength="280" placeholder="${t('notePlaceholder')}" required></textarea>
    <label for="report-photo">${u('photoLabel')}</label>
    <input id="report-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden />
    <button type="button" id="choose-report-photo">${u('selectPhoto')}</button>
    <div id="report-photo-name" class="photo-selection" role="status" aria-live="polite">${noPhotoLabel()}</div>
    <div class="panel-actions"><button type="button" id="select-report-location">${u('chooseLocation')}</button></div>
    <div class="feature-status" id="feature-status" role="status" aria-live="polite"></div>
    <div class="panel-actions"><button type="button" class="primary-action" id="send-report">${u('sendReport')}</button></div>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#choose-report-photo').addEventListener('click', () => panel.querySelector('#report-photo').click());
  panel.querySelector('#report-photo').addEventListener('change', (event) => {
    panel.querySelector('#report-photo-name').textContent = event.target.files?.[0]?.name || noPhotoLabel();
  });
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
    list.innerHTML = `<li>${m('reportsError')}</li>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = `<li>${m('noReports')}</li>`;
    return;
  }
  list.innerHTML = '';
  data.forEach((report) => {
    const item = document.createElement('li');
    const detail = document.createElement('span');
    detail.textContent = `${report.db_level == null ? m('noMeasurement') : `${t('index')} ${report.db_level}`} · ${report.note} · ${timeAgo(report.created_at)}`;
    item.appendChild(detail);
    if (report.photo_path) {
      const { data: photo } = supabaseClient.storage.from('noise-report-photos').getPublicUrl(report.photo_path);
      const image = document.createElement('img');
      image.src = photo.publicUrl;
      image.alt = m('attachedPhoto');
      image.loading = 'lazy';
      item.appendChild(image);
    }
    list.appendChild(item);
  });
}

function buildReportRecord(id, position, db, note, photoType) {
  const extension = photoType === 'image/png' ? 'png' : photoType === 'image/webp' ? 'webp' : 'jpg';
  const photoPath = photoType ? `${id}/${id}.${extension}` : null;
  return {
    photoPath,
    payload: { id, latitude: position.lat, longitude: position.lng, db_level: db, note, photo_path: photoPath }
  };
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
  if (!supabaseClient && navigator.onLine) { status.textContent = m('supabaseMissing'); return; }
  const photo = photoInput?.files?.[0] || null;
  if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
    status.textContent = u('photoError');
    return;
  }
  const snapped = snapToGrid(position.lat, position.lng);
  const parsedDb = Number.parseInt(document.getElementById('db-number')?.innerText, 10);
  const db = Number.isInteger(parsedDb) && parsedDb >= 20 && parsedDb <= 140 ? parsedDb : null;
  const reportId = crypto.randomUUID();
  const reportRecord = buildReportRecord(reportId, snapped, db, note, photo?.type);
  const button = panel.querySelector('#send-report');
  button.disabled = true;
  status.textContent = u('sending');
  const photoPath = reportRecord.photoPath;
  try {
    if (photo) {
      const { error: uploadError } = await supabaseClient.storage.from('noise-report-photos').upload(photoPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw uploadError;
    }
    const { error } = await supabaseClient.from('noise_reports').insert(reportRecord.payload);
    if (error) throw error;
    status.textContent = t('sent');
    noteInput.value = '';
    if (photoInput) photoInput.value = '';
    const photoName = panel.querySelector('#report-photo-name');
    if (photoName) photoName.textContent = noPhotoLabel();
    loadCitizenReports(document.getElementById('stats-feature-content'));
  } catch (error) {
    if (isOfflineError(error) && typeof enqueueOfflineRecord === 'function') {
      try {
        await enqueueOfflineRecord('noise_reports', { ...reportRecord.payload, photo_path: null }, photo);
        status.textContent = u('queuedReport');
        noteInput.value = '';
        if (photoInput) photoInput.value = '';
        const photoName = panel.querySelector('#report-photo-name');
        if (photoName) photoName.textContent = noPhotoLabel();
      } catch (_) {
        status.textContent = u('queueError');
      }
    } else {
      status.textContent = error.message || 'No se pudo enviar el reporte. Comprueba la conexión y la configuración de Supabase.';
    }
    // Un proceso programado retira las fotos sin reporte; el cliente anónimo no puede borrarlas.
    console.error('Error enviando reporte:', error);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function renderStatsPanel(panel) {
  panel.dataset.subview = 'overview';
  panel.innerHTML = panelFrame(t('summaryTitle'), `<div class="feature-status" role="status" aria-live="polite">${t('loading')}</div><div class="stats-metrics"><div><strong id="metric-total">--</strong><span>${t('measurements')} · ${u('last30')}</span></div><div><strong id="metric-average">--</strong><span>${t('average')}</span></div><div><strong id="metric-high">--</strong><span>${t('index')} &gt; 70</span></div></div><div class="stats-columns"><section><h2>${t('loudest')}</h2><ul class="feature-list" id="loudest-list"></ul></section><section><h2>${t('quietest')}</h2><ul class="feature-list" id="quietest-list"></ul></section></div><h2>${t('alerts')}</h2><ul class="feature-list" id="alerts-list"></ul><h2>${u('trendTitle')}</h2><p>${u('trendHelp')}</p><div class="panel-actions"><button type="button" id="select-trend-location">${u('chooseArea')}</button></div><div id="zone-trend" class="feature-status">${u('noZone')}</div><h2>${m('reportHeading')}</h2><ul class="feature-list" id="citizen-reports-list"><li>${t('loading')}</li></ul><div class="panel-actions"><button type="button" id="select-confirm-location">${u('chooseConfirm')}</button><button type="button" id="confirm-noise">🔊 ${t('confirm')}</button></div><p id="confirm-status" role="status" aria-live="polite">${t('confirmHelp')}</p>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#confirm-noise').addEventListener('click', confirmNoise);
  panel.querySelector('#select-confirm-location').addEventListener('click', () => {
    pendingMapSelection = true;
    switchTab('map-view', document.querySelector('.tab-btn'));
    const status = document.getElementById('confirm-status');
    if (status) status.textContent = m('selectConfirmHint');
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
  rows.forEach((row, index) => {
    const item = document.createElement('li');
    item.className = 'ranked-zone';
    const order = document.createElement('span');
    order.className = 'ranking-order';
    order.textContent = String(index + 1).padStart(2, '0');
    const detail = document.createElement('span');
    detail.className = 'ranking-detail';
    detail.textContent = `${row.count} ${t('measurements')}`;
    const level = document.createElement('strong');
    level.className = 'ranking-level';
    level.textContent = `${row.db} ${t('index')}`;
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'ranking-map-button';
    viewButton.textContent = t('viewMap');
    viewButton.setAttribute('aria-label', `${t('viewMap')}, ${t('sector')} ${index + 1}`);
    viewButton.addEventListener('click', () => {
      switchTab('map-view', document.querySelector('.tab-btn'));
      map.setView([row.lat, row.lng], Math.max(map.getZoom(), 16));
    });
    item.append(order, detail, level, viewButton);
    list.appendChild(item);
  });
}

async function loadStats(panel) {
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const rows = await fetchFeatureMeasurements(start, end);
    if (!panelIsCurrent(panel, 'stats') || panel.dataset.subview !== 'overview' || !panel.querySelector('#metric-total')) return;
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
    alerts.forEach((zone) => { const item = document.createElement('li'); item.textContent = `⚠️ ${t('index')} ${averageDb(zone.dailyLevels.get([...zone.days].sort().at(-1)).map((db_level) => ({ db_level })))} · ${m('alertDays')}`; alertList.appendChild(item); });
    panel.querySelector('.feature-status').textContent = featureRows.length ? `${zones.length} ${m('zonesAnalyzed')}` : noDataMessage();
  } catch (error) {
    if (supabaseClient) console.error('Error cargando estadísticas:', error);
    if (!panelIsCurrent(panel, 'stats') || panel.dataset.subview !== 'overview' || !panel.querySelector('#metric-total')) return;
    panel.querySelector('.feature-status').textContent = error.message || noDataMessage();
    panel.querySelector('#loudest-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
    panel.querySelector('#quietest-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
    panel.querySelector('#alerts-list').innerHTML = `<li>${error.message || noDataMessage()}</li>`;
  }
}

async function confirmNoise() {
  const position = selectedMapPoint || currentPosition;
  const status = document.getElementById('confirm-status');
  if (!position || (!supabaseClient && navigator.onLine)) { if (status) status.textContent = !position ? u('chooseMapPoint') : m('supabaseMissing'); return; }
  const keyTime = new Date();
  keyTime.setMinutes(0, 0, 0);
  const measurementTime = keyTime.toISOString();
  let confirmation;
  try {
    confirmation = await buildConfirmation(position, measurementTime);
    const { error } = await supabaseClient.from('noise_confirmations').insert(confirmation);
    if (error && error.code === '23505') {
      if (status) status.textContent = m('alreadyConfirmed');
      return;
    }
    if (error) throw error;
    if (status) status.textContent = t('confirmed');
    await loadZoneConfirmations(position);
  } catch (error) {
    if (confirmation && isOfflineError(error) && typeof enqueueOfflineRecord === 'function') {
      await enqueueOfflineRecord('noise_confirmations', confirmation);
      if (status) status.textContent = m('queuedConfirmation');
    } else if (status) status.textContent = error.message || 'No se pudo confirmar el ruido.';
  }
}

async function buildConfirmation(position, measurementTime) {
  const snapped = snapToGrid(position.lat, position.lng);
  const value = `${featureClientId}:${snapped.lat.toFixed(5)}:${snapped.lng.toFixed(5)}:${measurementTime}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    id: crypto.randomUUID(), latitude: snapped.lat, longitude: snapped.lng,
    measurement_time: measurementTime, confirmation_key: key
  };
}

async function loadZoneConfirmations(position) {
  const status = document.getElementById('confirm-status');
  if (!status || !supabaseClient || !position) return;
  const snapped = snapToGrid(position.lat, position.lng);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseClient.from('noise_confirmations').select('id', { count: 'exact', head: true })
    .eq('latitude', snapped.lat).eq('longitude', snapped.lng).gte('created_at', since);
  if (!error) status.textContent = `${count || 0} ${m('confirmations')}`;
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
  svg.setAttribute('viewBox', '0 0 300 120'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Tendencia del índice: ${series.map((item) => `${item.date}: ${item.db}`).join(', ')}`);
  const polyline = document.createElementNS(svg.namespaceURI, 'polyline');
  polyline.setAttribute('points', coords); polyline.setAttribute('fill', 'none'); polyline.setAttribute('stroke', '#2563eb'); polyline.setAttribute('stroke-width', '4'); polyline.setAttribute('stroke-linecap', 'round'); polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline); target.appendChild(svg);
  const caption = document.createElement('p'); caption.textContent = `${series[0].date} – ${series.at(-1).date} · índice ${min}–${max}`; target.appendChild(caption);
}

async function loadZoneTrend(position) {
  const target = document.getElementById('zone-trend');
  if (!target || !supabaseClient) return;
  const center = snapToGrid(position.lat, position.lng);
  const start = new Date(); start.setDate(start.getDate() - 7);
  target.textContent = m('loadingTrend');
  try {
    const rows = await fetchFeatureMeasurements(start, new Date());
    if (!target.isConnected || document.getElementById('zone-trend') !== target) return;
    const selected = rows.filter((row) => haversineDistance(center.lat, center.lng, row.latitude, row.longitude) <= 90);
    renderTrendChart(target.parentElement, selected);
  } catch (error) {
    if (target.isConnected) target.textContent = error.message || m('trendError');
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
    const rows = getLocalChallengeMeasurements();
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
  if (document.getElementById('map-view')?.classList.contains('active')) loadCommunityPoints();
}

function updateStaticLanguage() {
  const details = {
    es: { intro: 'Entiende el ruido de tu entorno y cómo los datos ciudadanos ayudan a mejorar la ciudad.', cardDescriptions: ['La exposición prolongada al ruido puede afectar el sueño, la concentración y la salud cardiovascular.', 'AcoustiMap muestra patrones relativos de ruido; su índice no permite evaluar exposición ni riesgo clínico.', 'Las mediciones anónimas aportan información ciudadana para una planificación urbana más sostenible.'], badges: ['Salud', 'ODS 3', 'ODS 11'], cardLabels: ['Bienestar', 'Salud', 'Ciudad'], legend: 'Información' },
    en: { intro: 'Explore local noise patterns and how citizen data can improve the city.', cardDescriptions: ['Long-term noise exposure can affect sleep, concentration, and cardiovascular health.', 'AcoustiMap shows relative noise patterns; its index cannot assess exposure or clinical risk.', 'Anonymous measurements provide information for more sustainable urban planning.'], badges: ['Health', 'SDG 3', 'SDG 11'], cardLabels: ['Wellbeing', 'Health', 'City'], legend: 'Map information' },
    pt: { intro: 'Explore padrões de ruído e como os dados cidadãos podem melhorar a cidade.', cardDescriptions: ['A exposição prolongada ao ruído pode afetar o sono, a concentração e a saúde cardiovascular.', 'O AcoustiMap mostra padrões relativos de ruído; o índice não avalia exposição nem risco clínico.', 'Medições anônimas fornecem informações para um planejamento urbano mais sustentável.'], badges: ['Saúde', 'ODS 3', 'ODS 11'], cardLabels: ['Bem-estar', 'Saúde', 'Cidade'], legend: 'Informações do mapa' }
  }[currentLanguage];
  const copy = {
    es: { map: 'Mapa', health: 'Salud y ODS', healthShort: 'Salud', stats: 'Estadísticas', statsShort: 'Datos', title: 'Salud y ODS', detail: 'Mostrar detalles', hide: 'Ocultar detalles', all: 'Todo', morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', exportCsv: 'Exportar CSV', exportGeo: 'Exportar GeoJSON', statsTitle: 'Datos del ruido', statsIntro: 'Mediciones ciudadanas, tendencias y reportes de tu zona.', tabs: ['Resumen', 'Reportar', 'Comparar', 'Retos'], visualHeat: 'Mapa de calor', visualZones: 'Puntos', privacy: 'Privacidad por diseño', privacyCopy: 'AcoustiMap no graba audio, no requiere login y guarda las coordenadas ancladas a una cuadrícula aproximada de 70 m.', mapHelp: 'Cómo interpretar el mapa', mapHelpCopy: 'Verde indica valores bajos, amarillo moderados y rojo altos del índice relativo. No equivale a decibelios calibrados ni evalúa exposición.', cardTitles: ['Menos ruido, más descanso', 'Ciudades más saludables', 'Participación local'] },
    en: { map: 'Map', health: 'Health and SDGs', healthShort: 'Health', stats: 'Statistics', statsShort: 'Data', title: 'Health and SDGs', detail: 'Show details', hide: 'Hide details', all: 'All', morning: 'Morning', afternoon: 'Afternoon', night: 'Night', exportCsv: 'Export CSV', exportGeo: 'Export GeoJSON', statsTitle: 'Noise data', statsIntro: 'Citizen measurements, trends, and reports for your area.', tabs: ['Summary', 'Report', 'Compare', 'Challenges'], visualHeat: 'Heatmap', visualZones: 'Points', privacy: 'Privacy by design', privacyCopy: 'AcoustiMap does not record audio, requires no login, and stores coordinates snapped to an approximate 70 m grid.', mapHelp: 'How to read the map', mapHelpCopy: 'Green shows low, yellow moderate, and red high relative index values. This is not calibrated decibel data and cannot assess exposure.', cardTitles: ['Less noise, better rest', 'Healthier cities', 'Local participation'] },
    pt: { map: 'Mapa', health: 'Saúde e ODS', healthShort: 'Saúde', stats: 'Estatísticas', statsShort: 'Dados', title: 'Saúde e ODS', detail: 'Mostrar detalhes', hide: 'Ocultar detalhes', all: 'Tudo', morning: 'Manhã', afternoon: 'Tarde', night: 'Noite', exportCsv: 'Exportar CSV', exportGeo: 'Exportar GeoJSON', statsTitle: 'Dados do ruído', statsIntro: 'Medições cidadãs, tendências e relatos da sua região.', tabs: ['Resumo', 'Relatar', 'Comparar', 'Desafios'], visualHeat: 'Mapa de calor', visualZones: 'Pontos', privacy: 'Privacidade desde o início', privacyCopy: 'O AcoustiMap não grava áudio, não exige login e salva coordenadas em uma grade aproximada de 70 m.', mapHelp: 'Como interpretar o mapa', mapHelpCopy: 'Verde indica valores baixos, amarelo moderados e vermelho altos do índice relativo. Não equivale a decibéis calibrados nem avalia exposição.', cardTitles: ['Menos ruído, mais descanso', 'Cidades mais saudáveis', 'Participação local'] }
  }[currentLanguage];
  const extra = {
    es: { timeLabel: 'Hora CO', timeGroup: 'Filtrar por franja horaria de Colombia', visualGroup: 'Forma de visualizar el mapa', low: 'Índice < 55 · Bajo', medium: 'Índice 55–70 · Moderado', high: 'Índice > 70 · Alto', legendNote: 'Escala relativa orientativa; no equivale a dB físicos ni sirve para evaluar exposición.', yourLocation: 'Tu ubicación (solo tú)', shareTitle: 'Compartir ubicación', shareText: 'Tu ubicación se <strong>ancla a una cuadrícula de ~70 m</strong> antes de enviarse a la base de datos. Tú verás tu posición exacta en azul; los demás solo verán la zona.', shareNote: '🔒 <strong>Datos compartidos:</strong> Tu audio nunca se graba ni transmite. Se guarda el índice relativo y la celda aproximada.', micTitle: 'Activar micrófono', micText: 'La app usará tu micrófono para calcular un <strong>índice relativo de ruido</strong>. No es una medición calibrada en decibelios y no sirve para evaluar la exposición acústica.<br><br><strong>No se graba audio.</strong> Solo se analiza la intensidad del sonido en tiempo real.', micNote: '🔒 <strong>Privacidad garantizada:</strong> El audio nunca sale de tu dispositivo ni se transmite a ningún servidor.', cancel: 'Cancelar', acceptShare: 'Aceptar y compartir', acceptMic: 'Aceptar y activar', activate: 'Activar', stop: 'Detener', share: 'Compartir', measuring: 'Midiendo en vivo', idle: 'Inactivo', startHint: 'Presiona para empezar', average: 'Promedio', noSession: 'Sin datos' },
    en: { timeLabel: 'CO time', timeGroup: 'Filter by Colombian time of day', visualGroup: 'Map display mode', low: 'Index < 55 · Low', medium: 'Index 55–70 · Moderate', high: 'Index > 70 · High', legendNote: 'Relative scale only; it is not calibrated dB and cannot assess noise exposure.', yourLocation: 'Your location (only you)', shareTitle: 'Share location', shareText: 'Your location is <strong>snapped to an approximately 70 m grid</strong> before it is sent to the database. You see your exact position in blue; others see only the area.', shareNote: '🔒 <strong>Shared data:</strong> Audio is never recorded or transmitted. Only the relative index and approximate cell are stored.', micTitle: 'Enable microphone', micText: 'The app uses your microphone to calculate a <strong>relative noise index</strong>. It is not calibrated in decibels and cannot assess noise exposure.<br><br><strong>Audio is not recorded.</strong> Sound intensity is analyzed on your device.', micNote: '🔒 <strong>Privacy:</strong> Audio never leaves your device or reaches a server.', cancel: 'Cancel', acceptShare: 'Accept and share', acceptMic: 'Accept and enable', activate: 'Enable', stop: 'Stop', share: 'Share', measuring: 'Measuring live', idle: 'Inactive', startHint: 'Press to start', average: 'Average', noSession: 'No data' },
    pt: { timeLabel: 'Hora CO', timeGroup: 'Filtrar por horário da Colômbia', visualGroup: 'Modo de exibição do mapa', low: 'Índice < 55 · Baixo', medium: 'Índice 55–70 · Moderado', high: 'Índice > 70 · Alto', legendNote: 'Escala relativa; não equivale a dB calibrados nem avalia exposição.', yourLocation: 'Sua localização (só você)', shareTitle: 'Compartilhar localização', shareText: 'Sua localização é <strong>ajustada a uma grade de aproximadamente 70 m</strong> antes de ser enviada ao banco de dados. Você vê sua posição exata em azul; os demais veem apenas a área.', shareNote: '🔒 <strong>Dados compartilhados:</strong> O áudio nunca é gravado ou transmitido. Apenas o índice relativo e a célula aproximada são armazenados.', micTitle: 'Ativar microfone', micText: 'O aplicativo usa seu microfone para calcular um <strong>índice relativo de ruído</strong>. Não é calibrado em decibéis e não avalia exposição.<br><br><strong>O áudio não é gravado.</strong> A intensidade é analisada no dispositivo.', micNote: '🔒 <strong>Privacidade:</strong> O áudio nunca sai do dispositivo nem chega a um servidor.', cancel: 'Cancelar', acceptShare: 'Aceitar e compartilhar', acceptMic: 'Aceitar e ativar', activate: 'Ativar', stop: 'Parar', share: 'Compartilhar', measuring: 'Medindo ao vivo', idle: 'Inativo', startHint: 'Toque para começar', average: 'Média', noSession: 'Sem dados' }
  }[currentLanguage];
  const meterLabels = {
    es: { index: 'índice', min: 'Mín', max: 'Máx', samples: 'Muestras', locate: 'Centrar en mi ubicación' },
    en: { index: 'index', min: 'Min', max: 'Max', samples: 'Samples', locate: 'Center on my location' },
    pt: { index: 'índice', min: 'Mín', max: 'Máx', samples: 'Amostras', locate: 'Centralizar na minha localização' }
  }[currentLanguage];
  const nav = document.querySelectorAll('.tab-btn');
  if (nav[0]) nav[0].textContent = copy.map;
  if (nav[1]) nav[1].innerHTML = `<span class="tab-long">${copy.health}</span><span class="tab-short">${copy.healthShort}</span>`;
  if (nav[2]) nav[2].innerHTML = `<span class="tab-long">${copy.stats}</span><span class="tab-short">${copy.statsShort}</span>`;
  if (nav[1]) nav[1].setAttribute('aria-label', copy.health);
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
  document.querySelectorAll('.stats-section-btn').forEach((button, index) => { if (copy.tabs[index]) button.textContent = copy.tabs[index]; });
  const handle = document.getElementById('stats-handle-label');
  if (handle) handle.textContent = document.getElementById('stats-panel')?.classList.contains('collapsed') ? copy.detail : copy.hide;
  [['time-all', copy.all], ['time-morning', copy.morning], ['time-afternoon', copy.afternoon], ['time-night', copy.night]].forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
  const heat = document.getElementById('visual-heatmap'); if (heat) heat.textContent = copy.visualHeat;
  const zones = document.getElementById('visual-zones'); if (zones) zones.textContent = copy.visualZones;
  const csv = document.getElementById('export-csv-btn'); if (csv) csv.textContent = copy.exportCsv;
  const geo = document.getElementById('export-geojson-btn'); if (geo) geo.textContent = copy.exportGeo;
  const legendTitle = document.querySelector('.legend-header span'); if (legendTitle) legendTitle.textContent = details.legend;
  const legendButton = document.getElementById('legend-toggle'); if (legendButton) legendButton.setAttribute('aria-label', details.legend);
  const statsTabs = document.querySelector('.stats-section-nav'); if (statsTabs) statsTabs.setAttribute('aria-label', m('statsTabLabel'));
  const timeGroup = document.querySelector('.time-filters'); if (timeGroup) timeGroup.setAttribute('aria-label', extra.timeGroup);
  const timeLabel = document.querySelector('.time-filters-label'); if (timeLabel) timeLabel.textContent = extra.timeLabel;
  const visualGroup = document.querySelector('.visual-filters'); if (visualGroup) visualGroup.setAttribute('aria-label', extra.visualGroup);
  const legend = document.getElementById('map-legend'); if (legend) legend.setAttribute('aria-label', details.legend);
  document.querySelectorAll('.legend-body > div').forEach((element, index) => {
    if (index < 3 && element.lastChild) element.lastChild.textContent = [extra.low, extra.medium, extra.high][index];
  });
  const legendNote = document.querySelector('.legend-body p'); if (legendNote) legendNote.textContent = extra.legendNote;
  const legendMe = document.querySelector('.legend-me'); if (legendMe?.lastChild) legendMe.lastChild.textContent = extra.yourLocation;
  [['share-modal', extra.shareTitle, extra.shareText, extra.shareNote, extra.acceptShare], ['mic-modal', extra.micTitle, extra.micText, extra.micNote, extra.acceptMic]].forEach(([id, titleText, bodyText, noteText, actionText]) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.querySelector('h2').textContent = titleText;
    modal.querySelector('.modal-text').innerHTML = bodyText;
    modal.querySelector('.modal-note').innerHTML = noteText;
    modal.querySelector('.modal-btn.cancel').textContent = extra.cancel;
    modal.querySelector('.modal-btn.confirm').textContent = actionText;
  });
  const monitoring = document.getElementById('stats-panel')?.classList.contains('monitoring');
  const actionText = document.querySelector('#btn-toggle .action-text'); if (actionText) actionText.textContent = monitoring ? extra.stop : extra.activate;
  const shareText = document.querySelector('#btn-share .action-text'); if (shareText) shareText.textContent = extra.share;
  const statusText = document.getElementById('status-text'); if (statusText) statusText.textContent = monitoring ? extra.measuring : extra.idle;
  if (!monitoring) {
    const startHint = document.getElementById('db-status-text'); if (startHint) startHint.textContent = extra.startHint;
    const noSession = document.getElementById('avg-tag'); if (noSession && ['Sin datos', 'No data', 'Sem dados'].includes(noSession.textContent.trim())) noSession.textContent = extra.noSession;
  }
  const averageLabel = document.querySelector('.avg-head span'); if (averageLabel) averageLabel.textContent = extra.average;
  document.querySelectorAll('.db-unit, .avg-unit').forEach((element) => { element.textContent = meterLabels.index; });
  document.querySelectorAll('.avg-meta > span').forEach((element, index) => {
    if (element.firstChild?.nodeType === Node.TEXT_NODE) element.firstChild.textContent = `${[meterLabels.min, meterLabels.max, meterLabels.samples][index]} `;
  });
  const locate = document.querySelector('.locate-btn'); if (locate) locate.title = meterLabels.locate;
  if (typeof updateGpsChip === 'function') updateGpsChip(Boolean(sharingEnabled), currentPosition?.accuracy);
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
        let payload = { ...record.payload };
        delete payload.client_id;
        if (Number.isFinite(payload.latitude) && Number.isFinite(payload.longitude)) {
          const snapped = snapToGrid(payload.latitude, payload.longitude);
          payload.latitude = snapped.lat;
          payload.longitude = snapped.lng;
        }
        if (record.table === 'noise_confirmations') {
          const rebuilt = await buildConfirmation(payload, payload.measurement_time);
          payload.confirmation_key = rebuilt.confirmation_key;
        }
        if (record.table === 'noise_reports' && record.photo) {
          const photoPath = buildReportRecord(payload.id, { lat: payload.latitude, lng: payload.longitude }, payload.db_level, payload.note, record.photo.type).photoPath;
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
  if ('serviceWorker' in navigator) {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('PWA no disponible:', error));
  }
  try {
    const legacy = JSON.parse(localStorage.getItem('acoustimap-pending-measurements') || '[]');
    const migration = await Promise.allSettled(legacy.map((measurement) => queueOfflineMeasurement({ ...measurement, id: measurement.id || crypto.randomUUID() })));
    if (legacy.length && migration.every((result) => result.status === 'fulfilled')) localStorage.removeItem('acoustimap-pending-measurements');
  } catch (error) { console.warn('No se pudo migrar la cola local antigua:', error); }
  flushOfflineMeasurements();
});
