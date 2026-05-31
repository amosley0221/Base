/* ===========================================================
   BASE — shared tiny UI helpers for editor pages
   =========================================================== */
window.UI = (function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  let toastEl = null, toastT = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("show"), 1500);
  }
  return { $, $$, esc, toast };
})();
