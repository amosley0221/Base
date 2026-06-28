/* ===========================================================
   BASE — Notes editor logic (auto-save)
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store, { $, esc, toast } = window.UI;
  let state = S.load();
  const persist = () => S.save(state);

  function render() {
    const board = $("#board");
    board.innerHTML = "";
    state.notes.forEach((n) => board.appendChild(card(n)));
    const add = document.createElement("button");
    add.className = "add-note";
    add.textContent = "+  New note";
    add.addEventListener("click", () => {
      const note = { id: S.uid("n"), title: "", body: "", color: "paper" };
      state.notes.unshift(note); persist(); render();
      // focus the new card's title
      const first = $("#board").querySelector(".ncard .ntitle");
      if (first) first.focus();
    });
    board.appendChild(add);
  }

  function card(n) {
    const el = document.createElement("div");
    el.className = "card ncard" + (n.color === "red" ? " is-red" : "");
    el.innerHTML = `
      <input class="ntitle" placeholder="Title" value="${esc(n.title)}" />
      <textarea class="nbody" placeholder="Write something…">${esc(n.body)}</textarea>
      <div class="nfoot">
        <div class="swap">
          <button class="sw-paper" data-c="paper" title="plain"></button>
          <button class="sw-red" data-c="red" title="red"></button>
        </div>
        <div class="nfoot-right">
          <button class="ncard-ai" title="AI assist">✦ AI</button>
          <button class="del" title="delete">×</button>
        </div>
      </div>
      <div class="ai-row" hidden>
        <button class="rev-btn" data-act="expand">Expand</button>
        <button class="rev-btn" data-act="shorten">Shorten</button>
        <button class="rev-btn" data-act="tidy">Tidy</button>
        <button class="rev-btn" data-act="summarize">Summarize</button>
        <span class="ai-stat"></span>
      </div>`;

    const title = el.querySelector(".ntitle");
    const body = el.querySelector(".nbody");
    title.addEventListener("input", () => { n.title = title.value; persist(); });
    body.addEventListener("input", () => { n.body = body.value; persist(); });
    el.querySelectorAll(".swap button").forEach((b) =>
      b.addEventListener("click", () => { n.color = b.dataset.c; persist(); el.classList.toggle("is-red", n.color === "red"); }));
    el.querySelector(".del").addEventListener("click", () => {
      state.notes = state.notes.filter((x) => x.id !== n.id); persist(); render(); toast("Note deleted");
    });

    // AI assist row
    const aiBtn = el.querySelector(".ncard-ai"), aiRow = el.querySelector(".ai-row"), aiStat = el.querySelector(".ai-stat");
    let ctrl = null;
    aiBtn.addEventListener("click", () => {
      if (!(window.BaseAI && window.BaseAI.hasKey())) { toast("Add your Anthropic API key on Settings"); return; }
      aiRow.hidden = !aiRow.hidden;
    });
    aiRow.querySelectorAll(".rev-btn").forEach((b) => b.addEventListener("click", async () => {
      const text = body.value.trim();
      if (!text) { aiStat.textContent = "Write something first."; aiStat.className = "ai-stat warn"; return; }
      const act = b.dataset.act, prev = body.value;
      aiRow.querySelectorAll(".rev-btn").forEach((x) => (x.disabled = true));
      aiStat.textContent = window.BaseAI.reviseLabel(act) + "…"; aiStat.className = "ai-stat";
      ctrl = new AbortController(); body.value = "";
      try {
        await window.BaseAI.revise(act, text, { title: n.title }, (chunk) => { body.value += chunk; }, ctrl.signal);
        n.body = body.value; persist(); aiStat.textContent = "Done."; aiStat.className = "ai-stat ok";
      } catch (e) {
        body.value = prev;
        aiStat.textContent = (e && e.message === "no-key") ? "Add your key on Settings." : ((e && e.message) || "Failed.");
        aiStat.className = "ai-stat warn";
      } finally {
        aiRow.querySelectorAll(".rev-btn").forEach((x) => (x.disabled = false)); ctrl = null;
      }
    }));
    return el;
  }

  render();
})();
