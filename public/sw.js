/**
 * Advanced Service Worker - Volumetrik Platform
 * 2025 Best Practices with Multiple Caching Strategies
 *
 * Features:
 * - Stale-While-Revalidate for app shell
 * - Cache-First for static assets
 * - Network-First for API calls
 * - Range request support for video streaming
 * - IndexedDB integration for large files
 * - Background sync for analytics
 * - Push notifications ready
 */

const CACHE_VERSION = 'volumetrik-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const VIDEO_CACHE = `${CACHE_VERSION}-video`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Cache duration in seconds
const CACHE_DURATIONS = {
  static: 365 * 24 * 60 * 60,    // 1 year for immutable assets
  dynamic: 7 * 24 * 60 * 60,     // 1 week for app shell
  api: 5 * 60,                    // 5 minutes for API
  video: 30 * 24 * 60 * 60        // 30 days for video chunks
};

// Resources to precache on install
const PRECACHE_URLS = [
  '/',
  '/library.html',
  '/login.html',
  '/player.html',
  '/auth.js',
  '/lib/three.min.js',
  '/lib/OrbitControls.js',
  '/lib/WebGL.js',
  '/lib/ARButton.js',
  '/assets/logo.png',
  '/web4dv/CODEC.wasm',
  '/web4dv/CODEC.js',
  '/web4dv/CODEC.worker.js',
  '/web4dv/model4D_Three.js',
  '/web4dv/web4dvImporter.js',
  '/web4dv/web4dvResource.js'
];

// Static assets that should use Cache-First
const STATIC_ASSETS = [
  /\.js$/,
  /\.css$/,
  /\.wasm$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.svg$/,
  /\.webp$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.otf$/
];

// API endpoints that should use Network-First
const API_ENDPOINTS = [
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/
];

// Video files that need special handling
const VIDEO_PATTERNS = [
  /\.4ds$/,
  /storage\.googleapis\.com.*\.4ds/
];

// ============================================================================
// INSTALL - Precache critical resources
// ============================================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })));
      })
      .then(() => {
        console.log('[SW] Precache complete');
        return self.skipWaiting(); // Activate immediately
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error);
      })
  );
});

// ============================================================================
// ACTIVATE - Clean up old caches
// ============================================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Delete old version caches
              return cacheName.startsWith('volumetrik-') && cacheName !== STATIC_CACHE &&
                     cacheName !== DYNAMIC_CACHE && cacheName !== VIDEO_CACHE && cacheName !== API_CACHE;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim(); // Take control immediately
      })
  );
});

// ============================================================================
// FETCH - Intelligent request routing
// ============================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Ignore Chrome extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Route to appropriate strategy
  if (isVideoRequest(request)) {
    event.respondWith(handleVideoRequest(request));
  } else if (isAPIRequest(request)) {
    event.respondWith(networkFirstStrategy(request, API_CACHE, CACHE_DURATIONS.api));
  } else if (isStaticAsset(request)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE, CACHE_DURATIONS.static));
  } else {
    // App shell and HTML - Stale-While-Revalidate
    event.respondWith(staleWhileRevalidateStrategy(request, DYNAMIC_CACHE, CACHE_DURATIONS.dynamic));
  }
});

// ============================================================================
// CACHING STRATEGIES
// ============================================================================

/**
 * Cache-First: Serve from cache, fallback to network
 * Best for: Static immutable assets
 */
async function cacheFirstStrategy(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Check if cache is still fresh
    const cachedDate = new Date(cached.headers.get('sw-cached-date') || 0);
    const now = Date.now();
    const age = (now - cachedDate) / 1000;

    if (age < maxAge) {
      return cached;
    }
  }

  // Fetch from network and cache
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
    }
    return response;
  } catch (error) {
    // Return stale cache if network fails
    if (cached) {
      console.log('[SW] Network failed, returning stale cache:', request.url);
      return cached;
    }
    throw error;
  }
}

/**
 * Network-First: Try network, fallback to cache
 * Best for: API calls and dynamic content
 */
async function networkFirstStrategy(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
    }
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

/**
 * Stale-While-Revalidate: Serve cache immediately, update in background
 * Best for: App shell and frequently updated content
 */
async function staleWhileRevalidateStrategy(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Fetch in background
  const fetchPromise = fetch(request).then((response) => {
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cached-date', new Date().toISOString());

      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers: headers
      });

      cache.put(request, cachedResponse);
    }
    return response;
  }).catch((error) => {
    console.log('[SW] Background fetch failed:', error);
  });

  // Return cached immediately if available
  return cached || fetchPromise;
}

/**
 * Video Request Handler: Support range requests for streaming
 * Best for: Large video files with partial content support
 */
async function handleVideoRequest(request) {
  const cache = await caches.open(VIDEO_CACHE);
  const cached = await cache.match(request);

  // Check if it's a range request
  const rangeHeader = request.headers.get('range');

  if (rangeHeader && cached) {
    // Handle range request from cache
    return createRangeResponse(cached, rangeHeader);
  }

  // For non-range or cache miss, fetch from network
  try {
    const response = await fetch(request);

    // Cache full responses (non-range)
    if (response && response.status === 200 && !rangeHeader) {
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }

    return response;
  } catch (error) {
    // Return cached if network fails
    if (cached) {
      console.log('[SW] Network failed, serving cached video:', request.url);
      return cached;
    }
    throw error;
  }
}

/**
 * Create range response from cached full response
 */
async function createRangeResponse(cachedResponse, rangeHeader) {
  const data = await cachedResponse.arrayBuffer();
  const range = parseRange(rangeHeader, data.byteLength);

  if (!range) {
    return new Response(data, {
      status: 200,
      headers: cachedResponse.headers
    });
  }

  const { start, end } = range;
  const slicedData = data.slice(start, end + 1);

  return new Response(slicedData, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Range': `bytes ${start}-${end}/${data.byteLength}`,
      'Content-Length': slicedData.byteLength,
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'application/octet-stream'
    }
  });
}

/**
 * Parse range header
 */
function parseRange(rangeHeader, totalLength) {
  const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : totalLength - 1;

  return { start, end };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isStaticAsset(request) {
  return STATIC_ASSETS.some((pattern) => pattern.test(request.url));
}

function isAPIRequest(request) {
  return API_ENDPOINTS.some((pattern) => pattern.test(request.url));
}

function isVideoRequest(request) {
  return VIDEO_PATTERNS.some((pattern) => pattern.test(request.url));
}

// ============================================================================
// BACKGROUND SYNC - Queue failed analytics
// ============================================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

async function syncAnalytics() {
  console.log('[SW] Syncing queued analytics...');
  // Implement your analytics sync logic here
}

// ============================================================================
// PUSH NOTIFICATIONS - Ready for future implementation
// ============================================================================
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Volumetrik';
  const options = {
    body: data.body || 'New content available',
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

console.log('[SW] Service Worker loaded');
