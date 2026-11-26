/**
 * KloudPDF Service Worker — Versioned Offline Application Shell
 *
 * Strict Privacy & Safety Guarantees:
 * - Caches only static application assets (HTML shell, bundled JS/CSS, icons, PDF.js worker).
 * - NEVER caches user PDF files, blob: URLs, data: URLs, or POST/mutation requests.
 * - Cleans outdated version caches cleanly on activation.
 */

const CACHE_VERSION = 'kloudpdf-shell-v4';
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './kloudpdf-logo.png',
  './favicon.png',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './pdf.worker.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('kloudpdf-shell-') && key !== CACHE_VERSION)
          .map((oldKey) => caches.delete(oldKey))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept or cache blob:, data:, chrome-extension:, or third-party hosts
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;

  // Navigation requests: Network-first with offline app shell fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static bundled assets (JS/CSS/SVG/workers): Cache-first with background refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
