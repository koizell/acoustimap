/**
 * map.js
 * Mapa Leaflet, capas, marcador personal, heatmap y botón centrar.
 * Depende de: config.js, Leaflet, leaflet.heat.
 */

// ============================================
// MAPA Y CAPAS
// ============================================
const map = L.map('map', {
  zoomControl: false,
  zoomSnap: 0.25,
  zoomDelta: 0.25
}).setView([8.75, -75.88], 14);

L.control.zoom({ position: 'topleft' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);

const communityLayer  = L.layerGroup().addTo(map);
const myLocationLayer = L.layerGroup().addTo(map);

// ============================================
// HEATMAP: una sola instancia reutilizable
// ============================================
let communityHeatLayer = null;
let heatmapReady = false;
let communityHeatRenderToken = 0;

/** Espera a que el mapa tenga dimensiones > 0 antes de dibujar el heatmap */
function waitForMapSize(callback, attempts = 0) {
  const view = document.getElementById('map-view');
  if (view && !view.classList.contains('active')) return;
  const mapEl = document.getElementById('map');
  if (mapEl && mapEl.offsetWidth > 0 && mapEl.offsetHeight > 0) {
    heatmapReady = true;
    callback();
    return;
  }
  if (attempts > 20) {
    console.warn('Mapa sin dimensiones después de 20 intentos');
    return;
  }
  setTimeout(() => waitForMapSize(callback, attempts + 1), 150);
}

/** Crear la instancia del heatmap (una sola vez) */
/**
 * Raster de índice espacial suavizado. El color sale de la media ponderada
 * de las celdas, no de sumar intensidades. La opacidad expresa el halo y no
 * crece por repetir una celda. No es una interpolación acústica ni LAeq.
 */
function buildRelativeHeatRaster(width, height, points, radius, gradient, previous = null) {
  const size = width * height;
  const raster = previous?.width === width && previous?.height === height ? previous : {
    width, height, values: new Float32Array(size), weights: new Float32Array(size),
    coverage: new Float32Array(size), pixels: new Uint8ClampedArray(size * 4)
  };
  raster.values.fill(0);
  raster.weights.fill(0);
  raster.coverage.fill(0);
  raster.pixels.fill(0);
  const radiusSquared = radius * radius;
  for (const [px, py, value] of points) {
    if (![px, py, value].every(Number.isFinite) || value < 0 || value > 1) continue;
    const left = Math.max(0, Math.floor(px - radius));
    const right = Math.min(width - 1, Math.ceil(px + radius));
    const top = Math.max(0, Math.floor(py - radius));
    const bottom = Math.min(height - 1, Math.ceil(py + radius));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const distanceSquared = (x - px) ** 2 + (y - py) ** 2;
      if (distanceSquared >= radiusSquared) continue;
      const weight = (1 - distanceSquared / radiusSquared) ** 3;
      const offset = y * width + x;
      raster.values[offset] += value * weight;
      raster.weights[offset] += weight;
      raster.coverage[offset] = Math.max(raster.coverage[offset], weight);
    }
  }
  for (let offset = 0; offset < size; offset++) {
    if (!raster.weights[offset]) continue;
    const color = Math.min(255, Math.max(0, Math.round(raster.values[offset] / raster.weights[offset] * 255))) * 4;
    const pixel = offset * 4;
    raster.pixels[pixel] = gradient[color];
    raster.pixels[pixel + 1] = gradient[color + 1];
    raster.pixels[pixel + 2] = gradient[color + 2];
    raster.pixels[pixel + 3] = Math.round(180 * raster.coverage[offset]);
  }
  return raster;
}

/** Reutiliza el ciclo de vida de Leaflet.heat, pero no su suma de densidades. */
function createRelativeHeatLayer(points, options) {
  const layer = L.heatLayer(points, options);
  layer._redraw = function () {
    this._frame = null;
    if (!this._map || !this._heat) return;
    const size = this._map.getSize();
    if (size.x < 1 || size.y < 1) return;
    const projected = this._latlngs.map((point) => {
      const pixel = this._map.latLngToContainerPoint(point);
      return [pixel.x, pixel.y, point[2]];
    });
    // Conserva los valores de entrada para inspección, sin atenuación por zoom.
    this._heat.data(projected);
    // Media resolución: limita memoria y coste al mover un mapa con muchas celdas.
    const step = 2;
    const width = Math.ceil(size.x / step), height = Math.ceil(size.y / step);
    this._relativeRaster = buildRelativeHeatRaster(width, height,
      projected.map(([x, y, value]) => [x / step, y / step, value]),
      ((this.options.radius || 48) + (this.options.blur || 36)) / step,
      this._heat._grad, this._relativeRaster);
    if (!this._relativeCanvas) this._relativeCanvas = document.createElement('canvas');
    this._relativeCanvas.width = width;
    this._relativeCanvas.height = height;
    const context = this._relativeCanvas.getContext('2d');
    const image = context.createImageData(width, height);
    image.data.set(this._relativeRaster.pixels);
    context.putImageData(image, 0, 0);
    const output = this._canvas.getContext('2d');
    output.clearRect(0, 0, size.x, size.y);
    output.drawImage(this._relativeCanvas, 0, 0, size.x, size.y);
  };
  return layer;
}

