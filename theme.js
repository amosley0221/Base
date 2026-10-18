/* ===========================================================
   BASE — theme toggle (light / dark), persisted
   The no-flash class is set by an inline <head> script;
   this only wires the toggle buttons.
   =========================================================== */
(function () {
  "use strict";
  const KEY = "base_theme";
  const root = document.documentElement;
  const isDark = () => root.classList.contains("mode-dark");
  // Status-bar / browser-chrome color per theme. Dark = near-black page bg,
  // light = white. This drives the Android status bar in the installed app
  // (the TWA follows the page's theme-color meta) and the browser chrome.
  const BAR = { dark: "#0E0F0B", light: "#FFFFFF" };
  function paintBar(dark) {
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.setAttribute("content", dark ? BAR.dark : BAR.light);
    // Native (Capacitor) app: color the real OS status bar in every
    // orientation — the web theme-color only reaches it in portrait.
    const C = window.Capacitor;
    if (C && C.Plugins && C.Plugins.StatusBar) {
      const SB = C.Plugins.StatusBar;
      try {
        SB.setOverlaysWebView({ overlay: false });
        SB.setBackgroundColor({ color: dark ? BAR.dark : BAR.light });
        SB.setStyle({ style: dark ? "DARK" : "LIGHT" });
      } catch (e) {}
    }
    // Floating agent mascot: green in dark mode, red in light.
    if (C && C.Plugins && C.Plugins.BaseAgent) {
      try { C.Plugins.BaseAgent.setTheme({ dark: !!dark }).catch(() => {}); } catch (e) {}
    }
  }
  function set(dark) {
    root.classList.toggle("mode-dark", dark);
    paintBar(dark);
    try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch (e) {}
  }
  function wire() {
    paintBar(isDark());
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) =>
      btn.addEventListener("click", () => set(!isDark())));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
