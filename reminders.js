/* ===========================================================
   BASE — bill reminders + notifications
   Loaded on every page so opening the app anywhere catches up
   on due/overdue bills. Background delivery (when the app is
   closed) is best-effort via Periodic Background Sync where the
   browser supports it; the on-open check guarantees you never
   miss a reminder for long.
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store;
  if (!S) return;
  const LOG_KEY = "base_notif_log"; // { "itemId|cycleKey": "YYYY-MM-DD" }

  function cfg() {
    const st = S.load();
    return (st.budget && st.budget.remind) || { enabled: false, daysBefore: 3 };
  }
  function todayISO() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  const money = (n) => "$" + Math.round(n).toLocaleString();

  // Due or overdue items inside the reminder window.
  function pending(state) {
    const st = state || S.load();
    const c = (st.budget && st.budget.remind) || {};
    const win = c.daysBefore == null ? 3 : c.daysBefore;
    return S.dueList(st.budget || {}).filter((d) => d.overdue || (d.daysUntil >= 0 && d.daysUntil <= win));
  }

  // Mirror the full schedule into the Cache so the service worker can
  // check it in the background (SW can't read localStorage).
  function mirrorSchedule(state) {
    try {
      if (!("caches" in window)) return;
      const st = state || S.load();
      const items = S.dueList(st.budget || {}).map((d) => ({
        itemId: d.itemId, label: d.label, kind: d.kind, amount: d.amount,
        date: d.date.toISOString(), overdue: d.overdue,
      }));
      const payload = JSON.stringify({ cfg: (st.budget && st.budget.remind) || {}, items });
      caches.open("base-reminders").then((c) =>
        c.put("/__reminders.json", new Response(payload, { headers: { "Content-Type": "application/json" } }))
      ).catch(() => {});
    } catch (e) {}
  }

  function notifyNow() {
    const c = cfg();
    if (!c.enabled) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const items = pending();
    if (!items.length) return;
    let log = {};
    try { log = JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch (e) { log = {}; }
    const today = todayISO();
    const fresh = items.filter((d) => log[d.itemId + "|" + d.cycleKey] !== today);
    if (!fresh.length) return;
    fresh.forEach((d) => (log[d.itemId + "|" + d.cycleKey] = today));
    try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch (e) {}

    let title, body;
    if (fresh.length === 1) {
      const d = fresh[0];
      const when = d.overdue ? "overdue" : d.daysUntil === 0 ? "due today" : d.daysUntil === 1 ? "due tomorrow" : "due in " + d.daysUntil + " days";
      title = "BASE — " + d.label + " " + when;
      body = money(d.amount) + " · " + d.kind;
    } else {
      const total = fresh.reduce((s, d) => s + d.amount, 0);
      title = "BASE — " + fresh.length + " bills need attention";
      body = fresh.slice(0, 4).map((d) => d.label + " " + (d.overdue ? "(overdue)" : d.daysUntil === 0 ? "(today)" : "(" + d.daysUntil + "d)")).join(", ")
        + (fresh.length > 4 ? "…" : "") + " · " + money(total) + " total";
    }
    const opts = { body, tag: "base-bills", renotify: true, icon: "icons/base-192.png", badge: "icons/base-192.png", data: { url: "Budget.html" } };
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opts)).catch(() => { try { new Notification(title, opts); } catch (e) {} });
      } else { new Notification(title, opts); }
    } catch (e) { try { new Notification(title, opts); } catch (_) {} }
  }

  async function registerPeriodic() {
    try {
      if (!navigator.serviceWorker) return;
      const reg = await navigator.serviceWorker.ready;
      if (!("periodicSync" in reg)) return;
      let state = "granted";
      try { state = (await navigator.permissions.query({ name: "periodic-background-sync" })).state; } catch (e) {}
      if (state === "denied") return;
      await reg.periodicSync.register("base-bill-reminders", { minInterval: 12 * 60 * 60 * 1000 }).catch(() => {});
    } catch (e) {}
  }

  async function enable(daysBefore) {
    const st = S.load();
    st.budget = st.budget || {};
    st.budget.remind = st.budget.remind || {};
    if (("Notification" in window) && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (e) {}
    }
    const granted = ("Notification" in window) && Notification.permission === "granted";
    st.budget.remind.enabled = granted;
    if (daysBefore != null) st.budget.remind.daysBefore = daysBefore;
    S.save(st);
    mirrorSchedule(st);
    if (granted) { registerPeriodic(); notifyNow(); }
    return granted;
  }
  function disable() {
    const st = S.load();
    st.budget = st.budget || {}; st.budget.remind = st.budget.remind || {};
    st.budget.remind.enabled = false;
    S.save(st);
  }
  function setDays(n) {
    const st = S.load();
    st.budget = st.budget || {}; st.budget.remind = st.budget.remind || { enabled: false };
    st.budget.remind.daysBefore = n;
    S.save(st); mirrorSchedule(st);
  }
  function status() {
    const c = cfg();
    return {
      enabled: !!c.enabled,
      daysBefore: c.daysBefore == null ? 3 : c.daysBefore,
      supported: ("Notification" in window),
      permission: ("Notification" in window) ? Notification.permission : "unsupported",
    };
  }

  function boot() {
    const st = S.load();
    mirrorSchedule(st);
    if (st.budget && st.budget.remind && st.budget.remind.enabled) {
      registerPeriodic();
      setTimeout(notifyNow, 1200); // let the SW settle on fresh loads
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.BaseReminders = { pending, notifyNow, mirrorSchedule, enable, disable, setDays, status };
})();
