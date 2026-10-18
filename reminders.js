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

  // Android app (Capacitor): the WebView has no web Notification API, so
  // reminders are real scheduled Android notifications instead, and the
  // floating agent's nudge pill is kept in sync from here.
  const CAP = window.Capacitor;
  const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const LN = NATIVE && CAP.Plugins ? CAP.Plugins.LocalNotifications : null;
  const AGENT = NATIVE && CAP.Plugins ? CAP.Plugins.BaseAgent : null;
  const LN_IDS = "base_ln_ids";
  const LN_PERM = "base_ln_perm";
  const money2 = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    if (LN) {
      let perm = await LN.checkPermissions().catch(() => ({ display: "prompt" }));
      if (perm.display !== "granted") perm = await LN.requestPermissions().catch(() => ({ display: "denied" }));
      setLnPerm(perm.display);
      const ok = perm.display === "granted";
      st.budget.remind.enabled = ok;
      if (daysBefore != null) st.budget.remind.daysBefore = daysBefore;
      S.save(st); // the save hook reschedules
      return ok;
    }
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
    if (LN) return { enabled: !!c.enabled, daysBefore: c.daysBefore == null ? 3 : c.daysBefore, supported: true, permission: lnPerm() };
    return {
      enabled: !!c.enabled,
      daysBefore: c.daysBefore == null ? 3 : c.daysBefore,
      supported: ("Notification" in window),
      permission: ("Notification" in window) ? Notification.permission : "unsupported",
    };
  }

  // ---------- Android: scheduled notifications ----------
  function lnPerm() { try { return localStorage.getItem(LN_PERM) || "prompt"; } catch (e) { return "prompt"; } }
  function setLnPerm(p) { try { localStorage.setItem(LN_PERM, p); } catch (e) {} }
  function notifId(key) {
    let h = 7;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return (h & 0x7fffffff) || 1;
  }
  function at9(date, minusDays) {
    const d = new Date(date); d.setDate(d.getDate() - (minusDays || 0)); d.setHours(9, 0, 0, 0);
    return d;
  }
  function whenText(days) {
    return days === 0 ? "due today" : days === 1 ? "due tomorrow" : "due in " + days + " days";
  }
  // Every reminder for the next ~2 months: a heads-up daysBefore, and one on the day.
  function nativeSchedule(st) {
    const b = st.budget || {};
    const c = b.remind || {};
    const before = c.daysBefore == null ? 3 : +c.daysBefore;
    const now = Date.now(), horizon = now + 62 * 86400000;
    const out = [];
    S.dueList(b).forEach((d) => {
      const occ = [{ date: d.date, key: d.cycleKey }];
      if (!/yearly/.test(d.kind)) {
        const nx = S.occDate(findDom(b, d.itemId) || d.date.getDate(), d.date.getFullYear(), d.date.getMonth() + 1);
        occ.push({ date: nx, key: S.cycleKeyFor(nx, false) });
      }
      occ.forEach((o) => {
        const fire = [];
        if (before > 0) fire.push({ at: at9(o.date, before), title: d.label + " " + whenText(before), tag: "b" });
        fire.push({ at: at9(o.date, 0), title: d.label + " due today", tag: "d" });
        fire.forEach((f) => {
          const t = f.at.getTime();
          if (t <= now || t > horizon) return;
          out.push({
            id: notifId(d.itemId + "|" + o.key + "|" + f.tag),
            title: "BASE — " + f.title,
            body: money2(d.amount) + " · " + d.kind,
            channelId: "bills",
            schedule: { at: f.at, allowWhileIdle: true },
            extra: { url: "Budget.html" },
          });
        });
      });
    });
    return out;
  }
  function findDom(b, id) {
    const all = [].concat(b.bills || [], b.subscriptions || [], b.accounts || []);
    const it = all.find((x) => x.id === id);
    return it ? +it.due : null;
  }
  let lnTimer = 0, channelMade = false;
  function syncNative(state) {
    if (!LN) return;
    clearTimeout(lnTimer);
    lnTimer = setTimeout(async () => {
      try {
        const st = state || S.load();
        let old = [];
        try { old = JSON.parse(localStorage.getItem(LN_IDS)) || []; } catch (e) { old = []; }
        if (old.length) await LN.cancel({ notifications: old.map((id) => ({ id })) }).catch(() => {});
        const on = st.budget && st.budget.remind && st.budget.remind.enabled;
        if (!on) { localStorage.setItem(LN_IDS, "[]"); return; }
        const perm = await LN.checkPermissions().catch(() => ({ display: lnPerm() }));
        setLnPerm(perm.display);
        if (perm.display !== "granted") return;
        if (!channelMade) {
          await LN.createChannel({ id: "bills", name: "Bill reminders", description: "Heads-ups before bills are due", importance: 4, visibility: 1 }).catch(() => {});
          channelMade = true;
        }
        const list = nativeSchedule(st);
        if (list.length) await LN.schedule({ notifications: list });
        localStorage.setItem(LN_IDS, JSON.stringify(list.map((n) => n.id)));
      } catch (e) {}
    }, 400);
  }

  // ---------- Android: agent nudge pill ----------
  function computeNudge(st) {
    const b = (st && st.budget) || {};
    const list = S.dueList(b);
    const over = list.filter((d) => d.overdue);
    if (over.length === 1) return { text: over[0].label + " is overdue · " + money2(over[0].amount), tone: "bad" };
    if (over.length > 1) return { text: over.length + " bills overdue · " + money2(over.reduce((s, d) => s + d.amount, 0)), tone: "bad" };
    const now = new Date();
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0); eom.setHours(23, 59, 59, 999);
    const left = list.filter((d) => d.date <= eom).reduce((s, d) => s + d.amount, 0);
    const cash = (b.accounts || []).filter((a) => a.type === "debit").reduce((s, a) => s + (+a.balance || 0), 0);
    if (left > cash) return { text: "Short " + money2(left - cash) + " for this month's bills", tone: "bad" };
    const soon = list.filter((d) => d.daysUntil >= 0 && d.daysUntil <= 2);
    if (soon.length) return { text: soon[0].label + " " + whenText(soon[0].daysUntil) + " · " + money2(soon[0].amount), tone: "warn" };
    return { text: "", tone: "info" };
  }
  function syncNudge(state) {
    if (!AGENT) return;
    try { const n = computeNudge(state || S.load()); AGENT.setNudge(n).catch(() => {}); } catch (e) {}
  }

  function boot() {
    const st = S.load();
    if (NATIVE) {
      S.onSave((s2) => { syncNative(s2); syncNudge(s2); });
      syncNative(st);
      syncNudge(st);
      return;
    }
    mirrorSchedule(st);
    if (st.budget && st.budget.remind && st.budget.remind.enabled) {
      registerPeriodic();
      setTimeout(notifyNow, 1200); // let the SW settle on fresh loads
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.BaseReminders = { pending, notifyNow, mirrorSchedule, enable, disable, setDays, status, computeNudge, native: NATIVE };
})();
