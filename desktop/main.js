// Rojo Desktop - Rojo on your Windows PC or Mac.
// A small always-on-top Rojo whose eyes follow your mouse; click him to chat.
// When you ask him to do something on the computer he takes screenshots and
// uses the mouse and keyboard (Claude computer use), with a glowing border,
// his pointer, and a Stop / Allow pill on screen.
const { app, BrowserWindow, ipcMain, screen, desktopCapturer, Tray, Menu, nativeImage, shell, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Input } = require("./control/input");
const { Link } = require("./control/link");
const crypto = require("crypto");

if (!app.requestSingleInstanceLock()) { app.quit(); }

const APP = path.join(__dirname, "app");
const CONFIG = () => path.join(app.getPath("userData"), "config.json");
let config = {};
function loadConfig() { try { config = JSON.parse(fs.readFileSync(CONFIG(), "utf8")); } catch (e) { config = {}; } }
function saveConfig() { try { fs.writeFileSync(CONFIG(), JSON.stringify(config, null, 2)); } catch (e) {} }

let mini = null, chat = null, overlay = null, pill = null, setup = null, tray = null;
let input = null;
let link = null, linkInfo = null, phoneLinked = false, phoneConnected = false;
let run = { active: false, stopped: false, pending: null };
let shot = null;   // geometry of the last screenshot: { k, sf, w, h }

// ---------------------------------------------------------------- windows
const common = { show: false, frame: false, transparent: true, resizable: false, skipTaskbar: true, hasShadow: false,
  webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } };

function createMini() {
  const wa = screen.getPrimaryDisplay().workArea;
  const pos = config.miniPos || { x: wa.x + wa.width - 170, y: wa.y + wa.height - 190 };
  mini = new BrowserWindow({ ...common, width: 150, height: 150, x: pos.x, y: pos.y, alwaysOnTop: true, focusable: true });
  mini.setAlwaysOnTop(true, "floating");
  mini.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mini.loadFile(path.join(APP, "mini.html"));
  mini.once("ready-to-show", () => mini.showInactive());
  mini.on("moved", () => { const b = mini.getBounds(); config.miniPos = { x: b.x, y: b.y }; saveConfig(); });
}

function createChat() {
  chat = new BrowserWindow({ ...common, transparent: false, backgroundColor: "#F4F0EA", width: 420, height: 640, alwaysOnTop: true, resizable: true, minWidth: 340, minHeight: 420, skipTaskbar: false, title: "Rojo" });
  chat.setAlwaysOnTop(true, "floating");
  chat.loadFile(path.join(APP, "chat.html"));
  chat.on("close", (e) => { if (!app.quitting) { e.preventDefault(); chat.hide(); } });
}

function placeChat() {
  const m = mini.getBounds();
  const wa = screen.getDisplayMatching(m).workArea;
  const [w, h] = chat.getSize();
  let x = m.x + m.width - w, y = m.y - h - 8;
  if (y < wa.y) y = Math.min(m.y + m.height + 8, wa.y + wa.height - h);
  x = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - w - 8));
  chat.setPosition(Math.round(x), Math.round(y));
}

function toggleChat(show) {
  if (!chat) return;
  const want = show === undefined ? !chat.isVisible() : show;
  if (want) { placeChat(); chat.show(); chat.focus(); } else chat.hide();
}

function createOverlay() {
  const d = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({ ...common, x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, focusable: false, alwaysOnTop: true });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setIgnoreMouseEvents(true);
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(APP, "overlay.html"));
  pill = new BrowserWindow({ ...common, width: 560, height: 72, focusable: false, alwaysOnTop: true, acceptFirstMouse: true });
  pill.setAlwaysOnTop(true, "screen-saver");
  pill.loadFile(path.join(APP, "pill.html"));
  const wa = d.workArea;
  pill.setPosition(Math.round(wa.x + (wa.width - 560) / 2), wa.y + 14);
}

