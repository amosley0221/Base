/* ===========================================================
   BASE — School / GPA calculator logic
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store, { $, $$, esc, toast } = window.UI;
  let state = S.load();
  if (!state.school) state.school = S.clone(S.SEED.school);
  const sc = state.school;
  const persist = () => S.save(state);

  const gradeTier = (g) => g[0].toLowerCase();
  function gradeOptions(sel) {
    return S.GRADES.map((g) => `<option value="${g[0]}" ${g[0] === sel ? "selected" : ""}>${g[0]} (${g[1].toFixed(1)})</option>`).join("");
  }
  $("#cGrade").innerHTML = gradeOptions("A");
  $("#pGrade").innerHTML = gradeOptions("A-");

  // ---------- GPA math ----------
  function gpaOf(list) {
    let pts = 0, cr = 0;
    list.forEach((c) => { const p = S.gradePoints(c.grade); const k = +c.credits || 0; if (p != null) { pts += p * k; cr += k; } });
    return { gpa: cr ? pts / cr : null, points: pts, credits: cr };
  }
  function clampGpa(x) { return Math.max(0, Math.min(4, x)); }

  function compute() {
    const cur = gpaOf(sc.completed);
    const all = gpaOf(sc.completed.concat(sc.planned));
    const needed = +sc.creditsNeeded || 0;
    const remaining = Math.max(0, needed - cur.credits);
    return { cur, all, needed, remaining };
  }

  // ---------- DIAL + STATS ----------
  function renderDial() {
    const { cur, all } = compute();
    const R = 90, C = 2 * Math.PI * R;
    const frac = (cur.gpa || 0) / 4;
    const pfrac = (all.gpa || 0) / 4;
    $("#dial").innerHTML = `
      <svg viewBox="0 0 220 220">
        <circle class="track" cx="110" cy="110" r="${R}"></circle>
        <circle class="proj" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - pfrac)).toFixed(1)}"></circle>
        <circle class="fill" cx="110" cy="110" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"></circle>
      </svg>
      <div class="center">
        <div>
          <div class="g">${cur.gpa != null ? cur.gpa.toFixed(2) : "—"}</div>
          <div class="lt">${cur.gpa != null ? S.gpaLetter(cur.gpa) : ""}</div>
          <div class="of">GPA · out of 4.0</div>
        </div>
      </div>`;
  }

  function renderStats() {
    const { cur, all, needed, remaining } = compute();
    const projDelta = (cur.gpa != null && all.gpa != null) ? all.gpa - cur.gpa : 0;
    $("#gpaStats").innerHTML = `
      <div class="gpa-stat"><div class="n">${cur.gpa != null ? cur.gpa.toFixed(2) : "—"}</div><div class="k">Current GPA</div><div class="sub">${cur.credits} credits graded</div></div>
      <div class="gpa-stat"><div class="n proj">${all.gpa != null ? all.gpa.toFixed(2) : "—"}</div><div class="k">Projected GPA</div><div class="sub">${projDelta >= 0 ? "▲" : "▼"} ${Math.abs(projDelta).toFixed(2)} with planned</div></div>
      <div class="gpa-stat"><div class="n">${cur.credits}<span class="u">/${needed}</span></div><div class="k">Credits done</div><div class="sub">${Math.round((cur.credits / (needed || 1)) * 100)}% of degree</div></div>
      <div class="gpa-stat"><div class="n">${remaining}</div><div class="k">Credits left</div><div class="sub">${sc.planned.length} planned next</div></div>`;
  }

  // ---------- DEGREE BAR ----------
  function renderDegree() {
    const { cur, needed } = compute();
    const plannedCr = sc.planned.reduce((s, c) => s + (+c.credits || 0), 0);
    const donePct = Math.min(100, (cur.credits / (needed || 1)) * 100);
    const planPct = Math.min(100 - donePct, (plannedCr / (needed || 1)) * 100);
    $("#degBar").innerHTML = `<i class="done" style="width:${donePct}%"></i><i class="plan" style="width:${planPct}%"></i>`;
    $("#degHint").textContent = `${cur.credits} of ${needed} credits`;
    $("#degMeta").innerHTML = `
      <span><b>${cur.credits}</b> completed</span>
      <span><b>${plannedCr}</b> in progress / planned</span>
      <span><b>${Math.max(0, needed - cur.credits - plannedCr)}</b> still to schedule</span>`;
  }

  // ---------- COURSE LISTS ----------
  function courseRow(c, listName) {
    const p = S.gradePoints(c.grade);
    return `<div class="course-row" data-id="${c.id}" data-list="${listName}">
      <span class="cname">${esc(c.name)}</span>
      <span class="ccred">${+c.credits || 0} cr</span>
      <button class="grade-pill" data-tier="${gradeTier(c.grade)}" title="click to change grade">${esc(c.grade)}</button>
      <button class="del" title="delete">×</button>
    </div>`;
  }
  function cycleGrade(cur, dir) {
    const i = S.GRADES.findIndex((g) => g[0] === cur);
    const ni = (i + dir + S.GRADES.length) % S.GRADES.length;
    return S.GRADES[ni][0];
  }
  function wireCourseList(sel, listName) {
    $$(sel + " .course-row").forEach((row) => {
      const arr = sc[listName];
      const c = arr.find((x) => x.id === row.dataset.id);
      row.querySelector(".grade-pill").addEventListener("click", () => { c.grade = cycleGrade(c.grade, 1); persist(); renderAll(); });
      row.querySelector(".del").addEventListener("click", () => { sc[listName] = arr.filter((x) => x.id !== c.id); persist(); renderAll(); toast("Removed"); });
    });
  }
  function renderCompleted() {
    $("#completedList").innerHTML = sc.completed.length ? sc.completed.map((c) => courseRow(c, "completed")).join("") : `<p class="muted">No classes yet.</p>`;
    wireCourseList("#completedList", "completed");
  }
  function renderPlanned() {
    $("#plannedList").innerHTML = sc.planned.length ? sc.planned.map((c) => courseRow(c, "planned")).join("") : `<p class="muted">No future classes yet.</p>`;
    wireCourseList("#plannedList", "planned");
  }

  // ---------- PACE PLANNER ----------
  function renderPace() {
    const { cur, needed, remaining } = compute();
    const pace = +sc.creditsPerSem || 15;
    const semesters = remaining > 0 ? Math.ceil(remaining / pace) : 0;
    const years = (semesters / 2).toFixed(1);

    // graduation term estimate
    const now = new Date();
    let term = "";
    if (semesters > 0) {
      const addMonths = semesters * 5; // ~5 months/term incl. break
      const grad = new Date(now.getFullYear(), now.getMonth() + addMonths, 1);
      const season = grad.getMonth() >= 7 ? "Fall" : grad.getMonth() >= 4 ? "Summer" : "Spring";
      term = season + " " + grad.getFullYear();
    } else term = "Done!";

    $("#paceOut").innerHTML = `
      <div class="po-row"><span class="po-k">Credits remaining</span><span class="po-v">${remaining}</span></div>
      <div class="po-row"><span class="po-k">Semesters left</span><span class="po-v">${semesters || "—"}</span></div>
      <div class="po-row"><span class="po-k">That's about</span><span class="po-v">${semesters ? years + " yrs" : "—"}</span></div>
      <div class="po-row"><span class="po-k">On track to finish</span><span class="po-v good">${term}</span></div>`;

    // target GPA reachability
    const target = +sc.targetGpa || 3.5;
    const totalCredits = needed;
    const neededPoints = target * totalCredits - cur.points;
    const reqAvg = remaining > 0 ? neededPoints / remaining : null;
    const note = $("#targetNote");
    if (cur.gpa == null) { note.innerHTML = `Add some completed classes to see what you need for a <b>${target.toFixed(2)}</b>.`; }
    else if (remaining <= 0) { note.innerHTML = `You've hit your credit goal with a <b>${cur.gpa.toFixed(2)}</b> GPA.`; }
    else if (reqAvg > 4.001) { note.innerHTML = `A <b>${target.toFixed(2)}</b> isn't mathematically reachable in your remaining ${remaining} credits — even straight A's land you at <b>${clampGpa((cur.points + 4 * remaining) / totalCredits).toFixed(2)}</b>. Consider a slightly lower target.`; }
    else if (reqAvg < 0) { note.innerHTML = `You're already past a <b>${target.toFixed(2)}</b> — even with low grades ahead you'll stay above it. Nice cushion.`; }
    else { note.innerHTML = `To graduate with a <b>${target.toFixed(2)}</b> GPA, you need to average <b>${reqAvg.toFixed(2)}</b> (${S.gpaLetter(reqAvg)}) across your remaining <b>${remaining}</b> credits.`; }
  }

  // ---------- ASSIGNMENTS ----------
  function dueChip(due) {
    const d = S.daysUntil(due);
    let cls = "", txt = "";
    if (d < 0) { cls = "over"; txt = Math.abs(d) + "d late"; }
    else if (d === 0) { cls = "today"; txt = "Today"; }
    else if (d === 1) { cls = "soon"; txt = "Tomorrow"; }
    else if (d <= 3) { cls = "soon"; txt = "in " + d + "d"; }
    else { const dt = new Date(due.split("-")[0], +due.split("-")[1] - 1, +due.split("-")[2]); txt = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
    return `<span class="asgn-due ${cls}">${txt}</span>`;
  }
  function renderAsgn() {
    if (!sc.assignments) sc.assignments = [];
    const sorted = sc.assignments.slice().sort((a, b) => (a.done - b.done) || (S.daysUntil(a.due) - S.daysUntil(b.due)));
    $("#asgnList").innerHTML = sorted.length ? sorted.map((a) => `
      <div class="asgn-row ${a.done ? "done" : ""}" data-id="${a.id}">
        <div class="check ${a.done ? "on" : ""}" role="button" title="mark done"></div>
        <div class="row-main"><div class="at">${esc(a.title)}${a.type ? ` <span class="asgn-tag t-${esc(a.type)}${(a.draft && writeable(a)) ? " has" : ""}">${(a.draft && writeable(a)) ? "draft saved" : esc(a.type)}</span>` : ""}</div>${a.course ? `<div class="acourse">${esc(a.course)}</div>` : ""}</div>
        ${writeable(a) ? `<button class="asgn-ai" data-ai title="Draft with AI">✎ Draft</button>` : ""}
        ${dueChip(a.due)}
        <button class="del" title="delete">×</button>
      </div>`).join("") : `<p class="muted">Nothing due. Enjoy the breather.</p>`;
    $$("#asgnList .asgn-row").forEach((row) => {
      const a = sc.assignments.find((x) => x.id === row.dataset.id);
      row.querySelector(".check").addEventListener("click", () => { a.done = !a.done; persist(); renderAsgn(); });
      row.querySelector(".del").addEventListener("click", () => { sc.assignments = sc.assignments.filter((x) => x.id !== a.id); persist(); renderAsgn(); toast("Removed"); });
      const ai = row.querySelector("[data-ai]");
      if (ai) ai.addEventListener("click", () => openEssay(a));
    });
  }

  // ---------- ADDERS ----------
  $("#addCompleted").addEventListener("click", () => {
    const name = $("#cName").value.trim(), cr = +$("#cCred").value, grade = $("#cGrade").value;
    if (!name || !(cr > 0)) { toast("Add a course and credits"); return; }
    sc.completed.push({ id: S.uid("c"), name, credits: cr, grade });
    $("#cName").value = ""; $("#cCred").value = ""; persist(); renderAll(); toast("Class added");
  });
  $("#addPlanned").addEventListener("click", () => {
    const name = $("#pName").value.trim(), cr = +$("#pCred").value, grade = $("#pGrade").value;
    if (!name || !(cr > 0)) { toast("Add a course and credits"); return; }
    sc.planned.push({ id: S.uid("p"), name, credits: cr, grade });
    $("#pName").value = ""; $("#pCred").value = ""; persist(); renderAll(); toast("Class added");
  });
  $("#addAsgn").addEventListener("click", () => {
    const title = $("#aTitle").value.trim(), course = $("#aCourse").value.trim(), due = $("#aDue").value;
    const type = ($("#aType") && $("#aType").value) || "task";
    if (!title || !due) { toast("Add a title and due date"); return; }
    if (!sc.assignments) sc.assignments = [];
    sc.assignments.push({ id: S.uid("as"), title, course, due, done: false, type, notes: "" });
    $("#aTitle").value = ""; $("#aCourse").value = ""; $("#aDue").value = ""; if ($("#aType")) $("#aType").value = "task";
    persist(); renderAsgn(); toast((type === "essay" || type === "discussion") ? "Added — hit Draft for an AI draft" : "Assignment added");
  });

  // ---------- ESSAY ASSISTANT (AI draft) ----------
  function writeable(a) { return a && (a.type === "essay" || a.type === "discussion"); }
  const eModal = $("#essayModal");
  let essayA = null, essayCtrl = null;
  function eStatus(msg, cls) { const s = $("#emStatus"); if (s) { s.textContent = msg || ""; s.className = "em-status" + (cls ? " " + cls : ""); } }
  function openEssay(a) {
    essayA = a;
    $("#emTitle").textContent = a.title || "Essay";
    $("#emCourse").textContent = a.course || "";
    $("#emNotes").value = a.notes || "";
    $("#emDraft").value = a.draft || "";
    const ready = !!(window.BaseAI && window.BaseAI.hasKey());
    eStatus(ready ? "" : "Add your Anthropic API key on Settings to generate a draft.", ready ? "" : "warn");
    eModal.hidden = false; document.body.classList.add("modal-open");
  }
  function closeEssay() {
    if (essayCtrl) { essayCtrl.abort(); essayCtrl = null; }
    if (essayA) { essayA.notes = $("#emNotes").value; essayA.draft = $("#emDraft").value; persist(); }
    eModal.hidden = true; document.body.classList.remove("modal-open"); essayA = null; renderAsgn();
  }
  if (eModal) {
    eModal.addEventListener("click", (e) => { if (e.target.closest("[data-eclose]")) closeEssay(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !eModal.hidden) closeEssay(); });
    $("#emGenerate").addEventListener("click", async () => {
      if (!(window.BaseAI && window.BaseAI.hasKey())) { eStatus("Add your Anthropic API key on Settings first.", "warn"); return; }
      const notes = $("#emNotes").value; if (essayA) essayA.notes = notes;
      const gen = $("#emGenerate"), stop = $("#emStop"), draft = $("#emDraft");
      draft.value = ""; gen.disabled = true; gen.hidden = true; stop.hidden = false; eStatus("Drafting…");
      essayCtrl = new AbortController();
      try {
        await window.BaseAI.draftEssay(
          { title: essayA.title, course: essayA.course, notes, type: essayA.type },
          (chunk) => { draft.value += chunk; draft.scrollTop = draft.scrollHeight; },
          essayCtrl.signal
        );
        if (essayA) { essayA.draft = draft.value; essayA.notes = notes; persist(); }
        eStatus("Draft ready — revise away.", "ok");
      } catch (e) {
        if (e && e.name === "AbortError") eStatus("Stopped.");
        else if (e && e.message === "no-key") eStatus("Add your API key on Settings first.", "warn");
        else eStatus((e && e.message) || "Something went wrong.", "warn");
      } finally {
        gen.disabled = false; gen.hidden = false; stop.hidden = true; essayCtrl = null;
      }
    });
    $("#emStop").addEventListener("click", () => { if (essayCtrl) essayCtrl.abort(); });
    $("#emCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("#emDraft").value); eStatus("Copied.", "ok"); }
      catch (e) { eStatus("Couldn't copy.", "warn"); }
    });
    $("#emDownload").addEventListener("click", () => {
      const text = $("#emDraft").value.trim();
      if (!text) { eStatus("Nothing to download yet.", "warn"); return; }
      window.BaseAI.downloadDoc((essayA && essayA.title) || "Draft", text); eStatus("Downloaded .doc", "ok");
    });
    $("#emSave").addEventListener("click", () => {
      if (essayA) { essayA.draft = $("#emDraft").value; essayA.notes = $("#emNotes").value; persist(); }
      toast("Draft saved"); closeEssay();
    });
    // revise bar — shorten / expand / formal / simpler / fix grammar
    $$("#emRevise .rev-btn").forEach((b) => b.addEventListener("click", () => runRevise(b.dataset.revise)));
  }
  function reviseDisabled(d) { $$("#emRevise .rev-btn").forEach((b) => (b.disabled = d)); }
  async function runRevise(action) {
    if (!(window.BaseAI && window.BaseAI.hasKey())) { eStatus("Add your API key on Settings first.", "warn"); return; }
    const draft = $("#emDraft"), text = draft.value.trim();
    if (!text) { eStatus("Generate or write a draft first.", "warn"); return; }
    const gen = $("#emGenerate"), stop = $("#emStop"), prev = draft.value;
    gen.disabled = true; stop.hidden = false; reviseDisabled(true); eStatus(window.BaseAI.reviseLabel(action) + "…");
    essayCtrl = new AbortController(); draft.value = "";
    try {
      await window.BaseAI.revise(action, text, { title: essayA && essayA.title }, (chunk) => { draft.value += chunk; draft.scrollTop = draft.scrollHeight; }, essayCtrl.signal);
      if (essayA) { essayA.draft = draft.value; persist(); }
      eStatus("Updated — revise more or save.", "ok");
    } catch (e) {
      draft.value = prev;                                   // keep their work on stop/error
      if (e && e.name === "AbortError") eStatus("Stopped.");
      else eStatus((e && e.message) || "Something went wrong.", "warn");
    } finally {
      gen.disabled = false; stop.hidden = true; reviseDisabled(false); essayCtrl = null;
    }
  }

  // ---------- SLIDERS ----------
  function bindSlider(id, valId, key, fmt) {
    const sl = $(id), out = $(valId);
    sl.value = sc[key];
    out.textContent = fmt ? fmt(sc[key]) : sc[key];
    sl.addEventListener("input", () => { sc[key] = +sl.value; out.textContent = fmt ? fmt(sc[key]) : sc[key]; renderPace(); renderDegree(); renderStats(); renderDial(); });
    sl.addEventListener("change", persist);
  }
  bindSlider("#needSlider", "#needVal", "creditsNeeded");
  bindSlider("#paceSlider", "#paceVal", "creditsPerSem");
  bindSlider("#targetSlider", "#targetVal", "targetGpa", (v) => (+v).toFixed(2));

  // ---------- RENDER ----------
  function renderAll() { renderDial(); renderStats(); renderDegree(); renderCompleted(); renderPlanned(); renderPace(); }
  renderAll(); renderAsgn();
})();
