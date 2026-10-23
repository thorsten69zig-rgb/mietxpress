/* MietXpress Offline-App – Service Worker
   Strategie: App-Dateien aus dem Cache liefern (funktioniert ohne Netz) und im
   Hintergrund aktualisieren. Bei jeder neuen Version VERSION hochzählen. */
const VERSION = 'mx-v10';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'logo.jpg',
  'db.js',
  'avail.js',
  'google.js',
  'calsync.js',
  'drive.js',
  'app.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  // cache:'reload' = immer frisch vom Server holen, nie aus dem Browser-Zwischenspeicher
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(ASSETS.map((u) =>
    fetch(new Request(u, { cache: 'reload' })).then((r) => { if (!r.ok) throw new Error(u); return c.put(u, r); })
  ))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google-Aufrufe etc. nie anfassen

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) {
        e.waitUntil(refresh);
        return cached;
      }
      const res = await refresh;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('index.html');
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })
  );
});
