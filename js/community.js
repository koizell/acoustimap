/**
 * community.js
 * Puntos comunitarios de Supabase y envío de mediciones.
 * Depende de: config.js, map.js (communityLayer).
 */

let selectedTimeFilter = 'all';
let selectedVisualMode = 'heatmap';
let lastAggregatedPoints = [];
let communityLoadToken = 0;

const communityCopy = {
  es: { now: 'ahora', index: 'Índice', category: 'Categoría', lastMeasurement: 'Última medición', cumulative: 'mediciones acumuladas', exporting: 'Exportando…', exportError: 'No se pudieron exportar las mediciones.', noCommunity: 'Sin datos comunitarios aún', noLive: 'Sin mediciones recientes (<24 h)', noHistory: 'Aún no hay mediciones en el historial', live: 'En vivo (24 h)', history: 'Historial (90 días)', zones: 'zonas', zone: 'zona', measurements: 'mediciones', measurement: 'medición', updated: 'Última actualización', loadError: 'Error al cargar datos', low: 'bajo', moderate: 'moderado', high: 'alto' },
  en: { now: 'now', index: 'Index', category: 'Category', lastMeasurement: 'Last measurement', cumulative: 'measurements combined', exporting: 'Exporting…', exportError: 'Measurements could not be exported.', noCommunity: 'No community data yet', noLive: 'No recent measurements (<24 h)', noHistory: 'No measurements in history yet', live: 'Live (24 h)', history: 'History (90 days)', zones: 'areas', zone: 'area', measurements: 'measurements', measurement: 'measurement', updated: 'Last updated', loadError: 'Could not load data', low: 'low', moderate: 'moderate', high: 'high' },
  pt: { now: 'agora', index: 'Índice', category: 'Categoria', lastMeasurement: 'Última medição', cumulative: 'medições acumuladas', exporting: 'Exportando…', exportError: 'Não foi possível exportar as medições.', noCommunity: 'Ainda não há dados comunitários', noLive: 'Sem medições recentes (<24 h)', noHistory: 'Ainda não há medições no histórico', live: 'Ao vivo (24 h)', history: 'Histórico (90 dias)', zones: 'áreas', zone: 'área', measurements: 'medições', measurement: 'medição', updated: 'Última atualização', loadError: 'Não foi possível carregar os dados', low: 'baixo', moderate: 'moderado', high: 'alto' }
};

function communityText(key) {
  const language = localStorage.getItem('acoustimap-language') || document.documentElement.lang;
  return (communityCopy[language] || communityCopy.es)[key];
}

function mapDataText(key) {
  const copy = {
    es: { disconnected: 'Supabase sin configurar. No se pueden consultar ni publicar datos.', loading: 'Comprobando conexión con Supabase…', ready: 'Supabase conectado · RPC v5 OK', empty: 'Supabase conectado · 0 zonas en esta vista.', sdkError: 'No se cargó la biblioteca de Supabase. Revisa la red.', configError: 'Configuración Supabase inválida.', denied: 'Supabase rechazó la consulta. Revisa la clave pública y los permisos.', missingMethod: 'Supabase responde, pero falta aplicar la migración v5.', error: 'No se pudo comprobar la conexión con Supabase.' },
    en: { disconnected: 'Supabase not configured. Data cannot be loaded or published.', loading: 'Checking Supabase connection…', ready: 'Supabase connected · v5 RPC OK', empty: 'Supabase connected · 0 areas in this view.', sdkError: 'Supabase library did not load. Check the network.', configError: 'Invalid Supabase configuration.', denied: 'Supabase rejected the query. Check the public key and permissions.', missingMethod: 'Supabase responds, but the v5 migration is missing.', error: 'Could not verify the Supabase connection.' },
    pt: { disconnected: 'Supabase não configurado. Não é possível consultar nem publicar dados.', loading: 'Verificando conexão com o Supabase…', ready: 'Supabase conectado · RPC v5 OK', empty: 'Supabase conectado · 0 áreas nesta vista.', sdkError: 'A biblioteca do Supabase não carregou. Verifique a rede.', configError: 'Configuração Supabase inválida.', denied: 'O Supabase rejeitou a consulta. Verifique a chave pública e as permissões.', missingMethod: 'O Supabase responde, mas falta aplicar a migração v5.', error: 'Não foi possível verificar a conexão com o Supabase.' }
  };
  return (copy[document.documentElement.lang] || copy.es)[key];
}