function createSetup() {
  if (setup) { setup.show(); setup.focus(); return; }
  setup = new BrowserWindow({ width: 560, height: 760, title: "Rojo settings", show: false, backgroundColor: "#F4F0EA", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true } });
  setup.loadFile(path.join(APP, "setup.html"));
  setup.once("ready-to-show", () => setup.show());
  setup.on("closed", () => { setup = null; if (chat) chat.webContents.send("settings-changed"); });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png")).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip("Rojo");
  const menu = () => Menu.buildFromTemplate([
    { label: phoneLinked ? (phoneConnected ? "Linked to your phone ✓" : "Linked to your phone (not connected)") : "Not linked to a phone", enabled: false },
    { label: "Talk to Rojo here", click: () => toggleChat(true) },
    { label: "Show Rojo on this computer", type: "checkbox", checked: !!(mini && mini.isVisible()),
      click: (it) => { config.showHere = it.checked; saveConfig(); applyVisibility(); } },
    { label: "Settings…", click: createSetup },
    { type: "separator" },
    { label: "Start with my computer", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: (it) => app.setLoginItemSettings({ openAtLogin: it.checked }) },
    { type: "separator" },
    { label: "Quit Rojo", click: () => { app.quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on("click", () => toggleChat());
  refreshTray = () => tray.setContextMenu(menu());
}
let refreshTray = () => {};

// With a phone linked, Rojo lives on the phone: hide him here unless you ask to see him.
function applyVisibility() {
  if (!mini) return;
  const show = !phoneLinked || !!config.showHere;
  if (show && !mini.isVisible()) mini.showInactive();
  if (!show && mini.isVisible()) { mini.hide(); if (chat && chat.isVisible() && !run.active) chat.hide(); }
  refreshTray();
}

// ---------------------------------------------------------------- eyes follow the mouse
let lastSent = "";
function followCursor() {
  setInterval(() => {
    const p = screen.getCursorScreenPoint();
    if (mini && !mini.isDestroyed() && mini.isVisible()) {
      const b = mini.getBounds();
      mini.webContents.send("cursor", { x: p.x - b.x, y: p.y - b.y });
    }
    // Rojo on the phone watches your mouse too (sent ~15 times a second while it moves).
    if (link && phoneConnected) {
      const d = screen.getDisplayNearestPoint(p).bounds;
      const x = Math.round(((p.x - d.x) / d.width) * 1000) / 1000, y = Math.round(((p.y - d.y) / d.height) * 1000) / 1000;
      const key = x + "," + y;
      if (key !== lastSent) { lastSent = key; link.broadcast({ type: "cursor", x, y }); }
    }
  }, 66);
}

// ---------------------------------------------------------------- screen + input
function geometry() {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  const pw = Math.round(d.size.width * sf), ph = Math.round(d.size.height * sf);
  // Claude's screenshot limits; 1366 on the long edge keeps text readable.
  const k = Math.min(1, 1366 / Math.max(pw, ph), Math.sqrt(1150000 / (pw * ph)));
  return { d, sf, pw, ph, k, w: Math.round(pw * k), h: Math.round(ph * k) };
}

async function hideOurs(hide) {
  for (const w of [overlay, pill, mini]) {
    if (w && !w.isDestroyed()) w.setOpacity(hide ? 0 : 1);
  }
  if (hide) await new Promise((r) => setTimeout(r, 90));
}

async function takeScreenshot(region) {
  const g = geometry();
  await hideOurs(true);
  let img;
  try {
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: g.w, height: g.h } });
    const src = sources.find((s) => String(s.display_id) === String(g.d.id)) || sources[0];
    img = src && src.thumbnail;
  } finally { await hideOurs(false); }
  if (!img || img.isEmpty()) throw new Error(process.platform === "darwin"
    ? "Couldn't capture the screen. Allow Rojo in System Settings → Privacy & Security → Screen Recording, then restart Rojo."
    : "Couldn't capture the screen.");
  const size = img.getSize();
  shot = { k: size.width / g.pw, sf: g.sf, w: size.width, h: size.height };
  if (region) {
    const [x0, y0, x1, y1] = region.map(Number);
    const rect = { x: Math.max(0, Math.round(x0)), y: Math.max(0, Math.round(y0)), width: Math.max(8, Math.round(x1 - x0)), height: Math.max(8, Math.round(y1 - y0)) };
    // Zoom: re-capture at full resolution and crop the region (in screenshot pixels).
    await hideOurs(true);
    let full;
    try {
      const s2 = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: g.pw, height: g.ph } });
      full = (s2.find((s) => String(s.display_id) === String(g.d.id)) || s2[0]).thumbnail;
    } finally { await hideOurs(false); }
    const f = g.pw / size.width;
    let crop = full.crop({ x: Math.round(rect.x * f), y: Math.round(rect.y * f), width: Math.round(rect.width * f), height: Math.round(rect.height * f) });
    const cs = crop.getSize();
    const z = Math.min(1, 1366 / Math.max(cs.width, cs.height));
    if (z < 1) crop = crop.resize({ width: Math.round(cs.width * z), height: Math.round(cs.height * z) });
    return crop.toJPEG(82).toString("base64");
  }
  return img.toJPEG(82).toString("base64");
}

