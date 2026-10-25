/* ===========================================================
   BASE — Settings logic: install, backup/restore, PDF export
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store, { $, $$, toast } = window.UI;

  // ---------- INSTALL ----------
  const installBtn = $("#installBtn"), iosSteps = $("#iosSteps"), status = $("#installStatus");
  function refreshInstall() {
    if (window.BASEStandalone && window.BASEStandalone()) {
      status.textContent = ""; status.innerHTML = "<i></i> Installed"; status.classList.add("ok");
      installBtn.textContent = "Already installed"; installBtn.disabled = true; installBtn.classList.add("hidden");
      iosSteps.classList.add("hidden");
    } else if (window.BASECanInstall && window.BASECanInstall()) {
      status.innerHTML = "<i></i> Ready to install"; status.classList.add("ok");
    }
  }
  window.addEventListener("base-installable", refreshInstall);
  installBtn.addEventListener("click", () => {
    const fired = window.BASEInstall && window.BASEInstall();
    if (!fired) iosSteps.classList.remove("hidden");
  });
  refreshInstall();

  // ---------- STORAGE INFO ----------
  function refreshStorage() {
    const bytes = S.storageBytes();
    const kb = (bytes / 1024).toFixed(1);
    $("#storageLine").textContent = `Currently stored: ${kb} KB on this device.`;
  }
  refreshStorage();

  // ---------- EXPORT ----------
  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }
  $("#exportBtn").addEventListener("click", () => {
    const json = S.exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "base-backup-" + stamp() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("Backup downloaded");
  });

  $("#copyBtn").addEventListener("click", async () => {
    const json = S.exportData();
    try { await navigator.clipboard.writeText(json); toast("Copied to clipboard"); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = json; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e2) { toast("Couldn't copy"); }
      ta.remove();
    }
  });

  // ---------- IMPORT ----------
  function applyImport(text) {
    const res = S.importData(text);
    if (res.ok) { toast("Restored! Reloading…"); setTimeout(() => location.reload(), 800); }
    else { toast(res.error || "Couldn't restore"); }
  }
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImport(String(reader.result || ""));
    reader.onerror = () => toast("Couldn't read that file");
    reader.readAsText(file);
    e.target.value = "";
  });
  $("#pasteBtn").addEventListener("click", () => {
    const v = $("#pasteBox").value.trim();
    if (!v) { toast("Paste a backup first"); return; }
    applyImport(v);
  });

  // ---------- PDF EXPORT ----------
  $("#pdfBtn").addEventListener("click", () => {
    const picked = $$("#pdfGrid input:checked").map((c) => c.value);
    if (!picked.length) { toast("Pick at least one section"); return; }
    try { localStorage.setItem("base_report_sections", JSON.stringify(picked)); } catch (e) {}
    location.href = "Report.html";
  });

  // ---------- RESET ----------
  $("#reseedBtn").addEventListener("click", () => {
    S.save(S.clone(S.SAMPLE)); toast("Sample data restored"); setTimeout(() => location.reload(), 700);
  });
  $("#wipeBtn").addEventListener("click", () => {
    S.save({ profile: { name: "", major: "" }, tasks: [], habits: [], notes: [], events: [], milestones: [], teams: [], budget: { incomes: [], expenses: [], history: [], taxRate: 0.12, accounts: [], bills: [], subscriptions: [] }, school: { creditsNeeded: 120, targetGpa: 3.5, creditsPerSem: 15, completed: [], planned: [], assignments: [] } });
    toast("Cleared"); setTimeout(() => location.reload(), 700);
  });

  // ---------- AI ASSISTANT (Anthropic API key) ----------
  const AI = window.BaseAI;
  const aiKey = $("#aiKey"), aiStatus = $("#aiStatus");
  function refreshAi() {
    if (!aiStatus) return;
    if (AI && AI.hasKey()) { aiStatus.innerHTML = "<i></i> Key saved"; aiStatus.classList.add("ok"); }
    else { aiStatus.innerHTML = "<i></i> Not set"; aiStatus.classList.remove("ok"); }
  }
  if (AI && aiKey) {
    aiKey.value = AI.getKey();
    refreshAi();
    $("#aiSave").addEventListener("click", () => {
      const v = aiKey.value.trim();
      if (v && !/^sk-ant-/.test(v)) { toast("That doesn't look like an Anthropic key"); return; }
      AI.setKey(v); refreshAi(); toast(v ? "API key saved" : "Key cleared");
    });
    $("#aiClear").addEventListener("click", () => { AI.setKey(""); aiKey.value = ""; refreshAi(); toast("Key cleared"); });
  }

  // ---------- ROJO'S MEMORY ----------
  function memList() { const st = S.load(); return (st.rojo && st.rojo.memory) || []; }
  function saveMem(list) { const st = S.load(); st.rojo = st.rojo || {}; st.rojo.memory = list; S.save(st); }
  function renderMem() {
    const list = memList(), ul = $("#memList");
    $("#memCount").textContent = list.length + (list.length === 1 ? " thing" : " things");
    ul.innerHTML = "";
    if (!list.length) { ul.innerHTML = '<li class="empty"><span>Nothing yet. Tell Rojo "remember that…"</span></li>'; return; }
    list.forEach((m) => {
      const li = document.createElement("li");
      li.innerHTML = "<span></span><button type=\"button\" aria-label=\"Forget\">✕</button>";
      li.querySelector("span").textContent = m.text;
      li.querySelector("button").addEventListener("click", () => { saveMem(memList().filter((x) => x.id !== m.id)); renderMem(); toast("Forgotten"); });
      ul.appendChild(li);
    });
  }
  $("#memCopy").addEventListener("click", async () => {
    const list = memList();
    if (!list.length) { toast("Rojo doesn't remember anything yet"); return; }
    const text = "Here's what my BASE assistant Rojo knows about me. Please remember these:\n" + list.map((m) => "- " + m.text).join("\n");
    try { await navigator.clipboard.writeText(text); toast("Copied — paste it into ChatGPT"); }
    catch (e) { $("#memPaste").value = text; $("#memImport").classList.remove("hidden"); toast("Couldn't copy; select the text below"); }
  });
  $("#memImportToggle").addEventListener("click", () => $("#memImport").classList.toggle("hidden"));
  $("#memAdd").addEventListener("click", () => {
    const lines = $("#memPaste").value.split(/\n+/).map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim()).filter((l) => l.length > 2 && !/^here'?s what/i.test(l));
    if (!lines.length) return;
    const list = memList();
    let n = list.reduce((mx, m) => Math.max(mx, +String(m.id).replace(/\D/g, "") || 0), 0);
    let added = 0;
    lines.forEach((l) => {
      if (list.some((m) => m.text.toLowerCase() === l.toLowerCase())) return;
      list.push({ id: "m" + (++n), text: l.slice(0, 240), at: S.isoInDays(0) }); added++;
    });
    saveMem(list.slice(-200));
    $("#memPaste").value = ""; $("#memImport").classList.add("hidden");
    renderMem(); toast(`Added ${added} to Rojo's memory`);
  });
  renderMem();

  // ---------- SYNC BETWEEN DEVICES ----------
  const SY = window.BaseSync;
  function ago(t) {
    if (!t) return "not yet";
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function refreshSync() {
    if (!SY) return;
    const st = SY.status(), chip = $("#syncStatus");
    $("#syncOff").classList.toggle("hidden", st.enabled);
    $("#syncOn").classList.toggle("hidden", !st.enabled);
    chip.classList.remove("ok", "err");
    if (!st.enabled) { chip.innerHTML = "<i></i> Off"; return; }
    if (st.lastError) { chip.innerHTML = "<i></i> Problem"; chip.classList.add("err"); }
    else { chip.innerHTML = "<i></i> On"; chip.classList.add("ok"); }
    $("#syncInfo").textContent = (st.lastError ? st.lastError + " " : "") + "Last synced " + ago(st.lastSync) +
      ". BASE syncs when you open it and a few seconds after each change.";
  }
  let pendingId = null;
  async function syncStart(mode) {
    const btns = ["#syncConnect", "#syncReplace", "#syncCombine"].map((q) => $(q));
    btns.forEach((b) => (b.disabled = true));
    try {
      await SY.start($("#syncToken").value, $("#syncPass").value, mode, pendingId);
      $("#syncToken").value = ""; $("#syncPass").value = ""; $("#syncChoice").classList.add("hidden");
      toast(mode === "new" ? "Sync is on. Now set it up on your other device." : "Synced");
      refreshSync();
      if (mode !== "new") setTimeout(() => location.reload(), 600);
    } catch (e) { toast(e.message || "Couldn't turn on sync"); }
    btns.forEach((b) => (b.disabled = false));
  }
  if (SY) {
    $("#syncConnect").addEventListener("click", async () => {
      const b = $("#syncConnect");
      b.disabled = true; b.textContent = "Checking…";
      try {
        const r = await SY.connect($("#syncToken").value, $("#syncPass").value);
        if (!r.exists) await syncStart("new");
        else {
          pendingId = r.id;
          const when = r.at ? new Date(r.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "earlier";
          $("#syncChoiceText").textContent = `Found synced data from your ${r.by} (${when}): ${r.counts.bills} bills, ${r.counts.tasks} tasks, ${r.counts.notes} notes. ` +
            `"Use the synced copy" replaces what's on this phone. "Combine" keeps both.`;
          $("#syncChoice").classList.remove("hidden");
        }
      } catch (e) { toast(e.message || "Couldn't connect"); }
      b.disabled = false; b.textContent = "Turn on sync";
    });
    $("#syncReplace").addEventListener("click", () => syncStart("replace"));
    $("#syncCombine").addEventListener("click", () => syncStart("combine"));
    $("#syncNowBtn").addEventListener("click", async () => {
      $("#syncNowBtn").disabled = true;
      const r = await SY.syncNow();
      $("#syncNowBtn").disabled = false;
      toast(r && r.error ? r.error : "Synced");
      refreshSync();
    });
    $("#syncOffBtn").addEventListener("click", () => {
      if (!confirm("Stop syncing on this device? Your data stays here and in the synced copy.")) return;
      SY.stop(); refreshSync(); toast("Sync off on this device");
    });
    window.addEventListener("base-sync", refreshSync);
    refreshSync();
  } else { $("#syncPanel").classList.add("hidden"); }

  // ---------- WEATHER LOCATION ----------
  const WX_KEY = "base_wx_loc";
  function wxSaved() { try { return JSON.parse(localStorage.getItem(WX_KEY)); } catch (e) { return null; } }
  function refreshWx() {
    const s = wxSaved(), st = $("#wxStatus");
    st.innerHTML = "<i></i> " + (s && s.name ? s.name.replace(/</g, "&lt;") : "Your location");
    st.classList.toggle("ok", !!s);
  }
  async function wxSearch() {
    const q = $("#wxCity").value.trim(), out = $("#wxResults");
    if (!q) return;
    out.innerHTML = '<span class="muted">Searching…</span>';
    try {
      const d = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=" + encodeURIComponent(q))).json();
      const list = (d && d.results) || [];
      if (!list.length) { out.innerHTML = '<span class="muted">No places found. Try a city name.</span>'; return; }
      out.innerHTML = "";
      list.forEach((r) => {
        const b = document.createElement("button");
        b.type = "button";
        const where = [r.admin1, r.country_code === "US" ? "" : r.country].filter(Boolean).join(", ");
        b.innerHTML = `<b></b><small></small>`;
        b.querySelector("b").textContent = r.name;
        b.querySelector("small").textContent = where;
        b.addEventListener("click", () => {
          try { localStorage.setItem(WX_KEY, JSON.stringify({ name: r.name, lat: r.latitude, lon: r.longitude })); } catch (e) {}
          out.innerHTML = ""; $("#wxCity").value = "";
          refreshWx(); toast("Weather set to " + r.name);
        });
        out.appendChild(b);
      });
    } catch (e) { out.innerHTML = '<span class="muted">Couldn\'t search right now. Check your connection.</span>'; }
  }
  $("#wxSearch").addEventListener("click", wxSearch);
  $("#wxCity").addEventListener("keydown", (e) => { if (e.key === "Enter") wxSearch(); });
  $("#wxUseGps").addEventListener("click", () => {
    try { localStorage.removeItem(WX_KEY); } catch (e) {}
    refreshWx();
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(
      () => toast("Using your current location"),
      () => toast("Location is off for BASE. Allow it in Android settings, or pick a city."),
      { timeout: 10000 });
  });
  refreshWx();

  // ---------- FLOATING AGENT (Android app) ----------
  const CAP = window.Capacitor;
  const AGT = CAP && CAP.isNativePlatform && CAP.isNativePlatform() && CAP.Plugins ? CAP.Plugins.BaseAgent : null;
  const agStatus = $("#agStatus");
  if (!AGT) { $("#agWeb").classList.remove("hidden"); }
  else {
    $("#agNative").classList.remove("hidden");
    const step = (k, ok) => { const li = $(`#agSteps [data-step="${k}"]`); if (li) li.classList.toggle("done", !!ok); };
    async function refreshAgent() {
      let st;
      try { st = await AGT.status(); } catch (e) { return; }
      const key = AI && AI.hasKey();
      step("key", key);
      step("restricted", st.accessibility);
      step("a11y", st.accessibility);
      step("notif", st.notifications);
      $("#agBubble").checked = !!st.bubble;
      const ready = key && st.accessibility;
      agStatus.innerHTML = "<i></i> " + (ready ? (st.bubble ? "On" : "Hidden") : "Needs setup");
      agStatus.classList.toggle("ok", !!ready && !!st.bubble);
    }
    $("#agBubble").addEventListener("change", async (e) => {
      try { await AGT.setBubble({ enabled: e.target.checked }); } catch (err) {}
      toast(e.target.checked ? "Rojo is on" : "Rojo is hidden");
      refreshAgent();
    });
    document.querySelectorAll("#agSteps [data-open]").forEach((b) => b.addEventListener("click", () => {
      const fn = AGT[b.dataset.open];
      if (fn) fn.call(AGT).catch(() => toast("Couldn't open that settings page"));
    }));
    if (aiKey) $("#aiSave").addEventListener("click", () => setTimeout(refreshAgent, 50));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshAgent(); });
    refreshAgent();
  }
})();
