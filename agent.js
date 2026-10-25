/* ===========================================================
   BASE — Rojo chat sheet (agent.html)
   The compact chat that slides up over other apps on Android
   when you tap the floating Rojo. The brain is AgentCore
   (agent-core.js); this file only draws the sheet.
   =========================================================== */
(function () {
  "use strict";
  const C = window.AgentCore;
  const AG = C.agentPlugin;
  const $ = (s) => document.querySelector(s);
  const logEl = $("#agLog"), chipsEl = $("#agChips"), textEl = $("#agText"), sendEl = $("#agSend");
  const ctxEl = $("#agCtx");
  const face = window.RojoFace ? RojoFace.create($("#agFace"), { mini: true }) : null;

  function paintCtx(screen) {
    if (!screen) { ctxEl.classList.add("hidden"); return; }
    ctxEl.classList.remove("hidden");
    ctxEl.classList.toggle("off", !!C.convo.screenOff);
    ctxEl.textContent = (C.convo.screenOff ? "Not reading: " : "Can read: ") + C.screenLabel(screen);
  }

  function renderItem(item, idx) {
    const el = document.createElement("div");
    if (item.type === "user") { el.className = "ag-msg user"; el.textContent = item.text; }
    else if (item.type === "bot") { el.className = "ag-msg bot"; el.innerHTML = C.md(item.text); }
    else if (item.type === "note") { el.className = "ag-msg note"; el.textContent = item.text; }
    else if (item.type === "err") { el.className = "ag-msg err"; el.textContent = item.text; }
    else if (item.type === "acts") {
      el.className = "ag-acts" + (item.pending ? " pending" : "");
      let h = item.pending ? `<div class="head">${item.resolved ? (item.resolved === "applied" ? "Applied" : "Discarded") : "Review these changes"}</div>` : "";
      h += item.items.map((s) => `<div class="row1"><span>${C.esc(s)}</span></div>`).join("");
      if (item.pending && !item.resolved) h += `<div class="btns"><button class="ag-mini primary" data-apply="${idx}">Apply</button><button class="ag-mini" data-discard="${idx}">Discard</button></div>`;
      if (!item.pending && item.undoable && item.snapshot) h += `<div class="btns"><button class="ag-mini" data-undo="${idx}">Undo</button></div>`;
      if (item.undone) h += `<div class="btns"><span class="muted">Undone</span></div>`;
      el.innerHTML = h;
    } else if (item.type === "setup") return renderSetupEl();
    return el;
  }
  function renderAll() {
    logEl.innerHTML = "";
    if (!C.convo.ui.length) {
      const g = document.createElement("div");
      g.className = "ag-msg bot"; g.innerHTML = C.md(C.greeting());
      logEl.appendChild(g);
    }
    C.convo.ui.forEach((it, i) => { const el = renderItem(it, i); if (el) logEl.appendChild(el); });
    if (C.busy) {
      const t = document.createElement("div");
      t.className = "ag-msg bot"; t.innerHTML = '<span class="ag-typing"><i></i><i></i><i></i></span>';
      logEl.appendChild(t);
    }
    logEl.scrollTop = logEl.scrollHeight;
    renderChips();
  }
  function renderChips() {
    chipsEl.innerHTML = "";
    if (C.convo.ui.length || C.busy) return;
    const chips = [];
    const screen = C.screen;
    if (screen && !C.convo.screenOff) { chips.push(["What's on my screen?", "Explain what's on my screen."]); if (screen.url) chips.push(["Summarize this page", "Summarize this page for me."]); }
    chips.push(["What's due this week?", "What bills are due in the next 7 days?"]);
    chips.push(["Am I short this month?", "Do I have enough cash for the rest of this month's bills?"]);
    chips.push(["Update a balance", "", "Checking has $"]);
    chips.push(["Add a bill", "", "Rent is $ due on the 1st"]);
    chips.forEach(([label, msg, prefill]) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.addEventListener("click", () => {
        if (msg) send(msg);
        else { textEl.value = prefill; textEl.focus(); const p = prefill.indexOf("$") + 1; textEl.setSelectionRange(p, p); autosize(); }
      });
      chipsEl.appendChild(b);
    });
  }
  function renderSetupEl() {
    const el = document.createElement("div");
    el.className = "ag-setup";
    el.innerHTML = `<b>Add your Claude API key</b><br>Rojo talks to Claude with your own key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. It's stored only on this phone.
      <input type="password" id="agKeyIn" placeholder="sk-ant-…" autocomplete="off" />
      <button class="ag-mini primary" id="agKeySave" type="button">Save key</button>`;
    el.querySelector("#agKeySave").addEventListener("click", () => {
      const k = el.querySelector("#agKeyIn").value.trim();
      if (!k) return;
      C.setKey(k);
      C.convo.ui = C.convo.ui.filter((u) => u.type !== "setup");
      renderAll();
      const t = textEl.value.trim();
      if (t) { textEl.value = ""; send(t); }
    });
    return el;
  }
  function renderSetup() {
    if (!C.convo.ui.some((u) => u.type === "setup")) { C.convo.ui.push({ type: "setup" }); renderAll(); }
  }

  async function send(text) {
    const r = await C.send(text);
    if (r && r.needKey) { textEl.value = text; autosize(); renderSetup(); }
    if (face && r && r.reply) { face.setMood("happy"); setTimeout(() => face.setMood("idle"), 1600); }
  }

  C.init({
    render: renderAll,
    busy(on) { sendEl.disabled = on; if (face) face.setMood(on ? "thinking" : "idle"); renderAll(); },
    screen: paintCtx,
  }, { surface: AG ? "sheet" : "rojo" });

  logEl.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.undo != null) C.undo(+t.dataset.undo);
    else if (t.dataset.apply != null) { t.disabled = true; C.apply(+t.dataset.apply); }
    else if (t.dataset.discard != null) C.discard(+t.dataset.discard);
  });

  // ---------------------------------------------------------------- shell
  function autosize() { textEl.style.height = "auto"; textEl.style.height = Math.min(132, textEl.scrollHeight) + "px"; }
  textEl.addEventListener("input", autosize);
  textEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#agForm").requestSubmit(); }
  });
  $("#agForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = textEl.value;
    if (!t.trim() || C.busy) return;
    if (!C.hasKey()) { renderSetup(); return; }
    textEl.value = ""; autosize();
    send(t);
  });

  function close() {
    document.body.classList.remove("open");
    setTimeout(() => {
      if (AG) AG.closeAgent().catch(() => {});
      else if (history.length > 1) history.back();
      else location.href = "Home.html";
    }, 260);
  }
  $("#agScrim").addEventListener("click", close);
  $("#agClose").addEventListener("click", close);
  // Opens Rojo's full screen inside BASE.
  $("#agOpen").addEventListener("click", () => { if (AG) AG.openApp({ path: "rojo.html" }).catch(() => {}); else location.href = "rojo.html"; });
  $("#agNew").addEventListener("click", () => { C.newChat(); paintCtx(C.screen); });
  ctxEl.addEventListener("click", () => { C.toggleScreenOff(); renderChips(); });

  // swipe the sheet down to close
  (function () {
    const sheet = $("#agSheet"), head = document.querySelector(".ag-head");
    let y0 = null, dy = 0;
    head.addEventListener("touchstart", (e) => { if (e.target.closest("button")) return; y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = "none"; }, { passive: true });
    head.addEventListener("touchmove", (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translate(-50%, ${dy}px)`; }, { passive: true });
    head.addEventListener("touchend", () => {
      if (y0 == null) return;
      sheet.style.transition = ""; sheet.style.transform = "";
      if (dy > 90) close();
      y0 = null;
    });
  })();

  async function refresh() {
    C.reload();
    const s = await C.fetchScreen();
    // A capture is fresh if it was taken when Rojo was last tapped.
    if (s && s.package !== "com.amosley.base") C.setScreen(s); else if (!s) C.setScreen(null);
    paintCtx(C.screen);
    renderAll();
    requestAnimationFrame(() => document.body.classList.add("open"));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !C.busy) refresh();
    else if (document.visibilityState === "hidden") document.body.classList.remove("open");
  });
  refresh();
  window.BaseAgentChat = { send, _state: () => C.convo };
})();
