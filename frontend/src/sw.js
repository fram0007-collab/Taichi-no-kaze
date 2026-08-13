/**
 * DIS-RUPTURE Service Worker
 * Combines:
 *   1. Workbox precaching (injected by vite-plugin-pwa at build time)
 *   2. Runtime caching strategies (map tiles, API, fonts)
 *   3. Push notification handlers (alert notifications from backend)
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ── 1. Precaching ─────────────────────────────────────────────────
// vite-plugin-pwa injects the manifest here at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── 2. Runtime Caching ────────────────────────────────────────────

// Map tiles — Cache First, 7 days
// CARTO tiles rarely change; serve from cache for fast map rendering
registerRoute(
  ({ url }) => url.hostname.endsWith('.basemaps.cartocdn.com'),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
    ],
  })
);

// Vercel API endpoints — Network First, 8s timeout, 5min cache
// Always try live data first; fall back to cached alerts if offline
registerRoute(
  ({ url }) =>
    url.hostname === 'taichi-no-kaze.vercel.app' &&
    url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 8,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  })
);

// Google Fonts — Cache First, 1 year
registerRoute(
  ({ url }) =>
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  })
);

// External tile providers (OpenStreetMap fallback, Leaflet CDN)
registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.openstreetmap.org') ||
    url.hostname === 'unpkg.com',
  new StaleWhileRevalidate({
    cacheName: 'external-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// ── 3. Push Notification Handlers & On-Device Geofence ────────────
const DB_NAME = 'disrupture_location_db';
const STORE_NAME = 'user_location';
const LOCATION_KEY = 'latest';
const MAX_STALENESS_MS = 30 * 60 * 1000; // 30 minutes

function readLocationFromIDB() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => resolve(null);
    request.onsuccess = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(LOCATION_KEY);
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => resolve(null);
    };
  });
}

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's mean radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data?.json?.() || {};
      } catch (error) {
        payload = {};
      }

      const zoneLat = Number(payload.zone_lat);
      const zoneLng = Number(payload.zone_lng);
      const thresholdKm = Number(payload.threshold_km) || 2.0;

      const cachedLocation = await readLocationFromIDB();
      let shouldShow = true;
      let bodyText = payload.body || payload.message || 'A disruption alert was detected nearby.';

      if (Number.isFinite(zoneLat) && Number.isFinite(zoneLng)) {
        const isStale = !cachedLocation || !cachedLocation.timestamp || (Date.now() - cachedLocation.timestamp > MAX_STALENESS_MS);

        if (isStale) {
          // Missing or stale location fallback: Deliver original notification payload text containing {disruption_type} at {zone_name}
          bodyText = payload.body || payload.message || 'A disruption alert was detected nearby.';
          shouldShow = true;
        } else {
          const userLat = Number(cachedLocation.lat);
          const userLng = Number(cachedLocation.lng);
          if (Number.isFinite(userLat) && Number.isFinite(userLng)) {
            const distance = calculateHaversineKm(userLat, userLng, zoneLat, zoneLng);
            if (distance > thresholdKm) {
              shouldShow = false;
              console.log(`[SW Geofence] Suppressing notification: user is ${distance.toFixed(1)}km away (threshold: ${thresholdKm}km)`);
            }
          }
        }
      }

      if (!shouldShow) {
        return;
      }

      const title = payload.title || 'DIS-RUPTURE Alert';
      const options = {
        body: bodyText,
        icon:  payload.icon  || '/icons/icon-192.png',
        badge: payload.badge || '/icons/icon-192.png',
        tag:   payload.tag   || 'dis-rupture-alert',
        renotify: true,
        data: {
          url: payload.url || payload.map_link || '/',
        },
      };

      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';
  const url = new URL(targetUrl, self.location.origin).toString();

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
        return Promise.resolve();
      })
  );
});

// ── 4. Auto-update: skip waiting so new SW activates immediately ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
