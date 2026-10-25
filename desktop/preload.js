// Rojo Desktop - the small, explicit API the pages get (no Node access in pages).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("RojoDesktop", {
  info: () => ipcRenderer.invoke("info"),
  computer: (name, input, note) => ipcRenderer.invoke("computer", name, input, note),
  runStart: (goal) => ipcRenderer.invoke("run-start", goal),
  runEnd: (message) => ipcRenderer.invoke("run-end", message),
  stopped: () => ipcRenderer.invoke("run-stopped"),
  ask: (question) => ipcRenderer.invoke("ask", question),
  pillAction: (a) => ipcRenderer.send("pill-action", a),
  miniClick: () => ipcRenderer.send("mini-click"),
  miniDrag: (dx, dy) => ipcRenderer.send("mini-drag", dx, dy),
  mood: (m) => ipcRenderer.send("mood", m),
  hideChat: () => ipcRenderer.send("chat-hide"),
  openSettings: () => ipcRenderer.send("open-settings"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  setLogin: (on) => ipcRenderer.invoke("set-login", on),
  testInput: () => ipcRenderer.invoke("test-input"),
  setLinked: (on) => ipcRenderer.send("set-linked", on),
  on: (channel, fn) => {
    const ok = ["cursor", "mood", "pointer", "act", "cursor-reset", "cursor-done", "ripple", "pill", "settings-changed"];
    if (ok.includes(channel)) ipcRenderer.on(channel, (e, ...args) => fn(...args));
  },
});
