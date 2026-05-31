/* ===========================================================
   BASE — Calendar editor logic
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store, { $, $$, esc, toast } = window.UI;
  let state = S.load();
  const tIdx = S.todayIdx();
  const persist = () => S.save(state);

  // populate day select (today first-ish, but keep Mon..Sun order)
  $("#fDay").innerHTML = S.DAYS.map((d, i) => `<option value="${i}" ${i === tIdx ? "selected" : ""}>${d}</option>`).join("");

  function timeToMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
  function fmtTime(t) {
    let [h, m] = t.split(":").map(Number);
    const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12;
    return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  }

  function render() {
    const cols = $("#weekCols");
    cols.innerHTML = S.DAYS.map((d, i) => {
      const evs = state.events.filter((e) => e.day === i).sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
      const body = evs.length ? evs.map((e) => `
        <div class="ev" data-cat="${e.cat}" data-id="${e.id}">
          <div class="et">${fmtTime(e.time)}</div>
          <div class="ev-title">${esc(e.title)}</div>
          <button class="del" data-id="${e.id}" title="delete">×</button>
        </div>`).join("") : `<div class="empty">—</div>`;
      return `<div class="col ${i === tIdx ? "today" : ""}">
        <div class="col-h"><span class="dname">${d}</span><span class="cn">${evs.length || ""}</span></div>
        ${body}
      </div>`;
    }).join("");

    $$("#weekCols .del").forEach((b) => b.addEventListener("click", () => {
      state.events = state.events.filter((e) => e.id !== b.dataset.id); persist(); render(); toast("Removed");
    }));
  }

  function addEvent() {
    const title = $("#fTitle").value.trim(); if (!title) { $("#fTitle").focus(); return; }
    state.events.push({
      id: S.uid("e"),
      day: +$("#fDay").value,
      time: $("#fTime").value || "09:00",
      title,
      cat: $("#fCat").value,
    });
    $("#fTitle").value = ""; persist(); render(); toast("Added to " + S.DAYS[+$("#fDay").value]);
  }
  $("#addEvent").addEventListener("click", addEvent);
  $("#fTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") addEvent(); });

  // ---------- COUNTDOWNS (milestones) ----------
  function renderMs() {
    const list = $("#msList");
    const arr = (state.milestones || []).map((m) => ({ ...m, d: S.daysUntil(m.date) })).sort((a, b) => a.d - b.d);
    if (!arr.length) { list.innerHTML = `<p class="muted">No countdowns yet.</p>`; return; }
    list.innerHTML = arr.map((m) => {
      const when = m.d < 0 ? "passed" : m.d === 0 ? "today" : m.d === 1 ? "tomorrow" : `${m.d} days`;
      return `<div class="row" data-id="${m.id}">
        <div class="row-main"><div class="t">${esc(m.title)}</div><div class="s">${m.date}</div></div>
        <span class="chip" style="${m.d >= 0 && m.d <= 7 ? "color:var(--red);border-color:var(--red)" : ""}">${when}</span>
        <button class="del" title="delete">×</button>
      </div>`;
    }).join("");
    $$("#msList .row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      state.milestones = state.milestones.filter((x) => x.id !== row.dataset.id); persist(); renderMs(); toast("Removed");
    }));
  }
  function addMs() {
    const title = $("#msTitle").value.trim(), date = $("#msDate").value;
    if (!title || !date) { toast("Add a title and date"); return; }
    if (!state.milestones) state.milestones = [];
    state.milestones.push({ id: S.uid("ms"), title, date });
    $("#msTitle").value = ""; $("#msDate").value = ""; persist(); renderMs(); toast("Countdown added");
  }
  $("#addMs").addEventListener("click", addMs);
  $("#msTitle").addEventListener("keydown", (e) => { if (e.key === "Enter") addMs(); });

  render();
  renderMs();
})();
