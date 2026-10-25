// Rojo Desktop - settings: API key, link with the phone (BASE sync), permissions, start at login.
(function () {
  "use strict";
  const D = window.RojoDesktop, SY = window.BaseSync;
  const $ = (s) => document.querySelector(s);
  RojoFace.create($("#face"), { mini: true });
  const KEY = "base_anthropic_key";
  const set = (id, text, ok) => { const el = $(id); el.textContent = text; el.className = "status " + (ok === undefined ? "" : ok ? "ok" : "bad"); };

  // 1. key
  try { if (localStorage.getItem(KEY)) set("#keyStatus", "Saved ✓", true); } catch (e) {}
  $("#saveKey").onclick = () => {
    const k = $("#key").value.trim();
    if (!/^sk-ant-/.test(k)) { set("#keyStatus", "That doesn't look like a Claude key", false); return; }
    localStorage.setItem(KEY, k); $("#key").value = ""; set("#keyStatus", "Saved ✓", true);
  };

  // 2. sync
  function paintSync() {
    const st = SY.status();
    $("#unlink").hidden = !st.enabled;
    $("#link").textContent = st.enabled ? "Re-link" : "Link";
    if (st.enabled) set("#syncStatus", st.lastError ? st.lastError : "Linked ✓ (last synced " + (st.lastSync ? new Date(st.lastSync).toLocaleTimeString() : "not yet") + ")", !st.lastError);
    else set("#syncStatus", "");
  }
  $("#link").onclick = async () => {
    set("#syncStatus", "Checking…");
    try {
      const r = await SY.connect($("#token").value, $("#pass").value);
      // A computer joins your phone's data (it has nothing of its own to keep).
      await SY.start($("#token").value, $("#pass").value, r.exists ? "replace" : "new", r.id);
      $("#token").value = ""; $("#pass").value = "";
      paintSync();
    } catch (e) { set("#syncStatus", e.message || "Couldn't link", false); }
  };
  $("#unlink").onclick = () => { SY.stop(); paintSync(); };
  window.addEventListener("base-sync", paintSync);
  paintSync();

  // 3. permissions
  D.info().then((i) => {
    $("#login").checked = !!i.openAtLogin;
    $("#permText").innerHTML = i.kind === "mac"
      ? "macOS asks for two permissions. Open <b>System Settings → Privacy &amp; Security</b> and turn on Rojo under <b>Screen Recording</b> (so he can see the screen) and <b>Accessibility</b> (so he can use the mouse and keyboard). Restart Rojo after turning them on."
      : "Nothing to set up on Windows. If a security prompt appears, allow Rojo. Use the buttons to check everything works.";
  });
  $("#testScreen").onclick = async () => {
    set("#testStatus", "Taking a screenshot…");
    const r = await D.computer("screenshot", {});
    set("#testStatus", r.ok ? "Screen access works ✓" : r.error, r.ok);
  };
  $("#testMouse").onclick = async () => {
    set("#testStatus", "Moving the mouse a little…");
    const r = await D.testInput();
    set("#testStatus", r.ok ? "Mouse control works ✓" : (r.error || "Mouse control didn't work"), r.ok);
  };

  // 4. login item
  $("#login").onchange = async (e) => { e.target.checked = await D.setLogin(e.target.checked); };
})();
