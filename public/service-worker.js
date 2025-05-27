/**
 * Service Worker for Ocean Basket Guest WiFi Portal
 * Provides caching and offline capabilities
 */

const CACHE_NAME = 'ob-wifi-cache-v1.2';
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/admin-dashboard.html',
  '/js/config/firebase-config.js',
  '/js/service-worker-registration.js',
  // Removed incorrect paths for Vite dev server
  // '/js/food-cost.js',
  // '/js/food-cost-standalone.js',
  '/js/admin-dashboard.js',
  // '/css/styles.css', // Removed - file does not exist
  // The default-logo.png may not exist, so we'll handle it specially
  // '/img/default-logo.png',
  '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell...');
        
        // Use Promise.allSettled to continue even if some assets fail to cache
        const cachePromises = CACHE_ASSETS.map(url => {
          return fetch(url)
            .then(response => {
              if (!response.ok) {
                throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
              }
              return cache.put(url, response);
            })
            .catch(error => {
              console.warn(`[Service Worker] Failed to cache: ${url}`, error);
              // Return resolved promise to allow other assets to be cached
              return Promise.resolve();
            });
        });
        
        return Promise.allSettled(cachePromises);
      })
      .then(() => {
        console.log('[Service Worker] Install completed');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Install failed:', error);
        // Still complete installation even if caching failed
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(cacheName => {
            return cacheName !== CACHE_NAME;
          }).map(cacheName => {
            console.log('[Service Worker] Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activation completed');
        return self.clients.claim();
      })
      .catch(error => {
        console.error('[Service Worker] Activation failed:', error);
      })
  );
});

// Fetch event - serve from cache first, then network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests and Firebase API calls
  if (!event.request.url.startsWith(self.location.origin) || 
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  // For HTML files, use network-first strategy
  if (event.request.headers.get('accept') && 
      event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseClone)
                .catch(err => console.warn('Failed to cache HTML response:', err));
            })
            .catch(err => console.warn('Failed to open cache for HTML:', err));
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(response => {
              return response || caches.match('/index.html');
            })
            .catch(err => {
              console.error('Failed to fetch from cache:', err);
              // Return a simple offline page as a last resort
              return new Response(
                '<html><body><h1>You are offline</h1><p>Please check your internet connection.</p></body></html>',
                { headers: {'Content-Type': 'text/html'} }
              );
            });
        })
    );
    return;
  }

  // For other assets, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }
        
        // Otherwise, fetch from network
        return fetch(event.request)
          .then(networkResponse => {
            // Clone the response as it can only be consumed once
            const responseToCache = networkResponse.clone();
            
            // Cache the fetched response for future use
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache)
                  .catch(err => console.warn(`Failed to cache response for ${event.request.url}:`, err));
              })
              .catch(err => console.warn('Failed to open cache:', err));
            
            // Return the network response
            return networkResponse;
          })
          .catch(error => {
            console.error('Fetch failed for asset:', error);
            
            // For image requests, return a placeholder
            if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
              return caches.match('/img/placeholder.png')
                .catch(() => {
                  // If placeholder doesn't exist, return a dummy transparent 1x1 gif
                  return new Response(
                    new Blob([
                      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
                    ], {type: 'image/gif'}),
                    {status: 200}
                  );
                });
            }
            
            // For JavaScript, CSS or other files, return an empty response
            // This prevents errors in the console without breaking the page
            return new Response('', {
              status: 499,
              statusText: 'Offline - Resource unavailable'
            });
          });
      })
      .catch(err => {
        console.error('Cache match failed:', err);
        // Return a default response instead of failing
        return fetch(event.request).catch(() => new Response('', {status: 499}));
      })
  );
});

// Handle connectivity changes
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
