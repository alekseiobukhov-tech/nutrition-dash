// Health Dashboard PWA service worker.
// Network-first for the report (always fresh when online), cache fallback offline.
const CACHE = 'health-467ae33eb5506721';
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
  // addAll commits the complete shell together. A failed update leaves the old worker active.
  e.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll(SHELL.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) =>
        k !== CACHE && /^health-(?:v\d+|[0-9a-f]{16})$/.test(k)
      ).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const REPORTS = ['feedback_2026.html', 'health_analytics_2026.html', 'index.html'];

async function serve(request, key) {
  let response;
  try {
    response = await fetch(request);
  } catch {
    // The exact cached resource can still satisfy an offline request.
  }
  if (response && response.ok && response.status === 200 && !response.redirected) {
    try {
      const cache = await caches.open(CACHE);
      await cache.put(key, response.clone());
    } catch {
      // A full or unavailable cache must still allow opening the online report.
    }
    return response;
  }
  if (response && response.status < 500) return response;
  try {
    const cached = await caches.match(key, {cacheName: CACHE});
    if (cached) return cached;
  } catch {
    // The network response, when available, still carries the original failure.
  }
  return response || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const base = self.registration.scope;
  const report = REPORTS.find(path => url.origin + url.pathname === new URL(path, base).href);
  const asset = SHELL.find(path => url.href === new URL(path, base).href);
  if (report || asset) event.respondWith(serve(request, new URL(report || asset, base).href));
});

SHELL.push("app.css?v=97dc5b4c1c98", "app.js?v=1d852cc6b394");
