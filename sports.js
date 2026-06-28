/* ===========================================================
   BASE — sports util (ESPN public JSON, no key)
   Exposes window.Sports
   =========================================================== */
window.Sports = (function () {
  "use strict";

  const LEAGUES = [
    { sport: "football", league: "nfl", label: "NFL" },
    { sport: "basketball", league: "nba", label: "NBA" },
    { sport: "baseball", league: "mlb", label: "MLB" },
    { sport: "hockey", league: "nhl", label: "NHL" },
    { sport: "football", league: "college-football", label: "CFB" },
    { sport: "basketball", league: "mens-college-basketball", label: "CBB (M)" },
    { sport: "basketball", league: "womens-college-basketball", label: "CBB (W)" },
    { sport: "soccer", league: "eng.1", label: "EPL" },
    { sport: "soccer", league: "uefa.champions", label: "UCL" },
    { sport: "soccer", league: "usa.1", label: "MLS" },
    { sport: "soccer", league: "esp.1", label: "La Liga" },
    { sport: "soccer", league: "ita.1", label: "Serie A" },
    { sport: "soccer", league: "ger.1", label: "Bundesliga" },
    { sport: "soccer", league: "uefa.europa", label: "Europa" },
    { sport: "soccer", league: "fifa.world", label: "World Cup" },
    { sport: "soccer", league: "fifa.wwc", label: "Women's WC" },
    { sport: "soccer", league: "fifa.cwc", label: "Club WC" },
    { sport: "basketball", league: "wnba", label: "WNBA" },
  ];

  function scoreOf(c) {
    if (!c) return null;
    const s = c.score;
    if (s == null) return null;
    if (typeof s === "object") return s.displayValue != null ? s.displayValue : s.value;
    return s;
  }

  function parseEvent(ev, teamId) {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp) return null;
    const date = new Date(comp.date || ev.date);
    const st = (comp.status && comp.status.type) || {};
    const comps = comp.competitors || [];
    const us = comps.find((c) => c.team && String(c.team.id) === String(teamId));
    const them = comps.find((c) => c !== us);
    if (!us || !them) return null;
    return {
      id: ev.id,
      date,
      state: st.state || "pre",        // pre | in | post
      detail: st.shortDetail || "",
      home: us.homeAway === "home",
      opp: (them.team && (them.team.shortDisplayName || them.team.displayName)) || "TBD",
      oppAbbr: (them.team && them.team.abbreviation) || "",
      ourScore: scoreOf(us),
      oppScore: scoreOf(them),
      winner: us.winner === true,
    };
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // returns { team, chosen, todayGame } or { team, error }
  async function teamGame(team) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.league}/teams/${team.id}/schedule`;
      const r = await fetch(url);
      const d = await r.json();
      const events = (d.events || []).map((e) => parseEvent(e, team.id)).filter(Boolean);
      const now = new Date();
      const live = events.find((e) => e.state === "in");
      const upcoming = events.filter((e) => e.state === "pre").sort((a, b) => a.date - b.date);
      const past = events.filter((e) => e.state === "post").sort((a, b) => a.date - b.date);
      const chosen = live || upcoming[0] || past[past.length - 1] || null;
      const todayGame = events.find((e) => sameDay(e.date, now) && e.state !== "post") || null;
      return { team, chosen, todayGame };
    } catch (e) {
      return { team, error: true };
    }
  }

  // fetch the full team list for a league (for the Plan picker)
  async function teamList(sport, league) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams`;
      const r = await fetch(url);
      const d = await r.json();
      const teams = [];
      (d.sports || []).forEach((s) =>
        (s.leagues || []).forEach((l) =>
          (l.teams || []).forEach((t) => {
            if (t.team) teams.push({ id: t.team.id, name: t.team.shortDisplayName || t.team.displayName, abbr: t.team.abbreviation });
          })
        )
      );
      teams.sort((a, b) => a.name.localeCompare(b.name));
      return teams;
    } catch (e) { return []; }
  }

  function logoFrom(team) {
    if (!team) return "";
    if (team.logo) return team.logo;
    if (team.logos && team.logos[0]) return team.logos[0].href;
    return "";
  }

  // Today's full scoreboard for a league
  async function leagueScoreboard(sport, league) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
      const d = await (await fetch(url)).json();
      const games = (d.events || []).map((ev) => {
        const comp = ev.competitions && ev.competitions[0];
        if (!comp) return null;
        const st = (comp.status && comp.status.type) || {};
        const cs = comp.competitors || [];
        const home = cs.find((c) => c.homeAway === "home") || cs[0];
        const away = cs.find((c) => c.homeAway === "away") || cs[1];
        if (!home || !away) return null;
        const side = (c) => ({
          name: c.team.shortDisplayName || c.team.displayName,
          abbr: c.team.abbreviation || "",
          logo: logoFrom(c.team),
          score: scoreOf(c),
          record: (c.records && c.records[0] && c.records[0].summary) || "",
          winner: c.winner === true,
          color: c.team.color ? "#" + c.team.color : null,
        });
        const leaders = [];
        (comp.leaders || []).forEach((cat) => {
          const l = cat.leaders && cat.leaders[0];
          if (l) leaders.push({ cat: cat.shortDisplayName || cat.displayName, who: l.athlete && l.athlete.shortName, val: l.displayValue });
        });
        return {
          id: ev.id,
          date: new Date(comp.date || ev.date),
          state: st.state || "pre",
          detail: st.shortDetail || "",
          completed: st.completed === true,
          venue: (comp.venue && comp.venue.fullName) || "",
          broadcast: (comp.broadcasts && comp.broadcasts[0] && comp.broadcasts[0].names && comp.broadcasts[0].names[0]) || "",
          home: side(home),
          away: side(away),
          leaders: leaders.slice(0, 3),
        };
      }).filter(Boolean);
      return games;
    } catch (e) { return null; }
  }

  // Standings for a league -> [{name, abbr, logo, w, l, pct, group}]
  async function standings(sport, league) {
    try {
      const url = `https://site.api.espn.com/apis/v2/sports/${sport}/${league}/standings`;
      const d = await (await fetch(url)).json();
      const rows = [];
      function walk(node, groupName) {
        if (!node) return;
        const gname = node.name || groupName || "";
        if (node.standings && node.standings.entries) {
          node.standings.entries.forEach((e) => {
            const t = e.team || {};
            const stat = (k) => { const s = (e.stats || []).find((x) => x.name === k || x.type === k); return s ? (s.displayValue != null ? s.displayValue : s.value) : ""; };
            rows.push({
              name: t.shortDisplayName || t.displayName || t.name,
              abbr: t.abbreviation || "",
              logo: (t.logos && t.logos[0] && t.logos[0].href) || "",
              w: stat("wins"), l: stat("losses"),
              pct: stat("winPercent") || stat("winpercent"),
              gb: stat("gamesBehind"),
              streak: stat("streak"),
              group: gname,
            });
          });
        }
        (node.children || []).forEach((c) => walk(c, gname));
      }
      (d.children || []).forEach((c) => walk(c, ""));
      if (!rows.length && d.standings && d.standings.entries) walk(d, d.name);
      return rows;
    } catch (e) { return null; }
  }

  // Detailed box score for one game (ESPN summary endpoint)
  async function gameSummary(sport, league, eventId) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${eventId}`;
      const d = await (await fetch(url)).json();
      const comp = d.header && d.header.competitions && d.header.competitions[0];
      const cs = (comp && comp.competitors) || [];
      const st = (comp && comp.status && comp.status.type) || {};
      function side(c) {
        if (!c) return null;
        const t = c.team || {};
        return {
          name: t.shortDisplayName || t.displayName || t.name,
          abbr: t.abbreviation || "",
          logo: logoFrom(t),
          color: t.color ? "#" + t.color : null,
          score: c.score != null ? c.score : null,
          homeAway: c.homeAway,
          winner: c.winner === true,
          record: (c.record && c.record[0] && c.record[0].displayValue) || "",
          linescores: (c.linescores || []).map((l) => (l.displayValue != null ? l.displayValue : l.value)),
        };
      }
      const home = side(cs.find((c) => c.homeAway === "home") || cs[0]);
      const away = side(cs.find((c) => c.homeAway === "away") || cs[1]);

      // period headers
      let periods = [];
      const maxLs = Math.max(home && home.linescores.length || 0, away && away.linescores.length || 0);
      let labeler;
      if (sport === "baseball") labeler = (i) => String(i + 1);
      else if (sport === "hockey") labeler = (i) => "P" + (i + 1);
      else if (sport === "soccer") labeler = (i) => (i < 2 ? (i + 1) + "H" : "ET" + (i - 1));
      else labeler = (i) => (i < 4 ? "Q" + (i + 1) : "OT" + (i - 3)); // football/basketball + OT
      for (let i = 0; i < maxLs; i++) periods.push(labeler(i));

      // team stat comparison from boxscore
      const teamStats = [];
      const bsTeams = (d.boxscore && d.boxscore.teams) || [];
      if (bsTeams.length === 2) {
        const labels = {};
        bsTeams.forEach((bt, idx) => (bt.statistics || []).forEach((s) => {
          const key = s.name || s.label;
          labels[key] = labels[key] || { label: s.label || s.name };
          labels[key][idx] = s.displayValue != null ? s.displayValue : s.value;
        }));
        Object.keys(labels).slice(0, 8).forEach((k) => {
          if (labels[k][0] != null && labels[k][1] != null) teamStats.push({ label: labels[k].label, away: labels[k][bsTeams[0].homeAway === "away" ? 0 : 1], home: labels[k][bsTeams[0].homeAway === "home" ? 0 : 1] });
        });
      }

      // leaders
      const leaders = [];
      ((d.leaders) || []).forEach((teamLead) => {
        (teamLead.leaders || []).forEach((cat) => {
          const top = cat.leaders && cat.leaders[0];
          if (top) leaders.push({ team: teamLead.team && teamLead.team.abbreviation, cat: cat.displayName || cat.shortDisplayName, who: top.athlete && (top.athlete.shortName || top.athlete.displayName), val: top.displayValue });
        });
      });

      // live situation — baseball (bases/count/batter/pitcher), football
      // (down & distance / possession), and a last-play line for any sport.
      let situation = null;
      if ((st.state || "post") === "in") {
        const sit = d.situation || (comp && comp.situation) || {};
        const nm = (p) => (p && p.athlete && (p.athlete.shortName || p.athlete.displayName)) || "";
        // possession team (football)
        let possession = "";
        if (sit.possession) {
          const pc = cs.find((c) => c.team && String(c.team.id) === String(sit.possession));
          possession = (pc && pc.team && (pc.team.abbreviation || pc.team.shortDisplayName)) || "";
        }
        // last play — from situation, else the final entry of the play feed
        let lastPlay = (sit.lastPlay && (sit.lastPlay.text || sit.lastPlay.shortText)) || (typeof sit.lastPlay === "string" ? sit.lastPlay : "");
        if (!lastPlay && Array.isArray(d.plays) && d.plays.length) { const lp = d.plays[d.plays.length - 1]; lastPlay = (lp && (lp.text || lp.shortText)) || ""; }
        situation = {
          balls: sit.balls, strikes: sit.strikes, outs: sit.outs,
          onFirst: !!sit.onFirst, onSecond: !!sit.onSecond, onThird: !!sit.onThird,
          batter: nm(sit.batter), batterLine: (sit.batter && sit.batter.summary) || "",
          pitcher: nm(sit.pitcher), pitcherLine: (sit.pitcher && sit.pitcher.summary) || "",
          downDistance: sit.downDistanceText || sit.shortDownDistanceText || "",
          possession, isRedZone: !!sit.isRedZone,
          lastPlay,
        };
      }

      return {
        state: st.state || "post",
        detail: st.shortDetail || st.detail || "",
        venue: (comp && comp.venue && comp.venue.fullName) || "",
        home, away, periods,
        teamStats,
        leaders: leaders.slice(0, 6),
        situation,
      };
    } catch (e) { return null; }
  }

  return { LEAGUES, teamGame, teamList, leagueScoreboard, standings, gameSummary, news };

  // Breaking news / insider posts for a league (ESPN news API)
  async function news(sport, league) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/news`;
      const d = await (await fetch(url)).json();
      return (d.articles || []).map((a) => ({
        headline: a.headline || a.shortHeadline || "",
        desc: a.description || "",
        published: a.published || a.lastModified || "",
        byline: (a.byline || "").trim(),
        league,
        sport,
        type: a.type || "",
        premium: a.premium === true,
        link: (a.links && a.links.web && a.links.web.href) || "",
      })).filter((x) => x.headline);
    } catch (e) { return null; }
  }
})();
