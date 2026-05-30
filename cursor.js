/* ===========================================================
   BASE — custom interactive cursor
   Lazily activates on the first real MOUSE movement, so it works
   regardless of how the environment reports pointer media features
   (some embedded previews report no fine-pointer / no hover even
   with a mouse attached). Touch-only sessions never trigger it.
   =========================================================== */
(function () {
  "use strict";

  let ring = null, dot = null, started = false;
  const HOVER = "a,button,input,textarea,select,label,.check,.week-day,.day-cell,.weekdots .d,.shade,.note-card,.ncard,.habit,.dotnav,.sb-tab,.game,.tt-btn,.theme-toggle,[data-cursor]";
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;

  function build() {
    if (started) return;
    started = true;
    ring = document.createElement("div"); ring.className = "cursor-ring";
    dot = document.createElement("div"); dot.className = "cursor-dot";
    document.body.appendChild(ring); document.body.appendChild(dot);
    document.documentElement.classList.add("has-cursor");
    requestAnimationFrame(function loop() {
      rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
      ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    });
  }

  function move(e) {
    // ignore synthetic/touch-driven pointer events
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (!started) build();
    mx = e.clientX; my = e.clientY;
    document.body.classList.add("cursor-on");
    if (dot) dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
    const over = e.target && e.target.closest && e.target.closest(HOVER);
    document.body.classList.toggle("cursor-hover", !!over);
  }

  addEventListener("pointermove", move, { passive: true });
  addEventListener("mousemove", move, { passive: true });

  // hide only when the pointer truly leaves the window
  document.addEventListener("mouseleave", () => document.body.classList.remove("cursor-on"));
  document.addEventListener("mouseenter", () => { if (started) document.body.classList.add("cursor-on"); });
  addEventListener("blur", () => document.body.classList.remove("cursor-on"));

  addEventListener("pointerdown", (e) => { if (!e.pointerType || e.pointerType === "mouse") document.body.classList.add("cursor-down"); });
  addEventListener("pointerup", () => document.body.classList.remove("cursor-down"));

  // a touch anywhere means: definitely not a mouse session — keep it hidden
  addEventListener("touchstart", () => document.body.classList.remove("cursor-on"), { passive: true });
})();
