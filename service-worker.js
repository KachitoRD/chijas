/* Service Worker - Offline Support & Caching Strategy */

const CACHE_VERSION = 'fijas-v1';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/admin.html',
  '/owner.html',
  '/dist/styles.min.css',
  '/button-styles.css',
  '/dashboard-styles.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  console.log('🛠️ Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('📦 Caching essential files...');
      return cache.addAll(CACHE_URLS).catch((err) => {
        console.warn('⚠️ Some files failed to cache:', err);
        // Continue even if some files fail
      });
    })
  );
  // Force the new service worker to become active immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('⚡ Service Worker activated');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_VERSION) {
            console.log('🗑️ Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (Firebase, Plausible, etc.)
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network first, with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Return cached version if network fails
        return caches.match(request).then((cached) => {
          if (cached) {
            console.log('📦 Serving from cache:', request.url);
            return cached;
          }
          
          // Fallback page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          
          // Return 503 error response for failed requests
          return new Response('Service unavailable. Please check your connection.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' }),
          });
        });
      })
  );
});

// Background sync - sync data when back online (optional, requires Periodic Background Sync API)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Add sync logic here (e.g., sync user data with server)
      Promise.resolve().then(() => {
        console.log('🔄 Syncing data...');
      })
    );
  }
});

console.log('✅ Service Worker loaded and ready for offline support');
