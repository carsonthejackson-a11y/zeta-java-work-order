// Bump this (and APP_VERSION in app.js) on every change, or installed phones keep the old files.
const CACHE_NAME = 'zeta-java-wo-v6';
// The picture reader in /ocr is big (about 7 MB per device) and rarely changes, so it lives in
// its own cache that survives app updates. Files land here the first time they are fetched.
const OCR_CACHE = 'zeta-java-ocr-7.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './pdf-lib.min.js',
  './pdfjs.min.js',
  './pdfjs.worker.min.js',
  './template.pdf',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== OCR_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && new URL(req.url).pathname.includes('/ocr/')){
          const copy = res.clone();
          caches.open(OCR_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
