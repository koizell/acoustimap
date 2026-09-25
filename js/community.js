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
  es: { now: 'ahora', index: 'Índice', category: 'Categoría', lastMeasurement: 'Última medición', cumulative: 'mediciones acumuladas', exporting: 'Exportando…', exportError: 'No se pudieron exportar las mediciones.', noCommunity: 'Sin datos comunitarios aún', noLive: 'Sin mediciones recientes (<24 h)', noHistory: 'Aún no hay mediciones en el historial', live: 'En vivo (24 h)', history: 'Historial (90 días)', zones: 'zonas', measurements: 'mediciones', updated: 'Última actualización', loadError: 'Error al cargar datos', low: 'bajo', moderate: 'moderado', high: 'alto' },
  en: { now: 'now', index: 'Index', category: 'Category', lastMeasurement: 'Last measurement', cumulative: 'measurements combined', exporting: 'Exporting…', exportError: 'Measurements could not be exported.', noCommunity: 'No community data yet', noLive: 'No recent measurements (<24 h)', noHistory: 'No measurements in history yet', live: 'Live (24 h)', history: 'History (90 days)', zones: 'areas', measurements: 'measurements', updated: 'Last updated', loadError: 'Could not load data', low: 'low', moderate: 'moderate', high: 'high' },
  pt: { now: 'agora', index: 'Índice', category: 'Categoria', lastMeasurement: 'Última medição', cumulative: 'medições acumuladas', exporting: 'Exportando…', exportError: 'Não foi possível exportar as medições.', noCommunity: 'Ainda não há dados comunitários', noLive: 'Sem medições recentes (<24 h)', noHistory: 'Ainda não há medições no histórico', live: 'Ao vivo (24 h)', history: 'Histórico (90 dias)', zones: 'áreas', measurements: 'medições', updated: 'Última atualização', loadError: 'Não foi possível carregar os dados', low: 'baixo', moderate: 'moderado', high: 'alto' }
};