// Screenshot pixels -> what the OS helper expects (Windows: physical px, macOS: points)
function toScreen(c) {
  if (!shot) { const g = geometry(); shot = { k: g.k, sf: g.sf, w: g.w, h: g.h }; }
  const px = c[0] / shot.k, py = c[1] / shot.k;
  if (process.platform === "darwin") return { x: Math.round(px / shot.sf), y: Math.round(py / shot.sf) };
  return { x: Math.round(px), y: Math.round(py) };
}
// Screenshot pixels -> overlay window coordinates (DIP)
function toOverlay(c) {
  if (!shot) return null;
  return { x: c[0] / shot.k / shot.sf, y: c[1] / shot.k / shot.sf };
}

// Rojo's cursor glides to the spot (arrow tip = the exact point) with a label saying what he's doing.
function pointAt(c, label) {
  const o = c && toOverlay(c);
  if (!o || !overlay) { if (label) act(null, label); return Promise.resolve(); }
  overlay.webContents.send("pointer", Object.assign(o, { label: label || "" }));
  return new Promise((r) => setTimeout(r, 480));
}
function act(kind, label) { if (overlay) overlay.webContents.send("act", { kind, label }); }
// Start his cursor where your mouse is right now.
function cursorHome() {
  if (!overlay) return;
  const send = () => {
    const p = screen.getCursorScreenPoint(), b = overlay.getBounds();
    overlay.webContents.send("cursor-reset");
    overlay.webContents.send("pointer", { x: p.x - b.x, y: p.y - b.y, instant: true, label: "On it!" });
  };
  if (overlay.webContents.isLoading()) overlay.webContents.once("did-finish-load", send); else send();
}
const KEYNAME = { ctrl: "Ctrl", control: "Ctrl", shift: "Shift", alt: "Alt", super: "Win", cmd: "Cmd", command: "Cmd", return: "Enter", enter: "Enter", escape: "Esc", esc: "Esc", back_space: "Backspace", backspace: "Backspace", delete: "Delete", tab: "Tab", space: "Space", page_down: "Page Down", page_up: "Page Up" };
const prettyKeys = (combo) => String(combo || "").split("+").map((k) => KEYNAME[k.trim().toLowerCase()] || (k.trim().length === 1 ? k.trim().toUpperCase() : k.trim())).join("+");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function computer(name, inp, note) {
  inp = inp || {};
  note = String(note || "").replace(/\s+/g, " ").trim().slice(0, 70);
  if (run.stopped) return { ok: false, error: "The user tapped Stop." };
  const btn = { left_click: "left", right_click: "right", middle_click: "middle", double_click: "left", triple_click: "left" };
  const count = { double_click: 2, triple_click: 3 };
  const verb = { left_click: "Clicking", right_click: "Right-clicking", middle_click: "Middle-clicking", double_click: "Double-clicking", triple_click: "Triple-clicking" };
  switch (name) {
    case "screenshot": act("look", note || "Looking at the screen"); return { ok: true, image: await takeScreenshot() };
    case "zoom": act("look", note || "Taking a closer look"); return { ok: true, image: await takeScreenshot(inp.region) };
    case "cursor_position": {
      const r = await input.send({ op: "cursor" });
      if (!r.ok) return r;
      const sf = process.platform === "darwin" ? shot ? shot.sf : 1 : 1;
      const k = shot ? shot.k : geometry().k;
      return { ok: true, text: `[${Math.round(r.x * sf * k)}, ${Math.round(r.y * sf * k)}]` };
    }
    case "mouse_move": { await pointAt(inp.coordinate, note || "Moving here"); const p = toScreen(inp.coordinate); return input.send({ op: "move", x: p.x, y: p.y }); }
    case "left_click": case "right_click": case "middle_click": case "double_click": case "triple_click": {
      const cmd = { op: "click", button: btn[name], count: count[name] || 1, mods: inp.text || "" };
      if (inp.coordinate) { await pointAt(inp.coordinate, note || verb[name]); Object.assign(cmd, toScreen(inp.coordinate)); }
      else act(null, note || verb[name]);
      const r = await input.send(cmd);
      act("click");
      await sleep(250);
      return r;
    }
    case "left_click_drag": {
      await pointAt(inp.start_coordinate, note || "Dragging");
      act("click");
      const a = toScreen(inp.start_coordinate), b = toScreen(inp.coordinate);
      const moved = pointAt(inp.coordinate, note || "Dragging");
      const r = await input.send({ op: "drag", x1: a.x, y1: a.y, x2: b.x, y2: b.y, mods: inp.text || "" });
      await moved;
      return r;
    }
    case "left_mouse_down": act("click", note || "Holding the mouse button"); return input.send({ op: "down" });
    case "left_mouse_up": act(null, note || "Letting go"); return input.send({ op: "up" });
    case "scroll": {
      const cmd = { op: "scroll", dir: inp.scroll_direction || "down", amount: inp.scroll_amount || 3, mods: inp.text || "" };
      const what = note || "Scrolling " + cmd.dir;
      if (inp.coordinate) { await pointAt(inp.coordinate, what); Object.assign(cmd, toScreen(inp.coordinate)); }
      else act("scroll", what);
      const r = await input.send(cmd); await sleep(250); return r;
    }
    case "type": {
      const t = String(inp.text || "");
      act("type", note || "Typing \u201C" + (t.length > 32 ? t.slice(0, 32) + "\u2026" : t) + "\u201D");
      const r = await input.send({ op: "type", text: t }); await sleep(150); act("done"); return r;
    }
    case "key": { act(null, note || "Pressing " + prettyKeys(inp.text)); const r = await input.send({ op: "key", combo: String(inp.text || ""), repeat: Math.min(100, inp.repeat || 1) }); await sleep(200); return r; }
    case "hold_key": act(null, note || "Holding " + prettyKeys(inp.text)); return input.send({ op: "hold", combo: String(inp.text || ""), ms: Math.min(300, +inp.duration || 1) * 1000 });
    case "wait": act("wait", note || "Waiting a moment\u2026"); await sleep(Math.min(300, +inp.duration || 1) * 1000); return { ok: true };
  }
  return { ok: false, error: "Unknown action " + name };
}

