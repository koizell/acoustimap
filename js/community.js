/**
 * community.js
 * Puntos comunitarios de Supabase y envío de mediciones.
 * Depende de: config.js, map.js (communityLayer).
 */

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

    const { data, error } = await query;
    if (error) throw error;

    communityLayer.clearLayers();

    if (!data || data.length === 0) {
      counter.innerText = mapMode === 'live'
        ? 'Sin mediciones recientes (<24h)'
        : 'Aún no hay mediciones en el historial';
      return;
    }

    const aggregated = aggregatePoints(data);
    aggregated.forEach((p) =>
      addCommunityPoint(p.lat, p.lng, p.db, p.category, p.createdAt, p.sampleCount)
    );

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
  sendWindowSum = 0;
  sendWindowCount = 0;
  lastSendTime = now;

  const snapped  = snapToGrid(currentPosition.lat, currentPosition.lng);
  const category = classifyDb(avg);
  const nowIso   = new Date().toISOString();

  // Dibujar la zona inmediatamente en el mapa
  addCommunityPoint(snapped.lat, snapped.lng, avg, category, nowIso, 1);

  if (supabaseClient) {
    const { error } = await supabaseClient.from('noise_measurements').insert({
      latitude: snapped.lat,
      longitude: snapped.lng,
      db_level: avg,
      category
    });
    if (error) console.error('Supabase insert error:', error);
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