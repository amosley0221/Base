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
  function renderBudget() {
    const b = state.budget || { incomes: [], expenses: [] };
    const income = b.incomes.reduce((s, x) => s + (+x.amount || 0), 0);
    const spend = b.expenses.reduce((s, x) => s + (+x.amount || 0), 0);
    const left = income - spend;
    const cats = { needs: 0, wants: 0, goals: 0 };
    b.expenses.forEach((x) => { cats[x.cat] = (cats[x.cat] || 0) + (+x.amount || 0); });
    const base = income || 1;

    const leftEl = $("#bdLeft");
    if (leftEl) {
      leftEl.textContent = (left < 0 ? "–" : "") + money(Math.abs(left));
      leftEl.classList.toggle("neg", left < 0);
      $("#bdIn").textContent = money(income);
      $("#bdOut").textContent = money(spend);
      const segs = ["needs", "wants", "goals"].map((c) => `<i data-cat="${c}" style="width:${(cats[c] / base) * 100}%"></i>`).join("");
      const leftSeg = left > 0 ? `<i data-cat="left" style="width:${(left / base) * 100}%"></i>` : "";
      $("#bdBar").innerHTML = segs + leftSeg;

      const labels = { needs: "Needs", wants: "Wants", goals: "Saving & goals" };
      $("#bdCats").innerHTML = ["needs", "wants", "goals"].map((c) => `
        <div class="bd-cat">
          <div class="bd-cat-top">
            <div class="bd-name"><i data-cat="${c}"></i>${labels[c]}</div>
            <div class="bd-sum">${money(cats[c])} · ${Math.round((cats[c] / base) * 100)}%</div>
          </div>
          <div class="bd-track"><i data-cat="${c}" style="width:${Math.min(100, (cats[c] / base) * 100)}%"></i></div>
        </div>`).join("");

      // savings sparkline from history + this month
      const spark = $("#bdSpark");
      if (spark) {
        const hist = (b.history || []).slice();
        const cur = S.isoMonth();
        const data = hist.filter((h) => h.month !== cur).map((h) => ({ month: h.month, left: h.income - h.spend }));
        data.push({ month: cur, left });
        const pts = data.slice(-7);
        if (pts.length >= 2) {
          const W = 280, H = 54;
          const vals = pts.map((p) => p.left);
          const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
          const span = (max - min) || 1;
          const x = (i) => (i / (pts.length - 1)) * W;
          const y = (v) => H - 4 - ((v - min) / span) * (H - 8);
          const d = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.left).toFixed(1)).join(" ");
          const area = `M0 ${H} ` + pts.map((p, i) => `L${x(i).toFixed(1)} ${y(p.left).toFixed(1)}`).join(" ") + ` L${W} ${H} Z`;
          const lastX = x(pts.length - 1), lastY = y(pts[pts.length - 1].left);
          const first = pts[0].left, change = left - first;
          spark.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Savings trend">
            <path class="sp-area" d="${area}"></path><path class="sp-line" d="${d}"></path>
            <circle class="sp-dot" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3"></circle></svg>
            <div class="sp-cap">savings · ${change >= 0 ? "up" : "down"} ${money(Math.abs(change))} over ${pts.length} months</div>`;
        } else { spark.innerHTML = ""; }
      }
    }
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
  renderTasks(); renderHabits(); renderNotes(); renderWeek(); renderBudget();
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
