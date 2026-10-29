/* Offline app shell cache (cache-first for app files; county GIS / imagery go straight to the network). */
const CACHE = 'zt-tree-inventory-v1.0.1'; // bump on every shell-file change (cache-first)
const SHELL = ['./', 'index.html', 'desktop.html', 'styles.css', 'field.js', 'desktop.js', 'jurisdictions.json', 'manifest.webmanifest',
  'lib/core.js', 'lib/store.js', 'lib/zip.js', 'lib/parcels.js', 'lib/sketch.js', 'lib/report.js',
  'vendor/proj4.js', 'vendor/xlsx.full.min.js', 'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/jspdf.umd.min.js',
  'vendor/images/layers.png', 'vendor/images/layers-2x.png', 'vendor/images/marker-icon.png', 'vendor/images/marker-icon-2x.png', 'vendor/images/marker-shadow.png',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // GIS/imagery: straight to network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(resp => {
    if (resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return resp;
  })));
});
