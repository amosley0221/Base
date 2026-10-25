// Rojo Desktop - the chat window. The brain is BASE's AgentCore (same as the phone),
// running here with the computer toolset. Also picks up tasks sent from your phone.
(function () {
  "use strict";
  const C = window.AgentCore, D = window.RojoDesktop, S = window.Store;
  const $ = (s) => document.querySelector(s);
  const log = $("#log"), text = $("#text"), sendBtn = $("#send"), chips = $("#chips");
  const face = RojoFace.create($("#face"), { mini: true });
  let info = { kind: "windows", name: "this computer" };

  function render() {
    const ui = C.convo.ui;
    log.innerHTML = "";
    if (!ui.length) add("bot", C.md("Hi! I'm Rojo, now on your computer. Ask me anything, or tell me what to do here, like *\"open Gmail and draft a reply to Sam\"*. While I work you'll see a red glow and a **Stop** button."));
    ui.forEach((it, i) => {
      if (it.type === "user") add(it.fromPhone ? "task" : "user", null, it.text);
      else if (it.type === "bot") add("bot", C.md(it.text));
      else if (it.type === "err") add("err", null, it.text);
      else if (it.type === "note") add("note", null, it.text);
      else if (it.type === "acts") {
        const el = document.createElement("div");
        el.className = "acts" + (it.pending ? " pending" : "");
        let h = it.items.map((s) => `<div class="row1">${C.esc(s)}</div>`).join("");
        if (it.pending && !it.resolved) h += `<div class="btns"><button class="mini primary" data-apply="${i}">Apply</button><button class="mini" data-discard="${i}">Discard</button></div>`;
        if (!it.pending && it.undoable && it.snapshot) h += `<div class="btns"><button class="mini" data-undo="${i}">Undo</button></div>`;
        el.innerHTML = h;
        log.appendChild(el);
      }
    });
    if (C.busy) add("bot", '<span class="typing"><i></i><i></i><i></i></span>');
    log.scrollTop = log.scrollHeight;
    renderChips();
  }
  function add(cls, html, plain) {
    const el = document.createElement("div");
    el.className = "m " + cls;
    if (html != null) el.innerHTML = html; else el.textContent = (cls === "task" ? "📱 From your phone: " : "") + plain;
    log.appendChild(el);
  }
  function renderChips() {
    chips.innerHTML = "";
    if (C.busy || C.convo.ui.length) return;
    [["What's on my screen?", "Take a screenshot and tell me what's on my screen."],
     ["What's due this week?", "What bills are due in the next 7 days?"],
     ["Open my email", "Open my email in the browser."]].forEach(([l, m]) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = l;
      b.onclick = () => ask(m); chips.appendChild(b);
    });
  }
  log.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.undo != null) C.undo(+t.dataset.undo);
    else if (t.dataset.apply != null) C.apply(+t.dataset.apply);
    else if (t.dataset.discard != null) C.discard(+t.dataset.discard);
  });

  async function ask(msg, opts) {
    msg = String(msg || "").trim();
    if (!msg || C.busy) return null;
    if (!C.hasKey()) { add("err", null, "Add your Claude API key in Settings (gear icon) first."); D.openSettings(); return null; }
    const r = await C.send(msg);
    if (opts && opts.fromPhone) {
      const last = C.convo.ui.filter((u) => u.type === "user").pop();
      if (last) last.fromPhone = true;
      render();
    }
    return r;
  }

  C.init({
    render,
    busy(on) { sendBtn.disabled = on; face.setMood(on ? "thinking" : "idle"); D.mood(on ? "thinking" : "idle"); render(); },
    screen() {},
  }, { surface: "desktop" });

  function autosize() { text.style.height = "auto"; text.style.height = Math.min(120, text.scrollHeight) + "px"; }
  text.addEventListener("input", autosize);
  text.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#form").requestSubmit(); } });
  $("#form").addEventListener("submit", (e) => { e.preventDefault(); const t = text.value; if (!t.trim()) return; text.value = ""; autosize(); ask(t); });
  $("#new").onclick = () => C.newChat();
  $("#settings").onclick = () => D.openSettings();
  $("#hide").onclick = () => D.hideChat();
  D.on("settings-changed", () => { C.reload(); render(); });

  // ---------------------------------------------------------------- tasks from your phone
  // The phone writes tasks into the synced data; this computer runs the ones meant for it.
  async function heartbeat() {
    const st = S.load();
    st.rojo = st.rojo || {};
    if (!Array.isArray(st.rojo.devices)) st.rojo.devices = [];
    const d = st.rojo.devices.find((x) => x.id === info.kind);
    if (d && Date.now() - (d.lastSeen || 0) < 9 * 60000 && d.name === info.name) return;
    if (d) Object.assign(d, { name: info.name, lastSeen: Date.now() });
    else st.rojo.devices.push({ id: info.kind, name: info.name, lastSeen: Date.now() });
    S.save(st);
  }
  async function checkTasks() {
    if (!window.BaseSync || !BaseSync.status().enabled) return;
    try { await BaseSync.syncNow(); } catch (e) {}
    await heartbeat();
    if (C.busy) return;
    const st = S.load();
    const list = (st.rojo && st.rojo.pcTasks) || [];
    const t = list.find((x) => x.status === "pending" && x.computer === info.kind);
    if (!t) return;
    t.status = "running"; t.startedAt = Date.now();
    S.save(st);
    const r = await ask(t.task, { fromPhone: true });
    const st2 = S.load();
    const t2 = ((st2.rojo && st2.rojo.pcTasks) || []).find((x) => x.id === t.id);
    if (t2) {
      t2.status = r && !r.error ? "done" : "failed";
      t2.result = String((r && (r.reply || r.error)) || "No reply").slice(0, 600);
      t2.finishedAt = Date.now();
      S.save(st2);
      if (window.BaseSync) BaseSync.syncNow();
    }
  }

  D.info().then((i) => {
    info = i;
    $("#where").textContent = "on " + (i.kind === "mac" ? "your Mac" : "your Windows PC") + " · " + i.name;
    render();
    checkTasks();
    setInterval(checkTasks, 20000);
  });
})();
