const CACHE_NAME = 'acoustimap-shell-v31';
const ASSET_VERSION = '31';
const APP_SHELL = [
  './',
  './index.html',
  './css/base.css',
  './css/layout.css',
  './css/map.css',
  './css/panel.css',
  './css/info.css',
  './css/responsive.css',
  './css/features.css',
  './css/experience.css',
  './js/config.js',
  './js/map.js',
  './js/audio.js',
  './js/community.js',
  './js/app.js',
  './js/features.js',
  './manifest.webmanifest',
  './assets/icon.svg'
].map((path) => path === './' || path === './index.html' ? path : `${path}?v=${ASSET_VERSION}`);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    // Libraries CDN: best-effort cache. A CDN outage must not block app install.
    await Promise.allSettled([
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
      'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js',
      'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js',
      'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
    ].map(async (url) => {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) await cache.put(url, response);
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ✅ Ignorar esquemas no soportados (chrome-extension, moz-extension, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // ✅ Ignorar peticiones de métodos no soportados
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    (async () => {
      if (event.request.mode === 'navigate') {
        try {
          const response = await fetch(event.request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('./index.html', response.clone());
          }
          return response;
        } catch (_) {
          return (await caches.match('./index.html')) || Response.error();
        }
      }
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok && (url.origin === self.location.origin || /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname))) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        if (event.request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