function setMapDataStatus(state) {
  const status = document.getElementById('map-data-status');
  if (!status) return;
  status.dataset.state = state;
  status.dataset.cells = String(lastAggregatedPoints.length);
  const count = state === 'ready'
    ? ` · ${lastAggregatedPoints.length} ${communityText(lastAggregatedPoints.length === 1 ? 'zone' : 'zones')}` : '';
  status.textContent = `${mapDataText(state)}${count} · v${APP_ASSET_VERSION}`;
  const detail = document.getElementById('map-connection-detail');
  if (detail) detail.textContent = status.textContent;
  status.hidden = false;
  status.setAttribute?.('aria-busy', String(state === 'loading'));
}

/**
 * Compone el contador de la leyenda distinguiendo singular de plural.
 * Sin esto el modo "En vivo" mostraba "1 zonas" cuando solo había una celda.
 * @param {string} modeLabel Etiqueta del periodo, ya traducida.
 * @param {number} cells Número de celdas agregadas del área visible.
 * @param {number} measurements Suma de mediciones de esas celdas.
 * @returns {string} Texto del contador.
 */
function formatLegendCounter(modeLabel, cells, measurements) {
  const unit = (count, singularKey, pluralKey) =>
    `${count} ${communityText(count === 1 ? singularKey : pluralKey)}`;
  return `${modeLabel} · ${unit(cells, 'zone', 'zones')} · ${unit(measurements, 'measurement', 'measurements')}`;
}


// ============================================
// DIBUJAR UN PUNTO COMUNITARIO
// ============================================
function addCommunityPoint(lat, lng, db, category, createdAt, sampleCount = 1) {
  const color = COLOR_BY_CAT[category] || COLOR_BY_CAT[classifyDb(db)];
  const when  = createdAt ? timeAgo(createdAt) : communityText('now');

  const categoryLabel = communityText(category === 'bajo' ? 'low' : category === 'moderado' ? 'moderate' : 'high');

  const popupHtml = [
    `<b>${communityText('index')} ${db}</b>`,
    `${communityText('category')}: <b>${categoryLabel}</b>`,
    `<small>${communityText('lastMeasurement')}: ${when}</small>`,
    sampleCount > 1 ? `<small>${sampleCount} ${communityText('cumulative')}</small>` : ''
  ].filter(Boolean).join('<br>');

  // Huella visual dentro de la celda (~70 m), no radio de propagación sonora.
  // El halo anterior de 90 m superponía varias celdas incluso al acercar.
  L.circle([lat, lng], {
    color,
    fillColor: color,
    fillOpacity: 0.08,
    weight: 0,
    radius: Math.min(CIRCLE_VISUAL_RADIUS_M * 1.8, CELL_SIZE_M / 2),
    interactive: false
  }).addTo(communityLayer);

  // Circulo principal. El relleno y el color dependen solo del indice: una
  // celda con una lectura se ve igual de intensa que una muy medida, porque
  // reportarla sigue siendo el objetivo de la app. Lo que si cambia es el
  // grosor del borde, que sube con cuantas mediciones sostienen el promedio.
  L.circle([lat, lng], {
    color,
    fillColor: color,
    fillOpacity: 0.18,
    weight: 1.2 + 1.3 * densityConfidence(sampleCount),
    opacity: cellBorderOpacity(sampleCount),
    radius: Math.min(CIRCLE_VISUAL_RADIUS_M, CELL_SIZE_M * 0.42),
    interactive: false
  }).addTo(communityLayer);

  // Punto central
  L.circleMarker([lat, lng], {
    radius: 4,
    color: '#ffffff',
    weight: 2,
    fillColor: color,
    fillOpacity: 1,
    interactive: false
  }).addTo(communityLayer);

  // Etiquetas permanentes solo si hay espacio; al tocar el marcador siempre
  // se puede consultar el índice/cantidad en su popup, incluso en zoom lejano.
  L.circleMarker([lat, lng], {
    radius: 20,
    color: 'transparent',
    fillColor: 'transparent',
    fillOpacity: 0,
    weight: 0
  })
    .addTo(communityLayer)
    .bindTooltip(`${db} · ${sampleCount}`, {
      permanent: communityLabelVisible(lat, lng),
      direction: 'top',
      offset: [0, -30],
      className: `zone-tooltip tooltip-${category}`
    })
    .bindPopup(popupHtml);
}

