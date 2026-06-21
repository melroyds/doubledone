// DoubleDone web-push service worker. It receives the daily nudge as a PAYLOADLESS push
// (the server sends no body, only a VAPID-signed ping) and shows a static, calm message
// that lives here, so no task content is ever sent to the browser. Tapping it focuses the
// open app, or opens it. Served at /sw.js from the web root (client/public).

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('DoubleDone', {
      body: 'Your today is here when you are ready.',
      tag: 'doubledone-daily',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      return self.clients.openWindow('/');
    }),
  );
});
