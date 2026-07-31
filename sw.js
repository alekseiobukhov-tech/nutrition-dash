// Health Dashboard PWA service worker.
// Network-first for the report (always fresh when online), cache fallback offline.
const CACHE = 'health-v5';
const SHELL = [
  'feedback_2026.html',
  'app.js',
  'app.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('feedback_2026.html')))
  );
});
