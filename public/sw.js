// Minimal service worker so Chrome on Android can install the page as an app. It never caches:
// every request goes to the network, so the newest version is always what opens.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));
