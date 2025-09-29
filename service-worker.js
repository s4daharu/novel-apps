// service-worker.js - Enhanced Mobile-First PWA Service Worker

const CACHE_VERSION = 'v1.3';
const STATIC_CACHE = `novel-apps-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `novel-apps-dynamic-${CACHE_VERSION}`;
const RUNTIME_CACHE = `novel-apps-runtime-${CACHE_VERSION}`;

// Mobile-first caching strategy
const STATIC_PATHS = new Set([
  '/',
  '/index.html',
  '/index.css',
  '/manifest.json',
  './jszip.min.js'
]);

const CRITICAL_ICONS = [
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png'
];



// Install event - cache critical assets immediately
self.addEventListener('install', event => {
  console.log('[SW] Installing mobile-first service worker');

  event.waitUntil(
    Promise.all([
    // Cache static assets (critical for app shell)
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching static assets');
      return cache.addAll(Array.from(STATIC_PATHS));
    }),
      // Cache critical icons (mobile PWA essentials)
      caches.open(STATIC_CACHE).then(cache => {
        console.log('[SW] Caching critical icons');
        return cache.addAll(CRITICAL_ICONS);
      })
    ]).then(() => {
      console.log('[SW] Installation complete, skipping wait');
      return self.skipWaiting();
    }).catch(error => {
      console.error('[SW] Installation failed:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating mobile-first service worker');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!cacheName.includes(CACHE_VERSION)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Enhanced fetch strategy for mobile-first PWA
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and moz-extension requests
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return;
  }

  event.respondWith(handleRequest(request));
});

// Main request handler with mobile-optimized strategies
async function handleRequest(request) {
  const url = new URL(request.url);

  try {
    // 1. Static assets (cache-first for performance)
    if (STATIC_PATHS.has(url.pathname) || STATIC_PATHS.has('./' + url.pathname.split('/').pop())) {
      return await cacheFirst(request, STATIC_CACHE);
    }

    // 2. Icons (cache-first, mobile critical)
    if (url.pathname.includes('/icons/')) {
      return await cacheFirst(request, STATIC_CACHE);
    }

    // 3. JavaScript modules (stale-while-revalidate)
    if (url.pathname.startsWith('/js/') && url.pathname.endsWith('.js')) {
      return await staleWhileRevalidate(request, DYNAMIC_CACHE);
    }

    // 4. External dependencies (network-first with fallback)
    if (url.hostname.includes('esm.sh')) {
      return await networkFirstWithFallback(request, RUNTIME_CACHE);
    }

    // 5. HTML pages (network-first for fresh content)
    if (request.mode === 'navigate') {
      return await networkFirstWithFallback(request, RUNTIME_CACHE);
    }

    // 6. Everything else (cache-first with network fallback)
    return await cacheFirstWithFallback(request, DYNAMIC_CACHE);

  } catch (error) {
    console.error('[SW] Request failed:', error);

    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const offlineResponse = await caches.match('./index.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }

    throw error;
  }
}

// Cache-first strategy (for static assets)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    throw error;
  }
}

// Network-first strategy (for dynamic content)
async function networkFirstWithFallback(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

// Stale-while-revalidate (for JS modules)
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  // Start network request (don't await)
  const networkPromise = fetch(request).then(response => {
    if (response.status === 200) {
      caches.open(cacheName).then(cache => {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(() => null);

  // Return cached version immediately if available
  if (cached) {
    return cached;
  }

  // Wait for network response, throw if null
  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }
  throw new Error('Network request failed for JS module');
}

// Cache-first with network fallback
async function cacheFirstWithFallback(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // For images, return a placeholder or throw
    if (request.destination === 'image') {
      throw error;
    }
    throw error;
  }
}

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  // Handle any queued operations when back online
  console.log('[SW] Handling background sync operations');
}

// Push notification handler (for future enhancements)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: './icons/icon-192x192.png',
      badge: './icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: data.url,
      actions: [
        {
          action: 'open',
          title: 'Open App',
          icon: './icons/icon-96x96.png'
        },
        {
          action: 'close',
          title: 'Dismiss'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data || './')
    );
  }
});

// Message handler for communication with main thread
self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_VERSION });
      break;

    case 'CLEAR_CACHE':
      handleClearCache(payload);
      break;

    case 'CACHE_JS_MODULE':
      cacheJSModule(payload.url);
      break;
  }
});

async function handleClearCache(cacheName) {
  try {
    if (cacheName) {
      await caches.delete(cacheName);
    } else {
      // Clear all caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(name => caches.delete(name))
      );
    }
    console.log('[SW] Cache cleared successfully');
  } catch (error) {
    console.error('[SW] Failed to clear cache:', error);
  }
}

async function cacheJSModule(url) {
  try {
    const response = await fetch(url);
    if (response.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE);
      await cache.put(url, response.clone());
      console.log(`[SW] Cached JS module: ${url}`);
    }
  } catch (error) {
    console.error(`[SW] Failed to cache JS module: ${url}`, error);
  }
}

// Periodic background sync for cache cleanup
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cache-cleanup') {
    event.waitUntil(cleanupOldCaches());
  }
});

async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const oldCaches = cacheNames.filter(name =>
    name.includes('novel-apps') && !name.includes(CACHE_VERSION)
  );

  await Promise.all(
    oldCaches.map(name => caches.delete(name))
  );

  console.log('[SW] Cleaned up old caches');
}