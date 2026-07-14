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

// ── 3. Push Notification Handlers ────────────────────────────────
// Receives push events from backend alert_notifications.py
// Payload shape: { title, body/message, url/map_link, icon?, badge? }

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data?.json?.() || {};
  } catch (error) {
    payload = {};
  }

  const title = payload.title || 'DIS-RUPTURE Alert';
  const body  = payload.body || payload.message || 'A disruption alert was detected nearby.';

  const options = {
    body,
    icon:  payload.icon  || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag:   payload.tag   || 'dis-rupture-alert',
    renotify: true,
    data: {
      url: payload.url || payload.map_link || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
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
