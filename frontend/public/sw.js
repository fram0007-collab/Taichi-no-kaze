self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data?.json?.() || {};
  } catch (error) {
    payload = {};
  }

  const title = payload.title || 'DIS-RUPTURE Alert';
  const body = payload.body || payload.message || 'A disruption alert was detected nearby.';
  const options = {
    body,
    data: {
      url: payload.url || payload.map_link || '/',
    },
  };

  if (payload.icon) {
    options.icon = payload.icon;
  }
  if (payload.badge) {
    options.badge = payload.badge;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';
  const url = new URL(targetUrl, self.location.origin).toString();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
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
