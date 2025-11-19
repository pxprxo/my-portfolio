// Service Worker for earthquake monitoring site
const CACHE_NAME = 'earthquake-app-v1.1.0';
const STATIC_CACHE = 'static-v1.1.0';
const DATA_CACHE = 'data-v1.1.0';

// Assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/script.js',
    '/mobile-sharing.js',
    '/tablet-support.js',
    '/performance-optimizer.js',
    '/fast-loader.js',
    '/picture/Ellipse 3.png',
    '/picture/line.png',
    '/picture/telegram.png',
    '/picture/discord.png'
];

// Data URLs to cache
const DATA_URLS = [
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    'https://api.allorigins.win/get',
    'https://earthquake.tmd.go.th/feed/rss_tmd.xml'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('Caching static assets...');
                return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { credentials: 'same-origin' })));
            })
            .then(() => {
                console.log('Static assets cached successfully');
                self.skipWaiting();
            })
            .catch((error) => {
                console.error('Error caching static assets:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== STATIC_CACHE && cacheName !== DATA_CACHE) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker activated');
            self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip service worker for CORS proxy requests (allorigins.win)
    if (url.hostname.includes('allorigins.win')) {
        console.log('Bypassing service worker for CORS proxy:', request.url);
        return; // Let browser handle it directly
    }

    // Skip service worker for external API requests
    if (url.hostname.includes('earthquake.usgs.gov') || 
        url.hostname.includes('earthquake.tmd.go.th')) {
        console.log('Bypassing service worker for external API:', request.url);
        return; // Let browser handle it directly
    }

    // Handle Google Maps API requests - network only
    if (url.hostname.includes('maps.googleapis.com') || 
        url.hostname.includes('maps.gstatic.com')) {
        event.respondWith(fetch(request));
        return;
    }

    // Handle static assets with cache-first strategy
    if (request.destination === 'document' || 
        request.destination === 'script' || 
        request.destination === 'style' ||
        request.destination === 'image') {
        event.respondWith(
            cacheFirstStrategy(request)
        );
        return;
    }

    // Default to network for other requests
    event.respondWith(fetch(request));
});

// Cache-first strategy for static assets
async function cacheFirstStrategy(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('Serving from cache:', request.url);
            return cachedResponse;
        }

        console.log('Cache miss, fetching from network:', request.url);
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Cache-first strategy failed:', error);
        
        // Try to return cached response
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return a simple error response
        return new Response('Network error', { 
            status: 408, 
            statusText: 'Network Request Failed' 
        });
    }
}

// Network-first strategy for dynamic content
async function networkFirstStrategy(request) {
    try {
        console.log('Network-first for:', request.url);
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(DATA_CACHE);
            cache.put(request, networkResponse.clone());
            console.log('Cached network response:', request.url);
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network failed, trying cache:', request.url);
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            console.log('Serving stale data from cache:', request.url);
            return cachedResponse;
        }
        
        console.error('Network-first strategy failed completely:', error);
        throw error;
    }
}

// Background sync for data updates
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync-earthquake-data') {
        console.log('Background sync triggered for earthquake data');
        event.waitUntil(updateEarthquakeData());
    }
});

// Update earthquake data in background
async function updateEarthquakeData() {
    try {
        const dataUrls = [
            'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
        ];
        
        for (const url of dataUrls) {
            const response = await fetch(url);
            if (response.ok) {
                const cache = await caches.open(DATA_CACHE);
                await cache.put(url, response.clone());
                console.log('Updated cached data:', url);
            }
        }
        
        // Notify clients about data update
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'DATA_UPDATED',
                message: 'Earthquake data has been updated'
            });
        });
        
    } catch (error) {
        console.error('Background sync failed:', error);
    }
}

// Handle push notifications (if implemented)
self.addEventListener('push', (event) => {
    console.log('Push notification received');
    
    const options = {
        body: 'New earthquake data available',
        icon: '/picture/Ellipse 3.png',
        badge: '/picture/Ellipse 3.png',
        tag: 'earthquake-update',
        requireInteraction: false,
        actions: [
            {
                action: 'view',
                title: 'View Details'
            },
            {
                action: 'dismiss',
                title: 'Dismiss'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Earthquake Alert', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'view') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});
