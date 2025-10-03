// service-worker.js - Enhanced Mobile-First PWA Service Worker

const CACHE_VERSION = 'v1.7-react-complete'; // Updated version for React conversion
const STATIC_CACHE = `novel-apps-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `novel-apps-dynamic-${CACHE_VERSION}`;
const RUNTIME_CACHE = `novel-apps-runtime-${CACHE_VERSION}`;

// Mobile-first caching strategy, updated for React build
const STATIC_PATHS = new Set([
  './',
  './index.html',
  './index.css',
  './manifest.json',
  './index.tsx',
  './App.tsx',
  './types.ts',
  './contexts/AppContext.tsx',
  './hooks/useHashRouter.ts',
  './components/Layout.tsx',
  './components/Header.tsx',
  './components/Sidebar.tsx',
  './components/Dashboard.tsx',
  './components/ToolCard.tsx',
  './tools/NovelSplitter.tsx',
  './tools/EpubSplitter.tsx',
  './tools/ZipEpub.tsx',
  './tools/ZipToEpub.tsx',
  './tools/EpubToZip.tsx',
  './tools/CreateBackupFromZip.tsx',
  './tools/MergeBackup.tsx',
  './tools/AugmentBackupWithZip.tsx',
  './tools/FindReplaceBackup.tsx',
  './utils/backupHelpers.ts',
  './utils/browserHelpers.ts'
]);

const CRITICAL_ICONS = [
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Install event - cache critical assets immediately
self.addEventListener('install', event => {
  console.log('[SW] Installing new React-based service worker');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Caching app shell and critical assets');
      return cache.addAll([...STATIC_PATHS, ...CRITICAL_ICONS]);
    }).then(() => {
      console.log('[SW] Installation complete, skipping wait');
      return self.skipWaiting();
    }).catch(error => {
      console.error('[SW] Installation failed:', error);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating new React-based service worker');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith('novel-apps-') && !cacheName.includes(CACHE_VERSION)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stale-while-revalidate for CDN assets
const staleWhileRevalidate = async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    const networkResponsePromise = fetch(request).then(response => {
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    });
    return cachedResponse || networkResponsePromise;
};

// Cache-first for static assets
const cacheFirst = async (request, cacheName) => {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error(`[SW] Fetch failed for ${request.url}`, error);
        throw error;
    }
};

// Network-first for navigation
const networkFirst = async (request) => {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        const cache = await caches.open(STATIC_CACHE);
        return await cache.match('./index.html');
    }
};

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.protocol.startsWith('chrome-extension')) {
        return;
    }

    if (url.hostname === 'esm.sh' || url.hostname === 'cdn.tailwindcss.com') {
        event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    } else if (STATIC_PATHS.has(url.pathname) || CRITICAL_ICONS.includes(url.pathname)) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
    } else if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
    } else {
        // For other requests, try network and fallback to cache if available
        event.respondWith(fetch(request).catch(() => caches.match(request)));
    }
});