function communityText(key) {
  const language = localStorage.getItem('acoustimap-language') || document.documentElement.lang;
  return (communityCopy[language] || communityCopy.es)[key];
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

  // Halo exterior tenue
  L.circle([lat, lng], {
    color,
    fillColor: color,
    fillOpacity: 0.08,
    weight: 0,
    radius: CIRCLE_VISUAL_RADIUS_M * 1.8,
    interactive: false
  }).addTo(communityLayer);

  // Círculo principal
  L.circle([lat, lng], {
    color,
    fillColor: color,
    fillOpacity: 0.18,
    weight: 1.2,
    opacity: 0.6,
    radius: CIRCLE_VISUAL_RADIUS_M,
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

  // Marcador invisible con tooltip permanente
  L.circleMarker([lat, lng], {
    radius: 20,
    color: 'transparent',
    fillColor: 'transparent',
    fillOpacity: 0,
    weight: 0
  })
    .addTo(communityLayer)
    .bindTooltip(when, {
      permanent: true,
      direction: 'top',
      offset: [0, -30],
      className: `zone-tooltip tooltip-${category}`
    })
    .bindPopup(popupHtml);
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
        sumDb: 0,
        count: 0,
        latest: r.created_at
      });
    }
    const b = buckets.get(key);
    b.sumDb += r.db_level;
    b.count += 1;
    if (new Date(r.created_at) > new Date(b.latest)) b.latest = r.created_at;
  });

  return Array.from(buckets.values()).map((b) => {
    const avg = Math.round(b.sumDb / b.count);
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
  if (comparisonMode && document.getElementById('map-view')?.classList.contains('active')) {
    activateComparisonLayer();
    return;
  }
  clearCommunityLayers();
  if (selectedVisualMode === 'heatmap') {
    setCommunityHeatPoints(points);
    return;
  }
  points.forEach((point) =>
    addCommunityPoint(point.lat, point.lng, point.db, point.category, point.createdAt, point.sampleCount)
  );
}

function setCommunityVisualMode(mode) {
  selectedVisualMode = mode;
  document.querySelectorAll('.visual-filter-btn').forEach((button) => {
    const active = button.id === `visual-${mode}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (lastAggregatedPoints.length) renderCommunityPoints(lastAggregatedPoints);
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
        .select('id, latitude, longitude, db_level, category, created_at')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    const columns = ['id', 'latitude', 'longitude', 'noise_index', 'category', 'created_at'];
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
        .select('id, latitude, longitude, db_level, category, created_at')
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
            created_at: row.created_at
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
async function loadCommunityPoints() {
  const counter = document.getElementById('community-count');
  const requestToken = ++communityLoadToken;
  if (!counter) return;

  if (!supabaseClient) {
    counter.innerText = communityText('noCommunity');
    return;
  }

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
        .rpc('noise_map_cells', queryParams)
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(page || []));
      if (!page || page.length < pageSize || requestToken !== communityLoadToken) break;
    }
    if (requestToken !== communityLoadToken) return;

    clearCommunityLayers();

    if (rows.length === 0) {
      lastAggregatedPoints = [];
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

    const mostRecent = rows[0].created_at;
    const modeLabel  = communityText(mapMode === 'live' ? 'live' : 'history');
    const measurementCount = aggregated.reduce((sum, point) => sum + point.sampleCount, 0);
    counter.innerText =
      `${modeLabel} · ${aggregated.length} ${communityText('zones')} · ${measurementCount} ${communityText('measurements')}\n` +
      `${communityText('updated')}: ${timeAgo(mostRecent)}`;

  } catch (err) {
    if (requestToken !== communityLoadToken) return;
    console.error('Error cargando mediciones:', err);
    counter.innerText = communityText('loadError');
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
async function sendMeasurementIfDue() {
  const now = Date.now();
  if (!sharingEnabled || !currentPosition) return;
  if (sendMeasurementIfDue.pending) return;
  if (now - lastSendTime < SEND_INTERVAL_MS) return;
  if (sendWindowCount === 0) return;

  const avg = Math.round(sendWindowSum / sendWindowCount);
  const windowSum = sendWindowSum;
  const windowCount = sendWindowCount;
  sendWindowSum = 0;
  sendWindowCount = 0;
  lastSendTime = now;
  sendMeasurementIfDue.pending = true;
  const snapped  = snapToGrid(currentPosition.lat, currentPosition.lng);
  const category = classifyDb(avg);
  const nowIso   = new Date().toISOString();
  const measurement = {
    id: crypto.randomUUID(),
    latitude: snapped.lat,
    longitude: snapped.lng,
    db_level: avg,
    category
  };

  let success = false;
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
      if (typeof isOfflineError === 'function' ? isOfflineError(error) : !navigator.onLine) {
        await queueOfflineMeasurement(measurement);
        success = true;
      }
    } else {
      success = true;
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
  if (success) {
    if (mapMode === 'live') {
      if (selectedVisualMode === 'heatmap') {
        addCommunityHeatPoint(snapped.lat, snapped.lng, avg);
      } else {
        addCommunityPoint(snapped.lat, snapped.lng, avg, category, nowIso, 1);
      }
      lastAggregatedPoints.push({
        lat: snapped.lat, lng: snapped.lng, db: avg, category,
        createdAt: nowIso, sampleCount: 1
      });
    } else {
      addCommunityPoint(snapped.lat, snapped.lng, avg, category, nowIso, 1);
    }
  }

  } finally {
    if (!success) {
      sendWindowSum += windowSum;
      sendWindowCount += windowCount;
    }
    sendMeasurementIfDue.pending = false;
  }
}

// ============================================
// CAMBIAR MODO EN VIVO / HISTORIAL
// ============================================
function setMapMode(mode) {
  if (!['history', 'live'].includes(mode) || mode === mapMode) return;
  mapMode = mode;
  document.querySelectorAll('.mode-btn').forEach((button) => {
    const active = button.id === `mode-${mode}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  loadCommunityPoints();
}

function setTimeFilter(filter) {
  selectedTimeFilter = filter;
  document.querySelectorAll('.time-filter-btn').forEach((button) => {
    const active = button.id === `time-${filter}`;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  loadCommunityPoints();
}
