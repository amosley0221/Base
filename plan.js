/* ===========================================================
   BASE — Plan editor logic
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store, { $, $$, esc, toast } = window.UI;
  let state = S.load();
  const persist = () => S.save(state);

  // ---------- PROFILE ----------
  $("#name").value = state.profile.name || "";
  $("#major").value = state.profile.major || "";
  $("#saveProfile").addEventListener("click", () => {
    state.profile.name = $("#name").value.trim();
    state.profile.major = $("#major").value.trim();
    persist(); toast("Saved");
  });

  // ---------- TASKS ----------
  function renderTasks() {
    const list = $("#taskList");
    if (!state.tasks.length) { list.innerHTML = `<p class="muted">No tasks yet.</p>`; return; }
    list.innerHTML = state.tasks.map((t) => `
      <div class="row ${t.done ? "done" : ""}" data-id="${t.id}">
        <div class="check ${t.done ? "on" : ""}" data-act="done" role="button" title="mark done"></div>
        <div class="row-main"><div class="t">${esc(t.text)}</div></div>
        <button class="iconbtn" data-act="top" title="toggle today's focus" style="${t.top ? "color:var(--red);border-color:var(--red)" : ""}">★</button>
        <button class="del" data-act="del" title="delete">×</button>
      </div>`).join("");
    $$("#taskList .row").forEach((row) => {
      const t = state.tasks.find((x) => x.id === row.dataset.id);
      row.querySelector('[data-act="done"]').addEventListener("click", () => { t.done = !t.done; persist(); renderTasks(); });
      row.querySelector('[data-act="top"]').addEventListener("click", () => { t.top = !t.top; persist(); renderTasks(); });
      row.querySelector('[data-act="del"]').addEventListener("click", () => { state.tasks = state.tasks.filter((x) => x.id !== t.id); persist(); renderTasks(); });
    });
  }
  function addTask() {
    const v = $("#taskText").value.trim(); if (!v) return;
    state.tasks.unshift({ id: S.uid("t"), text: v, done: false, top: state.tasks.filter((t) => t.top).length < 3 });
    $("#taskText").value = ""; persist(); renderTasks(); toast("Task added");
  }
  $("#addTask").addEventListener("click", addTask);
  $("#taskText").addEventListener("keydown", (e) => { if (e.key === "Enter") addTask(); });

  // ---------- HABITS ----------
  function renderHabits() {
    const list = $("#habitList");
    if (!state.habits.length) { list.innerHTML = `<p class="muted">No habits yet.</p>`; return; }
    list.innerHTML = state.habits.map((h) => `
      <div class="row" data-id="${h.id}">
        <div class="row-main"><div class="t">${esc(h.name)}</div><div class="s">${h.days.filter(Boolean).length}/${h.target} this week</div></div>
        <button class="del" data-act="del" title="delete">×</button>
      </div>`).join("");
    $$("#habitList .row").forEach((row) => row.querySelector('[data-act="del"]').addEventListener("click", () => {
      state.habits = state.habits.filter((x) => x.id !== row.dataset.id); persist(); renderHabits(); toast("Removed");
    }));
  }
  function addHabit() {
    const v = $("#habitName").value.trim(); if (!v) return;
    const target = Math.min(7, Math.max(1, +$("#habitTarget").value || 4));
    state.habits.push({ id: S.uid("h"), name: v, target, days: [false, false, false, false, false, false, false] });
    $("#habitName").value = ""; persist(); renderHabits(); toast("Habit added");
  }
  $("#addHabit").addEventListener("click", addHabit);
  $("#habitName").addEventListener("keydown", (e) => { if (e.key === "Enter") addHabit(); });

  // ---------- TEAMS ----------
  const leagueSel = $("#leagueSel"), teamSel = $("#teamSel");
  leagueSel.innerHTML = window.Sports.LEAGUES.map((l) => `<option value="${l.league}">${l.label}</option>`).join("");
  function leagueInfo(code) { return window.Sports.LEAGUES.find((l) => l.league === code); }
  async function loadTeamOptions() {
    const info = leagueInfo(leagueSel.value);
    teamSel.innerHTML = `<option>Loading…</option>`;
    const arr = await window.Sports.teamList(info.sport, info.league);
    teamSel.innerHTML = arr.length ? arr.map((t) => `<option value="${t.id}" data-name="${esc(t.name)}">${esc(t.name)}</option>`).join("") : `<option value="">None found</option>`;
  }
  leagueSel.addEventListener("change", loadTeamOptions);
  function renderTeams() {
    const list = $("#teamList");
    if (!state.teams || !state.teams.length) { list.innerHTML = `<p class="muted">No teams yet.</p>`; return; }
    list.innerHTML = state.teams.map((t) => `
      <div class="row" data-id="${t.league}-${t.id}">
        <div class="row-main"><div class="t">${esc(t.name)}</div><div class="s">${t.league.toUpperCase()}</div></div>
        <button class="del" title="delete">×</button>
      </div>`).join("");
    $$("#teamList .row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      state.teams = state.teams.filter((x) => (x.league + "-" + x.id) !== row.dataset.id); persist(); renderTeams(); toast("Removed");
    }));
  }
  $("#addTeam").addEventListener("click", () => {
    const opt = teamSel.options[teamSel.selectedIndex];
    if (!opt || !opt.value) return;
    const info = leagueInfo(leagueSel.value);
    if (state.teams.some((t) => t.league === info.league && t.id === opt.value)) { toast("Already added"); return; }
    state.teams.push({ id: opt.value, sport: info.sport, league: info.league, name: opt.dataset.name });
    persist(); renderTeams(); toast("Team added");
  });

  // ---------- RESET ----------
  $("#reseed").addEventListener("click", () => { state = S.clone(S.SEED); persist(); refresh(); toast("Sample data restored"); });
  $("#wipe").addEventListener("click", () => {
    state = { profile: { name: "", major: "" }, tasks: [], habits: [], notes: [], events: [], milestones: [], teams: [] };
    persist(); refresh(); toast("Cleared");
  });
  function refresh() { $("#name").value = state.profile.name || ""; $("#major").value = state.profile.major || ""; renderTasks(); renderHabits(); renderTeams(); }

  renderTasks(); renderHabits(); renderTeams(); loadTeamOptions();
})();
