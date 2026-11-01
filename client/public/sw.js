// DoubleDone web-push service worker. It receives the daily nudge as a PAYLOADLESS push
// (the server sends no body, only a VAPID-signed ping) and shows a static, calm message
// that lives here, so no task content is ever sent to the browser. Tapping it focuses the
// open app, or opens it. Served at /sw.js from the web root (client/public).

// The daily line in each of the app's languages: the catalogues' reminders.dailyTitle and
// reminders.dailyBody. A service worker cannot import the app's bundle, so these are copies,
// and client/src/lib/service-worker.test.ts holds every one equal to its catalogue.
const DAILY_TITLE = 'DoubleDone';
const DAILY_BODY = {
  en: 'Your today is here when you are ready.',
  de: 'Dein Heute ist da, wenn du so weit bist.',
  es: 'Tu Hoy está aquí para cuando quieras.',
  fr: 'Ton aujourd’hui est là quand tu veux.',
  it: 'Il tuo Oggi è qui, quando vuoi.',
};

// The app's own rule (lib/locale, through expo-localization, and the landing page's boot): the
// browser's FIRST preferred language if it is one of ours, else English. Read at each push, so a
// language changed after the reminder was turned on is followed. Until 2026-11-01 it was always English.
function dailyBody() {
  const nav = self.navigator || {};
  const langs = nav.languages && nav.languages.length ? nav.languages : [nav.language];
  const first = String(langs[0] || '').slice(0, 2).toLowerCase();
  return Object.prototype.hasOwnProperty.call(DAILY_BODY, first) ? DAILY_BODY[first] : DAILY_BODY.en;
}

// A new version of this file takes over at once. Without these two, an updated worker waited until
// every DoubleDone tab had closed, which for an installed web app or a pinned tab can be never, so
// the old one kept showing the old line. Safe because this worker caches nothing and has no fetch
// handler: taking over changes no request any page makes.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification(DAILY_TITLE, {
      body: dailyBody(),
      // One reminder at a time: a new day's replaces one still unread (the tag), and renotify makes
      // the replacement sound and show again. Without it, from the second unread day the reminder was
      // swapped in silently, with no sound, no vibration and no banner.
      tag: 'doubledone-daily',
      renotify: true,
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