function ensureHeatLayer() {
  if (communityHeatLayer) return communityHeatLayer;

  communityHeatLayer = createRelativeHeatLayer([], {
    radius: 48,
    blur: 36,
    // Leaflet.heat atenúa por 2^(maxZoom-zoom). Esa regla mide densidad,
    // no nivel: con zoom 14 convertía un índice 95 (1) en 0.125.
    maxZoom: 0,
    minOpacity: 0.22,
    // Stops alineados con los umbrales de categoria sobre el rango 30-95 del
    // indice: 0.385 es el indice 55 y 0.615 es el indice 70. Asi el ambar
    // empieza con "moderado" y el naranja con "alto", en vez de que ambos
    // quedaran fuera del alcance util.
    gradient: {
      0.0: '#22c55e',
      0.25: '#84cc16',
      0.385: '#facc15',
      0.615: '#f97316',
      1.0: '#dc2626'
    }
  });

  return communityHeatLayer;
}

/** Asigna los puntos al heatmap (nunca lo recrea) */
function setCommunityHeatPoints(points) {
  const renderToken = ++communityHeatRenderToken;
  // Limpiar capa de círculos
  if (communityLayer) communityLayer.clearLayers();

  // Crear heatmap si no existe
  const layer = ensureHeatLayer();

  if (!points || points.length === 0) {
    // Sin datos: ocultar el heatmap si está en el mapa
    detachHeatLayer(layer);
    layer._latlngs = [];
    return;
  }

  // Preparar datos normalizados
  const heatData = points.map((p) => [
    p.lat,
    p.lng,
    typeof normalizeDbForHeatmap === 'function'
      ? normalizeDbForHeatmap(p.db)
      : Math.min(Math.max((p.db - 30) / 65, 0.05), 1.0)
  ]);

  // Esperar a que el mapa esté listo antes de añadir
  waitForMapSize(() => {
    if (renderToken !== communityHeatRenderToken) return;
    try {
      if (!map.hasLayer(layer)) {
        // onAdd dibuja inmediatamente: no debe recuperar el conjunto anterior.
        layer._latlngs = heatData;
        layer.addTo(map);
      }
      layer.setLatLngs(heatData);
    } catch (e) {
      console.warn('Error actualizando heatmap:', e.message);
    }
  });
}

/** Añadir un punto individual al heatmap (sin recrear) */
function addCommunityHeatPoint(lat, lng, db) {
  const renderToken = communityHeatRenderToken;
  const layer = ensureHeatLayer();
  const intensity = typeof normalizeDbForHeatmap === 'function'
    ? normalizeDbForHeatmap(db)
    : Math.min(Math.max((db - 30) / 65, 0.05), 1.0);

  waitForMapSize(() => {
    if (renderToken !== communityHeatRenderToken) return;
    try {
      if (!map.hasLayer(layer)) layer.addTo(map);
      const current = [...(layer._latlngs || [])];
      current.push([lat, lng, intensity]);
      layer.setLatLngs(current);
    } catch (e) {
      console.warn('Error añadiendo punto al heatmap:', e.message);
    }
  });
}

/** Retira un canvas de Leaflet.heat sin dejar repintados pendientes. */
function detachHeatLayer(layer) {
  if (!layer) return;
  // Leaflet.heat 0.2.0 no cancela su RAF al retirar la capa; el callback
  // pendiente accede luego a _map=null y rompe cambios rápidos de modo/pestaña.
  if (layer._frame) L.Util.cancelAnimFrame(layer._frame);
  layer._frame = null;
  if (map.hasLayer(layer)) map.removeLayer(layer);
}

/** Limpiar capas comunitarias e invalidar dibujos diferidos. */
function clearCommunityLayers() {
  communityHeatRenderToken++;
  if (communityLayer) communityLayer.clearLayers();
  detachHeatLayer(communityHeatLayer);
}

/** Leaflet.heat cannot redraw its canvas while the map is display:none. */
function suspendMapHeatLayers() {
  communityHeatRenderToken++;
  const layers = [communityHeatLayer];
  if (typeof comparisonLayer !== 'undefined') layers.push(comparisonLayer);
  if (typeof currentComparisonLayer !== 'undefined') layers.push(currentComparisonLayer);
  layers.forEach(detachHeatLayer);
}

