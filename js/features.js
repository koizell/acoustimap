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
/*
 * Store aparte del de mediciones, a propósito.
 *
 * Mezclarlos haría que una funcióncontara para los dos y que un `filter` por
 * `db_level` fuera la única forma de distinguirlos. Con dos almacenes, leer uno nunca
 * puede contar lo del otro por accidente.
 */
const REPORT_CHALLENGE_STORE = 'acoustimap-local-challenge-reports';

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

/**
 * Anota un reporte para los retos, y decide si lo guarda en este dispositivo.
 *
 * ## Por qué el progreso no va a la base
 *
 * Porque es progreso **personal**, igual que las mediciones que ya contaban. El resto
 * de retos se calculan en el navegador, así que este sigue la misma regla y no crea
 * un precedente de "mis retos van al servidor".
 *
 * ## Por qué no se guarda la foto, y por qué la foto sigue siendo útil
 *
 * La foto **nunca sale del dispositivo** en esta ruta, ni en la base ni en el bucket.
 * Eso no es una Carthage de los retos: la app promete «anónimo, sin audio, cuadrícula
 * de 70 m», y una foto de una calle anula la cuadrícula, porque identifica el
 * edificio y a veces a quien sale en la imagen.
 *
 * La foto sí cumple una función: **acreditar que el reporte es real**. Se guarda un
 * `1` o un `0`, nunca el archivo. Con eso el reto se puede completar y la ciudad ve
 * *dónde* se acumula basura, que es el dato que sirve, sin que exista ninguna imagen
 * publicada.
 *
 * ## Lo que se guarda
 *
 * Categoría, día y celda. Nada que identifique a nadie ni por dónde pasó la persona.
 */
function recordLocalChallengeReport(report, photo, createdAt) {
  try {
    const rows = getLocalChallengeReports();
    rows.push({
      kind: report.kind,
      latitude: report.latitude,
      longitude: report.longitude,
      // El flag se pasa explícitamente y no se deduce de `photo_path`, por un motivo
      // concreto: en la cola offline el payload se guarda **sin** `photo_path` —la foto
      // vive en el store de la cola y se sube al vaciarse—, así que deducirlo de ahí
      // daba 0 siempre que hubiera red caída. El reto habría contado cero fotos
      // justamente en el caso para el que la foto es obligatoria.
      withPhoto: photo ? 1 : 0,
      created_at: createdAt || report.created_at
    });
    localStorage.setItem(REPORT_CHALLENGE_STORE, JSON.stringify(rows.slice(-2000)));
    return true;
  } catch (error) {
    // Un navegador con el almacenamiento lleno no debe impedir enviar el reporte:
    // el reporte va a la base, que es lo importante. Solo se pierde el progreso del
    // reto en este dispositivo.
    console.warn('No se pudo guardar el progreso local del reporte:', error);
    return false;
  }
}

