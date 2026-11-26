// Health Dashboard PWA service worker.
// Network-first for the report (always fresh when online), cache fallback offline.
const CACHE = 'health-91184e263812bfb8';
const SHELL = [
  'feedback_2026.html',
  'app.js',
  'app.css',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-180.png'
];

const OPTIONAL_REPORTS = ['health_analytics_2026.html', 'index.html'];
const REPORTS = ['feedback_2026.html', ...OPTIONAL_REPORTS];

function oldReportCache(name) {
  return name !== CACHE && /^health-(?:v\d+|[0-9a-f]{16})$/.test(name);
}

async function installShell() {
  const paths = [...SHELL];
  const previous = (await caches.keys()).filter(oldReportCache);
  for (const page of OPTIONAL_REPORTS) {
    const url = new URL(page, self.registration.scope).href;
    for (const name of previous) {
      if (await caches.match(url, {cacheName: name})) {
        paths.push(page);
        break;
      }
    }
  }
  // Fetch fresh encrypted copies of previously visited reports. A failed batch keeps the old worker active.
  const cache = await caches.open(CACHE);
  await cache.addAll(paths.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'})));
  await self.skipWaiting();
}

self.addEventListener('install', event => event.waitUntil(installShell()));

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(oldReportCache).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedResponse(key) {
  try {
    return await caches.match(key, {cacheName: CACHE});
  } catch {
    // Storage can be unavailable even when the network works.
    return undefined;
  }
}

async function serve(request, key, report) {
  if (report && ['Range', 'If-Range', 'If-Match', 'If-None-Match', 'If-Modified-Since', 'If-Unmodified-Since']
    .some(name => request.headers.has(name))) {
    // An ordinary cached 200 cannot answer the caller's range or precondition.
    return fetch(request, {cache: 'reload'});
  }
  let response;
  try {
    if (report) {
      const saved = await cachedResponse(key);
      const tag = saved && saved.status === 200 && !saved.redirected && saved.headers.get('ETag');
      if (tag) {
        // Validate the copy held by this worker, even if the browser HTTP cache is still fresh.
        const headers = new Headers(request.headers);
        headers.set('If-None-Match', tag);
        response = await fetch(request, {headers, cache: 'no-store'});
        if (response.status === 304 && !response.redirected) return saved;
      } else {
        response = await fetch(request, {cache: 'reload'});
      }
    } else {
      response = await fetch(request);
    }
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
  return (await cachedResponse(key)) || response || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const base = self.registration.scope;
  const report = REPORTS.find(path => url.origin + url.pathname === new URL(path, base).href);
  const asset = SHELL.find(path => url.href === new URL(path, base).href);
  if (report || asset) event.respondWith(serve(request, new URL(report || asset, base).href, report));
});

SHELL.push("app.css?v=a19ee03b17f1", "app.js?v=428648f07bb6");
