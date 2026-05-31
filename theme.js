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
  function set(dark) {
    root.classList.toggle("mode-dark", dark);
    try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch (e) {}
  }
  function wire() {
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) =>
      btn.addEventListener("click", () => set(!isDark())));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