function getLocalChallengeReports() {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const rows = JSON.parse(localStorage.getItem(REPORT_CHALLENGE_STORE) || '[]');
    return rows.filter((row) => Date.parse(row.created_at) >= cutoff);
  } catch (_) {
    return [];
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

/**
 * Un rechazo de Postgres por esquema, no un fallo de red.
 *
 * ## Por qué hace falta
 *
 * `isOfflineError()` reconoce fallos de red. Un `23514` —restricción violada— es
 * otra cosa: la red funcionó y la base respondió que no. Lo que pasaba es que las dos
 * se confundían, y el efecto era peor que un mal mensaje: la medición **no se
 * guardaba en ninguna parte**. Con la app en la v4 y la migración sin aplicar, el
 * CHECK rechazaba cada escritura y cada lectura del mundo se perdía en silencio.
 *
 * ## Los códigos que se consideran esquema
 *
 *   23514  check_violation       el CHECK no admite esta fila
 *   42P01  undefined_table       falta la tabla
 *   42703  undefined_column      falta la columna
 *   42883  undefined_function    falta la RPC — es el PGRST202 que ve el mapa
 *   42501  insufficient_privilege   el RLS o los permisos no dejan escribir
 *   PGRST204                    PostgREST: la columna no está en la tabla
 *
 * `42501` se incluye a propósito: dice «no autorizado», y la reacción correcta es
 * revisar la clave o las políticas, no esperar a que vuelva la red.
 *
 * ## Por qué PGRST204 está en la lista, y es el más importante
 *
 * Porque PostgREST envuelve los errores de Postgres en códigos propios, y el de
 * columna ausente **no** es `42703`: es `PGRST204`. Sin él, escribir `kind` en un
 * reporte antes de que la migración añada la columna daba un error que ninguna
 * expresión de esta lista reconocía, así que caía por el camino de la red: el reporte
 * se descartaba en silencio y el botón decía «revisa la conexión».
 *
 * Es el mismo modo de fallo que costó las mediciones de la v4, con un código distinto:
 * desplegar el frontend antes que la migración, y perder datos sin que nadie lo note.
 * Los dos casos están ahora en la lista y cubiertos por `test/schema-errors.test.js`.
 *
 * ## Lo que NO se hace con ellos
 *
 * No se ponen en la cola offline. Esa cola se sincroniza sola más tarde y volvería a
 * fallar igual, acumulando filas que la base va a rechazar otra vez; y el mensaje de
 * «guardado sin conexión» sería mentira.
 */
function isSchemaError(error) {
  return /23514|42P01|42703|42883|42501|PGRST202|PGRST204/.test(String(error?.code || ''));
}

const featureText = {
  es: {
    tools: 'Herramientas', compare: 'Comparar mes', draw: 'Dibujar zona', report: 'Reportar ruido', stats: 'Estadísticas', challenges: 'Retos', theme: 'Tema oscuro', language: 'English', close: 'Cerrar',
    comparison: 'Antes y después', comparisonHelp: 'Compara los últimos 30 días con los 30 anteriores. Elige un periodo para verlo en el mapa.', loading: 'Cargando datos…', noData: 'No hay datos suficientes.', current: 'Últimos 30 días', previous: '30 días anteriores', average: 'Promedio en dB', difference: 'Cambio', index: 'dB', sector: 'sector', viewMap: 'Ver en mapa', viewCurrent: 'Ver periodo actual', viewPrevious: 'Ver periodo anterior', indexPoints: 'puntos de diferencia', summaryTitle: 'Resumen de 30 días',
    zone: 'Análisis de zona', zoneHelp: 'Dibuja un polígono sobre el mapa para calcular el promedio del área.', drawAction: 'Activar dibujo', clear: 'Limpiar zona', noZone: 'Aún no hay una zona seleccionada.', measurements: 'mediciones',
    reportTitle: 'Reportar contexto', reportHelp: 'Añade una nota breve sobre el origen del ruido. No se guarda audio ni ubicación exacta.', notePlaceholder: 'Ej.: obra en la calle', send: 'Enviar reporte', sent: 'Reporte enviado.',
    ranking: 'Ranking de zonas', loudest: 'Más ruidosas', quietest: 'Más tranquilas', alerts: 'Alertas persistentes', noAlerts: 'No se detectan zonas persistentes.', confirm: 'Confirmar ruido aquí', confirmed: 'Ruido confirmado.', confirmHelp: 'Pulsa el mapa para elegir una zona y confirma si también escuchas el ruido.',
    challengeTitle: 'Retos', challengeHelp: 'El progreso se guarda en este navegador con tus aportaciones de los últimos 30 días, incluidas las pendientes de conexión. Los retos de huella se completan con un reporte; los de ruido, midiendo. Activa Compartir para aportar.', challengeProgress: 'progreso', offline: 'Medición guardada sin conexión.'
  },
  en: {
    tools: 'Tools', compare: 'Compare month', draw: 'Draw zone', report: 'Report noise', stats: 'Statistics', challenges: 'Challenges', theme: 'Dark theme', language: 'Português', close: 'Close',
    comparison: 'Before and after', comparisonHelp: 'Compare the last 30 days with the 30 days before. Choose a period to see it on the map.', loading: 'Loading data…', noData: 'Not enough data.', current: 'Last 30 days', previous: 'Previous 30 days', average: 'Average in dB', difference: 'Change', index: 'dB', sector: 'area', viewMap: 'View on map', viewCurrent: 'View current period', viewPrevious: 'View previous period', indexPoints: 'point difference', summaryTitle: '30-day summary',
    zone: 'Zone analysis', zoneHelp: 'Draw a polygon on the map to calculate the area average.', drawAction: 'Enable drawing', clear: 'Clear zone', noZone: 'No zone selected yet.', measurements: 'measurements',
    reportTitle: 'Context report', reportHelp: 'Add a short note about the noise source. No audio or exact location is stored.', notePlaceholder: 'E.g. road works', send: 'Send report', sent: 'Report sent.',
    ranking: 'Zone ranking', loudest: 'Loudest', quietest: 'Quietest', alerts: 'Persistent alerts', noAlerts: 'No persistent zones detected.', confirm: 'Confirm noise here', confirmed: 'Noise confirmed.', confirmHelp: 'Click the map to choose an area and confirm if you also hear the noise.',
    challengeTitle: 'Challenges', challengeHelp: 'Progress is saved in this browser from your contributions over the last 30 days, including those awaiting a connection. Impact challenges are completed with a report; noise ones, by measuring. Enable sharing to contribute.', challengeProgress: 'progress', offline: 'Measurement saved offline.'
  },
  pt: {
    tools: 'Ferramentas', compare: 'Comparar mês', draw: 'Desenhar zona', report: 'Relatar ruído', stats: 'Estatísticas', challenges: 'Desafios', theme: 'Tema escuro', language: 'Español', close: 'Fechar',
    comparison: 'Antes e depois', comparisonHelp: 'Compare os últimos 30 dias com os 30 dias anteriores. Escolha um período para ver no mapa.', loading: 'Carregando dados…', noData: 'Dados insuficientes.', current: 'Últimos 30 dias', previous: '30 dias anteriores', average: 'Média em dB', difference: 'Mudança', index: 'dB', sector: 'setor', viewMap: 'Ver no mapa', viewCurrent: 'Ver período atual', viewPrevious: 'Ver período anterior', indexPoints: 'pontos de diferença', summaryTitle: 'Resumo de 30 dias',
    zone: 'Análise da zona', zoneHelp: 'Desenhe um polígono no mapa para calcular a média da área.', drawAction: 'Ativar desenho', clear: 'Limpar zona', noZone: 'Nenhuma zona selecionada.', measurements: 'medições',
    reportTitle: 'Relato de contexto', reportHelp: 'Adicione uma nota breve sobre a origem do ruído. Áudio e localização exata não são armazenados.', notePlaceholder: 'Ex.: obra na rua', send: 'Enviar relato', sent: 'Relato enviado.',
    ranking: 'Ranking de zonas', loudest: 'Mais barulhentas', quietest: 'Mais silenciosas', alerts: 'Alertas persistentes', noAlerts: 'Nenhuma zona persistente detectada.', confirm: 'Confirmar ruído aqui', confirmed: 'Ruído confirmado.', confirmHelp: 'Clique no mapa para escolher uma zona e confirme se também ouve o ruído.',
    challengeTitle: 'Desafios', challengeHelp: 'O progresso é salvo neste navegador com suas contribuições dos últimos 30 dias, incluindo as pendentes de conexão. Os desafios de impacto são completados com um relato; os de ruído, medindo. Ative o compartilhamento para contribuir.', challengeProgress: 'progresso', offline: 'Medição guardada offline.'
  }
};

function t(key) {
  return featureText[currentLanguage][key] || featureText.es[key] || key;
}

const interfaceCopy = {
  es: { noteLabel: 'Nota', kindLabel: '¿Qué es?', photoLabel: 'Foto opcional (JPG, PNG o WebP; máximo 5 MB)', selectPhoto: 'Seleccionar foto', chooseLocation: 'Elegir ubicación en el mapa', sendReport: 'Enviar reporte', selectedLocation: 'Ubicación seleccionada para el reporte.', reportNeed: 'Escribe una nota y selecciona una ubicación.', photoError: 'La foto debe ser JPG, PNG o WebP y pesar menos de 5 MB.', sending: 'Enviando reporte…', queuedReport: 'Reporte guardado y pendiente de conexión.', queueError: 'No se pudo guardar el reporte sin conexión.', chooseArea: 'Elegir zona en el mapa', chooseConfirm: 'Elegir zona para confirmar', trendTitle: 'Evolución de una zona', trendHelp: 'Elige un punto del mapa para ver su tendencia de 7 días.', emptyTrend: 'No hay mediciones en esta zona durante el periodo.', last30: 'últimos 30 días', noZone: 'Sin zona seleccionada.', rushTitle: 'Hora punta', rushDetail: 'Mide la misma zona entre 07:00 y 09:00 durante 3 días.', quietTitle: 'Ruta tranquila', quietDetail: 'Registra 5 mediciones tranquilas en ubicaciones distintas.', nightTitle: 'Cobertura nocturna', nightDetail: 'Aporta mediciones entre las 18:00 y las 06:00, hora de Colombia, en 3 combinaciones distintas de zona y día.', litterTitle: 'Recoge basura', litterDetail: 'Reporta basura que hayas recogido, con foto, en 3 zonas y días distintos. La foto no se publica: solo queda en tu dispositivo.', worksTitle: 'Denuncia la obra', worksDetail: 'Reporta 2 obras activas en zonas distintas. No hace falta foto ni medir el ruido.', completed: 'Completado', chooseMapPoint: 'Toca el mapa para elegir una ubicación.' },
  en: { noteLabel: 'Note', kindLabel: 'What is it?', photoLabel: 'Optional photo (JPG, PNG, or WebP; 5 MB max)', selectPhoto: 'Choose photo', chooseLocation: 'Choose a location on the map', sendReport: 'Send report', selectedLocation: 'Location selected for the report.', reportNeed: 'Add a note and choose a location.', photoError: 'Photo must be JPG, PNG, or WebP and under 5 MB.', sending: 'Sending report…', queuedReport: 'Report saved and waiting for a connection.', queueError: 'Could not save the report offline.', chooseArea: 'Choose an area on the map', chooseConfirm: 'Choose an area to confirm', trendTitle: 'Area trend', trendHelp: 'Choose a map point to view its 7-day trend.', emptyTrend: 'No measurements in this area for this period.', last30: 'last 30 days', noZone: 'No area selected.', rushTitle: 'Rush hour', rushDetail: 'Measure the same area between 07:00 and 09:00 on 3 days.', quietTitle: 'Quiet route', quietDetail: 'Record 5 quiet measurements in different locations.', nightTitle: 'Night coverage', nightDetail: 'Contribute measurements between 18:00 and 06:00, Colombian time, in 3 distinct area-and-day combinations.', litterTitle: 'Pick up litter', litterDetail: 'Report litter you have picked up, with a photo, in 3 different areas and days. The photo is not published: it stays on your device.', worksTitle: 'Report the works', worksDetail: 'Report 2 active construction sites in different areas. No photo and no noise reading needed.', completed: 'Completed', chooseMapPoint: 'Tap the map to choose a location.' },
  pt: { noteLabel: 'Nota', kindLabel: 'O que é?', photoLabel: 'Foto opcional (JPG, PNG ou WebP; máximo 5 MB)', selectPhoto: 'Escolher foto', chooseLocation: 'Escolher local no mapa', sendReport: 'Enviar relato', selectedLocation: 'Local selecionado para o relato.', reportNeed: 'Escreva uma nota e escolha um local.', photoError: 'A foto deve ser JPG, PNG ou WebP e ter menos de 5 MB.', sending: 'Enviando relato…', queuedReport: 'Relato salvo e aguardando conexão.', queueError: 'Não foi possível salvar o relato offline.', chooseArea: 'Escolher área no mapa', chooseConfirm: 'Escolher área para confirmar', trendTitle: 'Tendência da área', trendHelp: 'Escolha um ponto no mapa para ver a tendência de 7 dias.', emptyTrend: 'Não há medições nesta área para o período.', last30: 'últimos 30 dias', noZone: 'Nenhuma área selecionada.', rushTitle: 'Hora de pico', rushDetail: 'Meça a mesma área entre 07:00 e 09:00 durante 3 dias.', quietTitle: 'Rota tranquila', quietDetail: 'Registre 5 medições tranquilas em locais diferentes.', nightTitle: 'Cobertura noturna', nightDetail: 'Contribua com medições entre 18:00 e 06:00, no horário da Colômbia, em 3 combinações distintas de área e dia.', litterTitle: 'Recolha lixo', litterDetail: 'Relate lixo que você recolheu, com foto, em 3 áreas e dias diferentes. A foto não é publicada: fica só no seu aparelho.', worksTitle: 'Denuncie a obra', worksDetail: 'Relate 2 obras ativas em áreas diferentes. Não precisa de foto nem de medir o ruído.', completed: 'Concluído', chooseMapPoint: 'Toque no mapa para escolher um local.' }
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

function toolUiText(key) {
  const copy = {
    es: { map: 'En el mapa', preferences: 'Preferencias' },
    en: { map: 'On the map', preferences: 'Preferences' },
    pt: { map: 'No mapa', preferences: 'Preferências' }
  };
  return (copy[currentLanguage] || copy.es)[key];
}

function closeFeatureMenu(restoreFocus = false) {
  const toolbar = document.querySelector('.feature-toolbar');
  if (!toolbar) return;
  const menu = toolbar.querySelector('.feature-menu-items');
  const toggle = toolbar.querySelector('.feature-menu-toggle');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) toggle.focus();
}

function createFeatureUi() {
  const toolbar = document.createElement('div');
  toolbar.className = 'feature-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="feature-menu-toggle" aria-expanded="false" aria-controls="feature-menu-items" aria-label="${t('tools')}" title="${t('tools')}">⋯</button>
    <div class="feature-menu-items" id="feature-menu-items" role="region" aria-label="${t('tools')}" hidden>
      <h3>${toolUiText('map')}</h3>
      <button type="button" data-feature="draw"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l14-2 3 15-14 3z"/><circle cx="4" cy="5" r="2"/><circle cx="18" cy="3" r="2"/><circle cx="21" cy="18" r="2"/><circle cx="7" cy="21" r="2"/></svg><span>${t('draw')}</span></button>
      <button type="button" data-feature="clear-zone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg><span>${t('clear')}</span></button>
      <h3 class="tool-preferences-title">${toolUiText('preferences')}</h3>
      <button type="button" data-feature="theme" aria-pressed="${Boolean(document.body?.classList?.contains('dark-theme'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5z"/></svg><span>${t('theme')}</span></button>
      <button type="button" data-feature="language"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18z"/></svg><span>${t('language')}</span></button>
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
    if (!isOpen) {
      const filters = document.getElementById('map-filters');
      if (filters) filters.open = false;
      const legend = document.getElementById('map-legend');
      if (legend && !legend.classList.contains('collapsed')) toggleLegend();
    }
    menu.hidden = isOpen;
    toolbar.querySelector('.feature-menu-toggle').setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen && typeof revealUi === 'function') revealUi(menu);
    if (!isOpen) menu.querySelector('button')?.focus();
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
    document.querySelector('.feature-menu-toggle')?.focus();
  });

  // Los listeners resuelven la barra actual: no se duplican al cambiar idioma.
  if (!createFeatureUi.dismissBound) {
    createFeatureUi.dismissBound = true;
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeFeatureMenu(true);
        if (pendingMapSelection || pendingTrendSelection || pendingReportSelection) cancelMapSelection(true);
      }
    });
    document.addEventListener('pointerdown', (event) => {
      const current = document.querySelector('.feature-toolbar');
      if (current && !current.contains(event.target)) closeFeatureMenu();
    });
  }

  if (!createFeatureUi.selectionBound) {
    createFeatureUi.selectionBound = true;
    document.getElementById('map-selection-use-center')?.addEventListener('click', () => completeMapSelection(map.getCenter()));
    document.getElementById('map-selection-cancel')?.addEventListener('click', () => cancelMapSelection(true));
  }
  updateMapSelectionUi();

  // Cambiar idioma reconstruye los botones, no debe registrar otro listener.
  if (!createFeatureUi.mapClickBound) {
    createFeatureUi.mapClickBound = true;
    map.on('click', (event) => {
      completeMapSelection(event.latlng);
    });
  }

  return panel;
}

function updateMapSelectionUi() {
  const copy = {
    es: { hint: 'Toca el mapa o muévelo con las flechas y usa su centro.', center: 'Elegir centro del mapa', cancel: 'Cancelar selección' },
    en: { hint: 'Tap the map or move it with the arrow keys and choose its center.', center: 'Choose map center', cancel: 'Cancel selection' },
    pt: { hint: 'Toque no mapa ou mova-o com as setas e escolha o centro.', center: 'Escolher centro do mapa', cancel: 'Cancelar seleção' }
  }[currentLanguage];
  for (const [id, text] of [['map-selection-hint', copy.hint], ['map-selection-use-center', copy.center], ['map-selection-cancel', copy.cancel]]) {
    const element = document.getElementById(id); if (element) element.textContent = text;
  }
}

