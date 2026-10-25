/* ===========================================================
   BASE — sync between devices
   Keeps phones in step through one private GitHub gist. The data
   is encrypted on the device (AES-GCM, key from your passphrase)
   before upload, so GitHub only ever stores ciphertext.

   Merging is per item: each task, bill, note, account… and each
   setting is a "unit" with a last-changed time. Changes are
   detected on save by comparing unit hashes, deletions leave a
   dated tombstone, and when both devices changed the same unit
   the newer change wins.
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store;
  if (!S) return;

  const CFG_KEY = "base_sync_cfg";     // { token, pass, gistId, lastSync, lastError, key:{salt,raw} } — this device only
  const META_KEY = "base_sync_meta";   // { u: { unitKey: {t,h} }, del: { unitKey: t } }
  const FILE = "base-sync.json";
  const DESC = "BASE sync (encrypted)";
  const API = "https://api.github.com";
  const TOMBSTONE_MS = 90 * 86400000;
  const THROTTLE_MS = 15000;

  // Lists of items with ids: merged item by item. Everything else directly
  // under the root, budget and school is merged as one unit per key.
  const COLLECTIONS = [
    "tasks", "habits", "notes", "events", "milestones", "teams",
    "budget.incomes", "budget.expenses", "budget.accounts", "budget.bills", "budget.subscriptions", "budget.paidLog",
    "school.completed", "school.planned", "school.assignments", "rojo.memory",
  ];
  const CONTAINERS = ["budget", "school", "rojo"];

  // ---------------------------------------------------------------- local config
  function readJSON(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const cfg = () => readJSON(CFG_KEY, null);
  const setCfg = (c) => writeJSON(CFG_KEY, c);
  const enabled = () => { const c = cfg(); return !!(c && c.token && c.pass && c.gistId); };
  const readMeta = () => { const m = readJSON(META_KEY, null) || {}; return { u: m.u || {}, del: m.del || {} }; };
  const writeMeta = (m) => writeJSON(META_KEY, m);

  // ---------------------------------------------------------------- units
  function hash(v) {
    const s = JSON.stringify(v === undefined ? null : v);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + "." + s.length.toString(36);
  }
  const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
  function setPath(o, p, v) {
    const ks = p.split(".");
    ks.slice(0, -1).forEach((k) => { if (!o[k] || typeof o[k] !== "object" || Array.isArray(o[k])) o[k] = {}; o = o[k]; });
    o[ks[ks.length - 1]] = v;
  }
  function itemKey(path, it) {
    if (it && typeof it === "object" && it.id != null) return path + "|" + it.id + (path === "teams" && it.league ? "@" + it.league : "");
    return path + "|#" + hash(it);
  }
  // state -> { units: Map(key -> {path, item, value}), orders: {collection: [keys]} }
  function flatten(st) {
    const units = new Map(), orders = {};
    const coll = new Set(COLLECTIONS);
    COLLECTIONS.forEach((p) => {
      orders[p] = [];
      const arr = getPath(st, p);
      if (!Array.isArray(arr)) return;
      arr.forEach((it) => {
        const k = itemKey(p, it);
        if (units.has(k)) return;
        units.set(k, { path: p, item: true, value: it });
        orders[p].push(k);
      });
    });
    (function leaves(obj, prefix) {
      Object.keys(obj || {}).forEach((k) => {
        const p = prefix ? prefix + "." + k : k;
        if (coll.has(p)) return;
        const v = obj[k];
        if (!prefix && CONTAINERS.includes(k) && v && typeof v === "object" && !Array.isArray(v)) return leaves(v, k);
        units.set(p, { path: p, item: false, value: v });
      });
    })(st, "");
    return { units, orders };
  }
  function unflatten(units, orders) {
    const st = {};
    CONTAINERS.forEach((c) => (st[c] = {}));
    COLLECTIONS.forEach((p) => setPath(st, p, []));
    units.forEach((u) => { if (!u.item) setPath(st, u.path, u.value); });
    COLLECTIONS.forEach((p) => {
      const arr = getPath(st, p);
      (orders[p] || []).forEach((k) => { const u = units.get(k); if (u) arr.push(u.value); });
    });
    return st;
  }
  // Record changed/new/removed units with the current time. Returns true if anything changed.
  function stamp(st, meta, now) {
    const { units } = flatten(st);
    let changed = false;
    units.forEach((u, k) => {
      const h = hash(u.value), m = meta.u[k];
      if (!m || m.h !== h) { meta.u[k] = { t: now, h }; delete meta.del[k]; changed = true; }
    });
    Object.keys(meta.u).forEach((k) => {
      if (!units.has(k)) { meta.del[k] = now; delete meta.u[k]; changed = true; }
    });
    return changed;
  }
  // Newer change wins per unit; deletions win over older edits.
  function merge(L, Lm, R, Rm) {
    const lf = flatten(L), rf = flatten(R);
    const keys = new Set([...lf.units.keys(), ...rf.units.keys(), ...Object.keys(Lm.del), ...Object.keys(Rm.del)]);
    const out = new Map(), meta = { u: {}, del: {} };
    const ver = (f, m, k) => f.units.has(k)
      ? { t: (m.u[k] && m.u[k].t) || 0, u: f.units.get(k) }
      : { t: m.del[k] != null ? m.del[k] : -1, u: null };
    keys.forEach((k) => {
      const a = ver(lf, Lm, k), b = ver(rf, Rm, k);
      const w = b.t > a.t ? b : a;
      if (w.u) { out.set(k, w.u); meta.u[k] = { t: w.t, h: hash(w.u.value) }; }
      else if (w.t >= 0) meta.del[k] = w.t;
    });
    // Keep the order of whichever device touched the list last, slotting in
    // the other device's items where they sat there.
    const orders = {};
    const newest = (o, m) => o.reduce((x, k) => Math.max(x, (m.u[k] && m.u[k].t) || 0), -1);
    COLLECTIONS.forEach((p) => {
      const lo = lf.orders[p] || [], ro = rf.orders[p] || [];
      const useRemote = newest(ro, Rm) > newest(lo, Lm);
      const base = useRemote ? ro : lo, other = useRemote ? lo : ro;
      const list = base.filter((k) => out.has(k));
      other.forEach((k, i) => { if (out.has(k) && !list.includes(k)) list.splice(Math.min(i, list.length), 0, k); });
      orders[p] = list;
    });
    const cutoff = Date.now() - TOMBSTONE_MS;
    Object.keys(meta.del).forEach((k) => { if (meta.del[k] < cutoff) delete meta.del[k]; });
    return { state: unflatten(out, orders), meta };
  }
  // Content fingerprints (ignore timestamps and key order).
  function digestState(st) { const { units } = flatten(st); return [...units.keys()].sort().map((k) => k + "=" + hash(units.get(k).value)).join(","); }
  function digestMeta(m) {
    return Object.keys(m.u || {}).sort().map((k) => k + "=" + m.u[k].h).join(",") + "|" + Object.keys(m.del || {}).sort().join(",");
  }

  // ---------------------------------------------------------------- crypto
  const enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) {
    const a = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(s) { const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  // PBKDF2 is deliberately slow, so the derived key is cached on this device.
  async function deriveKey(pass, saltB64) {
    const c = cfg();
    if (c && c.key && c.key.salt === saltB64 && c.key.raw && c.pass === pass) {
      return crypto.subtle.importKey("raw", unb64(c.key.raw), "AES-GCM", false, ["encrypt", "decrypt"]);
    }
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: unb64(saltB64), iterations: 210000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    if (c && c.pass === pass) { c.key = { salt: saltB64, raw: b64(await crypto.subtle.exportKey("raw", key)) }; setCfg(c); }
    return key;
  }
  async function seal(obj, pass, saltB64) {
    const salt = saltB64 || b64(crypto.getRandomValues(new Uint8Array(16)));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    return JSON.stringify({ app: "BASE-sync", v: 1, salt, iv: b64(iv), ct: b64(ct) });
  }
  async function unseal(text, pass) {
    let env;
    try { env = JSON.parse(text); } catch (e) { throw new Error("not-base"); }
    if (!env || env.app !== "BASE-sync") throw new Error("not-base");
    const key = await deriveKey(pass, env.salt);
    let pt;
    try { pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct)); }
    catch (e) { throw new Error("bad-pass"); }
    return { doc: JSON.parse(dec.decode(pt)), salt: env.salt };
  }

  // ---------------------------------------------------------------- GitHub
  async function gh(path, token, opts) {
    const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
    if (opts && opts.body) headers["Content-Type"] = "application/json";
    let r;
    try { r = await fetch(API + path, Object.assign({ headers, cache: "no-store" }, opts || {})); }
    catch (e) { throw new Error("offline"); }
    if (r.status === 401) throw new Error("auth");
    if (r.status === 403 || r.status === 404) throw new Error(path.indexOf("/gists") === 0 ? "scope" : "auth");
    if (!r.ok) throw new Error("http-" + r.status);
    return r.json();
  }
  async function findGist(token) {
    for (let page = 1; page <= 10; page++) {
      const list = await gh(`/gists?per_page=100&page=${page}`, token);
      const g = list.find((x) => x.description === DESC && x.files && x.files[FILE]);
      if (g) return g.id;
      if (list.length < 100) break;
    }
    return null;
  }
  async function readGist(token, id) {
    const g = await gh("/gists/" + id, token);
    const f = g.files && g.files[FILE];
    if (!f) return null;
    if (f.truncated && f.raw_url) return (await fetch(f.raw_url, { cache: "no-store" })).text();
    return f.content;
  }
  const writeGist = (token, id, content) => gh("/gists/" + id, token, { method: "PATCH", body: JSON.stringify({ files: { [FILE]: { content } } }) });
  async function createGist(token, content) {
    const g = await gh("/gists", token, { method: "POST", body: JSON.stringify({ description: DESC, public: false, files: { [FILE]: { content } } }) });
    return g.id;
  }

  // ---------------------------------------------------------------- sync
  const device = () => (/iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android" : "Browser");
  function errorText(e) {
    const m = (e && e.message) || "";
    if (m === "auth") return "GitHub rejected the token. Paste a new one.";
    if (m === "scope") return "The token can't access gists. Create one with the 'gist' permission.";
    if (m === "bad-pass") return "Wrong passphrase. Use the same one as on your other device.";
    if (m === "offline") return "Offline. Will sync when you're back online.";
    if (m === "not-base") return "The sync file isn't readable.";
    return "Sync failed (" + m + "). Will try again.";
  }
  function emit() { try { window.dispatchEvent(new CustomEvent("base-sync", { detail: status() })); } catch (e) {} }

  let running = null, again = false;
  function syncNow() {
    if (!enabled()) return Promise.resolve({ skipped: true });
    if (running) { again = true; return running; }
    running = doSync().finally(() => {
      running = null;
      if (again) { again = false; syncNow(); }
    });
    return running;
  }
  async function doSync() {
    const c = cfg();
    try {
      const local = S.load();
      const meta = readMeta();
      if (stamp(local, meta, Date.now())) writeMeta(meta);
      const text = await readGist(c.token, c.gistId);
      let remote = null, salt = null;
      if (text) { const o = await unseal(text, c.pass); remote = o.doc; salt = o.salt; }
      const merged = remote ? merge(local, meta, remote.state || {}, { u: {}, del: {}, ...(remote.meta || {}) }) : { state: local, meta };
      const localChanged = digestState(merged.state) !== digestState(local);
      writeMeta(merged.meta);
      if (localChanged) S.save(merged.state);          // the save hook finds nothing new to stamp
      const remoteChanged = !remote || digestMeta(merged.meta) !== digestMeta({ u: {}, del: {}, ...(remote.meta || {}) });
      if (remoteChanged) {
        const content = await seal({ v: 1, state: merged.state, meta: merged.meta, by: device(), at: Date.now() }, c.pass, salt);
        await writeGist(c.token, c.gistId, content);
      }
      const c2 = cfg() || c;
      c2.lastSync = Date.now(); c2.lastError = ""; setCfg(c2);
      emit();
      if (localChanged && !window.BASE_NO_AUTORELOAD) location.reload();   // show the merged data
      return { localChanged, remoteChanged };
    } catch (e) {
      const c2 = cfg();
      if (c2) { c2.lastError = errorText(e); setCfg(c2); }
      emit();
      return { error: errorText(e) };
    }
  }

  // ---------------------------------------------------------------- setup (Settings)
  // Step 1: check the token + passphrase and see whether a sync copy exists.
  async function connect(token, pass) {
    token = String(token || "").trim(); pass = String(pass || "");
    if (!token) throw new Error("Paste your GitHub token.");
    if (pass.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
    let id;
    try { await gh("/user", token); id = await findGist(token); }
    catch (e) { throw new Error(errorText(e)); }
    if (!id) return { exists: false };
    let opened;
    try { opened = await unseal(await readGist(token, id), pass); }
    catch (e) { throw new Error(errorText(e)); }
    const st = (opened.doc && opened.doc.state) || {};
    return {
      exists: true, id, by: opened.doc.by || "another device", at: opened.doc.at || null,
      counts: { bills: ((st.budget || {}).bills || []).length, tasks: (st.tasks || []).length, notes: (st.notes || []).length },
    };
  }
  // Step 2: start syncing. mode: "new" (first device), "replace" (take the
  // synced copy on this device), or "combine" (merge both).
  async function start(token, pass, mode, id) {
    token = String(token).trim();
    const now = Date.now();
    if (mode === "new") {
      const meta = { u: {}, del: {} };
      const st = S.load();
      stamp(st, meta, now);
      const content = await seal({ v: 1, state: st, meta, by: device(), at: now }, pass, null);
      let gid;
      try { gid = await createGist(token, content); } catch (e) { throw new Error(errorText(e)); }
      writeMeta(meta);
      setCfg({ token, pass, gistId: gid, lastSync: now, lastError: "" });
      emit();
      return { ok: true };
    }
    setCfg({ token, pass, gistId: id, lastSync: 0, lastError: "" });
    if (mode === "replace") {
      const o = await unseal(await readGist(token, id), pass);
      writeMeta({ u: {}, del: {}, ...(o.doc.meta || {}) });
      S.save(o.doc.state || {});
    } else {
      // Combine: this phone's items join the synced copy, but anything both
      // have (settings, your name, the same bill) keeps the synced version.
      const meta = { u: {}, del: {} };
      stamp(S.load(), meta, 1);
      writeMeta(meta);
    }
    const r = await doSync();
    if (r.error) throw new Error(r.error);
    return { ok: true };
  }
  function stop() {
    try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(META_KEY); } catch (e) {}
    emit();
  }
  function status() {
    const c = cfg();
    return { enabled: enabled(), lastSync: (c && c.lastSync) || 0, lastError: (c && c.lastError) || "" };
  }

  // ---------------------------------------------------------------- triggers
  let pushTimer = 0;
  S.onSave((st) => {
    if (!enabled()) return;
    const m = readMeta();
    if (stamp(st, m, Date.now())) {
      writeMeta(m);
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { pushTimer = 0; syncNow(); }, 2500);
    }
  });
  function maybeSync() {
    const c = cfg();
    if (enabled() && Date.now() - ((c && c.lastSync) || 0) > THROTTLE_MS) syncNow();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeSync();
    else if (pushTimer) { clearTimeout(pushTimer); pushTimer = 0; syncNow(); }   // flush before leaving
  });
  window.addEventListener("pagehide", () => { if (pushTimer) { clearTimeout(pushTimer); pushTimer = 0; syncNow(); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", maybeSync);
  else maybeSync();

  window.BaseSync = { syncNow, connect, start, stop, status, _merge: merge, _stamp: stamp, _flatten: flatten };
})();
