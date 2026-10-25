/* ===========================================================
   BASE — Rojo in the nav
   Adds a little Rojo to the top bar of every page; tap him to
   open Rojo's screen. While a focus session runs he shows the
   time left under him.
   =========================================================== */
(function () {
  "use strict";
  function mount() {
    const right = document.querySelector(".nav .nav-right");
    if (!right || right.querySelector(".rojo-nav") || !window.RojoFace) return;
    const a = document.createElement("a");
    a.className = "rojo-nav";
    a.href = "rojo.html";
    a.setAttribute("aria-label", "Talk to Rojo");
    a.setAttribute("data-cursor", "");
    a.innerHTML = '<span class="rojo-nav-face"></span><span class="rojo-nav-time" hidden></span>';
    right.insertBefore(a, right.firstChild);
    const face = RojoFace.create(a.querySelector(".rojo-nav-face"), { mini: true });
    const time = a.querySelector(".rojo-nav-time");
    function tick() {
      const F = window.BaseFocus && BaseFocus.status();
      if (F && F.active) {
        time.hidden = false;
        time.textContent = F.done ? "done!" : BaseFocus.fmt(F.remainingMs);
        face.setMood(F.paused ? "idle" : "focused");
      } else { time.hidden = true; if (face.mood === "focused") face.setMood("idle"); }
    }
    tick();
    setInterval(tick, 1000);
  }
  const css = document.createElement("style");
  css.textContent = `
  .rojo-nav { position: relative; width: 46px; height: 46px; flex: 0 0 auto; display: block; -webkit-tap-highlight-color: transparent; }
  .rojo-nav-face { position: absolute; inset: -3px; display: block; transition: transform .25s var(--ease, ease); }
  .rojo-nav:active .rojo-nav-face { transform: scale(.9); }
  .rojo-nav-time { position: absolute; left: 50%; bottom: -12px; transform: translateX(-50%); font: 600 10px/1 var(--font, sans-serif);
    letter-spacing: .02em; background: #F2481D; color: #fff; padding: 3px 6px; border-radius: 99px; white-space: nowrap; font-variant-numeric: tabular-nums; }`;
  document.head.appendChild(css);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
