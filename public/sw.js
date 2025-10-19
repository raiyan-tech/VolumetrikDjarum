// Service Worker for Volumetrik Player
// Optimized for HTTP/3/QUIC with Range request pass-through

const CACHE_VERSION = 'volumetrik-v2-20251019';
const STATIC_CACHE = 'volumetrik-static-v2-20251019';

// Files to cache for offline functionality (UI assets only, not video data)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/web4dv/web4dvImporter.js',
  '/web4dv/web4dvResource.js',
  '/web4dv/model4D_Three.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.warn('[SW] Failed to cache some static assets:', error);
      })
  );

  // Force the waiting service worker to become the active service worker
  // This ensures new versions activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== CACHE_VERSION) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Take control of all clients immediately
  // This ensures the new SW controls pages without requiring a reload
  return self.clients.claim();
});

// Fetch event - handle requests with Range pass-through
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if this is a .4ds file (volumetric video data)
  const is4dsFile = url.pathname.endsWith('.4ds');

  // Check if request has Range header (partial content request)
  const hasRangeHeader = event.request.headers.has('Range');

  // CRITICAL: Pass through Range requests without caching
  // This ensures HTTP/3/QUIC protocols can handle packet loss recovery properly
  if (hasRangeHeader || is4dsFile) {
    console.log('[SW] Range request detected, passing through:', url.pathname,
                'Range:', event.request.headers.get('Range'));

    // Pass through directly without touching cache
    // This allows browser to use HTTP/3/QUIC for optimal streaming
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // NEVER cache 206 Partial Content responses
          // Caching these breaks Range request logic and prevents proper seeking
          if (response.status === 206) {
            console.log('[SW] 206 Partial Content response, NOT caching');
            return response;
          }

          // For 200 OK responses to .4ds files, also don't cache (too large)
          if (is4dsFile && response.status === 200) {
            console.log('[SW] Full .4ds response, NOT caching (too large)');
            return response;
          }

          return response;
        })
        .catch((error) => {
          console.error('[SW] Range request failed:', error);
          throw error;
        })
    );
    return;
  }

  // For non-Range requests (static assets), use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', url.pathname);
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Cache static assets for offline use
            if (event.request.method === 'GET' &&
                (url.pathname.endsWith('.js') ||
                 url.pathname.endsWith('.html') ||
                 url.pathname.endsWith('.css'))) {

              const responseToCache = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }

            return networkResponse;
          });
      })
      .catch((error) => {
        console.error('[SW] Fetch failed:', error);
        throw error;
      })
  );
});

// Optional: Prefetch next chunk based on message from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PREFETCH_CHUNK') {
    const { url, range } = event.data;

    console.log('[SW] Prefetch request received:', url, 'Range:', range);

    // Create a Range request for prefetching
    const headers = new Headers();
    if (range) {
      headers.append('Range', `bytes=${range.start}-${range.end}`);
    }

    const request = new Request(url, {
      headers: headers,
      method: 'GET'
    });

    // Fetch but don't cache (let browser handle with HTTP/3)
    fetch(request)
      .then((response) => {
        console.log('[SW] Prefetch completed:', url, 'Status:', response.status);
      })
      .catch((error) => {
        console.warn('[SW] Prefetch failed:', error);
      });
  }
});

// Handle messages from clients to force update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message, activating new version');
    self.skipWaiting();
  }
});

console.log('[SW] Service Worker loaded - Version:', CACHE_VERSION);