function communityLabelVisible(lat, lng) {
  if (typeof map.getZoom !== 'function' || typeof map.latLngToContainerPoint !== 'function') return true;
  if (map.getZoom() < 16) return false;
  const pixel = map.latLngToContainerPoint([lat, lng]);
  let room = true;
  communityLayer.eachLayer((layer) => {
    if (!layer.getTooltip?.()?.options.permanent) return;
    const previous = map.latLngToContainerPoint(layer.getLatLng());
    if (Math.abs(pixel.x - previous.x) < 100 && Math.abs(pixel.y - previous.y) < 48) room = false;
  });
  return room;
}

// ============================================
// AGREGAR MEDICIONES POR ZONA
// ============================================
function aggregatePoints(rows) {
  const buckets = new Map();

  rows.forEach((r) => {
    const key = `${Math.round(r.latitude / AGG_GRID)}_${Math.round(r.longitude / AGG_GRID)}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        lat: r.latitude,
        lng: r.longitude,
        energySum: 0,
        count: 0,
        latest: r.created_at
      });
    }
    const b = buckets.get(key);
    b.energySum += energiaDe(r.db_level);
    b.count += 1;
    if (new Date(r.created_at) > new Date(b.latest)) b.latest = r.created_at;
  });

  return Array.from(buckets.values()).map((b) => {
    // Mismo promedio que Resumen, Tendencia y la RPC; no media de los logaritmos.
    const avg = Math.round(promedioEnergetico(b.energySum, b.count));
    return {
      lat: b.lat,
      lng: b.lng,
      db: avg,
      category: classifyDb(avg),
      createdAt: b.latest,
      sampleCount: b.count
    };
  });
}

function renderCommunityPoints(points) {
  // comparisonMode vive en features.js, que se carga despues. La comprobacion
  // lo mantiene segura: community.js llama a loadCommunityPoints() en tiempo de
  // carga, antes de que exista ese binding.
  if (typeof comparisonMode !== 'undefined' && comparisonMode
      && document.getElementById('map-view')?.classList.contains('active')) {
    if (typeof activateComparisonLayer === 'function') activateComparisonLayer();
    return;
  }
  clearCommunityLayers();
  const view = document.getElementById('map-view');
  if (view && !view.classList.contains('active')) return;
  if (selectedVisualMode === 'heatmap') {
    setCommunityHeatPoints(points);
    return;
  }
  points.forEach((point) =>
    addCommunityPoint(point.lat, point.lng, point.db, point.category, point.createdAt, point.sampleCount)
  );
}

function setCommunityVisualMode(mode) {
  if (!['heatmap', 'zones'].includes(mode)) return;
  if (typeof exitComparisonMode === 'function') exitComparisonMode();
  selectedVisualMode = mode;
  document.querySelectorAll('.visual-filter-btn').forEach((button) => {
    const active = button.id === `visual-${mode}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderCommunityPoints(lastAggregatedPoints);
}

// ============================================
// EXPORTAR MEDICIONES COMO CSV
// ============================================
function escapeCsvValue(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function exportMeasurementsCsv() {
  const button = document.getElementById('export-csv-btn');
  if (!supabaseClient || button.disabled) return;

  const originalText = button.innerText;
  button.disabled = true;
  button.innerText = communityText('exporting');

  try {
    const pageSize = 1000;
    const rows = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabaseClient
        .from('noise_measurements')
        .select('id, latitude, longitude, db_level, category, created_at, measurement_version, capture_profile')
        .eq('measurement_version', MEASUREMENT_VERSION)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    const columns = ['id', 'latitude', 'longitude', 'noise_index', 'category', 'created_at', 'measurement_version', 'capture_profile'];
    const csv = [
      columns.join(','),
      ...rows.map((row) => columns.map((column) => escapeCsvValue(column === 'noise_index' ? row.db_level : row[column])).join(','))
    ].join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `acoustimap-mediciones-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error exportando mediciones:', err);
    alert(communityText('exportError'));
  } finally {
    button.disabled = false;
    button.innerText = originalText;
  }
}

async function exportMeasurementsGeoJson() {
  const button = document.getElementById('export-geojson-btn');
  if (!supabaseClient || button.disabled) return;

  const originalText = button.innerText;
  button.disabled = true;
  button.innerText = communityText('exporting');

  try {
    const pageSize = 1000;
    const features = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabaseClient
        .from('noise_measurements')
        .select('id, latitude, longitude, db_level, category, created_at, measurement_version, capture_profile')
        .eq('measurement_version', MEASUREMENT_VERSION)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      (data || []).forEach((row) => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
          properties: {
            id: row.id,
            noise_index: row.db_level,
            category: row.category,
            created_at: row.created_at,
            measurement_version: row.measurement_version,
            capture_profile: row.capture_profile
          }
        });
      });
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], {
      type: 'application/geo+json;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `acoustimap-mediciones-${new Date().toISOString().slice(0, 10)}.geojson`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error exportando GeoJSON:', err);
    alert(communityText('exportError'));
  } finally {
    button.disabled = false;
    button.innerText = originalText;
  }
}

// ============================================
// CARGAR PUNTOS DESDE SUPABASE
// ============================================
/**
 * Consulta celdas agregadas del área visible, por periodo y franja horaria.
 * El token descarta respuestas anteriores al último movimiento/filtro: una
 * petición lenta no debe borrar ni reemplazar los datos de la vista actual.
 */
async function loadCommunityPoints() {
  const counter = document.getElementById('community-count');
  const requestToken = ++communityLoadToken;
  if (!counter) return;

  if (!supabaseClient) {
    const state = typeof backendInitializationState === 'string' ? backendInitializationState : 'disconnected';
    counter.innerText = mapDataText(state);
    lastAggregatedPoints = [];
    renderCommunityPoints([]);
    setMapDataStatus(state);
    return;
  }

  setMapDataStatus('loading');
  try {
    const rows = [];
    const pageSize = 1000;
    const since = new Date(Date.now() - (mapMode === 'live' ? 1 : 90) * 24 * 60 * 60 * 1000).toISOString();
    const until = new Date().toISOString();
    const bounds = map.getBounds();
    const queryParams = {
      p_since: since, p_until: until,
      p_south: bounds.getSouth(), p_north: bounds.getNorth(),
      p_west: bounds.getWest(), p_east: bounds.getEast(),
      p_time_filter: selectedTimeFilter
    };
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabaseClient
        .rpc('noise_map_cells_v5', queryParams)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(page || []));
      if (!page || page.length < pageSize || requestToken !== communityLoadToken) break;
    }
    if (requestToken !== communityLoadToken) return;

    clearCommunityLayers();

    if (rows.length === 0) {
      lastAggregatedPoints = [];
      renderCommunityPoints([]);
      setMapDataStatus('empty');
      counter.innerText = mapMode === 'live' ? communityText('noLive') : communityText('noHistory');
      return;
    }

    const aggregated = rows.map((row) => ({
      lat: row.latitude, lng: row.longitude, db: row.db_level,
      category: row.category, createdAt: row.created_at,
      sampleCount: Number(row.sample_count)
    }));
    lastAggregatedPoints = aggregated;
    renderCommunityPoints(aggregated);
    setMapDataStatus('ready');

    const mostRecent = rows[0].created_at;
    const modeLabel  = communityText(mapMode === 'live' ? 'live' : 'history');
    const measurementCount = aggregated.reduce((sum, point) => sum + point.sampleCount, 0);
    counter.innerText =
      `${formatLegendCounter(modeLabel, aggregated.length, measurementCount)}\n` +
      `${communityText('updated')}: ${timeAgo(mostRecent)}`;

  } catch (err) {
    if (requestToken !== communityLoadToken) return;
    console.error('Error cargando mediciones:', err);
    const state = err.code === 'PGRST202' ? 'missingMethod'
      : err.code === '42501' || err.code === 'PGRST301' || err.status === 401 || err.status === 403 ? 'denied' : 'error';
    counter.innerText = mapDataText(state);
    // Un fallo de red no invalida la última carga de esta misma vista.
    // Una RPC inexistente sí impide interpretar sus datos como método v3.
    if (state === 'missingMethod') lastAggregatedPoints = [];
    renderCommunityPoints(lastAggregatedPoints);
    setMapDataStatus(state);
  }
}

// Carga inicial + refresco automático
loadCommunityPoints();
setInterval(() => { if (mapMode === 'live') loadCommunityPoints(); }, REFRESH_INTERVAL_MS);
let mapReloadTimer;
map.on('moveend', () => {
  clearTimeout(mapReloadTimer);
  mapReloadTimer = setTimeout(loadCommunityPoints, 200);
});

// ============================================
// ENVIAR MEDICIÓN A SUPABASE
// ============================================
/**
 * Envía el promedio de una ventana de muestras, como máximo una petición a la vez.
 * Reserva las muestras antes del await para que las nuevas formen otra ventana.
 * Si falla tanto el envío como su persistencia local, devuelve las muestras
 * reservadas al acumulador; los datos solo llevan coordenadas aproximadas.
 */
async function sendMeasurementIfDue() {
  const now = Date.now();
  if (!sharingEnabled || !currentPosition) return;
  if (sendMeasurementIfDue.pending) return;
  if (now - lastSendTime < SEND_INTERVAL_MS) return;
  if (sendWindowCount === 0) return;

  /*
   * El promedio que se guarda en `db_level` es energetico, no aritmetico.
   *
   * Este valor es la unidad con la que la base de datos agrega las celdas del mapa,
   * asi que el sesgo de la media aritmetica no se quedaba en la sesion del usuario:
   * se guardaba ya rebajado y despues se promediaba otra vez en SQL. Corregir solo
   * el promedio de pantalla habria dejado el mapa igual de sesgado.
   */
  const avg = Math.round(promedioEnergetico(sendWindowEnergia, sendWindowCount));
  const windowEnergia = sendWindowEnergia;
  const windowCount = sendWindowCount;
  sendWindowEnergia = 0;
  sendWindowCount = 0;
  lastSendTime = now;
  sendMeasurementIfDue.pending = true;
  const sharingGeneration = typeof sharingRequestId !== 'undefined' ? sharingRequestId : null;
  if (typeof updateSharingDelivery === 'function') updateSharingDelivery('sending', sharingGeneration);
  const snapped  = snapToGrid(currentPosition.lat, currentPosition.lng);
  const category = classifyDb(avg);
  const nowIso   = new Date().toISOString();
  const measurement = {
    id: crypto.randomUUID(),
    latitude: snapped.lat,
    longitude: snapped.lng,
    db_level: avg,
    category,
    measurement_version: MEASUREMENT_VERSION,
    capture_profile: captureProfile
  };

  let success = false;
  let persisted = false;
  try {
    if (supabaseClient) {
      let error;
      try {
        ({ error } = await supabaseClient.from('noise_measurements').insert(measurement));
      } catch (requestError) {
        error = requestError;
      }
      if (error) {
        console.error('Supabase insert error:', error);
        /*
         * Un rechazo de Postgres **no** es un problema de red, y por eso no debe
         * seguir el camino de la cola offline.
         *
         * `isOfflineError()` solo reconoce fallos de red, así que un 23514 —una
         * restricción violada— no se guardaba en ninguna parte: la lectura se
         * descartaba en silencio y el botón ponía «Error de envío». Fue lo que pasó
         * al subir a la v4 sin aplicar la migración que admitiera el 4 en el CHECK:
         * cada medición del mundo se perdió sin dejar rastro, y el aviso que sí se
         * veía era el del mapa, que habla de la RPC y no del INSERT.
         *
         * Lo que se hace aquí:
         *
         *  - Se distingue el error de esquema del de red, y el de esquema **dice
         *    qué hacer** en lugar de recomendar revisar la conexión, que no es el
         *    problema.
         *  - El rechazo de esquema **no** se mete en la cola: esa cola acaba
         *    sincronizando en segundo plano y volvería a fallar igual, acumulándose
         *    de filas que la base va a rechazar otra vez. Perder una medición por un
         *    error de configuración es malo; perderla otra vez cada vez que se
         *    reintenta, en silencio, es peor.
         */
        const esEsquema = typeof isSchemaError === 'function' ? isSchemaError(error) : false;
        if (esEsquema) {
          sharingDeliveryState = 'error';
          updateSharingStatus('schemaOutOfDate');
        } else if (typeof isOfflineError === 'function' ? isOfflineError(error) : !navigator.onLine) {
          if (typeof queueOfflineMeasurement === 'function') {
            await queueOfflineMeasurement(measurement);
            success = true;
          }
        }
      } else {
        success = true;
        persisted = true;
      }
    } else {
      if (typeof queueOfflineMeasurement === 'function') {
        await queueOfflineMeasurement(measurement);
        success = true;
      }
    }

    if (success && typeof recordLocalChallengeMeasurement === 'function') {
      recordLocalChallengeMeasurement({ ...measurement, created_at: nowIso });
    }
    // La RPC vuelve a agregar la celda y respeta periodo/franja/viewport.
    // Añadir un punto suelto duplicaba celdas, ignoraba filtros y mezclaba
    // círculos con Calor en Historial. La cola offline no es un aporte público.
    const view = document.getElementById('map-view');
    if (persisted && view?.classList.contains('active')) loadCommunityPoints();

  } finally {
    if (!success) {
      sendWindowEnergia += windowEnergia;
      sendWindowCount += windowCount;
    }
    sendMeasurementIfDue.pending = false;
    if (typeof updateSharingDelivery === 'function') {
      updateSharingDelivery(persisted ? 'published' : success ? 'queued' : 'error', sharingGeneration);
    }
  }
}

// ============================================
// CAMBIAR MODO EN VIVO / HISTORIAL
// ============================================
function setMapMode(mode) {
  if (!['history', 'live'].includes(mode)) return;
  const comparing = typeof comparisonMode !== 'undefined' && comparisonMode;
  if (typeof exitComparisonMode === 'function') exitComparisonMode();
  if (mode === mapMode) {
    if (comparing) renderCommunityPoints(lastAggregatedPoints);
    return;
  }
  mapMode = mode;
  document.querySelectorAll('.mode-btn').forEach((button) => {
    const active = button.id === `mode-${mode}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  lastAggregatedPoints = [];
  clearCommunityLayers();
  loadCommunityPoints();
}

// La RPC noise_map_cells acepta exactamente estas cuatro franjas. Un valor
// inesperado deja sus cuatro condiciones en falso y devuelve cero filas, así
// que hay que rechazarlo aquí en lugar de vaciar el mapa en silencio.
const TIME_FILTERS = ['all', 'morning', 'afternoon', 'night'];

function setTimeFilter(filter) {
  if (!TIME_FILTERS.includes(filter)) return;
  if (typeof exitComparisonMode === 'function') exitComparisonMode();
  selectedTimeFilter = filter;
  document.querySelectorAll('.time-filter-btn').forEach((button) => {
    const active = button.id === `time-${filter}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  lastAggregatedPoints = [];
  clearCommunityLayers();
  loadCommunityPoints();
}
