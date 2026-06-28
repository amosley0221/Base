/* ===========================================================
   BASE — Scoreboard logic (ESPN public data)
   Live auto-refresh + tap-a-game box scores
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store, SP = window.Sports;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let state = S.load();
  const myKeys = new Set((state.teams || []).map((t) => (t.name || "").toLowerCase()));
  let view = "mine";
  let token = 0;          // cancels stale fetches/polls
  let pollTimer = null;
  let liveOpen = false;   // is a live game's box score open?
  let openGame = null;    // {id, sport, league}
  let featToken = 0, featuredLive = false;

  // leagues to pull current scores from = your teams' leagues + followed leagues
  function followedLeaguesSb() {
    const map = new Map();
    (state.teams || []).forEach((t) => { if (!map.has(t.league)) map.set(t.league, SP.LEAGUES.find((l) => l.league === t.league) || { sport: t.sport, league: t.league, label: (t.league || "").toUpperCase() }); });
    (state.followLeagues || []).forEach((f) => { if (!map.has(f.league)) map.set(f.league, SP.LEAGUES.find((l) => l.league === f.league) || { sport: f.sport, league: f.league, label: (f.league || "").toUpperCase() }); });
    return Array.from(map.values()).slice(0, 4);
  }
  const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const POLL_MS = 30000;
  const TABS = [{ key: "mine", label: "My Teams" }].concat(SP.LEAGUES.map((l) => ({ key: l.league, label: l.label, sport: l.sport })));

  $("#sbWhen").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  // ---------- tabs ----------
  $("#sbTabs").innerHTML = TABS.map((t) => `<button class="sb-tab${t.key === view ? " active" : ""}" data-key="${t.key}" data-cursor>${t.label}</button>`).join("");
  $$("#sbTabs .sb-tab").forEach((b) => b.addEventListener("click", () => { view = b.dataset.key; syncTabs(); render(); }));
  function syncTabs() { $$("#sbTabs .sb-tab").forEach((b) => b.classList.toggle("active", b.dataset.key === view)); }
  $("#sbRefresh").addEventListener("click", () => render());

  // ---------- TEAM MANAGER ----------
  const manage = $("#sbManage"), mLeague = $("#sbmLeague"), mTeam = $("#sbmTeam");
  mLeague.innerHTML = SP.LEAGUES.map((l) => `<option value="${l.league}">${l.label}</option>`).join("");
  function leagueInfo(code) { return SP.LEAGUES.find((l) => l.league === code); }
  async function loadTeamOptions() {
    const info = leagueInfo(mLeague.value);
    mTeam.innerHTML = `<option>Loading…</option>`;
    const arr = await SP.teamList(info.sport, info.league);
    mTeam.innerHTML = arr.length ? arr.map((t) => `<option value="${t.id}" data-name="${esc(t.name)}">${esc(t.name)}</option>`).join("") : `<option value="">None found</option>`;
  }
  mLeague.addEventListener("change", loadTeamOptions);
  function renderManageList() {
    const list = $("#sbmList");
    const teams = state.teams || [];
    if (!teams.length) { list.innerHTML = `<div class="sbm-empty">No teams yet. Add some below.</div>`; return; }
    list.innerHTML = teams.map((t) => `
      <div class="sbm-row" data-key="${t.league}-${t.id}">
        <div class="row-main"><div class="tn">${esc(t.name)}</div><div class="lg">${esc(t.league)}</div></div>
        <button class="del" title="remove">×</button>
      </div>`).join("");
    $$("#sbmList .sbm-row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      state.teams = state.teams.filter((x) => (x.league + "-" + x.id) !== row.dataset.key);
      S.save(state); myKeys.clear(); state.teams.forEach((t) => myKeys.add((t.name || "").toLowerCase()));
      renderManageList(); if (view === "mine") render();
    }));
  }
  $("#sbmAdd").addEventListener("click", () => {
    const opt = mTeam.options[mTeam.selectedIndex];
    if (!opt || !opt.value) return;
    const info = leagueInfo(mLeague.value);
    if ((state.teams || []).some((t) => t.league === info.league && t.id === opt.value)) return;
    if (!state.teams) state.teams = [];
    state.teams.push({ id: opt.value, sport: info.sport, league: info.league, name: opt.dataset.name });
    S.save(state); myKeys.add((opt.dataset.name || "").toLowerCase());
    renderManageList(); if (view === "mine") render();
  });
  // ---------- FOLLOW LEAGUES (whole-league updates, incl. World Cup) ----------
  function renderFollowLeagues() {
    const host = $("#sbmLeagueChips"); if (!host) return;
    const on = new Set((state.followLeagues || []).map((f) => f.league));
    host.innerHTML = SP.LEAGUES.map((l) => `<button class="sbm-lchip${on.has(l.league) ? " on" : ""}" data-league="${l.league}" data-cursor>${esc(l.label)}</button>`).join("");
    $$("#sbmLeagueChips .sbm-lchip").forEach((b) => b.addEventListener("click", () => {
      const info = leagueInfo(b.dataset.league); if (!info) return;
      const arr = state.followLeagues || (state.followLeagues = []);
      const i = arr.findIndex((f) => f.league === info.league);
      if (i >= 0) arr.splice(i, 1); else arr.push({ sport: info.sport, league: info.league });
      S.save(state); b.classList.toggle("on");
    }));
  }
  const followAll = $("#sbmFollowAll"), followNone = $("#sbmFollowNone");
  if (followAll) followAll.addEventListener("click", () => { state.followLeagues = SP.LEAGUES.map((l) => ({ sport: l.sport, league: l.league })); S.save(state); renderFollowLeagues(); });
  if (followNone) followNone.addEventListener("click", () => { state.followLeagues = []; S.save(state); renderFollowLeagues(); });

  function toggleManage(show) {
    const open = show != null ? show : manage.hidden;
    manage.hidden = !open;
    if (open && !mTeam.options.length) loadTeamOptions();
    if (open) { renderManageList(); renderFollowLeagues(); }
  }
  $("#sbManageBtn").addEventListener("click", () => toggleManage());
  $("#sbManageClose").addEventListener("click", () => toggleManage(false));

  // ---------- helpers ----------
  function fmtDateTime(d) {
    const today = new Date(); const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (sameDay(d, today)) return "Today · " + time;
    if (sameDay(d, tomorrow)) return "Tomorrow · " + time;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + " · " + time;
  }
  function logo(url, abbr) {
    if (url) return `<img class="logo" src="${esc(url)}" alt="" onerror="this.outerHTML='<div class=&quot;logo-fb&quot;>${esc(abbr || "?")}</div>'" />`;
    return `<div class="logo-fb">${esc(abbr || "?")}</div>`;
  }
  function statCards(cards) {
    $("#sbStats").innerHTML = cards.map((c) => `<div class="sb-stat"><div class="n${c.live ? " live" : ""}">${c.n}</div><div class="k">${c.k}</div></div>`).join("");
  }
  const setBody = (h) => {
    const b = $("#sbBody"); b.innerHTML = h;
    b.querySelectorAll(".game, .stand-group").forEach((el) => el.classList.add("reveal"));
    scanReveals(b);
  };
  const loading = () => { $("#sbStats").innerHTML = ""; setBody(`<div class="sb-loading">Loading live data…</div>`); };

  // ---------- game card ----------
  function teamRow(t, other, showScore) {
    const win = showScore && t.score != null && other && other.score != null && (+t.score > +other.score);
    const lose = showScore && t.score != null && other && other.score != null && (+t.score < +other.score);
    return `<div class="team-row ${win ? "win" : ""} ${lose ? "lose" : ""}">
      ${logo(t.logo, t.abbr)}
      <span class="tn">${esc(t.name)}${t.record ? `<span class="rec">${esc(t.record)}</span>` : ""}</span>
      ${showScore && t.score != null ? `<span class="sc">${esc(t.score)}</span>` : ""}
    </div>`;
  }
  function gameCard(g, sport, league) {
    const showScore = g.state !== "pre";
    let tag = "", status = "";
    if (g.state === "in") { tag = `<span class="g-tag live">LIVE</span>`; status = g.detail || "In progress"; }
    else if (g.state === "post") { tag = `<span class="g-tag final">FINAL</span>`; status = "Final"; }
    else { tag = `<span class="g-tag">${fmtDateTime(g.date)}</span>`; status = g.broadcast || ""; }
    const leaders = g.leaders && g.leaders.length
      ? `<div class="leaders">${g.leaders.map((l) => `${esc(l.cat)}: <b>${esc(l.who || "—")}</b> ${esc(l.val || "")}`).join(" · ")}</div>` : "";
    const clickable = !!g.id;
    return `<div class="game ${clickable ? "clickable" : ""}" ${clickable ? `data-id="${esc(g.id)}" data-sport="${sport}" data-league="${league}"` : ""}>
      <div class="g-status"><span>${esc(status)}</span>${tag}</div>
      ${teamRow(g.away, g.home, showScore)}
      ${teamRow(g.home, g.away, showScore)}
      ${leaders}
      <div class="g-foot"><span>${g.venue ? esc(g.venue) : ""}</span>${clickable ? `<span class="g-more">Box score →</span>` : ""}</div>
    </div>`;
  }

  // ---------- MY TEAMS ----------
  async function renderMine(silent) {
    const teams = state.teams || [];
    if (!teams.length) { $("#sbStats").innerHTML = ""; setBody(`<div class="sb-empty">No teams saved yet. Hit <b>Edit teams</b> up top to add some.</div>`); return 0; }
    if (!silent) loading();
    const my = ++token;
    const results = await Promise.all(teams.map((t) => SP.teamGame(t)));
    if (my !== token) return 0;
    let live = 0, today = 0, upcoming = 0;
    results.forEach((r) => { if (r.chosen && r.chosen.state === "in") live++; if (r.todayGame) today++; if (r.chosen && r.chosen.state === "pre") upcoming++; });
    statCards([
      { n: teams.length, k: "Teams tracked" },
      { n: live, k: "Playing now", live: live > 0 },
      { n: today, k: "Games today" },
      { n: upcoming, k: "Coming up" },
    ]);
    const cards = results.map((r) => {
      const t = r.team;
      if (r.error || !r.chosen) return `<div class="game"><div class="g-status"><span>${esc(t.name)}</span></div><div class="leaders">Season's quiet right now.</div></div>`;
      const g = r.chosen, vs = g.home ? "vs" : "@";
      let tag = "", status = "";
      if (g.state === "in") { tag = `<span class="g-tag live">LIVE</span>`; status = g.detail || "In progress"; }
      else if (g.state === "post") { tag = `<span class="g-tag ${g.winner ? "" : "final"}">${g.winner ? "WIN" : "LOSS"}</span>`; status = "Final"; }
      else { tag = `<span class="g-tag">${fmtDateTime(g.date)}</span>`; status = "Next up"; }
      const score = g.state !== "pre" ? `<span class="sc">${esc(g.ourScore)}–${esc(g.oppScore)}</span>` : "";
      const clickable = !!g.id;
      return `<div class="game ${clickable ? "clickable" : ""}" ${clickable ? `data-id="${esc(g.id)}" data-sport="${t.sport}" data-league="${t.league}"` : ""}>
        <div class="g-status"><span>${esc(status)}</span>${tag}</div>
        <div class="team-row win"><div class="logo-fb">${esc((t.name || "?").slice(0, 3).toUpperCase())}</div><span class="tn">${esc(t.name)}</span>${score}</div>
        <div class="team-row"><div class="logo-fb">${esc((g.opp || "?").slice(0, 3).toUpperCase())}</div><span class="tn">${vs} ${esc(g.opp)}</span></div>
        ${clickable ? `<div class="g-foot"><span></span><span class="g-more">Box score →</span></div>` : ""}
      </div>`;
    }).join("");

    // pull live + recently-ended games from followed leagues (today + yesterday), excluding my teams' games
    const shown = new Set(results.filter((r) => r.chosen && r.chosen.id).map((r) => String(r.chosen.id)));
    const leagues = followedLeaguesSb();
    const yest = new Date(Date.now() - 86400000);
    const boards = await Promise.all(leagues.flatMap((lg) => [
      SP.leagueScoreboard(lg.sport, lg.league).then((g) => ({ lg, games: g })).catch(() => ({ lg, games: null })),
      SP.leagueScoreboard(lg.sport, lg.league, ymd(yest)).then((g) => ({ lg, games: g })).catch(() => ({ lg, games: null })),
    ]));
    if (my !== token) return 0;
    const liveGames = [], recentGames = [];
    boards.forEach(({ lg, games }) => { if (!lg || !games) return; games.forEach((g) => {
      if (!g.id || shown.has(String(g.id))) return;
      if (g.state === "in") { shown.add(String(g.id)); liveGames.push({ g, lg }); }
      else if (g.state === "post") { shown.add(String(g.id)); recentGames.push({ g, lg }); }
    }); });
    liveGames.sort((a, b) => a.g.date - b.g.date);
    recentGames.sort((a, b) => b.g.date - a.g.date);

    let extra = "";
    if (liveGames.length) extra += `<h2 class="sb-section-title">Live now</h2><div class="sb-games">${liveGames.map((x) => gameCard(x.g, x.lg.sport, x.lg.league)).join("")}</div>`;
    if (recentGames.length) extra += `<h2 class="sb-section-title">Recently ended</h2><div class="sb-games">${recentGames.slice(0, 8).map((x) => gameCard(x.g, x.lg.sport, x.lg.league)).join("")}</div>`;

    setBody(`<h2 class="sb-section-title">Your teams</h2><div class="sb-games">${cards}</div>${extra}`);
    // refresh the "Playing now" tile to reflect everything live in the feed
    statCards([
      { n: teams.length, k: "Teams tracked" },
      { n: live + liveGames.length, k: "Playing now", live: (live + liveGames.length) > 0 },
      { n: today, k: "Games today" },
      { n: upcoming, k: "Coming up" },
    ]);
    return live + liveGames.length;
  }

  // ---------- LEAGUE ----------
  async function renderLeague(key, silent) {
    const lg = SP.LEAGUES.find((l) => l.league === key);
    if (!lg) return 0;
    if (!silent) loading();
    const my = ++token;
    const [games, stand] = await Promise.all([SP.leagueScoreboard(lg.sport, lg.league), SP.standings(lg.sport, lg.league)]);
    if (my !== token) return 0;

    if (games === null) { $("#sbStats").innerHTML = ""; setBody(`<div class="sb-empty">Couldn't reach the live ${lg.label} feed right now.<div class="sb-note">Live sports data needs an internet connection — try again from your own browser.</div></div>`); return 0; }

    const live = games.filter((g) => g.state === "in").length;
    const finals = games.filter((g) => g.state === "post").length;
    const pre = games.filter((g) => g.state === "pre").length;
    statCards([
      { n: games.length, k: lg.label + " games today" },
      { n: live, k: "Live now", live: live > 0 },
      { n: finals, k: "Final" },
      { n: pre, k: "Scheduled" },
    ]);

    let html = "";
    if (!games.length) html += `<div class="sb-empty">No ${lg.label} games today. Check the standings below.</div>`;
    else {
      const order = { in: 0, pre: 1, post: 2 };
      const sorted = games.slice().sort((a, b) => (order[a.state] - order[b.state]) || (a.date - b.date));
      html += `<h2 class="sb-section-title">Today${live ? " · " + live + " live" : ""}</h2><div class="sb-games">${sorted.map((g) => gameCard(g, lg.sport, lg.league)).join("")}</div>`;
    }

    if (stand && stand.length) {
      const groups = {};
      stand.forEach((r) => { (groups[r.group] = groups[r.group] || []).push(r); });
      html += `<h2 class="sb-section-title">Standings</h2><div class="standings">`;
      Object.keys(groups).forEach((g) => {
        const rows = groups[g];
        html += `<div class="stand-group">${g ? `<h3>${esc(g)}</h3>` : ""}
          <table class="stand-table"><thead><tr><th class="team-cell">Team</th><th>W</th><th>L</th><th>PCT</th><th>STRK</th></tr></thead><tbody>
          ${rows.map((r) => `<tr class="${myKeys.has((r.name || "").toLowerCase()) ? "mine" : ""}">
            <td class="team-cell">${r.logo ? `<img src="${esc(r.logo)}" alt="" />` : ""}${esc(r.name)}</td>
            <td>${esc(r.w)}</td><td>${esc(r.l)}</td><td>${esc(r.pct || "—")}</td><td>${esc(r.streak || "—")}</td>
          </tr>`).join("")}
          </tbody></table></div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="sb-note">Standings aren't available for ${lg.label} right now.</div>`;
    }
    setBody(html);
    return live;
  }

  // ---------- BOX SCORE MODAL ----------
  const modal = $("#sbModal"), modalBody = $("#sbModalBody");
  function openModal() { modal.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; liveOpen = false; openGame = null; }
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  $("#sbBody").addEventListener("click", (e) => {
    const card = e.target.closest(".game.clickable");
    if (!card) return;
    openGame = { id: card.dataset.id, sport: card.dataset.sport, league: card.dataset.league };
    openModal();
    modalBody.innerHTML = `<div class="bx-loading">Loading box score…</div>`;
    loadBox();
  });

  async function loadBox() {
    if (!openGame) return;
    const sum = await SP.gameSummary(openGame.sport, openGame.league, openGame.id);
    if (!sum) { modalBody.innerHTML = `<div class="bx-loading">Box score isn't available right now.</div>`; return; }
    liveOpen = sum.state === "in";
    modalBody.innerHTML = renderBox(sum);
  }

  function teamHeader(t) {
    if (!t) return "";
    const lg = t.logo ? `<img src="${esc(t.logo)}" alt="" />` : `<div class="lf">${esc((t.abbr || t.name || "?").slice(0, 3).toUpperCase())}</div>`;
    const lose = t.score != null && t.winner === false;
    return `<div class="bx-score">
      <div class="bx-team">${lg}<div><div class="nm">${esc(t.name)}</div>${t.record ? `<div class="rc">${esc(t.record)}</div>` : ""}</div></div>
      ${t.score != null ? `<div class="bx-num ${lose ? "lose" : ""}">${esc(t.score)}</div>` : ""}
    </div>`;
  }

  function renderBox(s) {
    const a = s.away, h = s.home;
    let head = "";
    if (s.state === "in") head = `<div class="bx-status"><span class="live">● Live</span> · ${esc(s.detail)}</div>`;
    else if (s.state === "post") head = `<div class="bx-status">Final${s.detail && !/final/i.test(s.detail) ? " · " + esc(s.detail) : ""}</div>`;
    else head = `<div class="bx-status">${esc(s.detail || "Scheduled")}</div>`;

    let scoreBlock = teamHeader(a) + teamHeader(h);

    // linescore table
    let line = "";
    const hasLine = s.periods.length && ((a && a.linescores.length) || (h && h.linescores.length));
    if (hasLine) {
      const ths = s.periods.map((p) => `<th>${esc(p)}</th>`).join("");
      const rowFor = (t) => {
        const cells = s.periods.map((p, i) => `<td>${esc(t.linescores[i] != null ? t.linescores[i] : "·")}</td>`).join("");
        return `<tr><td class="tm">${esc(t.abbr || t.name)}</td>${cells}<td class="tot">${esc(t.score != null ? t.score : "")}</td></tr>`;
      };
      line = `<table class="bx-line"><thead><tr><th class="tm">Team</th>${ths}<th>T</th></tr></thead><tbody>${rowFor(a)}${rowFor(h)}</tbody></table>`;
    }

    // team stat comparison
    let stats = "";
    if (s.teamStats && s.teamStats.length) {
      stats = `<div class="bx-h">Team stats · ${esc(a.abbr || a.name)} vs ${esc(h.abbr || h.name)}</div>` +
        s.teamStats.map((st) => `<div class="bx-stat"><span class="a">${esc(st.away)}</span><span class="lbl">${esc(st.label)}</span><span class="h">${esc(st.home)}</span></div>`).join("");
    }

    // leaders
    let leaders = "";
    if (s.leaders && s.leaders.length) {
      leaders = `<div class="bx-h">Game leaders</div>` + s.leaders.map((l) =>
        `<div class="bx-lead"><span class="lc">${esc(l.cat)}</span><span class="lw"><b>${esc(l.who || "—")}</b>${l.team ? `<span class="tt">${esc(l.team)}</span>` : ""} — ${esc(l.val || "")}</span></div>`).join("");
    }

    const venue = s.venue ? `<div class="bx-h" style="margin-bottom:0;border:none">${esc(s.venue)}</div>` : "";
    return head + scoreBlock + (line || "") + stats + leaders + venue;
  }

  // ---------- POLLING ----------
  // Always re-poll so the featured game and scores stay current: 30s when
  // anything is live, 2 min otherwise. Pauses while the tab is hidden.
  function schedulePoll(liveCount) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, (liveCount > 0 || featuredLive) ? POLL_MS : 120000);
  }
  async function poll() {
    if (document.hidden) { pollTimer = setTimeout(poll, POLL_MS); return; }
    const [live] = await Promise.all([
      (view === "mine" ? renderMine(true) : renderLeague(view, true)),
      renderFeatured(true),
    ]);
    if (liveOpen && openGame) loadBox();   // refresh the open box score too
    schedulePoll(live);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  // ---------- dispatch ----------
  async function render() {
    clearTimeout(pollTimer);
    renderNews();   // filter the wire to the active tab
    const [live] = await Promise.all([
      (view === "mine" ? renderMine(false) : renderLeague(view, false)),
      renderFeatured(false),
    ]);
    schedulePoll(live);
  }

  // ===========================================================
  //  EDITORIAL: reveal motion, count-up, featured game, news
  // ===========================================================
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let revealQueue = [];
  function activate(el) {
    if (el.classList.contains("gcl")) { drawLine(el); return; }
    el.classList.add("in");
    if (el.dataset.count != null) countUp(el);
  }
  function checkReveals() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    revealQueue = revealQueue.filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.92 && r.bottom > -40) { activate(el); return false; }
      return true;
    });
  }
  function scanReveals(root) {
    (root || document).querySelectorAll(".reveal:not(.in), .gcl").forEach((el) => {
      if (reduceMotion) {
        if (el.classList.contains("gcl")) el.style.strokeDashoffset = "0";
        else { el.classList.add("in"); if (el.dataset.count != null) el.textContent = el.dataset.count; }
        return;
      }
      if (revealQueue.indexOf(el) < 0) revealQueue.push(el);
    });
    checkReveals();
  }
  let revTick = false;
  window.addEventListener("scroll", () => { if (!revTick) { revTick = true; requestAnimationFrame(() => { revTick = false; checkReveals(); }); } }, { passive: true });
  window.addEventListener("resize", checkReveals, { passive: true });
  function countUp(el) {
    const target = parseFloat(el.dataset.count); if (isNaN(target)) return;
    const dur = 1100, t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * e);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  function drawLine(p) {
    try { const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len; p.getBoundingClientRect(); p.style.transition = "stroke-dashoffset 1.8s cubic-bezier(0.22,1,0.36,1)"; p.style.strokeDashoffset = "0"; } catch (e) {}
  }

  const relTime = (iso) => {
    if (!iso) return "";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    return Math.floor(diff / 86400) + "d";
  };
  const parseNum = (v) => { if (v == null) return null; const m = String(v).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

  // ---------- FEATURED GAME CENTER ----------
  // reflects the active tab: on "My Teams" → your most current game (live >
  // recent final > any live league game > next up); on a league tab → that
  // league's most relevant game. Re-runs on tab change and the poll.
  async function firstLiveLeagueGame() {
    const leagues = followedLeaguesSb();
    const boards = await Promise.all(leagues.map((lg) => SP.leagueScoreboard(lg.sport, lg.league).then((g) => ({ lg, games: g })).catch(() => ({ lg, games: null }))));
    for (const { lg, games } of boards) { if (lg && games) for (const g of games) if (g.state === "in" && g.id) return { sport: lg.sport, league: lg.league, id: g.id, label: lg.label }; }
    return null;
  }
  async function renderFeatured(silent) {
    const host = $("#sbFeatured"), marker = $("#featuredMarker");
    const my = ++featToken;
    if (!silent) host.innerHTML = `<div class="ed-empty">Loading the featured game…</div>`;
    let sport, league, id, team = { name: "", league: "" }, isHome = false;

    if (view === "mine") {
      const teams = state.teams || [];
      if (!teams.length) { marker.hidden = true; host.innerHTML = ""; featuredLive = false; return; }
      const results = await Promise.all(teams.map((t) => SP.teamGame(t)));
      if (my !== featToken) return;
      const withGame = results.filter((r) => r.chosen && r.chosen.id);
      const now = Date.now(), RECENT = 36 * 3600 * 1000;
      let pick = withGame.find((r) => r.chosen.state === "in")
        || withGame.filter((r) => r.chosen.state === "post" && r.chosen.date && now - r.chosen.date.getTime() <= RECENT).sort((a, b) => b.chosen.date - a.chosen.date)[0];
      if (!pick) {
        const lv = await firstLiveLeagueGame();                 // no current team game → show any live league game
        if (my !== featToken) return;
        if (lv) { sport = lv.sport; league = lv.league; id = lv.id; team = { name: "", league: lv.label }; }
      }
      if (!id && !pick) {
        pick = withGame.filter((r) => r.chosen.state === "pre").sort((a, b) => a.chosen.date - b.chosen.date)[0]
          || withGame.filter((r) => r.chosen.state === "post").sort((a, b) => b.chosen.date - a.chosen.date)[0]
          || withGame[0];
      }
      if (pick) { sport = pick.team.sport; league = pick.team.league; id = pick.chosen.id; team = pick.team; isHome = pick.chosen.home; }
    } else {
      const lg = SP.LEAGUES.find((l) => l.league === view);
      if (!lg) { marker.hidden = true; host.innerHTML = ""; featuredLive = false; return; }
      const games = await SP.leagueScoreboard(lg.sport, lg.league);
      if (my !== featToken) return;
      const order = { in: 0, post: 1, pre: 2 };
      const g = (games || []).slice().sort((a, b) => (order[a.state] - order[b.state]) || (a.state === "pre" ? a.date - b.date : b.date - a.date))[0];
      if (g && g.id) { sport = lg.sport; league = lg.league; id = g.id; team = { name: "", league: lg.label }; }
    }

    if (!id) { marker.hidden = true; if (!silent) host.innerHTML = ""; featuredLive = false; return; }
    const sum = await SP.gameSummary(sport, league, id);
    if (my !== featToken) return;
    marker.hidden = false; scanReveals(marker);
    if (!sum) { if (!silent) host.innerHTML = `<div class="ed-empty">Game details aren't available right now — check back when you're online.</div>`; featuredLive = false; return; }
    host.innerHTML = gameCenter(sum, team, isHome);
    scanReveals(host);
    featuredLive = sum.state === "in";
  }

  function sideMark(t) {
    return t.logo ? `<div class="gc-mark"><img src="${esc(t.logo)}" alt="" onerror="this.parentNode.innerHTML='<span class=&quot;fb&quot;>${esc((t.abbr||t.name||'?').slice(0,3).toUpperCase())}</span>'"></div>`
      : `<div class="gc-mark"><span class="fb">${esc((t.abbr || t.name || "?").slice(0, 3).toUpperCase())}</span></div>`;
  }
  function gameCenter(s, myTeam, myIsHome) {
    const a = s.away, h = s.home;
    const myName = (myTeam.name || "").toLowerCase();
    const myAbbr = (myTeam.abbr || "").toLowerCase();
    const nameHit = (t) => {
      const n = (t.name || "").toLowerCase(), ab = (t.abbr || "").toLowerCase();
      return (n && myName && (n.includes(myName) || myName.includes(n))) || (ab && myAbbr && ab === myAbbr);
    };
    const mine = (t) => nameHit(t) || (t && t.homeAway === (myIsHome ? "home" : "away"));
    const live = s.state === "in";
    const statusTxt = live ? (s.detail || "Live") : s.state === "post" ? "Final" : (s.detail || "Scheduled");

    const scoreSpan = (t) => {
      if (t.score == null) return `<span class="away-s">—</span>`;
      const red = mine(t);
      return `<span class="reveal ${red ? "home-s" : "away-s"}" data-count="${esc(t.score)}">0</span>`;
    };

    let html = `<div class="gc">
      <div class="ed-kicker reveal">${esc((myTeam.league || "").toUpperCase())} · Game center
        ${live ? `<span class="ed-status"><span class="ed-dot"></span>LIVE</span>` : ""}</div>
      <div class="gc-matchup reveal">
        <div class="gc-team away">${sideMark(a)}<div class="gc-name">${esc(a.name)}</div><div class="gc-record">${esc(a.record || "")}</div></div>
        <div class="gc-score-block">
          <div class="gc-scores">${scoreSpan(a)}<span class="dash">—</span>${scoreSpan(h)}</div>
          <div class="gc-clock" id="gcClock">${esc(statusTxt)}</div>
        </div>
        <div class="gc-team home">${sideMark(h)}<div class="gc-name">${esc(h.name)}</div><div class="gc-record">${esc(h.record || "")}</div></div>
      </div>`;

    // linescore
    if (s.periods && s.periods.length && (a.linescores.length || h.linescores.length)) {
      const ths = s.periods.map((p) => `<th>${esc(p)}</th>`).join("");
      const row = (t) => `<tr><td>${esc(t.abbr || t.name)}</td>${s.periods.map((p, i) => `<td>${esc(t.linescores[i] != null ? t.linescores[i] : "·")}</td>`).join("")}<td class="total">${esc(t.score != null ? t.score : "")}</td></tr>`;
      html += `<div class="gc-periods reveal"><table><thead><tr><th>Team</th>${ths}<th>T</th></tr></thead><tbody>${row(a)}${row(h)}</tbody></table></div>`;
      html += scoringChart(a, h, s.periods);
    }

    // head to head
    if (s.teamStats && s.teamStats.length) {
      const rows = s.teamStats.map((st) => {
        const av = parseNum(st.away), hv = parseNum(st.home);
        if (av == null || hv == null) return "";
        const tot = Math.abs(av) + Math.abs(hv) || 1;
        const aw = (Math.abs(av) / tot) * 100, hw = (Math.abs(hv) / tot) * 100;
        return `<div class="cmp reveal"><div class="cmp-label">${esc(st.label)}</div>
          <div class="cv away ${av >= hv ? "win" : ""}">${esc(st.away)}</div>
          <div class="cmp-bar"><span class="ba" style="width:${aw.toFixed(0)}%"></span><span class="bh" style="width:${hw.toFixed(0)}%"></span></div>
          <div class="cv home ${hv >= av ? "win" : ""}">${esc(st.home)}</div></div>`;
      }).filter(Boolean).join("");
      if (rows) html += `<div class="gc-compare">${rows}</div>`;
    }

    // leaders
    if (s.leaders && s.leaders.length) {
      html += `<div class="gc-leaders">` + s.leaders.slice(0, 4).map((l) =>
        `<div class="gc-leader reveal"><div class="gl-cat">${esc(l.cat)}</div><div class="gl-who">${esc(l.who || "—")}</div><div class="gl-val">${esc(l.val || "")}${l.team ? " · " + esc(l.team) : ""}</div></div>`).join("") + `</div>`;
    }

    html += `</div>`;
    return html;
  }

  function scoringChart(a, h, periods) {
    const cum = (t) => { let s = 0; return periods.map((p, i) => { s += parseNum(t.linescores[i]) || 0; return s; }); };
    const av = cum(a), hv = cum(h);
    const max = Math.max(...av, ...hv, 1);
    const W = 600, H = 150, padL = 6, padR = 6, padB = 18, padT = 8;
    const iw = W - padL - padR, ih = H - padT - padB;
    const x = (i) => padL + (periods.length === 1 ? iw / 2 : (i / (periods.length - 1)) * iw);
    const y = (v) => padT + ih - (v / max) * ih;
    const path = (arr) => arr.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    const labels = periods.map((p, i) => `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(p)}</text>`).join("");
    const dots = (arr, cls) => arr.map((v, i) => `<circle class="gcl-dot ${cls}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"></circle>`).join("");
    return `<div class="gc-chart reveal">
      <div class="gcc-head"><div class="gcc-title">How it flowed</div>
        <div class="gcc-leg"><span><i class="away"></i>${esc(a.abbr || a.name)}</span><span><i class="home"></i>${esc(h.abbr || h.name)}</span></div></div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line class="grid" x1="${padL}" y1="${(padT + ih).toFixed(1)}" x2="${W - padR}" y2="${(padT + ih).toFixed(1)}"></line>
        <path class="gcl away" d="${path(av)}"></path>
        <path class="gcl home" d="${path(hv)}"></path>
        ${dots(av, "away")}${dots(hv, "home")}
        ${labels}
      </svg></div>`;
  }

  // ---------- BREAKING NEWS ----------
  const INSIDERS = ["schefter", "wojnarowski", "woj", "shams", "charania", "passan", "rosenthal", "lowe", "fowler", "rapoport", "garafolo"];
  let newsToken = 0;
  async function renderNews() {
    const host = $("#sbNews"); if (!host) return;
    const my = ++newsToken;
    const head = $("#newsHead") || null;
    // sources: a single league when a league tab is active; otherwise everything you follow
    let sources, scope;
    if (view !== "mine") {
      const lg = SP.LEAGUES.find((l) => l.league === view);
      sources = lg ? [{ sport: lg.sport, league: lg.league }] : [];
      scope = lg ? lg.label : "";
    } else {
      const set = new Map();
      (state.teams || []).forEach((t) => set.set(t.league, { sport: t.sport, league: t.league }));
      (state.followLeagues || []).forEach((f) => { if (!set.has(f.league)) set.set(f.league, { sport: f.sport, league: f.league }); });
      if (!set.has("nfl")) set.set("nfl", { sport: "football", league: "nfl" });
      sources = Array.from(set.values()).slice(0, 5);
      scope = "";
    }
    // reflect the scope in the section subtitle
    const sub = $("#newsSub"); if (sub) sub.textContent = scope ? `${scope} insider reports and breaking news — newest first.` : "Insider reports and breaking news for the leagues you follow — newest first.";
    if (!sources.length) { host.innerHTML = `<div class="ed-empty">Pick a league tab to see its news.</div>`; return; }
    host.innerHTML = `<div class="ed-empty">Loading the wire…</div>`;
    const lists = await Promise.all(sources.map((s) => SP.news(s.sport, s.league)));
    if (my !== newsToken) return;                       // a newer tab won
    let items = [];
    lists.forEach((l) => { if (l) items = items.concat(l); });
    if (!items.length) { host.innerHTML = `<div class="ed-empty">The wire is quiet right now — live news needs a connection. Check back when you're online.</div>`; return; }
    const seen = new Set();
    items = items.filter((x) => { const k = x.headline.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    items.sort((a, b) => new Date(b.published) - new Date(a.published));
    items = items.slice(0, 10);

    host.innerHTML = items.map((it) => {
      const author = it.byline || "ESPN";
      const low = author.toLowerCase();
      const generic = /^(espn|espn staff|staff|.*insiders?|.*\bstaff\b|associated press|ap)$/i;
      const insider = INSIDERS.some((n) => low.includes(n)) || (!!it.byline && !generic.test(author.trim()) && /\s/.test(author.trim()));
      const handle = "@" + author.replace(/[^a-z0-9]/gi, "");
      const ageH = (Date.now() - new Date(it.published).getTime()) / 3.6e6;
      const breaking = insider || ageH < 3;
      const verif = insider ? `<svg class="verif" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l2.6 1.9 3.2-.2 1 3 2.6 1.8-1 3 1 3-2.6 1.8-1 3-3.2-.2L12 23l-2.6-1.9-3.2.2-1-3L2.6 16.5l1-3-1-3 2.6-1.8 1-3 3.2.2L12 1z"/><path d="M10.8 14.6 8.4 12.2l-1.1 1.1 3.5 3.5 6-6-1.1-1.1z" fill="#fff"/></svg>` : "";
      const body = `<b>${esc(it.headline)}</b>${it.desc ? " — " + esc(it.desc) : ""}`;
      const tag = it.link ? "a" : "article";
      const href = it.link ? ` href="${esc(it.link)}" target="_blank" rel="noopener" data-cursor` : "";
      return `<${tag} class="npost reveal${it.link ? " npost-link" : ""}"${href}>
        <div class="npost-head">
          <div class="avatar ${insider ? "ins" : ""}">${esc(author[0] || "E")}</div>
          <div><div class="nn">${esc(author)} ${verif}</div><div class="nh">${esc(handle)}</div></div>
          <div class="ntime">${breaking ? `<span class="brk"><i></i>BREAKING</span> ` : ""}${relTime(it.published)}</div>
        </div>
        <div class="nbody">${body}</div>
        <div class="nleague">${esc((it.league || "").toUpperCase())}${it.link ? ` · <span class="nread">Read full article ↗</span>` : ""}</div>
      </${tag}>`;
    }).join("");
    scanReveals(host);
  }

  // initial reveal scan for the static markers
  scanReveals(document);
  render();        // also renders the featured game (view-aware)
  renderNews();
})();
