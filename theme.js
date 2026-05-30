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
  // Match the installed-app status bar to the chosen theme (it's a manual
  // toggle, so the prefers-color-scheme meta tags can't track it).
  function syncThemeColor() {
    let m = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "theme-color");
      document.head.appendChild(m);
    }
    m.setAttribute("content", isDark() ? "#0E0F0B" : "#FBFAF8");
  }
  function set(dark) {
    root.classList.toggle("mode-dark", dark);
    try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch (e) {}
    syncThemeColor();
  }
  function wire() {
    syncThemeColor();
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) =>
      btn.addEventListener("click", () => set(!isDark())));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
