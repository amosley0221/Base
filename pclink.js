/* ===========================================================
   BASE — live link to Rojo Desktop (same Wi-Fi)
   The PC publishes its local address and a secret inside BASE's
   encrypted sync; the phone connects directly. Every message is
   encrypted (AES-256-GCM, key = SHA-256 of that secret). Over the
   link the PC streams its mouse position (Rojo's eyes follow it)
   and runs the computer actions Rojo on the phone asks for.
   =========================================================== */
window.PcLink = (function () {
  "use strict";
  const S = window.Store;
  const PC_KEY = "base_rojo_pc";
  let ws = null, key = null, dev = null, connected = false, connecting = null;
  let seq = 0, retry = 0, wanted = false;
  const pending = new Map();
  // A secure web page (the iPhone app from the web) can't open ws:// to the PC; the Android app can.
  const CAP = window.Capacitor;
  const usable = location.protocol !== "https:" || !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const cursorFns = [], statusFns = [];

  function b64(buf) { const a = new Uint8Array(buf); let s = ""; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  async function makeKey(secret) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
    return crypto.subtle.importKey("raw", d, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  async function enc(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return b64(out);
  }
  async function dec(str) {
    const b = unb64(str);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, key, b.subarray(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // The computer to use: the one picked in Settings, else any that's set up.
  function device() {
    if (!S || !usable || typeof WebSocket === "undefined") return null;
    const st = S.load();
    const devs = ((st.rojo && st.rojo.devices) || []).filter((d) => d.lanKey && d.lanUrls && d.lanUrls.length);
    let pref = "windows";
    try { pref = localStorage.getItem(PC_KEY) || "windows"; } catch (e) {}
    return devs.find((d) => d.id === pref) || devs[0] || null;
  }
  function emit() { statusFns.forEach((f) => { try { f(connected, dev); } catch (e) {} }); }

  function openOne(url) {
    return new Promise((resolve, reject) => {
      let sock;
      try { sock = new WebSocket(url); } catch (e) { reject(e); return; }
      const t = setTimeout(() => { try { sock.close(); } catch (e) {} reject(new Error("timeout")); }, 3500);
      let welcomed = false;
      sock.onopen = async () => { try { sock.send(await enc({ type: "hello", t: Date.now() })); } catch (e) { reject(e); } };
      sock.onmessage = async (ev) => {
        let m;
        try { m = await dec(ev.data); } catch (e) { return; }
        if (!welcomed) {
          if (m.type === "welcome") { welcomed = true; clearTimeout(t); resolve(sock); }
          return;
        }
        if (m.type === "cursor") cursorFns.forEach((f) => { try { f(m.x, m.y); } catch (e) {} });
        else if (m.type === "result" && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); p(m); }
      };
      sock.onerror = () => { if (!welcomed) { clearTimeout(t); reject(new Error("refused")); } };
      sock.onclose = () => {
        if (!welcomed) { clearTimeout(t); reject(new Error("closed")); return; }
        if (ws === sock) {
          ws = null; connected = false; emit();
          pending.forEach((p) => p({ ok: false, error: "Lost the connection to your computer." }));
          pending.clear();
          if (wanted) setTimeout(() => connect(), Math.min(30000, 2000 * ++retry));
        }
      };
    });
  }

  async function connect() {
    wanted = true;
    if (connected) return true;
    if (connecting) return connecting;
    connecting = (async () => {
      dev = device();
      if (!dev || !window.crypto || !crypto.subtle) return false;
      key = await makeKey(dev.lanKey);
      for (const url of dev.lanUrls) {
        try {
          ws = await openOne(url);
          connected = true; retry = 0; emit();
          return true;
        } catch (e) { /* try the next address */ }
      }
      if (wanted) setTimeout(() => { if (!connected) connect(); }, Math.min(30000, 5000 * ++retry));
      return false;
    })();
    try { return await connecting; } finally { connecting = null; }
  }
  function disconnect() { wanted = false; if (ws) { try { ws.close(); } catch (e) {} } ws = null; connected = false; emit(); }

  async function call(op, args, timeoutMs) {
    if (!connected || !ws) return { ok: false, error: "Your computer isn't connected. It needs Rojo Desktop running on the same Wi-Fi." };
    const id = ++seq;
    const p = new Promise((resolve) => {
      pending.set(id, resolve);
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ ok: false, error: "Your computer didn't answer in time." }); } }, timeoutMs || 120000);
    });
    ws.send(await enc({ id, type: "call", op, args: args || {} }));
    return p;
  }

  // The same shape the agent uses for Rojo Desktop's own bridge.
  const api = {
    computer: (name, input, note) => call("computer", { name, input, note }, Math.max(120000, ((input && input.duration) || 0) * 1000 + 30000)),
    runStart: (goal) => call("runStart", { goal }),
    runEnd: (message) => call("runEnd", { message }),
    stopped: async () => { const r = await call("stopped", {}, 10000); return !!(r && r.stopped); },
    note: (text) => call("pill", { text }, 10000),
  };

  return {
    connect, disconnect, api,
    ask: (text) => call("ask", { text }, 95000),
    askDone: (allowed) => call("askDone", { allowed: !!allowed }, 10000),
    get connected() { return connected; },
    get paired() { return !!device(); },
    get name() { const d = dev || device(); return d ? d.name || (d.id === "mac" ? "your Mac" : "your PC") : ""; },
    get kind() { const d = dev || device(); return d ? d.id : ""; },
    onCursor(fn) { cursorFns.push(fn); },
    onStatus(fn) { statusFns.push(fn); },
  };
})();
