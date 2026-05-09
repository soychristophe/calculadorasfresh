const CACHE_NAME = 'freshways-v2605049';
const ASSETS = [
  './index.html',
  './styles.css',
  './script.js',
  './products.js',
  './manifest.json',
  './72.png',
  './192.png',
  './512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // ── NAVEGACIÓN: Safari exige una respuesta LIMPIA y nunca undefined ──
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        let response = await cache.match('./index.html');

        // Si está en caché pero vino de una redirección, limpiar el flag
        if (response && response.redirected) {
          const body = await response.blob();
          response = new Response(body, {
            status: 200,
            statusText: 'OK',
            headers: response.headers
          });
        }

        // Si hay cache hit limpio, servirlo
        if (response) return response;

        // Fallback a red (evita el crash de Safari por undefined)
        return fetch(e.request).catch(() => {
          return new Response('Offline and without cache', { status: 503 });
        });
      })
    );
    return;
  }

  // ── RESTO DE RECURSOS: Cache First ──
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});