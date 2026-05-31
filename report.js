/* ===========================================================
   BASE — Report renderer (print / PDF)
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => "$" + Math.round(n).toLocaleString();
  const state = S.load();

  let sections = ["overview", "tasks", "habits", "week", "school", "budget", "notes"];
  try { const s = JSON.parse(localStorage.getItem("base_report_sections")); if (Array.isArray(s) && s.length) sections = s; } catch (e) {}

  const out = [];

  // ---------- HEADER ----------
  const name = (state.profile && state.profile.name) || "";
  const major = (state.profile && state.profile.major) || "";
  out.push(`<div class="r-head">
    <div><div class="r-title">Personal Report</div><div class="r-sub">A snapshot from your BASE homebase</div></div>
    <div class="r-meta">${name ? `<div class="nm">${esc(name)}</div>` : ""}${major ? esc(major) + "<br>" : ""}${S.formatDate()}</div>
  </div>`);

  const has = (k) => sections.indexOf(k) >= 0;

  // ---------- OVERVIEW ----------
  if (has("overview")) {
    const topTasks = (state.tasks || []).filter((t) => t.top);
    const doneTop = topTasks.filter((t) => t.done).length;
    const cur = gpa(state.school && state.school.completed);
    const b = state.budget || {};
    const income = (b.incomes || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const spend = (b.expenses || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const cash = (b.accounts || []).filter((a) => a.type === "debit").reduce((s, a) => s + (+a.balance || 0), 0);
    out.push(section("Overview", "", `<div class="r-stats">
      <div class="r-stat"><div class="n">${doneTop}/${topTasks.length}</div><div class="k">Focus tasks</div></div>
      <div class="r-stat"><div class="n">${cur.gpa != null ? cur.gpa.toFixed(2) : "—"}</div><div class="k">Current GPA</div></div>
      <div class="r-stat"><div class="n green">${money(cash)}</div><div class="k">Total cash</div></div>
      <div class="r-stat"><div class="n ${income - spend < 0 ? "red" : "green"}">${money(income - spend)}</div><div class="k">Left / month</div></div>
    </div>`));
  }

  // ---------- TASKS ----------
  if (has("tasks")) {
    const tasks = state.tasks || [];
    const top = tasks.filter((t) => t.top), rest = tasks.filter((t) => !t.top);
    let body = "";
    if (top.length) body += top.map(taskRow).join("");
    if (rest.length) { body += `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--r-faint);margin:14px 0 4px">Everything else</div>` + rest.map(taskRow).join(""); }
    if (!body) body = `<div class="r-empty">No tasks.</div>`;
    out.push(section("Tasks", top.length ? top.filter((t) => t.done).length + "/" + top.length + " focus done" : "", body));
  }

  // ---------- HABITS ----------
  if (has("habits")) {
    const habits = state.habits || [];
    let body = habits.length ? habits.map((h) => {
      const done = h.days.filter(Boolean).length;
      const cells = S.DAYS.map((d, i) => `<span class="dot" style="${h.days[i] ? "background:var(--r-red)" : "background:var(--r-edge)"}"></span>`).join("");
      return `<div class="r-habit"><div><b>${esc(h.name)}</b> &nbsp;<span style="color:var(--r-faint);font-size:12px">${done}/${h.target} this week</span></div><div>${cells}</div></div>`;
    }).join("") : `<div class="r-empty">No habits.</div>`;
    out.push(section("Habits", "Mon → Sun", body));
  }

  // ---------- WEEK ----------
  if (has("week")) {
    const events = state.events || [];
    let body = "";
    S.DAYS_FULL.forEach((day, i) => {
      const evs = events.filter((e) => e.day === i).sort((a, z) => a.time.localeCompare(z.time));
      if (!evs.length) return;
      body += `<div class="r-week"><div class="wd">${day}</div>` + evs.map((e) =>
        `<div class="r-row"><span class="dot ${e.cat}"></span><span class="grow">${esc(e.title)}</span><span class="tag">${fmtTime(e.time)}</span></div>`).join("") + `</div>`;
    });
    if (!body) body = `<div class="r-empty">Nothing scheduled.</div>`;
    out.push(section("Weekly schedule", "", body));
  }

  // ---------- SCHOOL ----------
  if (has("school") && state.school) {
    const sc = state.school;
    const cur = gpa(sc.completed), all = gpa((sc.completed || []).concat(sc.planned || []));
    const needed = +sc.creditsNeeded || 0;
    let body = `<div class="r-stats" style="margin-bottom:18px">
      <div class="r-stat"><div class="n">${cur.gpa != null ? cur.gpa.toFixed(2) : "—"}</div><div class="k">Current GPA</div></div>
      <div class="r-stat"><div class="n green">${all.gpa != null ? all.gpa.toFixed(2) : "—"}</div><div class="k">Projected</div></div>
      <div class="r-stat"><div class="n">${cur.credits}/${needed}</div><div class="k">Credits</div></div>
      <div class="r-stat"><div class="n">${Math.max(0, needed - cur.credits)}</div><div class="k">Remaining</div></div></div>`;
    if ((sc.completed || []).length) body += courseTable("Completed", sc.completed);
    if ((sc.planned || []).length) body += courseTable("Planned", sc.planned);
    const asg = (sc.assignments || []).filter((a) => !a.done).sort((a, z) => S.daysUntil(a.due) - S.daysUntil(z.due));
    if (asg.length) body += `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--r-faint);margin:16px 0 4px">Upcoming assignments</div>` +
      asg.map((a) => `<div class="r-row"><span class="grow">${esc(a.title)}${a.course ? ` <span style="color:var(--r-faint)">· ${esc(a.course)}</span>` : ""}</span><span class="tag">${dueLabel(a.due)}</span></div>`).join("");
    out.push(section("School & GPA", major ? esc(major) : "", body));
  }

  // ---------- BUDGET ----------
  if (has("budget") && state.budget) {
    const b = state.budget;
    const income = (b.incomes || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const tax = b.taxRate || 0;
    const bills = (b.bills || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const subs = (b.subscriptions || []).reduce((s, x) => s + (x.cycle === "yearly" ? (+x.amount || 0) / 12 : (+x.amount || 0)), 0);
    const cash = (b.accounts || []).filter((a) => a.type === "debit").reduce((s, a) => s + (+a.balance || 0), 0);
    const owed = (b.accounts || []).filter((a) => a.type === "credit").reduce((s, a) => s + (+a.balance || 0), 0);
    let body = `<div class="r-stats" style="margin-bottom:18px">
      <div class="r-stat"><div class="n green">${money(cash)}</div><div class="k">Total cash</div></div>
      <div class="r-stat"><div class="n green">${money(income * 12)}</div><div class="k">Yearly (gross)</div></div>
      <div class="r-stat"><div class="n green">${money(income * 12 * (1 - tax))}</div><div class="k">After ${Math.round(tax * 100)}% tax</div></div>
      <div class="r-stat"><div class="n ${owed ? "red" : ""}">${money(owed)}</div><div class="k">Credit owed</div></div></div>`;
    // due dates
    const due = [];
    (b.bills || []).forEach((x) => { if (x.due) due.push({ name: x.label, amount: +x.amount || 0, due: x.due, kind: "Bill" }); });
    (b.subscriptions || []).forEach((x) => { if (x.due) due.push({ name: x.label, amount: +x.amount || 0, due: x.due, kind: "Subscription" }); });
    (b.accounts || []).forEach((a) => { if (a.type === "credit" && a.due) due.push({ name: a.label + " payment", amount: +a.balance || 0, due: a.due, kind: "Card" }); });
    due.forEach((d) => (d.d = S.daysUntilDom(d.due))); due.sort((a, z) => a.d - z.d);
    if (due.length) body += `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--r-faint);margin:6px 0 4px">Upcoming due dates · ${money(bills)}/mo bills · ${money(subs)}/mo subs</div>` +
      due.map((d) => `<div class="r-row"><span class="tag">${S.ordinal(d.due)}</span><span class="grow">${esc(d.name)} <span style="color:var(--r-faint)">· ${d.kind}</span></span><span class="amt">${money(d.amount)}</span></div>`).join("");
    out.push(section("Budget", "monthly", body));
  }

  // ---------- NOTES ----------
  if (has("notes")) {
    const notes = state.notes || [];
    let body = notes.length ? notes.map((n) => `<div class="r-note"><h4>${esc(n.title || "Untitled")}</h4><p>${esc(n.body || "")}</p></div>`).join("") : `<div class="r-empty">No notes.</div>`;
    out.push(section("Notes", "", body));
  }

  // ---------- TEAMS ----------
  if (has("teams")) {
    const teams = state.teams || [];
    let body = teams.length ? teams.map((t) => `<div class="r-row"><span class="grow"><b>${esc(t.name)}</b></span><span class="tag">${esc((t.league || "").toUpperCase())}</span></div>`).join("") : `<div class="r-empty">No teams.</div>`;
    out.push(section("Teams", "", body));
  }

  document.getElementById("report").innerHTML = out.join("");
  document.getElementById("printBtn").addEventListener("click", () => window.print());

  // ---------- helpers ----------
  function section(title, sub, body) { return `<div class="r-section"><h2>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</h2>${body}</div>`; }
  function taskRow(t) { return `<div class="r-row"><span class="box ${t.done ? "on" : ""}"></span><span class="grow ${t.done ? "done" : ""}">${esc(t.text)}</span>${t.top ? `<span class="tag">focus</span>` : ""}</div>`; }
  function gpa(list) { let p = 0, c = 0; (list || []).forEach((x) => { const g = S.gradePoints(x.grade); const k = +x.credits || 0; if (g != null) { p += g * k; c += k; } }); return { gpa: c ? p / c : null, credits: c }; }
  function courseTable(label, list) {
    return `<div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--r-faint);margin:14px 0 6px">${label}</div>
      <table class="r-tab"><thead><tr><th class="l">Course</th><th>Credits</th><th>Grade</th></tr></thead><tbody>
      ${list.map((c) => `<tr><td class="l">${esc(c.name)}</td><td>${+c.credits || 0}</td><td class="grade">${esc(c.grade)}</td></tr>`).join("")}
      </tbody></table>`;
  }
  function fmtTime(t) { let [h, m] = t.split(":").map(Number); const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12; return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap; }
  function dueLabel(due) {
    const d = S.daysUntil(due);
    if (d < 0) return Math.abs(d) + "d late";
    if (d === 0) return "Today"; if (d === 1) return "Tomorrow"; if (d <= 6) return "in " + d + "d";
    const p = due.split("-"); return new Date(p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
})();
