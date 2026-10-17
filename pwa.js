/* ===========================================================
   BASE — PWA registration + install prompt
   =========================================================== */
(function () {
  "use strict";
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    document.documentElement.classList.add("can-install");
    window.dispatchEvent(new Event("base-installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    document.documentElement.classList.remove("can-install");
    document.documentElement.classList.add("is-installed");
  });

  // Settings page calls this. Returns true if the native prompt fired.
  window.BASEInstall = function () {
    if (!deferred) return false;
    deferred.prompt();
    deferred.userChoice.finally(() => { deferred = null; });
    return true;
  };
  window.BASECanInstall = function () { return !!deferred; };
  // standalone detection (already installed / launched from home screen)
  window.BASEStandalone = function () {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  };

  /* ---------------------------------------------------------
     Unfolded / wide screens: go fullscreen so there's no
     mismatched system status bar (Android colours that bar
     itself in landscape and ignores our theme-color). Portrait
     keeps the bar. Browsers only allow fullscreen after a user
     gesture, so this engages on the first tap/scroll when wide,
     and exits when folded back to portrait.
     --------------------------------------------------------- */
  (function () {
    const WIDE = () => window.matchMedia("(min-width: 820px)").matches;
    const root = document.documentElement;
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    const inFS = () => document.fullscreenElement || document.webkitFullscreenElement;
    if (!req) return; // Fullscreen API unavailable — nothing to do
    function enter() { if (WIDE() && !inFS()) { try { req.call(root).catch(() => {}); } catch (e) {} } }
    function exit() { if (inFS() && ex) { try { ex.call(document).catch(() => {}); } catch (e) {} } }
    ["pointerdown", "touchstart", "keydown", "wheel"].forEach((evt) =>
      window.addEventListener(evt, enter, { passive: true }));
    window.addEventListener("resize", () => { if (!WIDE()) exit(); });
  })();
})();
