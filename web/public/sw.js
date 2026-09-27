// Deliberately does nothing: no caching, every request goes to the network.
// It exists only so older Android Chrome builds treat the dashboard as
// installable. The Mini must still be reachable — there is no offline mode.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