// ---------------------------------------------------------------- run lifecycle
function pillText(t, asking) { if (pill) pill.webContents.send("pill", { text: t, asking: !!asking }); }
function mood(m) { if (mini) mini.webContents.send("mood", m); }

function startRun(goal, fromPhone) {
  run = { active: true, stopped: false, pending: null, fromPhone: !!fromPhone };
  if (!overlay) createOverlay();
  toggleChat(false);
  overlay.showInactive();
  cursorHome();
  pill.showInactive();
  pillText((fromPhone ? "Rojo (from your phone): " : "Rojo is on it: ") + String(goal || "").slice(0, 90));
  mood("focused");
  return { ok: true };
}
function endRun() {
  const fromPhone = run.fromPhone;
  run.active = false;
  if (run.pending) { run.pending(false); run.pending = null; }
  if (overlay) {
    overlay.webContents.send("cursor-done");
    const o = overlay;
    setTimeout(() => { if (!run.active && o && !o.isDestroyed()) o.hide(); }, 750);
  }
  if (pill) pill.hide();
  mood("happy");
  setTimeout(() => mood("idle"), 2000);
  if (!fromPhone && mini && mini.isVisible()) toggleChat(true);
  return { ok: true };
}
ipcMain.handle("run-start", (e, goal) => startRun(goal, false));
ipcMain.handle("run-end", () => endRun());
ipcMain.handle("run-stopped", () => run.stopped);
ipcMain.handle("ask", (e, question) => new Promise((resolve) => {
  if (!pill) return resolve(false);
  run.pending = resolve;
  pillText(String(question || "Rojo wants to do something important. OK?"), true);
  setTimeout(() => { if (run.pending === resolve) { run.pending = null; pillText("No answer, so Rojo didn't do it."); resolve(false); } }, 90000);
}));
ipcMain.on("pill-action", (e, a) => {
  if (a === "stop") { run.stopped = true; pillText("Stopping…"); }
  const p = run.pending; run.pending = null;
  if (p) { p(a === "allow"); if (a === "allow") pillText("Rojo is on it…"); }
});
ipcMain.handle("computer", async (e, name, inp, note) => {
  try { return await computer(name, inp, note); }
  catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

// ---------------------------------------------------------------- the phone link
async function phoneCommand(op, a) {
  switch (op) {
    case "computer":
      if (!run.active) startRun("working on your computer", true);
      return computer(a.name, a.input, a.note);
    case "runStart": return startRun(a.goal, true);
    case "runEnd": return endRun();
    case "stopped": return { ok: true, stopped: !!run.stopped };
    case "pill": if (run.active) pillText(String(a.text || "").slice(0, 120), false); return { ok: true };
    // Allow / Don't on this screen too; the phone asks at the same time and whichever answers first wins.
    case "ask": {
      if (!run.active) startRun(String(a.text || "").slice(0, 90), true);
      if (run.pending) { run.pending(false); run.pending = null; }
      return new Promise((resolve) => {
        const done = (ok) => resolve({ ok: true, allowed: !!ok });
        run.pending = done;
        pillText(String(a.text || "Rojo wants to do something important. OK?").slice(0, 160), true);
        setTimeout(() => { if (run.pending === done) { run.pending = null; resolve({ ok: true, allowed: false, timeout: true }); } }, 90000);
      });
    }
    case "askDone": if (run.pending) { const p = run.pending; run.pending = null; p(false); } pillText(a.allowed ? "Rojo is on it…" : "OK, Rojo won't do that."); return { ok: true };
    case "ping": return { ok: true };
  }
  return { ok: false, error: "Unknown command " + op };
}
async function startLink() {
  if (!config.linkSecret) { config.linkSecret = crypto.randomBytes(32).toString("hex"); saveConfig(); }
  link = new Link({ secret: config.linkSecret, port: 47811, name: os.hostname(), onCommand: phoneCommand,
    onClients: (n) => {
      phoneConnected = n > 0; refreshTray();
      if (!phoneConnected && run.active && run.fromPhone) endRun();   // the phone went away mid-task
    } });
  try {
    await link.start();
    linkInfo = { urls: link.urls(), key: config.linkSecret };
  } catch (e) { link = null; linkInfo = null; }
}

// ---------------------------------------------------------------- misc IPC
ipcMain.on("set-linked", (e, on) => { phoneLinked = !!on; applyVisibility(); });
ipcMain.on("mini-click", () => toggleChat());
ipcMain.on("mini-drag", (e, dx, dy) => {
  if (!mini) return;
  const b = mini.getBounds();
  mini.setPosition(Math.round(b.x + dx), Math.round(b.y + dy));
});
ipcMain.on("mood", (e, m) => mood(m));
ipcMain.on("chat-hide", () => toggleChat(false));
ipcMain.on("open-settings", createSetup);
ipcMain.on("open-external", (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle("info", () => ({
  platform: process.platform, kind: process.platform === "darwin" ? "mac" : "windows",
  name: os.hostname(), version: app.getVersion(),
  screenAccess: process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("screen") : "granted",
  openAtLogin: app.getLoginItemSettings().openAtLogin,
  lan: link ? { urls: link.urls(), key: config.linkSecret, port: link.port } : null,
}));
ipcMain.handle("set-login", (e, on) => { app.setLoginItemSettings({ openAtLogin: !!on }); return app.getLoginItemSettings().openAtLogin; });
ipcMain.handle("test-input", async () => {
  const a = await input.send({ op: "cursor" });
  if (!a.ok) return a;
  const b = await input.send({ op: "move", x: a.x + 40, y: a.y });
  await input.send({ op: "move", x: a.x, y: a.y });
  return b;
});

// ---------------------------------------------------------------- start
app.whenReady().then(() => {
  loadConfig();
  if (process.platform === "darwin" && app.dock) app.dock.hide();
  input = new Input(app.getPath("userData"));
  createMini();
  createChat();
  createOverlay();
  createTray();
  followCursor();
  startLink();
  if (!config.setupDone) { createSetup(); config.setupDone = true; saveConfig(); }
});
app.on("second-instance", () => toggleChat(true));
app.on("before-quit", () => { app.quitting = true; if (input) input.stop(); if (link) link.stop(); });
app.on("window-all-closed", (e) => { /* keep running in the tray */ });
