// Kill-switch service worker — v4 (2026-06-23)
// Bumped to force returning clients to fetch this file, activate it, and have it
// unregister itself + flush caches. Any byte change in this file triggers update.
const SW_VERSION = 'kill-switch-v4-2026-06-23';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      await self.clients.claim();

      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(clients.map((client) => {
        const url = new URL(client.url);
        url.searchParams.set('sw-cleanup', SW_VERSION);
        return client.navigate(url.toString());
      }));
    } finally {
      await self.registration.unregister();
    }
  })());
});
