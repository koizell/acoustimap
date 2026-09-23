/**
 * community.js
 * Puntos comunitarios de Supabase y envío de mediciones.
 * Depende de: config.js, map.js (communityLayer).
 */

let selectedTimeFilter = 'all';
let selectedVisualMode = 'heatmap';
let lastAggregatedPoints = [];

function normalizeDbForHeatmap(db) {
  return Math.min(Math.max((db - 30) / (100 - 30), 0.05), 1.0);
}

function getTimeFilterRange(filter) {
  if (filter === 'all') return null;

  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (filter === 'morning') {
    start.setHours(6, 0, 0, 0);
    end.setHours(12, 0, 0, 0);
  } else if (filter === 'afternoon') {
    start.setHours(12, 0, 0, 0);
    end.setHours(18, 0, 0, 0);
  } else {
    // Noche cruza medianoche: usar el intervalo nocturno en curso.
    if (now.getHours() < 6) {
      start.setDate(start.getDate() - 1);
    } else {
      end.setDate(end.getDate() + 1);
    }
    start.setHours(18, 0, 0, 0);
    end.setHours(6, 0, 0, 0);
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

// ============================================
// DIBUJAR UN PUNTO COMUNITARIO
// ============================================
function addCommunityPoint(lat, lng, db, category, createdAt, sampleCount = 1) {
  const color = COLOR_BY_CAT[category] || COLOR_BY_CAT[classifyDb(db)];
  const when  = createdAt ? timeAgo(createdAt) : 'ahora';

  const popupHtml = [
    `<b>${db} dB</b>`,
    `Categoría: <b>${category}</b>`,
    `<small>Última medición: ${when}</small>`,
    sampleCount > 1 ? `<small>${sampleCount} mediciones acumuladas</small>` : ''
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
    button.classList.toggle('active', button.id === `visual-${mode}`);
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
  button.innerText = 'Exportando…';

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

    const columns = ['id', 'latitude', 'longitude', 'db_level', 'category', 'created_at'];
    const csv = [
      columns.join(','),
      ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(','))
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
    alert('No se pudieron exportar las mediciones.');
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
  button.innerText = 'Exportando…';

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
            db_level: row.db_level,
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
    alert('No se pudieron exportar las mediciones.');
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

  if (!supabaseClient) {
    counter.innerText = 'Sin datos comunitarios aún';
    return;
  }

  try {
    let query = supabaseClient
      .from('noise_measurements')
      .select('latitude, longitude, db_level, category, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (mapMode === 'live') {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', since);
    }

    const timeRange = getTimeFilterRange(selectedTimeFilter);
    if (timeRange) {
      query = query
        .gte('created_at', timeRange.start)
        .lt('created_at', timeRange.end);
    }

    const { data, error } = await query;
    if (error) throw error;

    clearCommunityLayers();

    if (!data || data.length === 0) {
      lastAggregatedPoints = [];
      counter.innerText = mapMode === 'live'
        ? 'Sin mediciones recientes (<24h)'
        : 'Aún no hay mediciones en el historial';
      return;
    }

    const aggregated = aggregatePoints(data);
    lastAggregatedPoints = aggregated;
    renderCommunityPoints(aggregated);

    const mostRecent = data[0].created_at;
    const modeLabel  = mapMode === 'live' ? 'En Vivo (24h)' : 'Historial (todo)';
    counter.innerText =
      `${modeLabel} · ${aggregated.length} zonas · ${data.length} mediciones\n` +
      `Última actualización: ${timeAgo(mostRecent)}`;

  } catch (err) {
    console.error('Error cargando mediciones:', err);
    counter.innerText = 'Error al cargar datos';
  }
}

// Carga inicial + refresco automático
loadCommunityPoints();
setInterval(loadCommunityPoints, REFRESH_INTERVAL_MS);

// ============================================
// ENVIAR MEDICIÓN A SUPABASE
// ============================================
async function sendMeasurementIfDue() {
  const now = Date.now();
  if (!sharingEnabled || !currentPosition) return;
  if (now - lastSendTime < SEND_INTERVAL_MS) return;
  if (sendWindowCount === 0) return;

  const avg = Math.round(sendWindowSum / sendWindowCount);
  const snapped  = snapToGrid(currentPosition.lat, currentPosition.lng);
  const category = classifyDb(avg);
  const nowIso   = new Date().toISOString();
  const measurement = {
    latitude: snapped.lat,
    longitude: snapped.lng,
    db_level: avg,
    category
  };

  // Dibujar la zona inmediatamente en el mapa
  if (mapMode === 'live') {
    if (selectedVisualMode === 'heatmap') {
      addCommunityHeatPoint(snapped.lat, snapped.lng, avg);
    } else {
      addCommunityPoint(snapped.lat, snapped.lng, avg, category, nowIso, 1);
    }
    lastAggregatedPoints.push({
      lat: snapped.lat,
      lng: snapped.lng,
      db: avg,
      category,
      createdAt: nowIso,
      sampleCount: 1
    });
  } else {
    addCommunityPoint(snapped.lat, snapped.lng, avg, category, nowIso, 1);
  }

  let success = false;
  if (supabaseClient) {
    const { error } = await supabaseClient.from('noise_measurements').insert(measurement);
    if (error) {
      console.error('Supabase insert error:', error);
      if (typeof queueOfflineMeasurement === 'function') queueOfflineMeasurement(measurement);
      success = true;
    } else {
      success = true;
    }
  } else {
    if (typeof queueOfflineMeasurement === 'function') queueOfflineMeasurement(measurement);
    success = true;
  }

  if (success) {
    sendWindowSum = 0;
    sendWindowCount = 0;
    lastSendTime = now;
  }
}

// ============================================
// CAMBIAR MODO EN VIVO / HISTORIAL
// ============================================
function setMapMode(mode) {
  mapMode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById(`mode-${mode}`);
  if (btn) btn.classList.add('active');
  loadCommunityPoints();
}

function setTimeFilter(filter) {
  selectedTimeFilter = filter;
  document.querySelectorAll('.time-filter-btn').forEach((button) => {
    button.classList.toggle('active', button.id === `time-${filter}`);
  });
  loadCommunityPoints();
}
