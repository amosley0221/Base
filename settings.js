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
    S.save(S.clone(S.SEED)); toast("Sample data restored"); setTimeout(() => location.reload(), 700);
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
})();
