/* ===========================================================
   BASE — service worker (offline app shell)
   Cache-first with runtime caching; ignores query strings so
   cache-busted URLs still resolve offline. localStorage (your
   data) is separate and untouched by cache updates.
   =========================================================== */
const CACHE = "base-cache-v4";
const CORE = [
  "Home.html", "Plan.html", "Notes.html", "Calendar.html", "Budget.html",
  "School.html", "Scoreboard.html", "Settings.html", "Report.html",
  "app.css", "home.css", "school.css", "scoreboard.css", "report.css",
  "store.js", "home.js", "plan.js", "notes.js", "calendar.js", "budget.js",
  "school.js", "scoreboard.js", "sports.js", "ui.js", "theme.js", "cursor.js",
  "pwa.js", "settings.js", "report.js", "ai.js",
  "manifest.webmanifest", "icons/base-192.png", "icons/base-512.png", "icons/base-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // let cross-origin (ESPN scores, weather APIs) always hit the network
  if (url.origin !== self.location.origin) return;

  const isDoc = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

  if (isDoc) {
    // network-first for pages, so updates show immediately when online
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("Home.html", { ignoreSearch: true })))
    );
    return;
  }

  // stale-while-revalidate for static assets: instant + offline, updates next load
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const fetchP = fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || fetchP;
    })
  );
});