// ============================================
// BOTÓN "CENTRAR EN MÍ"
// ============================================
const LocateControl = L.Control.extend({
  options: { position: 'topleft' },
  onAdd: function () {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const link = L.DomUtil.create('a', 'locate-btn', container);
    link.href = '#';
    link.title = 'Centrar en mi ubicación';
    link.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
    link.setAttribute('aria-label', link.title);
    L.DomEvent.on(link, 'click', function (e) {
      L.DomEvent.stop(e);
      container.classList.add('locating');
      centerOnUser();
      setTimeout(() => container.classList.remove('locating'), 2000);
    });
    return container;
  }
});
map.addControl(new LocateControl());

// ============================================
// RESIZEOBSERVER
// ============================================
function invalidateMapIfVisible() {
  const element = document.getElementById('map');
  const view = document.getElementById('map-view');
  if (!element || !view?.classList.contains('active') || element.offsetWidth < 1 || element.offsetHeight < 1) return false;
  map.invalidateSize({ pan: false });
  return true;
}

const resizeObserver = new ResizeObserver(() => {
  setTimeout(invalidateMapIfVisible, 200);
});
const mapEl = document.getElementById('map');
if (mapEl) resizeObserver.observe(mapEl);

window.addEventListener('orientationchange', () => {
  setTimeout(invalidateMapIfVisible, 300);
});

// ============================================
// PROCESAR NUEVA POSICIÓN
// ============================================
function processNewPosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;

  positionHistory.push({
    lat: latitude,
    lng: longitude,
    accuracy: accuracy,
    time: Date.now()
  });
  if (positionHistory.length > 10) positionHistory.shift();

  let effectiveAccuracy = accuracy;

  if (positionHistory.length >= STABILITY_MIN_SAMPLES) {
    const recent = positionHistory.slice(-STABILITY_MIN_SAMPLES);
    const centerLat = recent.reduce((s, p) => s + p.lat, 0) / recent.length;
    const centerLng = recent.reduce((s, p) => s + p.lng, 0) / recent.length;

    const maxSpread = Math.max(...recent.map(p =>
      haversineDistance(centerLat, centerLng, p.lat, p.lng)
    ));

    if (maxSpread < STABILITY_THRESHOLD_M) {
      const bestAccuracy = Math.min(...recent.map(p => p.accuracy));
      effectiveAccuracy = Math.max(bestAccuracy, maxSpread, 5);
    }
  }

  currentPosition = {
    lat: latitude,
    lng: longitude,
    accuracy: effectiveAccuracy
  };

  showMyLocation(latitude, longitude, effectiveAccuracy);
  updateGpsChip(true, effectiveAccuracy);
}

// ============================================
// MOSTRAR MI UBICACIÓN
// ============================================
function showMyLocation(lat, lng, accuracy) {
  myLocationLayer.clearLayers();

  const visualAccuracy = Math.min(accuracy, MAX_VISUAL_ACCURACY_M);

  if (visualAccuracy > 0) {
    L.circle([lat, lng], {
      radius: visualAccuracy,
      color: '#2563eb',
      weight: 1,
      opacity: 0.25,
      fillColor: '#2563eb',
      fillOpacity: 0.04,
      interactive: false
    }).addTo(myLocationLayer);
  }

  L.circleMarker([lat, lng], {
    radius: 7,
    color: '#ffffff',
    weight: 3,
    fillColor: '#2563eb',
    fillOpacity: 1
  })
    .addTo(myLocationLayer)
    .bindPopup(
      '<b>📍 Tu ubicación</b><br>' +
      `<small>${({ es: 'Precisión', en: 'Accuracy', pt: 'Precisão' }[document.documentElement.lang] || 'Precisión')}: ±${Math.round(accuracy)} m</small>`
    );
}

function hideMyLocation() {
  myLocationLayer.clearLayers();
  positionHistory = [];
}

// ============================================
// CENTRAR EN EL USUARIO
// ============================================
function centerOnUser() {
  if (currentPosition) {
    map.setView([currentPosition.lat, currentPosition.lng], 17);
    showMyLocation(currentPosition.lat, currentPosition.lng, currentPosition.accuracy);
    return;
  }

  if (!navigator.geolocation) {
    alert('Tu navegador no soporta geolocalización.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      processNewPosition(pos);
      map.setView([currentPosition.lat, currentPosition.lng], 17);

      if (geoWatchId === null) {
        geoWatchId = navigator.geolocation.watchPosition(
          processNewPosition,
          (err) => console.warn('watchPosition:', err),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
      }
    },
    (err) => {
      console.warn(err);
      alert('No se pudo obtener tu ubicación: ' + err.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}
