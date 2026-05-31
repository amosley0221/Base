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
        <button class="del" title="delete">×</button>
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
    return el;
  }

  render();
})();
