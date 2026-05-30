/* ===========================================================
   BASE — Home logic: personal assistant dashboard
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let state = S.load();
  // defend against older saves missing the newer collections
  state.budget = state.budget || {};
  ["incomes", "bills", "subscriptions", "cards"].forEach((k) => { if (!Array.isArray(state.budget[k])) state.budget[k] = []; });
  state.academics = state.academics || {};
  ["courses", "assignments"].forEach((k) => { if (!Array.isArray(state.academics[k])) state.academics[k] = []; });
  if (!Array.isArray(state.teams)) state.teams = [];
  const tIdx = S.todayIdx();
  let selDay = tIdx;
  let sportsToday = [];
  const persist = () => S.save(state);

  function timeToMin(t) { const p = t.split(":").map(Number); return p[0] * 60 + p[1]; }
  function fmtTime(t) {
    let [h, m] = t.split(":").map(Number);
    const ap = h < 12 ? "am" : "pm"; h = h % 12 || 12;
    return h + (m ? ":" + String(m).padStart(2, "0") : "") + ap;
  }
  function listJoin(a) {
    if (a.length === 1) return a[0];
    if (a.length === 2) return a[0] + " and " + a[1];
    return a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];
  }

  // ---------- HEADER + PREVIEW ----------
  function renderHeader() {
    const name = (state.profile.name || "Antonio").trim();
    $("#greet").textContent = S.greeting() + ", " + name + ".";
    $("#date").textContent = S.formatDate();
  }

  function renderPreview() {
    const evs = state.events.filter((e) => e.day === tIdx);
    const school = evs.filter((e) => e.cat === "school");
    const work = evs.filter((e) => e.cat === "work");
    const move = evs.filter((e) => e.cat === "move");
    const personal = evs.filter((e) => e.cat === "personal");
    const weekend = S.isWeekend(tIdx);

    let lead = "";
    if (weekend && work.length === 0) lead = `It's ${S.DAYS_FULL[tIdx]} — no work today. `;

    const seg = [];
    if (school.length) seg.push(`<span class="accent">${school.length} class${school.length > 1 ? "es" : ""}</span>`);
    if (work.length) seg.push(work.length > 1 ? `${work.length} shifts` : `a ${work[0].title.toLowerCase()}`);
    if (move.length) seg.push(`a workout at ${fmtTime(move[0].time)}`);
    if (personal.length && !seg.length) seg.push(personal[0].title.toLowerCase());

    let body;
    if (seg.length) body = (weekend && lead ? "Just " : "Today: ") + listJoin(seg) + ".";
    else body = weekend ? "Nothing on the books. Enjoy it." : "Nothing scheduled — open space.";

    let sport = "";
    if (sportsToday.length) {
      const s = sportsToday[0];
      sport = s.live ? ` Your <span class="accent">${esc(s.team)}</span> are playing now.` : ` Your <span class="accent">${esc(s.team)}</span> play at ${esc(s.time)}.`;
    }
    $("#preview").innerHTML = lead + body + sport;
  }

  // ---------- COUNTDOWN HEADLINE ----------
  function renderCountdown() {
    const up = (state.milestones || []).map((m) => ({ ...m, d: S.daysUntil(m.date) }))
      .filter((m) => m.d >= 0).sort((a, b) => a.d - b.d);
    const big = $("#heroStatement .big");
    const sub = $("#heroStatement .sub");
    if (up.length) {
      const m = up[0];
      big.textContent = m.d === 0 ? `${m.title} is today.` : m.d === 1 ? `${m.title} is tomorrow.` : `${m.d} days until ${m.title}.`;
      const second = up[1];
      sub.textContent = second ? `then ${second.title.toLowerCase()} in ${second.d} days` : S.formatDate();
    } else {
      big.textContent = S.isWeekend() ? "It's the weekend." : "Here's your day.";
      sub.textContent = S.isWeekend() ? "No work — enjoy it." : "One thing at a time";
    }
  }

  // ---------- TODAY CARD ----------
  function renderTodayCard() {
    const top = state.tasks.filter((t) => t.top);
    const topDone = top.filter((t) => t.done).length;
    const next = top.find((t) => !t.done);
    const todayEvents = state.events.filter((e) => e.day === tIdx).length;
    const habitsToday = state.habits.filter((h) => h.days[tIdx]).length;
    $("#tcFocus").textContent = next ? next.text : "All clear — take a breath.";
    $("#tcDay").textContent = S.DAYS[tIdx];
    $("#tcStats").innerHTML = `
      <div class="stat"><div class="n">${topDone}<span class="unit">/${top.length || 0}</span></div><div class="k">focus tasks</div></div>
      <div class="stat"><div class="n">${todayEvents}</div><div class="k">on today</div></div>
      <div class="stat"><div class="n">${habitsToday}<span class="unit">/${state.habits.length}</span></div><div class="k">habits</div></div>`;
  }

  // ---------- TASKS + RING ----------
  const RC = 2 * Math.PI * 54;
  function renderTasks() {
    const top = state.tasks.filter((t) => t.top);
    const done = top.filter((t) => t.done).length;
    const frac = top.length ? done / top.length : 0;
    const fill = $("#ringFill");
    fill.style.strokeDasharray = RC;
    fill.style.strokeDashoffset = RC * (1 - frac);
    $("#ringN").textContent = done + "/" + top.length;
    const list = $("#taskList");
    if (!top.length) { list.innerHTML = `<p class="muted">No focus tasks yet. Add a few on the Plan page.</p>`; return; }
    list.innerHTML = top.map((t) => `
      <div class="row ${t.done ? "done" : ""}" data-id="${t.id}">
        <div class="check ${t.done ? "on" : ""}" role="button" aria-label="toggle"></div>
        <div class="row-main"><div class="t">${esc(t.text)}</div></div>
      </div>`).join("");
    $$("#taskList .row").forEach((row) => row.querySelector(".check").addEventListener("click", () => {
      const t = state.tasks.find((x) => x.id === row.dataset.id);
      t.done = !t.done; persist(); renderTasks(); renderTodayCard();
    }));
  }

  // ---------- HABITS ----------
  function streak(days) { let s = 0; for (let i = tIdx; i >= 0; i--) { if (days[i]) s++; else break; } return s; }
  function renderHabits() {
    const grid = $("#habitGrid");
    if (!state.habits.length) { grid.innerHTML = `<p class="muted">No habits yet — add some on the Plan page.</p>`; return; }
    grid.innerHTML = state.habits.map((h) => {
      const done = h.days.filter(Boolean).length, st = streak(h.days);
      const dots = S.DAYS.map((d, i) => `<div class="d ${h.days[i] ? "on" : ""} ${i === tIdx ? "today" : ""}" data-i="${i}">${d[0]}</div>`).join("");
      return `<div class="habit" data-id="${h.id}">
        <div class="h-top"><div class="name">${esc(h.name)}</div>
        <div class="meta">${done}/${h.target} this week${st > 1 ? ` · <span class="streak">${st}-day streak</span>` : ""}</div></div>
        <div class="weekdots">${dots}</div></div>`;
    }).join("");
    $$("#habitGrid .habit").forEach((card) => {
      const h = state.habits.find((x) => x.id === card.dataset.id);
      $$(".weekdots .d", card).forEach((dot) => dot.addEventListener("click", () => {
        h.days[+dot.dataset.i] = !h.days[+dot.dataset.i]; persist(); renderHabits(); renderTodayCard();
      }));
    });
  }

  // ---------- NOTES ----------
  function renderNotes() {
    const track = $("#notesTrack");
    if (!state.notes.length) { track.innerHTML = `<div class="note-card"><div class="nc-empty">Nothing on your mind yet.<br>Jot something on the Notes page.</div></div>`; return; }
    track.innerHTML = state.notes.map((n) => `
      <div class="note-card ${n.color === "red" ? "red" : ""}">
        <div class="nc-kicker">Note</div><h3>${esc(n.title || "Untitled")}</h3><p>${esc(n.body || "")}</p>
      </div>`).join("");
  }

  // ---------- WEEK + DAY DETAIL ----------
  function renderWeek() {
    const strip = $("#weekStrip");
    strip.innerHTML = S.DAYS.map((d, i) => {
      const evs = state.events.filter((e) => e.day === i);
      const dots = evs.slice(0, 4).map((e) => `<i data-cat="${e.cat}"></i>`).join("");
      return `<div class="week-day ${i === tIdx ? "today" : ""} ${i === selDay ? "selected" : ""}" data-day="${i}">
        <div class="wd">${d}</div><div class="dots">${dots}</div><div class="cnt">${evs.length ? evs.length : "—"}</div></div>`;
    }).join("");
    $$("#weekStrip .week-day").forEach((c) => c.addEventListener("click", () => { selDay = +c.dataset.day; renderWeek(); renderDay(); }));
    renderDay();
  }

  function miniRow(e) {
    return `<div class="row"><div class="time">${fmtTime(e.time)}</div><div class="row-main"><div class="t">${esc(e.title)}</div></div></div>`;
  }
  function pythonSchool(dayIdx, school) {
    const head = `<span class="c"># ${S.DAYS_FULL[dayIdx]}</span>`;
    if (!school.length) {
      return `<pre class="py">${head}\n<span class="v">classes</span> <span class="o">=</span> <span class="b">[]</span>  <span class="c"># no class — free to build</span></pre>`;
    }
    const items = school.map((e) =>
      `    <span class="b">(</span><span class="s">"${fmtTime(e.time)}"</span><span class="o">,</span> <span class="s">"${esc(e.title)}"</span><span class="b">)</span><span class="o">,</span>`).join("\n");
    return `<pre class="py">${head}
<span class="v">classes</span> <span class="o">=</span> <span class="b">[</span>
${items}
<span class="b">]</span>

<span class="k">for</span> <span class="v">time</span><span class="o">,</span> <span class="v">name</span> <span class="k">in</span> <span class="v">classes</span><span class="o">:</span>
    <span class="fn">attend</span><span class="b">(</span><span class="v">time</span><span class="o">,</span> <span class="v">name</span><span class="b">)</span>  <span class="c"># ${school.length} today</span></pre>`;
  }
  function renderDay() {
    const evs = state.events.filter((e) => e.day === selDay).sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
    const school = evs.filter((e) => e.cat === "school");
    const work = evs.filter((e) => e.cat === "work");
    const rest = evs.filter((e) => e.cat === "move" || e.cat === "personal");
    $("#ddName").innerHTML = S.DAYS_FULL[selDay] + (selDay === tIdx ? `<span class="tag">today</span>` : "");
    $("#ddSchool").innerHTML = pythonSchool(selDay, school);
    $("#ddWork").innerHTML = work.length ? work.map(miniRow).join("") : `<div class="dd-empty">${S.isWeekend(selDay) ? "Off the clock." : "No shifts today."}</div>`;
    $("#ddRest").innerHTML = rest.length ? rest.map(miniRow).join("") : `<div class="dd-empty">No plans — rest up.</div>`;
  }

  // ---------- SCOREBOARD ----------
  function fmtGameTime(date) {
    const wd = S.DAYS[(date.getDay() + 6) % 7];
    const t = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return wd + " " + t;
  }
  function scoreCard(res) {
    const t = res.team;
    if (res.error || !res.chosen) return `<div class="sc-head"><div class="sc-team">${esc(t.name)}</div></div><div class="sc-line muted">Season's quiet right now.</div>`;
    const g = res.chosen, vs = g.home ? "vs" : "@";
    let tag = "", main = "", sub = "";
    if (g.state === "in") { tag = `<span class="sc-tag live">LIVE</span>`; main = `${g.ourScore}–${g.oppScore} <span class="sc-vs">${vs}</span> ${esc(g.oppAbbr || g.opp)}`; sub = g.detail || "In progress"; }
    else if (g.state === "post") { tag = `<span class="sc-tag ${g.winner ? "win" : "loss"}">${g.winner ? "W" : "L"}</span>`; main = `${g.ourScore}–${g.oppScore} <span class="sc-vs">${vs}</span> ${esc(g.opp)}`; sub = "Final"; }
    else { tag = `<span class="sc-tag">NEXT</span>`; main = `<span class="sc-vs">${vs}</span> ${esc(g.opp)}`; sub = fmtGameTime(g.date); }
    return `<div class="sc-head"><div class="sc-team">${esc(t.name)}</div>${tag}</div><div class="sc-line">${main}</div><div class="sc-sub">${sub}</div>`;
  }
  async function renderScores() {
    const grid = $("#scoreGrid");
    if (!state.teams || !state.teams.length) { grid.innerHTML = `<p class="muted">No teams yet — add some on the Plan page.</p>`; return; }
    grid.innerHTML = state.teams.map((t) => `<div class="score-card" data-key="${t.league}-${t.id}"><div class="sc-head"><div class="sc-team">${esc(t.name)}</div></div><div class="sc-line muted">Loading…</div></div>`).join("");
    const results = await Promise.all(state.teams.map((t) => window.Sports.teamGame(t)));
    sportsToday = [];
    results.forEach((res) => {
      const el = $(`.score-card[data-key="${res.team.league}-${res.team.id}"]`);
      if (el) el.innerHTML = scoreCard(res);
      if (res.todayGame) sportsToday.push({ team: res.team.name, time: res.todayGame.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), live: res.todayGame.state === "in" });
    });
    renderPreview();
  }

  // ---------- BUDGET ----------
  function money(n) { return "$" + Math.round(n).toLocaleString(); }

  function budgetTotals(b) {
    const taxRate = clamp(+b.taxRate || 0, 0, 0.6);
    const incomeMo = (b.incomes || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const yearGross = incomeMo * 12;
    const yearNet = yearGross * (1 - taxRate);
    const netMo = yearNet / 12;
    const bills = (b.bills || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const subs = (b.subscriptions || []).reduce((s, x) => s + (+x.amount || 0), 0);
    const cards = b.cards || [];
    const credit = cards.filter((c) => c.kind === "credit");
    const debit = cards.filter((c) => c.kind !== "credit");
    const creditDebt = credit.reduce((s, c) => s + (+c.balance || 0), 0);
    const creditLimit = credit.reduce((s, c) => s + (+c.limit || 0), 0);
    const cash = debit.reduce((s, c) => s + (+c.balance || 0), 0);
    const outMo = bills + subs;
    return { taxRate, incomeMo, yearGross, yearNet, netMo, bills, subs, credit, debit, creditDebt, creditLimit, cash, outMo, leftMo: netMo - outMo };
  }

  // dated obligations (bills + subscriptions + credit-card payments), soonest first
  function dueItems(b) {
    const items = [];
    (b.bills || []).forEach((x) => { const d = S.nextDueDate(x.dueDay); if (d) items.push({ name: x.label || "Bill", amount: +x.amount || 0, date: d, kind: "bill" }); });
    (b.subscriptions || []).forEach((x) => { const d = S.nextDueDate(x.dueDay); if (d) items.push({ name: x.label || "Subscription", amount: +x.amount || 0, date: d, kind: "sub" }); });
    (b.cards || []).filter((c) => c.kind === "credit").forEach((c) => { const d = S.nextDueDate(c.dueDay); if (d) items.push({ name: (c.name || "Card") + " payment", amount: +c.balance || 0, date: d, kind: "card" }); });
    return items.sort((a, c) => a.date - c.date);
  }
  function relDay(n) { return n <= 0 ? "today" : n === 1 ? "tomorrow" : "in " + n + " days"; }
  function shortDate(d) { return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }

  function renderBudget() {
    const b = state.budget;
    const t = budgetTotals(b);

    const tiles = [
      { k: "Total cash", v: money(t.cash), s: t.debit.length + " account" + (t.debit.length === 1 ? "" : "s") },
      { k: "Income / yr", v: money(t.yearGross), s: "before taxes" },
      { k: "After taxes", v: money(t.yearNet), s: Math.round(t.taxRate * 100) + "% est. tax" },
      { k: "Bills / mo", v: money(t.bills), s: (b.bills || []).length + " bills" },
      { k: "Subscriptions / mo", v: money(t.subs), s: (b.subscriptions || []).length + " subs" },
      { k: "Credit balance", v: money(t.creditDebt), s: t.creditLimit ? Math.round((t.creditDebt / t.creditLimit) * 100) + "% utilized" : t.credit.length + " card" + (t.credit.length === 1 ? "" : "s") },
    ];
    const ft = $("#finTiles");
    if (ft) ft.innerHTML = tiles.map((x) => `<div class="fin-tile"><div class="ft-k">${esc(x.k)}</div><div class="ft-v">${x.v}</div><div class="ft-s">${esc(x.s)}</div></div>`).join("");

    const leftEl = $("#bdLeft");
    if (leftEl) {
      leftEl.textContent = (t.leftMo < 0 ? "–" : "") + money(Math.abs(t.leftMo));
      leftEl.classList.toggle("neg", t.leftMo < 0);
      $("#bdIn").textContent = money(t.netMo);
      $("#bdOut").textContent = money(t.outMo);
      const base = Math.max(t.netMo, t.outMo) || 1;
      const seg = (cat, val) => val > 0 ? `<i data-cat="${cat}" style="width:${(val / base) * 100}%"></i>` : "";
      $("#bdBar").innerHTML = seg("bills", t.bills) + seg("subs", t.subs) + (t.leftMo > 0 ? seg("left", t.leftMo) : "");
      renderSpark(b, t.leftMo);
    }

    const due = dueItems(b);
    const dueEl = $("#bdDue");
    if (dueEl) {
      const within = due.filter((x) => S.daysUntilDate(x.date) <= 30);
      const totEl = $("#bdDueTotal");
      if (totEl) totEl.textContent = within.length ? money(within.reduce((s, x) => s + x.amount, 0)) + " in 30 days" : "";
      dueEl.innerHTML = due.length ? due.slice(0, 6).map((x) => {
        const n = S.daysUntilDate(x.date);
        return `<div class="due-row ${n <= 3 ? "soon" : ""}">
          <span class="due-dot" data-kind="${x.kind}"></span>
          <div class="due-main"><div class="due-name">${esc(x.name)}</div><div class="due-when">${shortDate(x.date)} · ${relDay(n)}</div></div>
          <div class="due-amt">${money(x.amount)}</div></div>`;
      }).join("") : `<div class="dd-empty">No dated bills yet.</div>`;
    }

    const cardsEl = $("#bdCards");
    if (cardsEl) {
      const cards = b.cards || [];
      cardsEl.innerHTML = cards.length ? cards.map((c) => {
        if (c.kind === "credit") {
          const util = c.limit ? Math.min(100, ((+c.balance || 0) / c.limit) * 100) : 0;
          const d = S.nextDueDate(c.dueDay);
          return `<div class="acct-card credit">
            <div class="ac-top"><span class="ac-name">${esc(c.name || "Card")}</span><span class="ac-kind">Credit</span></div>
            <div class="ac-bal">${money(c.balance)}</div>
            <div class="ac-sub">${c.limit ? "of " + money(c.limit) + " limit" : "balance"}${d ? " · due " + shortDate(d) : ""}</div>
            <div class="ac-track"><i style="width:${util}%"></i></div></div>`;
        }
        return `<div class="acct-card debit">
          <div class="ac-top"><span class="ac-name">${esc(c.name || "Account")}</span><span class="ac-kind">Debit</span></div>
          <div class="ac-bal">${money(c.balance)}</div>
          <div class="ac-sub">available cash</div></div>`;
      }).join("") : `<div class="dd-empty">No cards yet — add one with “Edit budget”.</div>`;
    }
  }

  function renderSpark(b, left) {
    const spark = $("#bdSpark"); if (!spark) return;
    const cur = S.isoMonth();
    const data = (b.history || []).filter((h) => h.month !== cur).map((h) => ({ left: h.income - h.spend }));
    data.push({ left });
    const pts = data.slice(-7);
    if (pts.length < 2) { spark.innerHTML = ""; return; }
    const W = 280, H = 54;
    const vals = pts.map((p) => p.left);
    const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
    const span = (max - min) || 1;
    const x = (i) => (i / (pts.length - 1)) * W;
    const y = (v) => H - 4 - ((v - min) / span) * (H - 8);
    const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.left).toFixed(1)).join(" ");
    const area = `M0 ${H} ` + pts.map((p, i) => `L${x(i).toFixed(1)} ${y(p.left).toFixed(1)}`).join(" ") + ` L${W} ${H} Z`;
    const change = left - pts[0].left;
    spark.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Leftover trend">
      <path class="sp-area" d="${area}"></path><path class="sp-line" d="${d}"></path>
      <circle class="sp-dot" cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts[pts.length - 1].left).toFixed(1)}" r="3"></circle></svg>
      <div class="sp-cap">leftover · ${change >= 0 ? "up" : "down"} ${money(Math.abs(change))} over ${pts.length} months</div>`;
  }

  // ---------- ACADEMICS / GPA ----------
  const SEASON = { spring: 1, summer: 2, fall: 3, winter: 4 };
  function termOrder(term) {
    const m = String(term).match(/(spring|summer|fall|winter)\s+(\d{4})/i);
    return m ? (+m[2]) * 10 + (SEASON[m[1].toLowerCase()] || 0) : 0;
  }
  function gpaCompute(a) {
    let qpDone = (+a.priorGpa || 0) * (+a.priorCredits || 0);
    let crDone = (+a.priorCredits || 0);    // graded credits (GPA denominator)
    let earned = (+a.priorCredits || 0);    // credits earned toward the degree
    let qpProj = qpDone, crProj = crDone, inProgress = 0;
    (a.courses || []).forEach((c) => {
      const cr = +c.credits || 0;
      if (c.status === "completed") {
        const gp = S.gradePoints(c.grade);
        if (gp != null) { qpDone += gp * cr; crDone += cr; qpProj += gp * cr; crProj += cr; if (c.grade !== "F") earned += cr; }
      } else {
        if (c.status === "in-progress") inProgress += cr;
        const gp = S.gradePoints(c.expected);
        if (gp != null) { qpProj += gp * cr; crProj += cr; }
      }
    });
    return { current: crDone ? qpDone / crDone : 0, projected: crProj ? qpProj / crProj : 0, earned, inProgress, required: +a.requiredCredits || 0 };
  }
  function gpaClass(v) { return v >= 3.5 ? "good" : v >= 2.5 ? "ok" : "low"; }

  function renderAcademics() {
    const a = state.academics;
    const g = gpaCompute(a);
    const now = $("#gpaNow"), proj = $("#gpaProj");
    if (now) { now.textContent = g.current.toFixed(2); now.className = "n " + gpaClass(g.current); }
    if (proj) { proj.textContent = g.projected.toFixed(2); proj.className = "n " + gpaClass(g.projected); }

    const needed = Math.max(0, g.required - g.earned);
    const pct = g.required ? Math.min(100, (g.earned / g.required) * 100) : 0;
    const fill = $("#credFill");
    if (fill) { fill.style.strokeDasharray = RC; fill.style.strokeDashoffset = RC * (1 - pct / 100); }
    const pctEl = $("#credPct"); if (pctEl) pctEl.textContent = Math.round(pct) + "%";
    const meta = $("#credMeta");
    if (meta) meta.innerHTML = `<div><span class="cm-n">${g.earned}</span><span class="cm-k">earned</span></div>
      <div><span class="cm-n">${needed}</span><span class="cm-k">to go</span></div>
      <div><span class="cm-n">${g.required}</span><span class="cm-k">required</span></div>`;

    const courses = a.courses || [];
    const terms = {};
    courses.forEach((c) => { (terms[c.term] = terms[c.term] || []).push(c); });
    const termNames = Object.keys(terms).sort((x, y) => termOrder(x) - termOrder(y));
    const curTerm = (courses.find((c) => c.status === "in-progress") || {}).term || termNames[termNames.length - 1] || "—";
    const tiles = [
      { k: "Credits earned", v: g.earned, s: "of " + g.required },
      { k: "In progress", v: g.inProgress, s: "credits this term" },
      { k: "Classes this term", v: (terms[curTerm] || []).length, s: curTerm },
      { k: "Credits to go", v: needed, s: "to graduate" },
    ];
    const at = $("#acadTiles");
    if (at) at.innerHTML = tiles.map((x) => `<div class="fin-tile"><div class="ft-k">${esc(x.k)}</div><div class="ft-v">${x.v}</div><div class="ft-s">${esc(x.s)}</div></div>`).join("");

    renderAssignments();

    const tEl = $("#acadTerms");
    if (tEl) {
      tEl.innerHTML = termNames.slice().reverse().map((tn) => {
        const cs = terms[tn];
        let qp = 0, cr = 0;
        cs.forEach((c) => { const gp = c.status === "completed" ? S.gradePoints(c.grade) : null; if (gp != null) { qp += gp * (+c.credits || 0); cr += +c.credits || 0; } });
        const tg = cr ? (qp / cr).toFixed(2) : "—";
        const credits = cs.reduce((s, c) => s + (+c.credits || 0), 0);
        const rows = cs.map((c) => {
          const grade = c.status === "completed" ? (c.grade || "—") : (c.expected ? c.expected + "*" : "—");
          return `<div class="term-row"><span class="tr-code">${esc(c.code || "")}</span><span class="tr-name">${esc(c.name)}</span><span class="tr-cr">${c.credits}cr</span><span class="tr-grade">${esc(grade)}</span></div>`;
        }).join("");
        return `<div class="term-block"><div class="term-head"><h4>${esc(tn)}</h4><span class="term-gpa">GPA ${tg} · ${credits}cr</span></div>${rows}</div>`;
      }).join("");
    }
  }

  function renderAssignments() {
    const a = state.academics;
    const list = (a.assignments || []).map((x) => ({ ...x, days: x.due ? S.daysUntil(x.due) : null }))
      .filter((x) => !x.done)
      .sort((p, q) => (p.days == null ? 1e9 : p.days) - (q.days == null ? 1e9 : q.days));
    const el = $("#acadAssign");
    if (!el) return;
    if (!list.length) { el.innerHTML = `<div class="dd-empty">Nothing due — you're clear.</div>`; return; }
    el.innerHTML = list.slice(0, 6).map((x) => {
      const when = x.days == null ? "" : x.days <= 0 ? "due today" : x.days === 1 ? "due tomorrow" : "in " + x.days + " days";
      return `<div class="assign-row ${x.days != null && x.days <= 2 ? "soon" : ""}" data-id="${x.id}">
        <span class="check" role="button" aria-label="mark done"></span>
        <div class="assign-main"><div class="assign-title">${esc(x.title || "Untitled")}</div>
          <div class="assign-sub">${esc(x.course || "")}${x.course && when ? " · " : ""}${when}</div></div></div>`;
    }).join("");
    $$("#acadAssign .assign-row").forEach((row) => row.querySelector(".check").addEventListener("click", () => {
      const it = (state.academics.assignments || []).find((y) => y.id === row.dataset.id);
      if (it) { it.done = true; persist(); renderAssignments(); }
    }));
  }

  // ---------- EDITOR SHEET (budget / courses) ----------
  const sheet = $("#sheet"), sheetBody = $("#sheetBody"), sheetTitle = $("#sheetTitle");
  let sheetKind = null;
  function grpArray(grp) {
    return { incomes: state.budget.incomes, bills: state.budget.bills, subscriptions: state.budget.subscriptions,
      cards: state.budget.cards, courses: state.academics.courses, assignments: state.academics.assignments }[grp] || null;
  }
  function liveRender() { if (sheetKind === "budget") renderBudget(); else if (sheetKind === "acad") renderAcademics(); else if (sheetKind === "teams") renderScores(); }
  function attr(v) { return v == null ? "" : String(v).replace(/"/g, "&quot;"); }
  function inp(grp, id, f, value, o) {
    o = o || {};
    if (o.options) return `<select class="field field--sm" data-grp="${grp}" data-id="${id}" data-field="${f}">${o.options.map((op) => `<option value="${attr(op)}" ${String(value || "") === String(op) ? "selected" : ""}>${op === "" ? "—" : op}</option>`).join("")}</select>`;
    const type = o.type || "text";
    return `<input class="field field--sm" type="${type}" ${type === "number" ? 'inputmode="decimal"' : ""} data-grp="${grp}" data-id="${id}" data-field="${f}" value="${attr(value)}" placeholder="${o.ph || ""}" />`;
  }
  function row(inner, grp, id) { return `<div class="ed-row" data-grp="${grp}" data-id="${id}">${inner}<button class="ed-del" type="button" data-del aria-label="Remove" data-cursor>&times;</button></div>`; }
  const emptyHint = (t) => `<div class="dd-empty">${t}</div>`;

  function buildBudgetSheet() {
    const b = state.budget;
    const inc = (b.incomes || []).map((x) => row(inp("incomes", x.id, "label", x.label, { ph: "Source" }) + inp("incomes", x.id, "amount", x.amount, { type: "number", ph: "$/mo" }), "incomes", x.id)).join("");
    const billRow = (grp) => (b[grp] || []).map((x) => row(
      inp(grp, x.id, "label", x.label, { ph: grp === "bills" ? "Bill" : "Subscription" }) +
      inp(grp, x.id, "amount", x.amount, { type: "number", ph: "$/mo" }) +
      inp(grp, x.id, "dueDay", x.dueDay, { type: "number", ph: "Due day" }), grp, x.id)).join("");
    const cards = (b.cards || []).map((x) => row(
      inp("cards", x.id, "kind", x.kind, { options: ["debit", "credit"] }) +
      inp("cards", x.id, "name", x.name, { ph: "Card / account" }) +
      inp("cards", x.id, "balance", x.balance, { type: "number", ph: "Balance" }) +
      inp("cards", x.id, "limit", x.limit, { type: "number", ph: "Limit" }) +
      inp("cards", x.id, "dueDay", x.dueDay, { type: "number", ph: "Due day" }), "cards", x.id)).join("");
    sheetBody.innerHTML =
      `<div class="ed-group"><div class="ed-grp-head"><h4>Income <span>monthly, gross</span></h4><button class="ed-add" type="button" data-add="incomes" data-cursor>+ Add</button></div>${inc || emptyHint("No income yet")}</div>
       <div class="ed-group"><div class="ed-grp-head"><h4>Estimated tax rate</h4></div><div class="ed-row single"><input class="field field--sm" type="number" inputmode="decimal" data-tax value="${Math.round((+b.taxRate || 0) * 100)}" /><span class="ed-unit">% — used for take-home estimates</span></div></div>
       <div class="ed-group"><div class="ed-grp-head"><h4>Bills <span>name · amount · due day</span></h4><button class="ed-add" type="button" data-add="bills" data-cursor>+ Add</button></div>${billRow("bills") || emptyHint("No bills yet")}</div>
       <div class="ed-group"><div class="ed-grp-head"><h4>Subscriptions <span>name · amount · due day</span></h4><button class="ed-add" type="button" data-add="subscriptions" data-cursor>+ Add</button></div>${billRow("subscriptions") || emptyHint("No subscriptions yet")}</div>
       <div class="ed-group"><div class="ed-grp-head"><h4>Cards &amp; accounts <span>credit = owed · debit = cash</span></h4><button class="ed-add" type="button" data-add="cards" data-cursor>+ Add</button></div>${cards || emptyHint("No cards yet")}</div>`;
    wireSheet();
  }

  function buildAcadSheet() {
    const a = state.academics;
    const grades = ["", ...S.GRADE_LIST];
    const courses = (a.courses || []).map((c) => row(
      inp("courses", c.id, "code", c.code, { ph: "Code" }) +
      inp("courses", c.id, "name", c.name, { ph: "Course" }) +
      inp("courses", c.id, "credits", c.credits, { type: "number", ph: "Cr" }) +
      inp("courses", c.id, "status", c.status, { options: ["completed", "in-progress", "planned"] }) +
      inp("courses", c.id, "grade", c.grade, { options: grades }) +
      inp("courses", c.id, "expected", c.expected, { options: grades }) +
      inp("courses", c.id, "term", c.term, { ph: "Term e.g. Fall 2026" }), "courses", c.id)).join("");
    const assigns = (a.assignments || []).map((x) => row(
      inp("assignments", x.id, "title", x.title, { ph: "Assignment" }) +
      inp("assignments", x.id, "course", x.course, { ph: "Course" }) +
      inp("assignments", x.id, "due", x.due, { type: "date" }) +
      `<label class="ed-done"><input type="checkbox" data-grp="assignments" data-id="${x.id}" data-field="done" ${x.done ? "checked" : ""} />done</label>`, "assignments", x.id)).join("");
    sheetBody.innerHTML =
      `<div class="ed-group"><div class="ed-grp-head"><h4>Degree</h4></div><div class="ed-row trio">
         <label class="ed-lab">Required credits<input class="field field--sm" type="number" data-acad="requiredCredits" value="${+a.requiredCredits || 0}" /></label>
         <label class="ed-lab">Prior credits<input class="field field--sm" type="number" data-acad="priorCredits" value="${+a.priorCredits || 0}" /></label>
         <label class="ed-lab">Prior GPA<input class="field field--sm" type="number" step="0.01" data-acad="priorGpa" value="${+a.priorGpa || 0}" /></label></div></div>
       <div class="ed-group"><div class="ed-grp-head"><h4>Courses <span>completed → grade · else → expected*</span></h4><button class="ed-add" type="button" data-add="courses" data-cursor>+ Add</button></div>${courses || emptyHint("No courses yet")}</div>
       <div class="ed-group"><div class="ed-grp-head"><h4>Assignments <span>title · course · due date</span></h4><button class="ed-add" type="button" data-add="assignments" data-cursor>+ Add</button></div>${assigns || emptyHint("No assignments yet")}</div>`;
    wireSheet();
  }

  function buildSheet() {
    if (sheetKind === "budget") buildBudgetSheet();
    else if (sheetKind === "teams") buildTeamsSheet();
    else if (sheetKind === "pdf") buildPdfSheet();
    else buildAcadSheet();
  }

  // ----- teams editor (scoreboard) -----
  function buildTeamsSheet() {
    const teams = state.teams || [];
    const rows = teams.length ? teams.map((t) => `<div class="ed-row team-row">
        <span class="team-chip">${esc((t.league || "").toUpperCase())}</span>
        <span class="team-name">${esc(t.name)}</span>
        <button class="ed-del" type="button" data-del-team="${esc(t.id)}|${esc(t.league)}" aria-label="Remove" data-cursor>&times;</button>
      </div>`).join("") : emptyHint("No teams yet — add some below.");
    const leagueOpts = window.Sports.LEAGUES.map((l) => `<option value="${l.sport}|${l.league}">${l.label}</option>`).join("");
    sheetBody.innerHTML =
      `<div class="ed-group"><div class="ed-grp-head"><h4>Your teams</h4></div>${rows}</div>
       <div class="ed-group"><div class="ed-grp-head"><h4>Add a team</h4></div>
         <div class="ed-row"><select class="field field--sm" id="tmLeague">${leagueOpts}</select>
           <select class="field field--sm" id="tmTeam" style="flex:1.6"><option value="">Loading…</option></select>
           <button class="ed-add" type="button" id="tmAdd" data-cursor>+ Add</button></div>
         <div class="ed-hint" id="tmHint"></div></div>`;
    const leagueSel = $("#tmLeague"), teamSel = $("#tmTeam"), hint = $("#tmHint");
    async function loadTeams() {
      teamSel.innerHTML = `<option value="">Loading…</option>`; hint.textContent = "";
      const [sport, league] = leagueSel.value.split("|");
      const list = await window.Sports.teamList(sport, league);
      if (!list.length) { teamSel.innerHTML = `<option value="">— couldn't load —</option>`; hint.textContent = "Connect to the internet to pick teams."; return; }
      teamSel.innerHTML = list.map((t) => `<option value="${esc(t.id)}|${esc(t.name)}">${esc(t.name)}</option>`).join("");
    }
    leagueSel.addEventListener("change", loadTeams);
    loadTeams();
    $("#tmAdd").addEventListener("click", () => {
      const [sport, league] = leagueSel.value.split("|");
      const val = teamSel.value; if (!val) return;
      const sep = val.indexOf("|"); const id = val.slice(0, sep), name = val.slice(sep + 1);
      if ((state.teams || []).some((t) => t.id === id && t.league === league)) { toast(name + " is already added"); return; }
      state.teams.push({ id, sport, league, name });
      persist(); buildTeamsSheet(); renderScores(); toast("Added " + name);
    });
    $$("[data-del-team]", sheetBody).forEach((btn) => btn.addEventListener("click", () => {
      const v = btn.dataset.delTeam, sep = v.indexOf("|"); const id = v.slice(0, sep), league = v.slice(sep + 1);
      const i = state.teams.findIndex((t) => t.id === id && t.league === league);
      if (i >= 0) state.teams.splice(i, 1);
      persist(); buildTeamsSheet(); renderScores();
    }));
  }

  // ----- export to PDF (whole page or selected sections) -----
  function buildPdfSheet() {
    const secs = $$("[data-nav][data-label]");
    const rows = secs.map((s, i) => `<label class="pdf-row"><input type="checkbox" class="pdf-sec" value="${i}" checked /> <span>${esc(s.dataset.label)}</span></label>`).join("");
    sheetBody.innerHTML =
      `<p class="pdf-hint">Pick the sections to include, then save. On your phone choose “Save to Files” or share the PDF to keep it.</p>
       <div class="pdf-list">${rows}</div>
       <div class="pdf-actions"><button class="btn btn--red btn--sm" type="button" id="pdfGo" data-cursor>Save as PDF</button>
         <button class="btn btn--ghost btn--sm" type="button" id="pdfAll" data-cursor>Select all</button></div>`;
    $("#pdfAll").addEventListener("click", () => $$(".pdf-sec", sheetBody).forEach((c) => { c.checked = true; }));
    $("#pdfGo").addEventListener("click", () => {
      const idxs = $$(".pdf-sec", sheetBody).filter((c) => c.checked).map((c) => +c.value);
      if (!idxs.length) { toast("Pick at least one section"); return; }
      runPdf(idxs);
    });
  }
  function runPdf(idxs) {
    const secs = $$("[data-nav][data-label]");
    secs.forEach((s, i) => s.classList.toggle("print-include", idxs.indexOf(i) >= 0));
    document.body.classList.add("printing");
    closeSheet();
    setTimeout(() => window.print(), 180);
  }
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing");
    $$("[data-nav]").forEach((s) => s.classList.remove("print-include"));
  });

  // ----- backup / restore (file) + durable storage -----
  let toastT;
  function toast(msg) {
    const el = $("#toast"); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function downloadBlob(blob, fname) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function exportData() {
    const fname = "base-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    try {
      const file = new File([blob], fname, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "BASE backup" }).then(() => toast("Backup shared")).catch(() => downloadBlob(blob, fname));
        return;
      }
    } catch (e) {}
    downloadBlob(blob, fname); toast("Backup saved");
  }
  function importData(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("bad");
        S.save(obj); toast("Restored — reloading…");
        setTimeout(() => location.reload(), 700);
      } catch (e) { toast("Couldn't read that backup file"); }
    };
    r.readAsText(file);
  }
  // ask the browser to keep our data through storage pressure / updates
  if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); }

  function wireSheet() {
    $$("[data-grp]", sheetBody).forEach((el) => {
      const ev = el.type === "checkbox" ? "change" : "input";
      el.addEventListener(ev, () => {
        const arr = grpArray(el.dataset.grp); if (!arr) return;
        const item = arr.find((x) => x.id === el.dataset.id); if (!item) return;
        const f = el.dataset.field;
        let v = el.type === "checkbox" ? el.checked : el.value;
        if (["amount", "credits", "balance", "limit", "dueDay"].indexOf(f) >= 0) v = el.value === "" ? 0 : +el.value;
        item[f] = v;
        persist(); liveRender();
      });
    });
    const tax = $("[data-tax]", sheetBody);
    if (tax) tax.addEventListener("input", () => { state.budget.taxRate = clamp((+tax.value || 0) / 100, 0, 0.6); persist(); renderBudget(); });
    $$("[data-acad]", sheetBody).forEach((el) => el.addEventListener("input", () => { state.academics[el.dataset.acad] = +el.value || 0; persist(); renderAcademics(); }));
    $$("[data-add]", sheetBody).forEach((btn) => btn.addEventListener("click", () => addItem(btn.dataset.add)));
    $$("[data-del]", sheetBody).forEach((btn) => btn.addEventListener("click", () => {
      const r = btn.closest(".ed-row"), arr = grpArray(r.dataset.grp);
      const i = arr.findIndex((x) => x.id === r.dataset.id); if (i >= 0) arr.splice(i, 1);
      persist(); buildSheet(); liveRender();
    }));
  }

  function addItem(grp) {
    const arr = grpArray(grp); if (!arr) return;
    const id = S.uid(grp[0]);
    if (grp === "incomes") arr.push({ id, label: "", amount: 0 });
    else if (grp === "bills" || grp === "subscriptions") arr.push({ id, label: "", amount: 0, dueDay: 1 });
    else if (grp === "cards") arr.push({ id, kind: "debit", name: "", balance: 0, limit: 0, dueDay: 1 });
    else if (grp === "courses") arr.push({ id, code: "", name: "", credits: 3, grade: "", expected: "", term: "", status: "planned" });
    else if (grp === "assignments") arr.push({ id, title: "", course: "", due: S.isoInDays(7), done: false });
    persist(); buildSheet(); liveRender();
  }

  const SHEET_TITLES = { budget: "Edit budget", acad: "Edit courses & assignments", teams: "Edit teams", pdf: "Export to PDF" };
  function openSheet(kind) {
    sheetKind = kind;
    sheetTitle.textContent = SHEET_TITLES[kind] || "Edit";
    buildSheet();
    sheet.hidden = false;
    document.body.classList.add("sheet-open");
    sheet.scrollTop = 0;
  }
  function closeSheet() { sheet.hidden = true; sheetKind = null; document.body.classList.remove("sheet-open"); }
  if (sheet) {
    sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
    $$("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openSheet(btn.dataset.edit)));
  }

  // tools (wrap-up section): export PDF, back up, restore
  const btnPdf = $("#btnPdf"), btnBackup = $("#btnBackup"), btnRestore = $("#btnRestore"), fileRestore = $("#fileRestore");
  if (btnPdf) btnPdf.addEventListener("click", () => openSheet("pdf"));
  if (btnBackup) btnBackup.addEventListener("click", exportData);
  if (btnRestore && fileRestore) {
    btnRestore.addEventListener("click", () => fileRestore.click());
    fileRestore.addEventListener("change", () => { importData(fileRestore.files[0]); fileRestore.value = ""; });
  }

  // ---------- WEATHER ----------
  const WX = {
    clear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6"/></svg>',
    partly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.8v1.4M2.2 8h1.4M3.6 3.6l1 1M3.6 12.4l1-1"/><path d="M9 19h7.5a3.5 3.5 0 0 0 .2-7 4.5 4.5 0 0 0-8.5-1A3.5 3.5 0 0 0 9 19z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 18.5h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6-1.3A4.2 4.2 0 0 0 7.5 18.5z"/></svg>',
    fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5a5.5 5.5 0 0 1 10.8-1.3A4 4 0 0 1 16.5 16"/><path d="M4 19h16M5 15.5h14M7 22h10"/></svg>',
    drizzle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 15.5h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6-1.3A4.2 4.2 0 0 0 7.5 15.5z"/><path d="M9 19l-.8 1.6M13 19l-.8 1.6M16.5 19l-.8 1.6"/></svg>',
    rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 14.5h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6-1.3A4.2 4.2 0 0 0 7.5 14.5z"/><path d="M8.5 18l-1 3M12 18l-1 3M15.5 18l-1 3"/></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 14.5h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6-1.3A4.2 4.2 0 0 0 7.5 14.5z"/><path d="M9 19h.01M12 21h.01M15 19h.01M12 18h.01"/></svg>',
    storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 14.5h9a4 4 0 0 0 .3-8 5.5 5.5 0 0 0-10.6-1.3A4.2 4.2 0 0 0 7.5 14.5z"/><path d="M12.5 13l-2.5 4h3l-2 4"/></svg>',
  };
  function wxFromCode(c) {
    if (c === 0) return ["clear", "Clear"];
    if (c === 1 || c === 2) return ["partly", "Partly cloudy"];
    if (c === 3) return ["cloud", "Cloudy"];
    if (c === 45 || c === 48) return ["fog", "Foggy"];
    if (c >= 51 && c <= 57) return ["drizzle", "Drizzle"];
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ["rain", "Rain"];
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ["snow", "Snow"];
    if (c >= 95) return ["storm", "Thunderstorm"];
    return ["cloud", "—"];
  }
  async function fetchWx(lat, lon, fallbackName) {
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`;
      const d = await (await fetch(u)).json();
      if (d && d.current) {
        const [k, label] = wxFromCode(d.current.weather_code);
        $("#wxIcon").innerHTML = WX[k] || WX.cloud;
        $("#wxTemp").textContent = Math.round(d.current.temperature_2m) + "°";
        $("#wxCond").textContent = label;
      }
      let name = fallbackName || "";
      try { const gj = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)).json(); name = gj.city || gj.locality || gj.principalSubdivision || name; } catch (e) {}
      if (name) $("#wxLoc").textContent = name;
    } catch (e) { $("#wxCond").textContent = "Weather unavailable"; $("#wxIcon").innerHTML = WX.cloud; }
  }
  function loadWeather() {
    const fb = () => fetchWx(40.7128, -74.006, "New York");
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => fetchWx(p.coords.latitude, p.coords.longitude, ""), fb, { timeout: 6000, maximumAge: 600000 });
    else fb();
  }

  // ===================== RENDER ALL =====================
  renderHeader(); renderPreview(); renderCountdown(); renderTodayCard();
  renderTasks(); renderHabits(); renderNotes(); renderWeek(); renderBudget(); renderAcademics();
  loadWeather(); renderScores();

  // ===================== DOT NAV =====================
  document.documentElement.classList.add("hide-bar");
  const dotnav = $("#dotnav");
  const sections = $$("[data-nav][data-label]");
  dotnav.innerHTML = sections.map((s, i) => {
    const href = s.dataset.href ? ` data-href="${s.dataset.href}"` : "";
    const arrow = s.dataset.href ? `<span class="dn-arrow">↗</span>` : "";
    return `<button class="dotnav-dot${s.dataset.href ? " is-link" : ""}" data-i="${i}"${href} aria-label="${s.dataset.label}"><span class="dn-label">${s.dataset.label}${arrow}</span></button>`;
  }).join("");
  const dots = $$(".dotnav-dot", dotnav);
  function topOf(s) { return s.getBoundingClientRect().top + window.scrollY; }
  function activeIndex() { const y = window.scrollY + window.innerHeight * 0.4; let idx = 0; sections.forEach((s, i) => { if (topOf(s) <= y) idx = i; }); return idx; }
  function updateDots() { const a = activeIndex(); dots.forEach((d, i) => d.classList.toggle("active", i === a)); }
  function goTo(i, smooth) { const s = sections[clamp(i, 0, sections.length - 1)]; window.scrollTo({ top: topOf(s) + 2, behavior: smooth ? "smooth" : "auto" }); }
  function activate(i, smooth) {
    const s = sections[clamp(i, 0, sections.length - 1)];
    if (s && s.dataset.href) { window.location.href = s.dataset.href; return; }
    goTo(i, smooth);
  }
  function idxFromY(cy) { const r = dotnav.getBoundingClientRect(); return Math.round(clamp((cy - r.top) / r.height, 0, 1) * (sections.length - 1)); }
  let dragging = false, downIdx = null, moved = false;
  dotnav.addEventListener("pointerdown", (e) => { dragging = true; moved = false; downIdx = idxFromY(e.clientY); dotnav.setPointerCapture(e.pointerId); dotnav.classList.add("dragging"); e.preventDefault(); });
  dotnav.addEventListener("pointermove", (e) => { if (!dragging) return; if (Math.abs(e.movementY) > 0) moved = true; if (moved) goTo(idxFromY(e.clientY), false); });
  dotnav.addEventListener("pointerup", () => { if (!moved && downIdx != null) activate(downIdx, true); dragging = false; dotnav.classList.remove("dragging"); });
  dotnav.addEventListener("pointercancel", () => { dragging = false; dotnav.classList.remove("dragging"); });

  // ===================== SCROLL FX =====================
  const nav = $("#nav");
  const heroTrack = $(".h-hero"), heroRed = $("#heroRed"), heroTop = $("#heroTop"),
    heroStatement = $("#heroStatement"), todayCard = $("#todayCard"), scrollHint = $("#scrollHint");
  const notesWrap = $(".notes-wrap"), notesTrack = $("#notesTrack");
  let heroFill = 0;
  function trackProgress(el) { const r = el.getBoundingClientRect(); const dist = el.offsetHeight - window.innerHeight; return dist <= 0 ? 0 : clamp(-r.top / dist, 0, 1); }
  function updateHero() {
    const p = trackProgress(heroTrack);
    const fill = clamp(p / 0.6, 0, 1); heroFill = fill;
    heroRed.style.clipPath = `inset(${lerp(56, 0, easeIO(fill))}% 0 0 0)`;
    const tf = clamp(p / 0.32, 0, 1);
    heroTop.style.opacity = String(1 - tf); heroTop.style.transform = `translateY(${lerp(0, -40, tf)}px)`;
    const st = clamp((p - 0.4) / 0.28, 0, 1);
    heroStatement.style.opacity = String(st); heroStatement.style.transform = `translateY(${lerp(30, 0, easeOut(st))}px)`;
    const pr = clamp((p - 0.34) / 0.5, 0, 1);
    todayCard.style.opacity = String(clamp((p - 0.34) / 0.22, 0, 1));
    todayCard.style.transform = `translateX(-50%) translateY(${lerp(150, 34, easeOut(pr))}px)`;
    scrollHint.style.opacity = String(1 - clamp(p / 0.06, 0, 1));
  }
  function updateNotes() { const p = trackProgress(notesWrap); const maxX = notesTrack.scrollWidth - window.innerWidth + 16; if (maxX > 0) notesTrack.style.transform = `translateX(${-easeIO(p) * maxX}px)`; }
  const navLine = 42;
  function updateNav() {
    let theme = "on-light";
    for (const region of sections) {
      const r = region.getBoundingClientRect();
      if (r.top <= navLine && r.bottom > navLine) { theme = region.dataset.nav === "hero" ? (heroFill > 0.85 ? "on-dark" : "on-light") : (region.dataset.theme || "on-light"); break; }
    }
    nav.classList.toggle("on-dark", theme === "on-dark");
    document.body.classList.toggle("theme-dark", theme === "on-dark");
  }
  let ticking = false;
  function frame() { updateHero(); updateNotes(); updateNav(); updateDots(); ticking = false; }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }), { threshold: 0.18 });
  $$(".reveal").forEach((el) => io.observe(el));

  if (!reduce) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    frame();
  } else { $$(".reveal").forEach((el) => el.classList.add("in")); updateDots(); }

  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href"); if (id.length < 2) return;
    const t = $(id); if (t) { e.preventDefault(); window.scrollTo({ top: topOf(t), behavior: "smooth" }); }
  }));
})();
