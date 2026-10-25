/* ===========================================================
   BASE — focus sessions (Rojo's focus timer)
   "I'm studying for 45 minutes" -> a running session with a
   task and a countdown that can be paused, extended or ended.
   Stored on this device (localStorage), shared by every page
   and the Android agent window. In the Android app it also
   tells the native side (for off-task nudges and a "time's up"
   notification even when BASE is closed).
   =========================================================== */
window.BaseFocus = (function () {
  "use strict";
  const KEY = "base_focus";          // active session
  const HIST = "base_focus_hist";    // finished sessions (newest last)
  const CAP = window.Capacitor;
  const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const AG = NATIVE && CAP.Plugins ? CAP.Plugins.BaseAgent : null;
  const LN = NATIVE && CAP.Plugins ? CAP.Plugins.LocalNotifications : null;
  const DONE_NOTIF = 909001;
  const listeners = [];

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  function usedMs(s, now) { return s.accumMs + (s.resumedAt ? (now || Date.now()) - s.resumedAt : 0); }
  function status() {
    const s = read(KEY, null);
    if (!s) return { active: false };
    const now = Date.now();
    const used = usedMs(s, now);
    const remaining = Math.max(0, s.totalMs - used);
    return {
      active: true, task: s.task, totalMs: s.totalMs, usedMs: used, remainingMs: remaining,
      paused: !s.resumedAt, startedAt: s.startedAt, endsAt: s.resumedAt ? now + remaining : null,
      done: remaining <= 0, nudges: s.nudges || 0,
    };
  }
  function emit() {
    const st = status();
    listeners.forEach((fn) => { try { fn(st); } catch (e) {} });
    syncNative(st);
  }
  function syncNative(st) {
    if (AG && AG.setFocus) AG.setFocus({ active: !!(st.active && !st.paused && !st.done), task: st.task || "", endsAt: st.endsAt || 0, startedAt: st.startedAt || 0 }).catch(() => {});
    if (!LN) return;
    LN.cancel({ notifications: [{ id: DONE_NOTIF }] }).catch(() => {}).then(() => {
      if (st.active && !st.paused && st.endsAt && st.endsAt > Date.now() + 1000) {
        LN.schedule({ notifications: [{ id: DONE_NOTIF, title: "Rojo: time's up!", body: `Nice work on "${st.task}". Come say hi.`, schedule: { at: new Date(st.endsAt), allowWhileIdle: true }, extra: { url: "rojo.html" } }] }).catch(() => {});
      }
    });
  }

  function start(task, minutes) {
    const mins = Math.max(1, Math.min(240, Math.round(+minutes || 30)));
    const now = Date.now();
    write(KEY, { task: String(task || "Focus").slice(0, 80), totalMs: mins * 60000, startedAt: now, accumMs: 0, resumedAt: now, nudges: 0 });
    emit();
    return status();
  }
  function pause() {
    const s = read(KEY, null);
    if (!s || !s.resumedAt) return status();
    s.accumMs = usedMs(s); s.resumedAt = null; write(KEY, s); emit();
    return status();
  }
  function resume() {
    const s = read(KEY, null);
    if (!s || s.resumedAt) return status();
    s.resumedAt = Date.now(); write(KEY, s); emit();
    return status();
  }
  function extend(minutes) {
    const s = read(KEY, null);
    if (!s) return status();
    s.totalMs += Math.max(1, Math.min(120, Math.round(+minutes || 5))) * 60000;
    write(KEY, s); emit();
    return status();
  }
  // Ends the session (early or because time ran out) and records it.
  function end(reason) {
    const st = status();
    if (!st.active) return null;
    const entry = { task: st.task, plannedMin: Math.round(st.totalMs / 60000), focusedMin: Math.round(st.usedMs / 60000),
      completed: st.remainingMs <= 0 || reason === "done", endedAt: Date.now(), nudges: st.nudges || 0 };
    const h = read(HIST, []);
    h.push(entry);
    write(HIST, h.slice(-60));
    write(KEY, null);
    emit();
    return entry;
  }
  function addNudge() { const s = read(KEY, null); if (s) { s.nudges = (s.nudges || 0) + 1; write(KEY, s); } }
  function history() { return read(HIST, []); }
  function onChange(fn) { listeners.push(fn); }
  function fmt(ms) {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }
  // Another page or the agent window changed it.
  window.addEventListener("storage", (e) => { if (e.key === KEY) emit(); });

  return { status, start, pause, resume, extend, end, addNudge, history, onChange, fmt, _emit: emit };
})();