function beginMapSelection(kind) {
  cancelMapSelection();
  pendingMapSelection = kind === 'confirm';
  pendingTrendSelection = kind === 'trend';
  pendingReportSelection = kind === 'report';
  switchTab('map-view', document.querySelector('.tab-btn'));
  const selection = document.getElementById('map-selection');
  if (selection) selection.hidden = false;
  document.getElementById('map-view')?.setAttribute('data-selecting', 'true');
  map.getContainer()?.focus();
}

function cancelMapSelection(returnToData = false) {
  const origin = pendingReportSelection ? 'select-report-location' : pendingTrendSelection ? 'select-trend-location' : 'select-confirm-location';
  pendingMapSelection = pendingTrendSelection = pendingReportSelection = false;
  const selection = document.getElementById('map-selection');
  if (selection) selection.hidden = true;
  document.getElementById('map-view')?.removeAttribute('data-selecting');
  if (returnToData) {
    switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
    document.getElementById(origin)?.focus();
  }
}

function completeMapSelection(position) {
  selectedMapPoint = position;
  const kind = pendingReportSelection ? 'report' : pendingTrendSelection ? 'trend' : pendingMapSelection ? 'confirm' : null;
  if (!kind) return;
  cancelMapSelection();
  switchTab('stats-view', document.querySelectorAll('.tab-btn')[2]);
  if (kind === 'report') {
    const status = document.getElementById('stats-feature-content')?.querySelector('#feature-status');
    if (status) status.textContent = u('selectedLocation');
    document.getElementById('report-note')?.focus();
    return;
  }
  openStatsTab('stats');
  if (kind === 'trend') {
    loadZoneTrend(position);
    document.getElementById('stats-feature-content')?.focus();
  } else {
    const status = document.getElementById('confirm-status');
    if (status) status.textContent = u('selectedLocation');
    loadZoneConfirmations(position);
    document.getElementById('confirm-noise')?.focus();
  }
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
    button.setAttribute('tabindex', active ? '0' : '-1');
  });
  content.dataset.view = view;
  content.setAttribute('aria-labelledby', `stats-tab-${view}`);
  const page = document.getElementById('stats-view');
  if (page) page.scrollTop = 0;
  const renderers = { compare: renderComparisonPanel, report: renderReportPanel, stats: renderStatsPanel, challenges: renderChallengesPanel };
  if (render) (renderers[view] || renderStatsPanel)(content);
  if (typeof revealUi === 'function') revealUi(content);
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
      .select('latitude, longitude, db_level, category, created_at, measurement_version, capture_profile')
      .eq('measurement_version', MEASUREMENT_VERSION)
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

/*
 * El promedio de la pestaña de Datos, energetico como el resto.
 *
 * Es el mismo error que se corrigio en el medidor y en la ventana de envio, en el
 * tercer sitio donde se hacia: la media aritmetica de dB queda por debajo de la
 * energia real, y cuanto mas varian las lecturas mas se separa. Aqui las filas son
 * mediciones de distintos dias y horas, que es donde mas varian, asi que era el
 * promedio mas sesgado de los tres.
 */
function averageDb(rows) {
  if (!rows.length) return null;
  const energia = rows.reduce((sum, row) => sum + energiaDe(row.db_level), 0);
  return Math.round(promedioEnergetico(energia, rows.length));
}

function noDataMessage() {
  return supabaseClient
    ? m('noData')
    : m('connect');
}

