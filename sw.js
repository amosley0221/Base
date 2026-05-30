/* ===========================================================
   BASE — service worker (offline app shell + installability)
   Caches the static app shell; lets live API calls
   (ESPN scores, Open-Meteo weather) go straight to the network.
   =========================================================== */
const CACHE = "base-shell-v1";
const SHELL = [
  "/Home.html",
  "/app.css",
  "/home.css",
  "/store.js",
  "/sports.js",
  "/home.js",
  "/theme.js",
  "/cursor.js",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-180.png",
  "/icon-32.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll is atomic; cache files individually so one miss can't abort install
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Cross-origin (weather / sports APIs, team logos) — always go to network.
  if (url.origin !== self.location.origin) return;

  // App navigations resolve to the Home shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/Home.html").then((r) => r || caches.match(req)))
    );
    return;
  }

  // Same-origin assets: cache-first, then refresh the cache in the background.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
