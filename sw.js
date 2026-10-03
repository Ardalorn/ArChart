// Network-first: online loads always revalidate, so edited files show up without bumping a version.
// Offline (or network slower than the timeout) falls back to the cache.
const CACHE = 'ArChart-v12', NETWORK_TIMEOUT_MS = 3000;
const SHELL = ['./', 'index.html', 'styles.css', 'planner.js', 'ics.js', 'app.js', 'manifest.webmanifest',
  'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'fonts/fraunces-latin-600-normal.woff2', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/icon-monochrome-192.png', 'icons/icon-monochrome-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon.ico'];
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('http')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache', signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS) }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html'))));
});