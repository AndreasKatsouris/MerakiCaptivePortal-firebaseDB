/**
 * Phase 3 Advanced Performance Service Worker
 * Provides aggressive caching and offline capabilities for instant loading
 */

// Phase 3 Advanced Optimization - Performance-First Service Worker
const CACHE_NAME = 'ob-wifi-cache-v2.8-itemkey-attach';  // Non-blocking install
const DATA_CACHE_NAME = 'ob-data-cache-v2.8-itemkey-attach';  // Non-blocking install
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/user-dashboard.html',
  '/admin-dashboard.html', 
  '/js/config/firebase-config.js',
  '/js/modules/user-dashboard/index.js',
  '/js/modules/access-control/services/feature-access-control.js',
  '/js/modules/access-control/services/platform-features.js',
  '/js/utils/subscription-tier-fix.js',
  '/js/auth/admin-claims.js',
  '/js/service-worker-registration.js',
  '/js/admin-dashboard.js',
  '/css/admin-dashboard.css',
  '/manifest.json'
];

// Phase 3: API endpoints to cache for instant loading
// NOTE: RTDB paths (userLocations, locations, subscriptions, etc.) removed —
// they were matching RTDB long-polling requests and causing 4+ min delays.
// Only non-streaming Cloud Function endpoints should be listed here.
const CACHEABLE_API_PATTERNS = [];

// Phase 3: Cache duration settings
const CACHE_DURATIONS = {
  API: 5 * 60 * 1000,    // 5 minutes for API responses
  STATIC: 24 * 60 * 60 * 1000,  // 24 hours for static assets
  DATA: 10 * 60 * 1000   // 10 minutes for user data
};

// Install event - cache assets with Phase 3 optimizations
// Install event — non-blocking.
// Do NOT pre-fetch assets here; pre-fetching 14+ files on install saturates slow
// connections for 20+ seconds, starving in-flight Firebase requests. Assets are
// now cached lazily via the fetch handler (cache-on-demand).
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing (lazy install — no pre-fetch)');
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME),
      caches.open(DATA_CACHE_NAME)
    ]).then(() => {
      // Do NOT call skipWaiting() here. Let the old SW keep serving the current
      // page. The new SW will activate on the next page load, avoiding mid-request
      // takeover that breaks in-flight connections.
      console.log('[Service Worker] Install complete — will activate on next reload');
    })
  );
});

// Activate event — clean up old caches, but do NOT claim existing clients.
// Claiming mid-session causes the new SW to intercept in-flight fetches that
// were started against the old SW, leading to broken connections.
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating (no client claim)');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== DATA_CACHE_NAME)
          .map(name => {
            console.log('[Service Worker] Clearing old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[Service Worker] Activation complete');
    })
  );
});

// Fetch event with Phase 3 advanced caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // CRITICAL FIX: Never intercept Firebase Functions or Firebase RTDB.
  // RTDB uses long-polling/streaming that breaks when the SW tries to cache responses.
  // Caching RTDB responses was causing 4+ minute delays on stock data / location loads.
  if (url.pathname.includes('/performanceTest') ||
      url.pathname.includes('/__/') ||
      url.hostname.includes('cloudfunctions.net') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com') ||
      (url.hostname.includes('firebaseapp.com') && url.pathname.includes('/functions/'))) {
    // Direct network passthrough - no SW interception
    event.respondWith(
      fetch(request).catch(error => {
        console.error('[Service Worker] Firebase passthrough failed:', request.url, error);
        return new Response('Firebase service unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
    return;
  }

  // Phase 3: Advanced caching strategy based on request type
  if (request.method === 'GET') {
    
    // Strategy 1: Firebase API calls - Network first with aggressive caching
    if (isFirebaseApiCall(url)) {
      event.respondWith(handleFirebaseApiRequest(request));
      return;
    }

    // Strategy 2: Static assets - Cache first for instant loading
    if (isStaticAsset(url) || CACHE_ASSETS.some(asset => url.pathname === asset)) {
      event.respondWith(handleStaticAssetRequest(request));
      return;
    }

    // Strategy 3: Dashboard pages - Cache first with network fallback
    if (isDashboardPage(url)) {
      event.respondWith(handleDashboardPageRequest(request));
      return;
    }
  }

  // Default: Network first with error handling
  event.respondWith(
    fetch(request).catch(error => {
      console.error('[Service Worker] Default fetch failed:', request.url, error);
      return new Response('Network error', { 
        status: 503, 
        statusText: 'Network Unavailable',
        headers: { 'Content-Type': 'text/plain' }
      });
    })
  );
});

// Phase 3: Firebase API request handler with intelligent caching
async function handleFirebaseApiRequest(request) {
  const url = new URL(request.url);
  
  // CRITICAL FIX: Don't cache Firebase Function calls
  if (url.pathname.includes('functions') || url.pathname.includes('performanceTest')) {
    try {
      return await fetch(request);
    } catch (error) {
      console.error('[Service Worker] Firebase Function fetch failed:', error);
      throw error;
    }
  }
  
  const cache = await caches.open(DATA_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Check if cached response is still valid
  if (cachedResponse && isCacheValid(cachedResponse, CACHE_DURATIONS.API)) {
    console.log('[Service Worker] Serving cached API response:', request.url);
    // Serve from cache immediately, then update in background
    updateCacheInBackground(request, cache);
    return cachedResponse;
  }
  
  // Fetch from network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      const responseClone = networkResponse.clone();
      await cache.put(request, responseClone);
      console.log('[Service Worker] Cached API response:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed - return cached version if available
    if (cachedResponse) {
      console.log('[Service Worker] Network failed, serving stale cache:', request.url);
      return cachedResponse;
    }
    throw error;
  }
}

// Phase 3: Static asset handler - Cache first for instant loading
async function handleStaticAssetRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('[Service Worker] Serving cached asset:', request.url);
    return cachedResponse;
  }
  
  // Not in cache - fetch and cache
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      console.log('[Service Worker] Cached new asset:', request.url);
    }
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Failed to fetch asset:', request.url, error);
    throw error;
  }
}

// Phase 3: Dashboard page handler with progressive enhancement
async function handleDashboardPageRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    console.log('[Service Worker] Serving cached page:', request.url);
    // Serve cached page immediately for instant loading
    updateCacheInBackground(request, cache);
    return cachedResponse;
  }
  
  // Fetch from network
  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    await cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

// Helper functions
function isFirebaseApiCall(url) {
  // Firebase hosts are handled by the early passthrough above; this function
  // only exists for legacy matchers. Always returns false now to prevent
  // accidental caching of Firebase traffic.
  return false;
}

function isStaticAsset(url) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(url.pathname);
}

function isDashboardPage(url) {
  return url.pathname.includes('dashboard') || url.pathname === '/' || url.pathname.includes('index.html');
}

function isCacheValid(response, maxAge) {
  const dateHeader = response.headers.get('date');
  if (!dateHeader) return false;
  
  const cacheDate = new Date(dateHeader);
  const now = new Date();
  return (now.getTime() - cacheDate.getTime()) < maxAge;
}

async function updateCacheInBackground(request, cache) {
  // Update cache in background without blocking response
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      console.log('[Service Worker] Background cache update:', request.url);
    }
  } catch (error) {
    console.log('[Service Worker] Background update failed:', request.url);
  }
}

// Phase 3: Message handling for cache management
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      Promise.all([
        caches.delete(CACHE_NAME),
        caches.delete(DATA_CACHE_NAME)
      ]).then(() => {
        console.log('[Service Worker] Cache cleared by request');
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[Service Worker] Phase 3 Performance Optimization Service Worker loaded');