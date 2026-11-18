self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Sabor Goo Maldonado',
    body: 'Tienes una actualización de tu pedido.',
    url: '/',
    badgeCount: 1,
    tag: 'sabor-goo-alert',
    playAlertSound: true,
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text();
    }
  }

  const badgePromise =
    typeof navigator !== 'undefined' && 'setAppBadge' in navigator
      ? navigator.setAppBadge(data.badgeCount || 1).catch(() => {})
      : Promise.resolve();

  const notifyClientsPromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        client.postMessage({
          type: 'SABOR_GOO_PUSH_SOUND',
          payload: data,
        });
      }
    });

  const showNotificationPromise = self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'sabor-goo-notif',
    renotify: true,
    vibrate:,
    data: { url: data.url || '/' },
  });

  event.waitUntil(
    Promise.all([badgePromise, notifyClientsPromise, showNotificationPromise])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