function renderComparisonPanel(panel) {
  panel.innerHTML = panelFrame(t('comparison'), `<p>${t('comparisonHelp')}</p><p class="data-scope">${dataUiText('all')} · ${summaryText('scope')}</p><p class="comparison-periods"></p><div class="feature-status" role="status" aria-live="polite">${t('loading')}</div><div class="comparison-summary" hidden><div><span>${t('previous')}</span><strong id="comparison-previous">--</strong><small>${t('average')}</small></div><div><span>${t('current')}</span><strong id="comparison-current">--</strong><small>${t('average')}</small></div><div><span>${t('difference')}</span><strong id="comparison-difference">--</strong><small>${t('indexPoints')}</small></div></div><div class="panel-actions comparison-actions" hidden><button type="button" data-comparison="previous">${t('viewPrevious')}</button><button type="button" data-comparison="current">${t('viewCurrent')}</button></div><div class="panel-actions comparison-feedback-actions" hidden><button type="button" class="comparison-retry">${dataUiText('retry')}</button><button type="button" class="comparison-map">${dataUiText('map')}</button></div>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelectorAll('[data-comparison]').forEach((button) => button.addEventListener('click', () => showComparison(button.dataset.comparison)));
  panel.querySelector('.comparison-retry').addEventListener('click', () => comparePeriods(panel));
  panel.querySelector('.comparison-map').addEventListener('click', () => switchTab('map-view', document.querySelector('.tab-btn')));
  comparePeriods(panel);
}

async function comparePeriods(panel) {
  // El mismo panel puede volver a Comparar mientras otra consulta sigue pendiente.
  const requestId = panel.comparisonRequestId = (panel.comparisonRequestId || 0) + 1;
  const status = panel.querySelector('.feature-status');
  status.textContent = t('loading');
  if (status.dataset) status.dataset.state = 'loading';
  status.setAttribute?.('aria-busy', 'true');
  const retry = panel.querySelector('.comparison-retry');
  if (retry) retry.disabled = true;
  for (const selector of ['.comparison-summary', '.comparison-actions', '.comparison-feedback-actions']) {
    const element = panel.querySelector(selector); if (element) element.hidden = true;
  }
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - 30);
  const previousEnd = new Date(currentStart);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - 30);
  const periods = panel.querySelector('.comparison-periods');
  if (periods) periods.textContent = `${t('previous')}: ${previousStart.toISOString().slice(0, 10)} – ${previousEnd.toISOString().slice(0, 10)} · ${t('current')}: ${currentStart.toISOString().slice(0, 10)} – ${now.toISOString().slice(0, 10)} (UTC)`;
  try {
    const [current, previous] = await Promise.all([
      fetchFeatureMeasurements(currentStart, now),
      fetchFeatureMeasurements(previousStart, previousEnd)
    ]);
    const currentAvg = averageDb(current);
    const previousAvg = averageDb(previous);
    const difference = currentAvg == null || previousAvg == null ? null : currentAvg - previousAvg;
    if (!panelIsCurrent(panel, 'compare') || panel.comparisonRequestId !== requestId
      || panel.querySelector('.feature-status') !== status) return;
    comparisonRows = { current, previous };
    if (status.dataset) status.dataset.state = difference == null ? 'empty' : 'ready';
    status.setAttribute?.('aria-busy', 'false');
    if (retry) retry.disabled = false;
    const feedback = panel.querySelector('.comparison-feedback-actions');
    if (feedback) feedback.hidden = difference != null;
    status.textContent = difference == null
      ? `${noDataMessage()} ${t('previous')}: ${previous.length} · ${t('current')}: ${current.length}.`
      : `${previous.length + current.length} ${m('periods')}`;
    const summary = panel.querySelector('.comparison-summary');
    if (summary) summary.hidden = difference == null;
    if (difference != null) {
      panel.querySelector('#comparison-previous').textContent = previousAvg;
      panel.querySelector('#comparison-current').textContent = currentAvg;
      panel.querySelector('#comparison-difference').textContent = `${difference > 0 ? '+' : ''}${difference}`;
      if (summary?.dataset) summary.dataset.change = difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'unchanged';
    }
    const actions = panel.querySelector('.comparison-actions');
    if (actions) actions.hidden = difference == null;
    if (difference == null) comparisonMode = null;
  } catch (error) {
    if (!panelIsCurrent(panel, 'compare') || panel.comparisonRequestId !== requestId
      || panel.querySelector('.feature-status') !== status) return;
    if (supabaseClient) console.error('Error comparando periodos:', error);
    comparisonRows = { current: [], previous: [] };
    comparisonMode = null;
    status.textContent = supabaseClient ? m('comparisonError') : m('connect');
    if (status.dataset) status.dataset.state = supabaseClient ? 'error' : 'disconnected';
    status.setAttribute?.('aria-busy', 'false');
    if (retry) retry.disabled = false;
    const feedback = panel.querySelector('.comparison-feedback-actions');
    if (feedback) feedback.hidden = false;
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
  const aggregated = aggregatePoints(rows);
  const points = aggregated.map((point) => [point.lat, point.lng, normalizeDbForHeatmap(point.db)]);
  if (!comparisonLayer) comparisonLayer = createRelativeHeatLayer([], {
    radius: 42, blur: 30, maxZoom: 0, max: 1, minOpacity: 0.3,
    gradient: { 0.2: '#2563eb', 0.55: '#38bdf8', 1: '#1d4ed8' }
  });
  if (!currentComparisonLayer) currentComparisonLayer = createRelativeHeatLayer([], {
    radius: 42, blur: 30, maxZoom: 0, max: 1, minOpacity: 0.3,
    gradient: { 0.2: '#10b981', 0.55: '#f59e0b', 1: '#dc2626' }
  });
  communityLayer.clearLayers();
  suspendMapHeatLayers();
  if (selectedVisualMode === 'zones') {
    aggregated.forEach((point) => addCommunityPoint(point.lat, point.lng, point.db, point.category, point.createdAt, point.sampleCount));
    return;
  }
  const layer = comparisonMode === 'previous' ? comparisonLayer : currentComparisonLayer;
  layer._latlngs = points;
  if (!points.length) return;
  layer.addTo(map);
  layer.setLatLngs(points);
}

function exitComparisonMode() {
  comparisonMode = null;
  detachHeatLayer(comparisonLayer);
  detachHeatLayer(currentComparisonLayer);
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
  if (drawnZone) map.removeLayer(drawnZone);
  drawnZone = null;
  exitComparisonMode();
  renderCommunityPoints(lastAggregatedPoints);
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

/**
 * Las categorías de reporte, y por qué existen.
 *
 * ## El problema que resuelven
 *
 * El reto de recoger basura se completaría con **cualquier** reporte que lleve una
 * foto. Eso está mal: fotografiar una obra en seco lo completaría, que es justo lo
 * contrario de lo que se busca. Para que un reto signifique algo tiene que poder
 * distinguir de qué trata el reporte, y eso no se saca del texto libre.
 *
 * ## Por qué solo cuatro
 *
 * Porque cuatro son las que la app sabe nombrar sin inventar una taxonomía. Una
 * lista larga de categorías que nadie usa es peor que cuatro que sí: el objetivo es
 * que el dato sea fiable, no que haya muchas casillas. `'ruido'` es la que menos dice,
 * y es la que corresponde a lo que había antes de esta columna, porque el 100 % de
 * los reportes guardados hasta ahora son de ese tipo.
 *
 * El orden no es el de la base de datos ni el alfabético: empieza por `basura` porque
 * es la que empuja el reto nuevo, y acaba por `ruido` porque es la que menos
 * información aporta y así no se elige por defecto.
 */
const REPORT_KINDS = ['basura', 'obra', 'trafico', 'ruido'];

const reportKindCopy = {
  es: { basura: 'Basura acumulada', obra: 'Obra', trafico: 'Tráfico', ruido: 'Ruido' },
  en: { basura: 'Litter', obra: 'Construction', trafico: 'Traffic', ruido: 'Noise' },
  pt: { basura: 'Lixo acumulado', obra: 'Obra', trafico: 'Tráfego', ruido: 'Ruído' }
};

/** El `<option>` que viene marcado es `ruido`, el de menor información. */
function reportKindOptions() {
  const copy = reportKindCopy[currentLanguage] || reportKindCopy.es;
  const selected = REPORT_KINDS.find((kind) => kind === 'ruido');
  return REPORT_KINDS
    .map((kind) => `<option value="${kind}"${kind === selected ? ' selected' : ''}>${copy[kind]}</option>`)
    .join('');
}

function reportPhotoNotice(kind) {
  const local = kind === 'basura' || kind === 'obra';
  const copy = {
    es: local ? 'La foto no se sube; solo cuenta para el reto.' : 'La foto se publicará con el reporte. Evita rostros y datos personales.',
    en: local ? 'The photo is not uploaded; it only counts toward the challenge.' : 'The photo will be published with the report. Avoid faces and personal details.',
    pt: local ? 'A foto não é enviada; só conta para o desafio.' : 'A foto será publicada com o relato. Evite rostos e dados pessoais.'
  };
  return copy[currentLanguage] || copy.es;
}

function renderReportPanel(panel) {
  panel.innerHTML = panelFrame(t('reportTitle'), `
    <p>${t('reportHelp')}</p>
    <label for="report-kind">${u('kindLabel')}</label>
    <select id="report-kind">${reportKindOptions()}</select>
    <label for="report-note">${u('noteLabel')}</label>
    <textarea id="report-note" maxlength="280" placeholder="${t('notePlaceholder')}" required></textarea>
    <label for="report-photo">${u('photoLabel')}</label>
    <input id="report-photo" type="file" accept="image/jpeg,image/png,image/webp" hidden />
    <button type="button" id="choose-report-photo">${u('selectPhoto')}</button>
    <div id="report-photo-name" class="photo-selection" role="status" aria-live="polite">${noPhotoLabel()}</div>
    <p id="report-photo-privacy" role="status" aria-live="polite">${reportPhotoNotice('ruido')}</p>
    <div class="panel-actions"><button type="button" id="select-report-location">${u('chooseLocation')}</button></div>
    <div class="feature-status" id="feature-status" role="status" aria-live="polite"></div>
    <div class="panel-actions"><button type="button" class="primary-action" id="send-report">${u('sendReport')}</button></div>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#choose-report-photo').addEventListener('click', () => panel.querySelector('#report-photo').click());
  panel.querySelector('#report-kind').addEventListener('change', (event) => {
    panel.querySelector('#report-photo-privacy').textContent = reportPhotoNotice(event.target.value);
  });
  panel.querySelector('#report-photo').addEventListener('change', (event) => {
    panel.querySelector('#report-photo-name').textContent = event.target.files?.[0]?.name || noPhotoLabel();
  });
  panel.querySelector('#select-report-location').addEventListener('click', () => {
    beginMapSelection('report');
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
    .select('db_level, note, photo_path, kind, created_at')
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
    const kindLabel = reportKindCopy[currentLanguage]?.[report.kind];
    const nivel = report.db_level == null ? m('noMeasurement') : `${t('index')} ${report.db_level}`;
    detail.textContent = `${kindLabel ? `${kindLabel} · ` : ''}${nivel} · ${report.note} · ${timeAgo(report.created_at)}`;
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

function buildReportRecord(id, position, db, note, photoType, kind) {
  const extension = photoType === 'image/png' ? 'png' : photoType === 'image/webp' ? 'webp' : 'jpg';
  const localPhoto = kind === 'basura' || kind === 'obra';
  const photoPath = photoType && !localPhoto ? `${id}/${id}.${extension}` : null;
  return {
    photoPath,
    payload: { id, latitude: position.lat, longitude: position.lng, db_level: db, note, photo_path: photoPath, kind }
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
  const kindInput = panel?.querySelector('#report-kind');
  const kind = REPORT_KINDS.includes(kindInput?.value) ? kindInput.value : 'ruido';
  const reportRecord = buildReportRecord(reportId, snapped, db, note, photo?.type, kind);
  const button = panel.querySelector('#send-report');
  button.disabled = true;
  status.textContent = u('sending');
  const photoPath = reportRecord.photoPath;
  const uploadPhoto = photoPath ? photo : null;
  try {
    if (uploadPhoto) {
      const { error: uploadError } = await supabaseClient.storage.from('noise-report-photos').upload(photoPath, uploadPhoto, { contentType: uploadPhoto.type, upsert: false });
      if (uploadError) throw uploadError;
    }
    const { error } = await supabaseClient.from('noise_reports').insert(reportRecord.payload);
    if (error) throw error;
    status.textContent = t('sent');
    recordLocalChallengeReport(reportRecord.payload, photo, new Date().toISOString());
    noteInput.value = '';
    if (photoInput) photoInput.value = '';
    const photoName = panel.querySelector('#report-photo-name');
    if (photoName) photoName.textContent = noPhotoLabel();
    loadCitizenReports(document.getElementById('stats-feature-content'));
  } catch (error) {
    if (isOfflineError(error) && typeof enqueueOfflineRecord === 'function') {
      try {
        await enqueueOfflineRecord('noise_reports', { ...reportRecord.payload, photo_path: null }, uploadPhoto);
        status.textContent = u('queuedReport');
        recordLocalChallengeReport(reportRecord.payload, photo, new Date().toISOString());
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

// Copy del resumen: breve, sin presentar el índice como una medición en dB.
function summaryText(key) {
  const copy = {
    es: {
      scope: `Ruido medido · método v${MEASUREMENT_VERSION}`, totalLabel: 'Mediciones', singleReading: 'medición', oneZone: 'zona analizada',
      totalHint: 'Lecturas compartidas', averageLabel: 'Media en dB', averageHint: 'Escala orientativa, sin calibrar',
      highLabel: 'Lecturas altas', highHint: 'Lecturas por encima de 70 dB', loadingHint: 'Consultando las mediciones compartidas.',
      emptyTitle: 'Aún no hay mediciones', emptyHint: `Los aportes del método v${MEASUREMENT_VERSION} aparecerán aquí. Puedes empezar desde el mapa.`,
      disconnectedTitle: 'Resumen no disponible', disconnectedHint: 'Falta conectar la base de datos. Puedes probar el medidor en el mapa.',
      errorTitle: 'No pudimos cargar el resumen', errorHint: 'Revisa la conexión e inténtalo de nuevo.', retry: 'Reintentar', map: 'Ir al mapa',
      zonesHint: 'Promedios por zona · hasta 3 por lista', alertsHint: 'Ruido alto durante 3 días seguidos',
      community: 'Confirmar una zona', communityHint: '¿También escuchas el ruido? Elige un punto y confírmalo.', reports: 'Ver reportes ciudadanos'
    },
    en: {
      scope: `Measured noise · method v${MEASUREMENT_VERSION}`, totalLabel: 'Measurements', singleReading: 'measurement', oneZone: 'area analyzed',
      totalHint: 'Shared readings', averageLabel: 'Mean in dB', averageHint: 'Orientation scale, uncalibrated',
      highLabel: 'High readings', highHint: 'Readings above 70 dB', loadingHint: 'Fetching shared measurements.',
      emptyTitle: 'No measurements yet', emptyHint: `Contributions using method v${MEASUREMENT_VERSION} will appear here. You can start on the map.`,
      disconnectedTitle: 'Summary unavailable', disconnectedHint: 'The database is not connected. You can try the meter on the map.',
      errorTitle: 'Could not load the summary', errorHint: 'Check your connection and try again.', retry: 'Try again', map: 'Go to map',
      zonesHint: 'Area averages · up to 3 per list', alertsHint: 'High noise for 3 days running',
      community: 'Confirm an area', communityHint: 'Can you hear it too? Choose a point and confirm the noise.', reports: 'View citizen reports'
    },
    pt: {
      scope: `Ruído medido · método v${MEASUREMENT_VERSION}`, totalLabel: 'Medições', singleReading: 'medição', oneZone: 'área analisada',
      totalHint: 'Leituras compartilhadas', averageLabel: 'Média em dB', averageHint: 'Escala orientativa, sem calibração',
      highLabel: 'Leituras altas', highHint: 'Leituras acima de 70 dB', loadingHint: 'Consultando as medições compartilhadas.',
      emptyTitle: 'Ainda não há medições', emptyHint: `As contribuições do método v${MEASUREMENT_VERSION} aparecerão aqui. Comece pelo mapa.`,
      disconnectedTitle: 'Resumo indisponível', disconnectedHint: 'O banco de dados não está conectado. Você pode testar o medidor no mapa.',
      errorTitle: 'Não foi possível carregar o resumo', errorHint: 'Verifique a conexão e tente novamente.', retry: 'Tentar novamente', map: 'Ir ao mapa',
      zonesHint: 'Médias por área · até 3 por lista', alertsHint: 'Ruído alto por 3 dias seguidos',
      community: 'Confirmar uma área', communityHint: 'Também ouve o ruído? Escolha um ponto e confirme.', reports: 'Ver relatos da comunidade'
    }
  };
  return (copy[document.documentElement.lang] || copy.es)[key];
}

function summaryIcon(name) {
  const paths = {
    readings: '<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
    average: '<path d="M3 12h18M5 7h14M5 17h14"/>',
    high: '<path d="m3 17 6-6 4 3 8-10m-6 0h6v6"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Zm6-3v15m6-12v15"/>',
    trend: '<path d="M3 3v18h18M6 15l5-6 4 3 6-7"/>',
    community: '<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0ZM7 9h9M7 13h6"/>'
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.map}</svg>`;
}

function renderStatsPanel(panel) {
  panel.dataset.subview = 'overview';
  panel.innerHTML = panelFrame(t('summaryTitle'), `
    <div class="summary-overview" data-state="loading">
      <p class="summary-scope">${dataUiText('all')} · ${summaryText('scope')}</p>
      <div class="stats-metrics summary-metrics" aria-busy="true">
        <div class="summary-metric"><span class="summary-metric-label">${summaryIcon('readings')}${summaryText('totalLabel')}</span><strong id="metric-total">--</strong><small>${summaryText('totalHint')}</small></div>
        <div class="summary-metric"><span class="summary-metric-label">${summaryIcon('average')}${summaryText('averageLabel')}</span><strong id="metric-average">--</strong><small>${summaryText('averageHint')}</small></div>
        <div class="summary-metric"><span class="summary-metric-label">${summaryIcon('high')}${summaryText('highLabel')}</span><strong id="metric-high">--</strong><small>${summaryText('highHint')}</small></div>
      </div>
      <div class="summary-feedback" role="status" aria-live="polite" aria-atomic="true">
        <span class="summary-feedback-icon">${summaryIcon('map')}</span>
        <div><h3 id="summary-state-title">${t('loading')}</h3><p id="summary-state-hint">${summaryText('loadingHint')}</p></div>
      </div>
      <div class="summary-state-actions" hidden><button type="button" id="summary-state-action"></button></div>
      <div class="summary-results" hidden>
        <p class="summary-section-note">${summaryText('zonesHint')}</p>
        <div class="stats-columns">
          <section class="summary-zone-card"><h3><span class="summary-dot loud"></span>${t('loudest')}</h3><ul class="feature-list" id="loudest-list"></ul></section>
          <section class="summary-zone-card"><h3><span class="summary-dot quiet"></span>${t('quietest')}</h3><ul class="feature-list" id="quietest-list"></ul></section>
        </div>
        <details class="summary-alerts"><summary>${t('alerts')}</summary><p>${summaryText('alertsHint')}</p><ul class="feature-list" id="alerts-list"></ul></details>
      </div>
      <div class="summary-tools">
        <section class="summary-tool"><span class="summary-tool-icon">${summaryIcon('trend')}</span><h3>${u('trendTitle')}</h3><p>${u('trendHelp')}</p><div class="panel-actions"><button type="button" id="select-trend-location">${u('chooseArea')}</button></div><div id="zone-trend" class="feature-status" hidden></div></section>
        <section class="summary-tool"><span class="summary-tool-icon">${summaryIcon('community')}</span><h3>${summaryText('community')}</h3><p>${summaryText('communityHint')}</p><div class="panel-actions"><button type="button" id="select-confirm-location">${u('chooseConfirm')}</button><button type="button" id="confirm-noise">${t('confirm')}</button></div><p id="confirm-status" role="status" aria-live="polite"></p><details class="summary-reports"><summary>${summaryText('reports')}</summary><ul class="feature-list" id="citizen-reports-list"><li>${t('loading')}</li></ul></details></section>
      </div>
    </div>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  panel.querySelector('#summary-state-action').addEventListener('click', () => {
    if (panel.querySelector('.summary-overview').dataset.state === 'error') loadStats(panel);
    else switchTab('map-view', document.querySelector('.tab-btn'));
  });
  panel.querySelector('#confirm-noise').addEventListener('click', confirmNoise);
  panel.querySelector('#select-confirm-location').addEventListener('click', () => {
    beginMapSelection('confirm');
  });
  panel.querySelector('#select-trend-location').addEventListener('click', () => {
    beginMapSelection('trend');
  });
  loadStats(panel);
  loadCitizenReports(panel);
}

/** Un solo estado global: sin listas vacías repetidas ni ceros ante un error. */
function updateSummaryState(panel, state, zoneCount = 0) {
  const overview = panel.querySelector('.summary-overview');
  overview.dataset.state = state;
  panel.querySelector('.summary-metrics').setAttribute('aria-busy', String(state === 'loading'));
  panel.querySelector('.summary-results').hidden = state !== 'ready';
  const title = panel.querySelector('#summary-state-title');
  const hint = panel.querySelector('#summary-state-hint');
  title.textContent = state === 'ready' ? `${zoneCount} ${zoneCount === 1 ? summaryText('oneZone') : m('zonesAnalyzed')}`
    : state === 'loading' ? t('loading') : summaryText(`${state}Title`);
  hint.textContent = state === 'ready' ? '' : summaryText(`${state}Hint`);
  hint.hidden = state === 'ready';
  panel.querySelector('.summary-state-actions').hidden = state === 'ready' || state === 'loading';
  panel.querySelector('#summary-state-action').textContent = summaryText(state === 'error' ? 'retry' : 'map');
  if (state !== 'ready') {
    panel.querySelector('#metric-total').textContent = state === 'empty' ? '0' : '--';
    panel.querySelector('#metric-average').textContent = '--';
    panel.querySelector('#metric-high').textContent = '--';
    for (const id of ['loudest-list', 'quietest-list', 'alerts-list']) panel.querySelector(`#${id}`).innerHTML = '';
  }
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
    detail.textContent = `${row.count} ${row.count === 1 ? summaryText('singleReading') : t('measurements')}`;
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
  updateSummaryState(panel, 'loading');
  try {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const rows = await fetchFeatureMeasurements(start, end);
    if (!panelIsCurrent(panel, 'stats') || panel.dataset.subview !== 'overview' || !panel.querySelector('#metric-total')) return;
    featureRows = rows;
    const zones = aggregatePoints(featureRows).map((point) => ({ ...point, count: point.sampleCount }));
    if (!featureRows.length) {
      updateSummaryState(panel, 'empty');
      return;
    }
    updateSummaryState(panel, 'ready', zones.length);
    for (const id of ['loudest-list', 'quietest-list', 'alerts-list']) panel.querySelector(`#${id}`).innerHTML = '';
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
  } catch (error) {
    if (supabaseClient) console.error('Error cargando estadísticas:', error);
    if (!panelIsCurrent(panel, 'stats') || panel.dataset.subview !== 'overview' || !panel.querySelector('#metric-total')) return;
    updateSummaryState(panel, supabaseClient ? 'error' : 'disconnected');
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

/**
 * Crea una confirmación por navegador, celda y hora. El identificador local
 * participa en el hash, pero no se envía como campo a Supabase.
 * @param {{lat: number, lng: number}} position Coordenadas del mapa (grados).
 * @param {string} measurementTime Hora redondeada en formato ISO 8601.
 * @returns {Promise<object>} Registro con latitude/longitude para la base de datos.
 */
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

function dataUiText(key) {
  const guidance = {
    es: { challengeHelp: 'El progreso se guarda en este navegador, incluidos los aportes pendientes de conexión.', measurementHelp: 'En el mapa, activa el micrófono y Compartir cuando quieras aportar.', reportHelp: 'Prepara un reporte de la categoría indicada. No necesitas activar el micrófono.', allIntro: 'Mediciones ciudadanas y reportes de todas las zonas con aportes.' },
    en: { challengeHelp: 'Progress is saved in this browser, including contributions awaiting a connection.', measurementHelp: 'On the map, enable the microphone and sharing when you want to contribute.', reportHelp: 'Prepare a report in the indicated category. No microphone needed.', allIntro: 'Citizen measurements and reports from all areas with contributions.' },
    pt: { challengeHelp: 'O progresso fica neste navegador, incluindo contribuições pendentes de conexão.', measurementHelp: 'No mapa, ative o microfone e o compartilhamento quando quiser contribuir.', reportHelp: 'Prepare um relato da categoria indicada. Não precisa ativar o microfone.', allIntro: 'Medições cidadãs e relatos de todas as áreas com contribuições.' }
  };
  if (key in guidance.es) return (guidance[currentLanguage] || guidance.es)[key];
  const copy = {
    es: { date: 'Fecha (UTC)', readings: 'Mediciones', average: 'Promedio en dB', missing: 'Sin mediciones', trend: 'Tendencia de 7 días; valores en la tabla.', table: 'Últimos 7 días · escala sin calibrar', all: 'Todas las zonas con aportes', retry: 'Reintentar', map: 'Ir al mapa', measure: 'Ir a medir', report: 'Preparar reporte', measurements: 'Retos de medición', reports: 'Acciones ciudadanas', personal: 'Progreso personal · últimos 30 días', changeUp: 'Aumento', changeDown: 'Descenso', unchanged: 'Sin cambio' },
    en: { date: 'Date (UTC)', readings: 'Measurements', average: 'Average in dB', missing: 'No measurements', trend: '7-day trend; values in the table.', table: 'Last 7 days · uncalibrated scale', all: 'All areas with contributions', retry: 'Try again', map: 'Go to map', measure: 'Go to measure', report: 'Prepare report', measurements: 'Measurement challenges', reports: 'Citizen actions', personal: 'Personal progress · last 30 days', changeUp: 'Increase', changeDown: 'Decrease', unchanged: 'No change' },
    pt: { date: 'Data (UTC)', readings: 'Medições', average: 'Média em dB', missing: 'Sem medições', trend: 'Tendência de 7 dias; valores na tabela.', table: 'Últimos 7 dias · escala sem calibração', all: 'Todas as áreas com contribuições', retry: 'Tentar novamente', map: 'Ir ao mapa', measure: 'Ir medir', report: 'Preparar relato', measurements: 'Desafios de medição', reports: 'Ações cidadãs', personal: 'Progresso pessoal · últimos 30 dias', changeUp: 'Aumento', changeDown: 'Queda', unchanged: 'Sem mudança' }
  };
  return (copy[currentLanguage] || copy.es)[key];
}

/** Siete días naturales UTC: un hueco significa falta de datos, nunca silencio. */
function buildTrendSeries(rows, end = new Date()) {
  const days = new Map();
  rows.forEach((row) => {
    const date = row.created_at.slice(0, 10);
    if (!days.has(date)) days.set(date, []);
    days.get(date).push(row);
  });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const key = date.toISOString().slice(0, 10);
    const readings = days.get(key) || [];
    return { date: key, db: averageDb(readings), count: readings.length };
  });
}

function renderTrendChart(container, rows) {
  const target = container.querySelector('#zone-trend') || container.querySelector('.feature-status');
  if (!target) return;
  const series = buildTrendSeries(rows);
  const measured = series.filter((item) => item.count);
  const min = Math.min(...measured.map((item) => item.db));
  const max = Math.max(...measured.map((item) => item.db));
  const range = Math.max(max - min, 1);
  target.textContent = '';
  if (measured.length) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 300 120');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', dataUiText('trend'));
    let previous = null;
    series.forEach((item, index) => {
      if (!item.count) { previous = null; return; }
      const x = 20 + index * (260 / 6);
      const y = max === min ? 65 : 100 - ((item.db - min) / range) * 70;
      if (previous) {
        const line = document.createElementNS(svg.namespaceURI, 'line');
        for (const [key, value] of Object.entries({ x1: previous.x, y1: previous.y, x2: x, y2: y, stroke: 'currentColor', 'stroke-width': 3 })) line.setAttribute(key, value);
        svg.appendChild(line);
      }
      const point = document.createElementNS(svg.namespaceURI, 'circle');
      for (const [key, value] of Object.entries({ cx: x, cy: y, r: 4, fill: 'currentColor' })) point.setAttribute(key, value);
      svg.appendChild(point); previous = { x, y };
    });
    target.appendChild(svg);
  } else {
    const message = document.createElement('p'); message.textContent = u('emptyTrend'); target.appendChild(message);
  }
  const table = document.createElement('table'); table.className = 'trend-table';
  const caption = document.createElement('caption'); caption.textContent = dataUiText('table'); table.appendChild(caption);
  const head = document.createElement('thead'), heading = document.createElement('tr');
  for (const key of ['date', 'average', 'readings']) {
    const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = dataUiText(key); heading.appendChild(cell);
  }
  head.appendChild(heading); table.appendChild(head);
  const body = document.createElement('tbody');
  for (const item of series) {
    const row = document.createElement('tr');
    for (const value of [item.date, item.count ? item.db : dataUiText('missing'), item.count]) {
      const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
    }
    body.appendChild(row);
  }
  table.appendChild(body); target.appendChild(table);
}

async function loadZoneTrend(position) {
  const target = document.getElementById('zone-trend');
  if (!target) return;
  target.hidden = false;
  if (!supabaseClient) { target.textContent = noDataMessage(); return; }
  const center = snapToGrid(position.lat, position.lng);
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - 6);
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

/**
 * Los retos.
 *
 * ## Qué cambió y por qué
 *
 * Antes los tres medían lo mismo: ruido. Medir más ruido es útil para el mapa, pero
 * un reto de ruido empuja a la gente a medir en sitios ruidosos, y eso no reduce nada.
 *
 * Los dos nuevos son de huella: **recoger basura** y **denunciar la obra**. Los dos se
 * cumplen con un reporte, no con una medición, y por eso usan la categoría y no el
 * nivel de dB. La diferencia con los antiguos es de fondo: no piden esfuerzo de
 * medición, piden un acto.
 *
 * ## Por qué los antiguos no se tocan
 *
 * Porque los tres hacen falta y funcionan: la cobertura horaria y la variabilidad en
 * el tiempo son las dos cosas que un mapa de ruido no puede tener sin muchos
 * voluntarios. Lo que se añade es una vía distinta, no se quita la anterior.
 *
 * ## El requisito de foto
 *
 * «Recoger basura» pide foto; «denunciar la obra» no. No es arbitrario: la foto es lo
 * que distingue un acto de una queja, porque cualquiera puede escribir «hay basura».
 * En la obra, en cambio, el propio motivo de quejarse es visible y la foto solo
 * añadiría una imagen pública de un solar.
 */
const CHALLENGE_DEFS = [
  { key: 'rush-hour', target: 3, type: 'measurement', titleKey: 'rushTitle', detailKey: 'rushDetail' },
  { key: 'quiet-route', target: 5, type: 'measurement', titleKey: 'quietTitle', detailKey: 'quietDetail' },
  { key: 'night-cover', target: 3, type: 'measurement', titleKey: 'nightTitle', detailKey: 'nightDetail' },
  { key: 'litter-pickup', target: 3, type: 'report', kind: 'basura', needsPhoto: true, distinctDays: true,
    titleKey: 'litterTitle', detailKey: 'litterDetail' },
  { key: 'report-works', target: 2, type: 'report', kind: 'obra', needsPhoto: false,
    titleKey: 'worksTitle', detailKey: 'worksDetail' }
];

/** Retos de reporte y su progreso, contados por categoría y sin salir del dispositivo. */
function reportChallengeProgress(definitions) {
  const rows = getLocalChallengeReports();
  const byKind = new Map();
  for (const definition of definitions.filter((d) => d.type === 'report')) {
    const matching = rows.filter((row) => row.kind === definition.kind
      && (definition.needsPhoto ? row.withPhoto === 1 : true));
    const places = new Map();
    for (const row of matching) {
      const day = coDayKey(row.created_at);
      if (!day) continue;
      const place = `${Math.round(row.latitude / AGG_GRID)}_${Math.round(row.longitude / AGG_GRID)}`;
      if (!places.has(place)) places.set(place, new Set());
      places.get(place).add(day);
    }
    // Obras: zonas distintas. Basura: cada aporte elegido exige zona Y día nuevos.
    // Emparejar evita contar tres días de una sola zona o tres zonas el mismo día.
    byKind.set(definition.key, definition.distinctDays ? countDistinctZoneDays(places) : places.size);
  }
  return byKind;
}

function countDistinctZoneDays(places) {
  const assignments = new Map();
  function assign(place, visited) {
    for (const day of places.get(place)) {
      if (visited.has(day)) continue;
      visited.add(day);
      if (!assignments.has(day) || assign(assignments.get(day), visited)) {
        assignments.set(day, place);
        return true;
      }
    }
    return false;
  }
  for (const place of places.keys()) assign(place, new Set());
  return assignments.size;
}

function renderChallengesPanel(panel) {
  const challenges = CHALLENGE_DEFS.map((definition) => ({
    ...definition,
    title: u(definition.titleKey),
    detail: u(definition.detailKey)
  }));
  panel.innerHTML = panelFrame(t('challengeTitle'), `<p class="data-scope">${dataUiText('personal')}</p><p>${dataUiText('challengeHelp')}</p><section class="challenge-group"><h3>${dataUiText('measurements')}</h3><p>${dataUiText('measurementHelp')}</p><ul class="feature-list" id="challenge-list"></ul></section><section class="challenge-group"><h3>${dataUiText('reports')}</h3><p>${dataUiText('reportHelp')}</p><ul class="feature-list" id="report-challenge-list"></ul></section>`, panel);
  panel.querySelector('[data-close]')?.addEventListener('click', closeFeaturePanel);
  const list = panel.querySelector('#challenge-list');
  loadChallengeProgress(list, challenges.filter((challenge) => challenge.type === 'measurement'));
  loadChallengeProgress(panel.querySelector('#report-challenge-list'), challenges.filter((challenge) => challenge.type === 'report'));
}

/** Solo prepara la acción: no concede permisos ni publica aportes automáticamente. */
function startChallenge(key) {
  const challenge = CHALLENGE_DEFS.find((definition) => definition.key === key);
  if (!challenge) return;
  if (challenge.type === 'measurement') {
    switchTab('map-view', document.querySelector('.tab-btn'));
    document.getElementById('btn-toggle')?.focus();
    return;
  }
  openStatsTab('report');
  const kind = document.getElementById('report-kind');
  if (kind) {
    kind.value = challenge.kind;
    kind.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.getElementById('report-note')?.focus();
}

async function loadChallengeProgress(list, challenges) {
  try {
    const rows = getLocalChallengeMeasurements();
    const rushByZone = new Map();
    const nightZoneDays = new Set();
    const quietLocations = new Set();
    rows.forEach((row) => {
      // La hora y el día se calculan en hora de Colombia (UTC−5), no en la del
      // dispositivo. Antes usaba getHours()/getFullYear(), que seguían la zona
      // del navegador mientras el mapa se filtraba por America/Bogota en el servidor.
      const hour = coHour(row.created_at);
      const day = coDayKey(row.created_at);
      if (hour === null || day === null) return;
      const challengeCell = `${Math.round(row.latitude / AGG_GRID)}_${Math.round(row.longitude / AGG_GRID)}`;
      // Hora punta: ventana de 7:00 a 9:00, que es una sub-ventana de la
      // franja "morning" a propósito. Conservamos el horario del reto existente;
      // no tiene que abarcar toda la franja del filtro del mapa.
      if (hour >= 7 && hour < 9) {
        if (!rushByZone.has(challengeCell)) rushByZone.set(challengeCell, new Set());
        rushByZone.get(challengeCell).add(day);
      }
      if (inCoTimeBand(row.created_at, 'night')) {
        // Repetir una lectura en la misma zona y día no aumenta el progreso.
        nightZoneDays.add(`${challengeCell}|${day}`);
      }
      if (row.db_level < 55) quietLocations.add(challengeCell);
    });
    const progress = {
      'rush-hour': Math.max(0, ...[...rushByZone.values()].map((days) => days.size)),
      'quiet-route': quietLocations.size,
      'night-cover': nightZoneDays.size,
      ...Object.fromEntries(reportChallengeProgress(challenges))
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
        <div class="challenge-track" role="progressbar" aria-label="${challenge.title}" aria-valuemin="0" aria-valuemax="${challenge.target}" aria-valuenow="${current}">
          <span class="challenge-fill"></span>
        </div>
        <span class="challenge-state">${percentage === 100 ? `✓ ${u('completed')}` : `${percentage}% ${t('challengeProgress')}`}</span>
        ${percentage < 100 ? `<button type="button" data-challenge-action="${challenge.key}">${dataUiText(challenge.type === 'report' ? 'report' : 'measure')}</button>` : ''}`;
      item.querySelector?.('[data-challenge-action]')?.addEventListener('click', () => startChallenge(challenge.key));
      if (percentage === 100) item.classList.add('completed');
      list.appendChild(item);
    });
  } catch (error) {
    list.innerHTML = `<li>${error.message || noDataMessage()}</li>`;
  }
}

function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const toggle = document.querySelector('[data-feature="theme"]');
  toggle?.setAttribute('aria-pressed', String(document.body.classList.contains('dark-theme')));
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
    es: { intro: 'Entiende el ruido de tu entorno y cómo los datos ciudadanos ayudan a mejorar la ciudad.', cardDescriptions: ['El ruido sostenido en el tiempo puede afectar el sueño, la concentración y la salud cardiovascular.', 'AcoustiMap muestra dónde hay más y menos ruido, para comparar una calle con otra.', 'Con miles de mediciones de la gente, las ciudades pueden ver el problema antes de que sea un aviso.'], badges: ['Salud', 'ODS 3', 'ODS 11'], cardLabels: ['Bienestar', 'Salud', 'Ciudad'], legend: 'Información' },
    en: { intro: 'Explore local noise patterns and how citizen data can improve the city.', cardDescriptions: ['Long-term noise exposure can affect sleep, concentration, and cardiovascular health.', 'AcoustiMap shows relative noise patterns; its index cannot assess exposure or clinical risk.', 'Anonymous measurements provide information for more sustainable urban planning.'], badges: ['Health', 'SDG 3', 'SDG 11'], cardLabels: ['Wellbeing', 'Health', 'City'], legend: 'Map information' },
    pt: { intro: 'Explore padrões de ruído e como os dados cidadãos podem melhorar a cidade.', cardDescriptions: ['O ruído contínuo pode afetar o sono, a concentração e a saúde cardiovascular.', 'O AcoustiMap mostra onde há mais e menos ruído, para comparar uma rua com outra.', 'Com milhares de medições, as cidades podem ver o problema antes que vire denúncia.'], badges: ['Saúde', 'ODS 3', 'ODS 11'], cardLabels: ['Bem-estar', 'Saúde', 'Cidade'], legend: 'Informações do mapa' }
  }[currentLanguage];
  const copy = {
    es: { map: 'Mapa', health: 'Salud y ODS', healthShort: 'Salud', stats: 'Estadísticas', statsShort: 'Datos', title: 'Salud y ODS', detail: 'Mostrar detalles', hide: 'Ocultar detalles', all: 'Todo', morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', exportCsv: 'Exportar CSV', exportGeo: 'Exportar GeoJSON', statsTitle: 'Datos del ruido', statsIntro: 'Mediciones ciudadanas, tendencias y reportes de tu zona.', tabs: ['Resumen', 'Reportar', 'Comparar', 'Retos'], visualHeat: 'Mapa de calor', visualZones: 'Puntos', privacy: 'Privacidad por diseño', privacyCopy: 'AcoustiMap no graba audio, no requiere login y guarda las coordenadas ancladas a una cuadrícula aproximada de 70 m.', mapHelp: 'Cómo interpretar el mapa', mapHelpCopy: 'Verde son zonas tranquilas, amarillo el ruido normal de la calle y rojo las zonas ruidosas. Sirve para comparar zonas entre sí.', cardTitles: ['Menos ruido, más descanso', 'Ciudades más saludables', 'Participación local'] },
    en: { map: 'Map', health: 'Health and SDGs', healthShort: 'Health', stats: 'Statistics', statsShort: 'Data', title: 'Health and SDGs', detail: 'Show details', hide: 'Hide details', all: 'All', morning: 'Morning', afternoon: 'Afternoon', night: 'Night', exportCsv: 'Export CSV', exportGeo: 'Export GeoJSON', statsTitle: 'Noise data', statsIntro: 'Citizen measurements, trends, and reports for your area.', tabs: ['Summary', 'Report', 'Compare', 'Challenges'], visualHeat: 'Heatmap', visualZones: 'Points', privacy: 'Privacy by design', privacyCopy: 'AcoustiMap does not record audio, requires no login, and stores coordinates snapped to an approximate 70 m grid.', mapHelp: 'How to read the map', mapHelpCopy: 'Green shows low, yellow moderate, and red high relative index values. This is not calibrated decibel data and cannot assess exposure.', cardTitles: ['Less noise, better rest', 'Healthier cities', 'Local participation'] },
    pt: { map: 'Mapa', health: 'Saúde e ODS', healthShort: 'Saúde', stats: 'Estatísticas', statsShort: 'Dados', title: 'Saúde e ODS', detail: 'Mostrar detalhes', hide: 'Ocultar detalhes', all: 'Tudo', morning: 'Manhã', afternoon: 'Tarde', night: 'Noite', exportCsv: 'Exportar CSV', exportGeo: 'Exportar GeoJSON', statsTitle: 'Dados do ruído', statsIntro: 'Medições cidadãs, tendências e relatos da sua região.', tabs: ['Resumo', 'Relatar', 'Comparar', 'Desafios'], visualHeat: 'Mapa de calor', visualZones: 'Pontos', privacy: 'Privacidade desde o início', privacyCopy: 'O AcoustiMap não grava áudio, não exige login e salva coordenadas em uma grade aproximada de 70 m.', mapHelp: 'Como interpretar o mapa', mapHelpCopy: 'Verde são zonas tranquilas, amarelo o ruído normal da rua e vermelho as zonas ruidosas. Serve para comparar áreas entre si.', cardTitles: ['Menos ruído, mais descanso', 'Cidades mais saudáveis', 'Participação local'] }
  }[currentLanguage];
  const extra = {
    es: { timeLabel: 'Hora CO', timeGroup: 'Filtrar por franja horaria de Colombia', visualGroup: 'Forma de visualizar el mapa', low: 'dB < 55 · Bajo', medium: 'dB 55–70 · Moderado', high: 'dB > 70 · Alto', legendNote: 'Escala orientativa sin calibrar. Sirve para comparar zonas entre sí, no para medir exposición.', legendHint: 'Cada círculo rotula <b>dB · mediciones</b>. El color depende solo del promedio de esa zona.', yourLocation: 'Tu ubicación (solo tú)', shareTitle: 'Compartir ubicación', shareText: 'Tu ubicación se <strong>ancla a una cuadrícula de ~70 m</strong> antes de enviarse a la base de datos. Tú verás tu posición exacta en azul; los demás solo verán la zona.', shareNote: '🔒 <strong>Datos compartidos:</strong> solo tu nivel de ruido y la zona aproximada. Nunca el audio.', micTitle: 'Activar micrófono', micText: 'Vamos a usar tu micrófono para medir el ruido de donde estás.<br><br><strong>No se graba audio.</strong> Solo leemos el nivel del sonido, aquí mismo.', micNote: '🔒 <strong>Privacidad garantizada:</strong> El audio nunca sale de tu dispositivo ni se transmite a ningún servidor.', cancel: 'Cancelar', acceptShare: 'Aceptar y compartir', acceptMic: 'Aceptar y activar', activate: 'Activar', stop: 'Detener', share: 'Compartir', measuring: 'Midiendo en vivo', idle: 'Inactivo', startHint: 'Presiona para empezar', average: 'Promedio', noSession: 'Sin datos' },
    en: { timeLabel: 'CO time', timeGroup: 'Filter by Colombian time of day', visualGroup: 'Map display mode', low: 'dB < 55 · Low', medium: 'dB 55–70 · Moderate', high: 'dB > 70 · High', legendNote: 'Uncalibrated scale for orientation. It is useful to compare areas with each other, not to assess exposure.', legendHint: 'Each circle is labelled <b>dB · measurements</b>. Colour depends only on that area’s average.', yourLocation: 'Your location (only you)', shareTitle: 'Share location', shareText: 'Your location is <strong>snapped to an approximately 70 m grid</strong> before it is sent to the database. You see your exact position in blue; others see only the area.', shareNote: '🔒 <strong>Shared data:</strong> only your noise level and the approximate area. Never the audio.', micTitle: 'Enable microphone', micText: 'We will use your microphone to measure the noise where you are.<br><br><strong>Audio is not recorded.</strong> We only read the sound level, right here on your device.', micNote: '🔒 <strong>Privacy:</strong> Audio never leaves your device or reaches a server.', cancel: 'Cancel', acceptShare: 'Accept and share', acceptMic: 'Accept and enable', activate: 'Enable', stop: 'Stop', share: 'Share', measuring: 'Measuring live', idle: 'Inactive', startHint: 'Press to start', average: 'Average', noSession: 'No data' },
    pt: { timeLabel: 'Hora CO', timeGroup: 'Filtrar por horário da Colômbia', visualGroup: 'Modo de exibição do mapa', low: 'dB < 55 · Baixo', medium: 'dB 55–70 · Moderado', high: 'dB > 70 · Alto', legendNote: 'Escala orientativa sem calibração. Serve para comparar áreas entre si, não para avaliar exposição.', legendHint: 'Cada círculo mostra <b>dB · medições</b>. A cor depende só da média daquela área.', yourLocation: 'Sua localização (só você)', shareTitle: 'Compartilhar localização', shareText: 'Sua localização é <strong>ajustada a uma grade de aproximadamente 70 m</strong> antes de ser enviada ao banco de dados. Você vê sua posição exata em azul; os demais veem apenas a área.', shareNote: '🔒 <strong>Dados compartilhados:</strong> apenas o nível de ruído e a área aproximada. Nunca o áudio.', micTitle: 'Ativar microfone', micText: 'Vamos usar seu microfone para medir o ruído de onde você está.<br><br><strong>O áudio não é gravado.</strong> Só lemos o nível do som, aqui no aparelho.', micNote: '🔒 <strong>Privacidade:</strong> O áudio nunca sai do dispositivo nem chega a um servidor.', cancel: 'Cancelar', acceptShare: 'Aceitar e compartilhar', acceptMic: 'Aceitar e ativar', activate: 'Ativar', stop: 'Parar', share: 'Compartilhar', measuring: 'Medindo ao vivo', idle: 'Inativo', startHint: 'Toque para começar', average: 'Média', noSession: 'Sem dados' }
  }[currentLanguage];
  /*
   * La unidad del número grande y del promedio.
   *
   * Antes decía «índice» y la línea de debajo añadía «· 1 s · no son dB». Eso
   * obligaba a leer tres cosas para entender una: un término que no es una
   * unidad, una advertencia partida en tres trozos, y un segundo número en dBFS
   * que no se parecía al primero. Alguien que mide en la calle no iba a leer
   * ninguna de las tres, y el número se quedaba sin explicación.
   *
   * Ahora dice `dB`, que es lo que la gente entiende de un ruido, con una sola
   * línea debajo que dice la única cosa que hay que saber: **sin calibrar**.
   *
   * La honestidad no se pierde, cambia de sitio. Antes la advertencia ocupaba la
   * pantalla entera; ahora ocupa tres palabras y la leyenda del mapa la
   * desarrolla para quien quiera el matiz. Es el mismo dato con el orden de las
   * prioridades invertido: primero lo que hay que leer, y el resto a un clic.
   */
  const meterLabels = {
    es: { index: 'dB', min: 'Mín', max: 'Máx', samples: 'Muestras', locate: 'Centrar en mi ubicación' },
    en: { index: 'dB', min: 'Min', max: 'Max', samples: 'Samples', locate: 'Center on my location' },
    pt: { index: 'dB', min: 'Mín', max: 'Máx', samples: 'Amostras', locate: 'Centralizar na minha localização' }
  }[currentLanguage];
  const periodLabels = {
    es: { history: 'Historial · 90 días', historyShort: '90 días', live: 'En vivo · 24 h', liveShort: '24 h', heatShort: 'Calor', pointsShort: 'Puntos', group: 'Periodo y visualización del mapa' },
    en: { history: 'History · 90 days', historyShort: '90 days', live: 'Live · 24 h', liveShort: '24 h', heatShort: 'Heat', pointsShort: 'Points', group: 'Map period and display mode' },
    pt: { history: 'Histórico · 90 dias', historyShort: '90 dias', live: 'Ao vivo · 24 h', liveShort: '24 h', heatShort: 'Calor', pointsShort: 'Pontos', group: 'Período e visualização do mapa' }
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
  const statsIntro = document.querySelector('.stats-page-header p'); if (statsIntro) statsIntro.textContent = dataUiText('allIntro');
  document.querySelectorAll('.stats-section-btn').forEach((button, index) => { if (copy.tabs[index]) button.textContent = copy.tabs[index]; });
  const handle = document.getElementById('stats-handle-label');
  const filtersLabel = document.getElementById('map-filters-label');
  if (filtersLabel) filtersLabel.textContent = { es: 'Filtros', en: 'Filters', pt: 'Filtros' }[currentLanguage];
  if (handle) handle.textContent = sharingText(document.getElementById('stats-panel')?.classList.contains('collapsed') ? 'showDetails' : 'hideDetails');
  [['time-all', copy.all], ['time-morning', copy.morning], ['time-afternoon', copy.afternoon], ['time-night', copy.night]].forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
  [
    ['mode-history', periodLabels.history, periodLabels.historyShort],
    ['mode-live', periodLabels.live, periodLabels.liveShort],
    ['visual-heatmap', copy.visualHeat, periodLabels.heatShort],
    ['visual-zones', copy.visualZones, periodLabels.pointsShort]
  ].forEach(([id, long, short]) => {
    const button = document.getElementById(id);
    if (button) button.innerHTML = `<span class="control-long">${long}</span><span class="control-short">${short}</span>`;
  });
  const csv = document.getElementById('export-csv-btn'); if (csv) csv.textContent = copy.exportCsv;
  const geo = document.getElementById('export-geojson-btn'); if (geo) geo.textContent = copy.exportGeo;
  const legendTitle = document.querySelector('.legend-header span'); if (legendTitle) legendTitle.textContent = details.legend;
  const legendButton = document.getElementById('legend-toggle'); if (legendButton) legendButton.setAttribute('aria-label', details.legend);
  const legendClose = document.querySelector('.legend-close'); if (legendClose) legendClose.setAttribute('aria-label', t('close'));
  const statsTabs = document.querySelector('.stats-section-nav'); if (statsTabs) statsTabs.setAttribute('aria-label', m('statsTabLabel'));
  const timeGroup = document.querySelector('.time-filters'); if (timeGroup) timeGroup.setAttribute('aria-label', extra.timeGroup);
  const timeLabel = document.querySelector('.time-filters-label'); if (timeLabel) timeLabel.textContent = extra.timeLabel;
  const visualGroup = document.querySelector('.visual-filters'); if (visualGroup) visualGroup.setAttribute('aria-label', periodLabels.group);
  const legend = document.getElementById('map-legend'); if (legend) legend.setAttribute('aria-label', details.legend);
  const legendLabels = {
    es: { scale: 'Escala del mapa', levels: ['Bajo', 'Moderado', 'Alto'], data: 'Datos en esta vista', technical: 'Método y conexión', downloads: 'Descargar datos' },
    en: { scale: 'Map scale', levels: ['Low', 'Moderate', 'High'], data: 'Data in this view', technical: 'Method and connection', downloads: 'Download data' },
    pt: { scale: 'Escala do mapa', levels: ['Baixo', 'Moderado', 'Alto'], data: 'Dados nesta vista', technical: 'Método e conexão', downloads: 'Baixar dados' }
  }[currentLanguage];
  [['legend-scale-title', legendLabels.scale], ['legend-data-title', legendLabels.data], ['legend-technical-title', legendLabels.technical], ['legend-download-title', legendLabels.downloads],
    ['legend-low-label', legendLabels.levels[0]], ['legend-medium-label', legendLabels.levels[1]], ['legend-high-label', legendLabels.levels[2]]].forEach(([id, text]) => {
    const element = document.getElementById(id); if (element) element.textContent = text;
  });
  const legendNote = document.getElementById('legend-note'); if (legendNote) legendNote.textContent = extra.legendNote;
  const legendHint = document.getElementById('legend-hint');
  if (legendHint) legendHint.innerHTML = extra.legendHint;
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
  if (typeof updateActionButtons === 'function') updateActionButtons();
  if (typeof updateSharingStatus === 'function') updateSharingStatus();
  const statusText = document.getElementById('status-text'); if (statusText) statusText.textContent = meterText(monitoring ? 'measuring' : 'idle');
  if (!monitoring) {
    const startHint = document.getElementById('db-status-text'); if (startHint) startHint.textContent = meterText('start');
    const noSession = document.getElementById('avg-tag'); if (noSession && ['Sin datos', 'No data', 'Sem dados'].includes(noSession.textContent.trim())) noSession.textContent = extra.noSession;
  }
  const averageLabel = document.querySelector('.avg-head span'); if (averageLabel) averageLabel.textContent = extra.average;
  document.querySelectorAll('.db-unit, .avg-unit').forEach((element) => { element.textContent = meterLabels.index; });
  document.querySelectorAll('.avg-meta > span').forEach((element, index) => {
    if (element.firstChild?.nodeType === Node.TEXT_NODE) element.firstChild.textContent = `${[meterLabels.min, meterLabels.max, meterLabels.samples][index]} `;
  });
  const locate = document.querySelector('.locate-btn');
  if (locate) { locate.title = meterLabels.locate; locate.setAttribute('aria-label', meterLabels.locate); }
  if (typeof updateGpsChip === 'function') updateGpsChip(Boolean(sharingEnabled), currentPosition?.accuracy);
  if (typeof updateAudioDiagnostics === 'function') updateAudioDiagnostics();
  const mapStatus = document.getElementById('map-data-status');
  if (mapStatus?.dataset.state) setMapDataStatus(mapStatus.dataset.state);
  if (typeof updateAvgUI === 'function') updateAvgUI();
  document.title = `AcoustiMap — ${copy.title} · v${APP_ASSET_VERSION}`;
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

/**
 * Vacía la cola en orden con un solo envío activo. Conserva cada UUID para
 * reintentar sin duplicar registros; retira el elemento solo tras insertarlo
 * o recibir 23505 (ya existe). Un error conserva el resto para el próximo intento.
 */
async function flushOfflineMeasurements() {
  if (!supabaseClient || !navigator.onLine || flushOfflineMeasurements.running) return;
  flushOfflineMeasurements.running = true;
  const sharingGeneration = typeof sharingRequestId !== 'undefined' ? sharingRequestId : null;
  let syncedMeasurement = false;
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
          // El registro SQL usa latitude/longitude; el mapa usa lat/lng.
          const rebuilt = await buildConfirmation({ lat: payload.latitude, lng: payload.longitude }, payload.measurement_time);
          payload.confirmation_key = rebuilt.confirmation_key;
        }
        const localPhoto = record.table === 'noise_reports' && ['basura', 'obra'].includes(payload.kind);
        if (localPhoto) payload.photo_path = null;
        if (record.table === 'noise_reports' && record.photo && !localPhoto) {
          const photoPath = buildReportRecord(payload.id, { lat: payload.latitude, lng: payload.longitude }, payload.db_level, payload.note, record.photo.type).photoPath;
          const { error: uploadError } = await supabaseClient.storage.from('noise-report-photos').upload(photoPath, record.photo, { contentType: record.photo.type, upsert: false });
          if (uploadError && uploadError.statusCode !== '409' && uploadError.status !== 409 && uploadError.code !== 'Duplicate') throw uploadError;
          payload = { ...payload, photo_path: photoPath };
        }
        const { error } = await supabaseClient.from(record.table).insert(payload);
        if (error && error.code !== '23505') throw error;
        await removeOfflineRecord(record.id);
        if (record.table === 'noise_measurements') syncedMeasurement = true;
      } catch (error) {
        console.warn(`Sincronización pendiente (${record.table}):`, error.message || error);
        break;
      }
    }
    if (syncedMeasurement) {
      if (typeof updateSharingDelivery === 'function' && sharingDeliveryState === 'queued'
        && !(await getOfflineRecords()).some((record) => record.table === 'noise_measurements')) {
        updateSharingDelivery('published', sharingGeneration);
      }
      if (document.getElementById('map-view')?.classList.contains('active')) loadCommunityPoints();
    }
  } catch (error) {
    console.warn('No se pudo leer la cola offline:', error);
  } finally {
    flushOfflineMeasurements.running = false;
  }
}

window.addEventListener('online', flushOfflineMeasurements);

/** En desarrollo se evita servir otra configuración desde una PWA antigua. */
async function configureServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(window.location.hostname);
  if (local) {
    const scope = new URL('./', window.location.href).href;
    const script = new URL('./sw.js', window.location.href).href;
    let removed = false;
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      const worker = registration.active || registration.waiting || registration.installing;
      if (registration.scope === scope && worker?.scriptURL.split('?')[0] === script) {
        removed = (await registration.unregister()) || removed;
      }
    }
    if (window.caches) {
      const keys = await window.caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('acoustimap-shell-'))
        .map((key) => window.caches.delete(key)));
    }
    console.log('Desarrollo local: caché PWA desactivada; la cola offline se conserva.');
    if (removed && navigator.serviceWorker.controller) window.location.reload();
    return;
  }
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  // register ya comprueba actualizaciones; no se lanza otro update redundante.
  await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
}

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
  configureServiceWorker().catch((error) => console.warn('PWA no disponible:', error));
  try {
    const legacy = JSON.parse(localStorage.getItem('acoustimap-pending-measurements') || '[]');
    const migration = await Promise.allSettled(legacy.map((measurement) => queueOfflineMeasurement({ ...measurement, id: measurement.id || crypto.randomUUID() })));
    if (legacy.length && migration.every((result) => result.status === 'fulfilled')) localStorage.removeItem('acoustimap-pending-measurements');
  } catch (error) { console.warn('No se pudo migrar la cola local antigua:', error); }
  flushOfflineMeasurements();
});
