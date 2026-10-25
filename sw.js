/* ===========================================================
   BASE — service worker (offline app shell)
   Cache-first with runtime caching; ignores query strings so
   cache-busted URLs still resolve offline. localStorage (your
   data) is separate and untouched by cache updates.
   =========================================================== */
const CACHE = "base-cache-v32";
const REMINDERS_CACHE = "base-reminders"; // SW-readable schedule mirror (kept across updates)
const CORE = [
  "Home.html", "Plan.html", "Notes.html", "Calendar.html", "Budget.html",
  "School.html", "Scoreboard.html", "Settings.html", "Report.html",
  "app.css", "home.css", "school.css", "scoreboard.css", "report.css",
  "store.js", "home.js", "plan.js", "notes.js", "calendar.js", "budget.js",
  "school.js", "scoreboard.js", "sports.js", "ui.js", "theme.js", "cursor.js",
  "pwa.js", "settings.js", "report.js", "ai.js", "reminders.js", "onboard.js", "sync.js", "focus.js", "rojo-face.js", "rojo-nav.js", "rojo.html", "rojo.css", "rojo.js", "agent-core.js", "pclink.js", "vendor/anthropic.js",
  "manifest.webmanifest", "icons/base-192.png", "icons/base-512.png", "icons/base-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  const KEEP = [CACHE, REMINDERS_CACHE];
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

/* ---- bill reminders: background check + notification click ---- */
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "base-bill-reminders") e.waitUntil(checkReminders());
});
// one-shot background sync fallback (some browsers only expose this)
self.addEventListener("sync", (e) => {
  if (e.tag === "base-bill-reminders") e.waitUntil(checkReminders());
});

async function checkReminders() {
  try {
    const c = await caches.open(REMINDERS_CACHE);
    const res = await c.match("/__reminders.json");
    if (!res) return;
    const data = await res.json();
    if (!data || !data.cfg || !data.cfg.enabled) return;
    const win = data.cfg.daysBefore == null ? 3 : data.cfg.daysBefore;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = (data.items || []).filter((it) => {
      const d = new Date(it.date); d.setHours(0, 0, 0, 0);
      const days = Math.round((d - today) / 86400000);
      return it.overdue || (days >= 0 && days <= win);
    });
    if (!due.length) return;

    let log = {};
    const logRes = await c.match("/__notiflog.json");
    if (logRes) { try { log = await logRes.json(); } catch (e) { log = {}; } }
    const key = today.toISOString().slice(0, 10);
    const fresh = due.filter((it) => log[it.itemId] !== key);
    if (!fresh.length) return;
    fresh.forEach((it) => (log[it.itemId] = key));
    await c.put("/__notiflog.json", new Response(JSON.stringify(log), { headers: { "Content-Type": "application/json" } }));

    const money = (n) => "$" + Math.round(n).toLocaleString();
    const total = fresh.reduce((s, it) => s + (it.amount || 0), 0);
    const title = fresh.length === 1 ? "BASE — " + fresh[0].label : "BASE — " + fresh.length + " bills due soon";
    const body = fresh.length === 1
      ? money(fresh[0].amount) + " · " + (fresh[0].overdue ? "overdue" : "due soon")
      : fresh.slice(0, 4).map((f) => f.label).join(", ") + (fresh.length > 4 ? "…" : "") + " · " + money(total) + " total";
    await self.registration.showNotification(title, {
      body, tag: "base-bills", renotify: true,
      icon: "icons/base-192.png", badge: "icons/base-192.png", data: { url: "Budget.html" },
    });
  } catch (e) {}
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "Home.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) { if (w.navigate) { try { w.navigate(url); } catch (e) {} } return w.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // let cross-origin (ESPN scores, weather APIs) always hit the network
  if (url.origin !== self.location.origin) return;

  // Network-first for EVERYTHING same-origin, so a deploy's HTML + CSS + JS
  // always refresh together (no new-page-with-old-styles mismatch). A short
  // timeout falls back to cache so slow networks / offline never hang.
  e.respondWith(networkFirst(req));
});

function timedFetch(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

async function networkFirst(req) {
  try {
    const res = await timedFetch(req, 4500);
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  } catch (e) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") {
      const home = await caches.match("Home.html", { ignoreSearch: true });
      if (home) return home;
    }
    throw e;
  }
}
