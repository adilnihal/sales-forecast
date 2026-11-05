// Minimal service worker so the app can be installed. It never caches anything,
// so bills, stock and GST are always fresh from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
