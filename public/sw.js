// Bump this version string whenever you deploy meaningfully changed static
// files, so old visitors' caches get cleared out and refreshed.
const CACHE_NAME = 'recol-shell-v1';

const APP_SHELL = [
    '/',
    '/app',
    '/style.css',
    '/landing.css',
    '/script.js',
    '/landing.js',
    '/translations.js',
    '/country-codes.js',
    '/manifest.json',
    '/assets/RECOL.png',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Never intercept API calls - AI generation, news, and geo-detect all
    // need live, current data every single time. Caching these would risk
    // serving stale or broken responses.
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // Stale-while-revalidate for everything else: serve the cached copy
    // instantly (fast repeat loads, works offline), while quietly fetching
    // a fresh copy in the background to keep the cache up to date.
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
                    }
                    return networkResponse;
                })
                .catch(() => cached); // offline and nothing cached yet: this just fails, same as normal offline behavior

            return cached || fetchPromise;
        })
    );
});
