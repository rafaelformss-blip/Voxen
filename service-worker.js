const CACHE_NAME = "voxen-shell-v3-20261010";
const APP_SHELL = ["/", "/index.html", "/styles.css?v=20261010-5", "/app.js?v=20261010-5", "/manifest.json", "/icon.svg"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(fetch(request).then((response) => {
    if (response && response.ok && (request.mode === "navigate" || APP_SHELL.some((asset) => new URL(asset, self.location.origin).pathname === url.pathname))) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (await caches.match("/index.html"))));
});