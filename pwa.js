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
})();
