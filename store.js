/* ===========================================================
   BASE — shared data store (localStorage)
   One source of truth for Home + Plan + Notes + Calendar.
   =========================================================== */
(function () {
  "use strict";

  const KEY = "base_home_v1";
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  function pad(n) { return String(n).padStart(2, "0"); }
  function isoInDays(n) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function daysUntil(dateStr) {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const p = String(dateStr).split("-").map(Number);
    const target = new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
    return Math.round((target - t) / 86400000);
  }

  // ---- GPA / grade scale (standard US 4.0) ----
  const GRADES = [
    ["A", 4.0], ["A-", 3.7], ["B+", 3.3], ["B", 3.0], ["B-", 2.7],
    ["C+", 2.3], ["C", 2.0], ["C-", 1.7], ["D+", 1.3], ["D", 1.0], ["D-", 0.7], ["F", 0.0],
  ];
  function gradePoints(letter) { const f = GRADES.find((g) => g[0] === letter); return f ? f[1] : null; }
  function gpaLetter(p) {
    if (p == null || isNaN(p)) return "—";
    let best = GRADES[GRADES.length - 1];
    for (const g of GRADES) { if (p >= g[1] - 0.001) { best = g; break; } }
    return best[0];
  }
  // days until the next occurrence of a day-of-month (1-31)
  function daysUntilDom(dom) {
    if (!dom) return null;
    const now = new Date(); const today = now.getDate();
    const y = now.getFullYear(), m = now.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    let target = Math.min(dom, dim);
    if (target >= today) return target - today;
    const nextDim = new Date(y, m + 2, 0).getDate();
    return (dim - today) + Math.min(dom, nextDim);
  }
  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  const SEED = {
    profile: {
      name: "Antonio",
      major: "Computer Engineering",
    },
    tasks: [
      { id: "t1", text: "Register for fall classes", done: false, top: true },
      { id: "t2", text: "Trade Friday shift with Sam", done: false, top: true },
      { id: "t3", text: "30-minute workout", done: false, top: true },
      { id: "t4", text: "Order textbooks", done: false, top: false },
      { id: "t5", text: "Meal prep for the week", done: true, top: false },
    ],
    habits: [
      { id: "h1", name: "Workout", target: 4, days: [false, false, false, false, false, false, false] },
      { id: "h2", name: "Read 20 min", target: 5, days: [false, false, false, false, false, false, false] },
      { id: "h3", name: "Sleep by 11", target: 6, days: [false, false, false, false, false, false, false] },
      { id: "h4", name: "Water", target: 7, days: [false, false, false, false, false, false, false] },
    ],
    notes: [
      { id: "n1", title: "Semester goals", body: "Keep a 3.5+. Don't overload — 4 classes max. Protect mornings for studying before the afternoon shift.", color: "paper" },
      { id: "n2", title: "Two-job rhythm", body: "Cafe = mornings & weekends. Library desk = Tue/Thu evenings. Never both on a class day if I can help it.", color: "red" },
      { id: "n3", title: "Getting back to the gym", body: "Start light: 3x a week, 30 min. Walk on rest days. The goal is showing up, not maxing out.", color: "paper" },
    ],
    // day: 0-6 (Mon-Sun). cat: school | work | move | personal
    events: [
      { id: "e1", day: 0, time: "09:00", title: "Intro to Stats", cat: "school" },
      { id: "e2", day: 0, time: "14:00", title: "Cafe shift", cat: "work" },
      { id: "e3", day: 1, time: "10:00", title: "Library desk", cat: "work" },
      { id: "e4", day: 1, time: "18:00", title: "Workout", cat: "move" },
      { id: "e5", day: 2, time: "09:00", title: "Intro to Stats", cat: "school" },
      { id: "e6", day: 2, time: "13:00", title: "Writing seminar", cat: "school" },
      { id: "e7", day: 3, time: "10:00", title: "Library desk", cat: "work" },
      { id: "e8", day: 3, time: "18:00", title: "Workout", cat: "move" },
      { id: "e9", day: 4, time: "08:00", title: "Cafe shift", cat: "work" },
      { id: "e10", day: 5, time: "11:00", title: "Long study block", cat: "school" },
      { id: "e11", day: 5, time: "17:00", title: "Workout", cat: "move" },
      { id: "e12", day: 6, time: "10:00", title: "Rest + meal prep", cat: "personal" },
    ],
    // one-off dated countdowns
    milestones: [
      { id: "ms1", title: "Class registration", date: isoInDays(2) },
      { id: "ms2", title: "First day of classes", date: isoInDays(7) },
      { id: "ms3", title: "Vegas trip", date: isoInDays(23) },
    ],
    // teams for the scoreboard (ESPN ids)
    teams: [
      { id: "21", sport: "football", league: "nfl", name: "Eagles" },
      { id: "22", sport: "baseball", league: "mlb", name: "Phillies" },
      { id: "20", sport: "basketball", league: "nba", name: "76ers" },
    ],
    // whole leagues followed for live/recent updates beyond your specific teams
    followLeagues: [
      { sport: "soccer", league: "fifa.world" },
    ],
    // monthly budget — student with two jobs
    budget: {
      incomes: [
        { id: "i1", label: "Cafe job", amount: 900 },
        { id: "i2", label: "Library desk", amount: 560 },
      ],
      expenses: [
        { id: "x1", label: "Rent + utilities", amount: 650, cat: "needs" },
        { id: "x2", label: "Groceries", amount: 240, cat: "needs" },
        { id: "x3", label: "Phone + transit", amount: 95, cat: "needs" },
        { id: "x4", label: "Textbooks (saved)", amount: 60, cat: "goals" },
        { id: "x5", label: "Gym membership", amount: 30, cat: "wants" },
        { id: "x6", label: "Eating out + fun", amount: 130, cat: "wants" },
        { id: "x7", label: "Vegas fund", amount: 100, cat: "goals" },
      ],
      // past monthly snapshots (most recent last); current month is computed live
      history: [
        { month: "2025-12", income: 1300, spend: 1280 },
        { month: "2026-01", income: 1380, spend: 1290 },
        { month: "2026-02", income: 1420, spend: 1355 },
        { month: "2026-03", income: 1460, spend: 1300 },
        { month: "2026-04", income: 1500, spend: 1285 },
      ],
      // effective tax rate applied to gross income for the after-tax calc
      taxRate: 0.12,
      // credit + debit cards. due = day of month (credit only)
      accounts: [
        { id: "a1", label: "Visa Student", type: "credit", balance: 420, limit: 1500, due: 15 },
        { id: "a2", label: "Amex Blue", type: "credit", balance: 180, limit: 1000, due: 2 },
        { id: "a3", label: "Checking", type: "debit", balance: 1240, due: null },
        { id: "a4", label: "Savings", type: "debit", balance: 3100, due: null },
      ],
      // recurring bills. due = day of month
      bills: [
        { id: "b1", label: "Rent + utilities", amount: 650, due: 1 },
        { id: "b2", label: "Phone", amount: 55, due: 22 },
        { id: "b3", label: "Internet", amount: 40, due: 12 },
        { id: "b4", label: "Transit pass", amount: 65, due: 5 },
      ],
      // subscriptions. cycle = monthly | yearly
      subscriptions: [
        { id: "s1", label: "Spotify", amount: 11, cycle: "monthly", due: 8 },
        { id: "s2", label: "Netflix", amount: 15, cycle: "monthly", due: 20 },
        { id: "s3", label: "iCloud+", amount: 3, cycle: "monthly", due: 5 },
        { id: "s4", label: "Amazon Prime", amount: 139, cycle: "yearly", due: 14 },
        { id: "s5", label: "GitHub Pro", amount: 4, cycle: "monthly", due: 28 },
      ],
    },
    // school / GPA calculator
    school: {
      creditsNeeded: 128,   // total to graduate
      targetGpa: 3.6,
      creditsPerSem: 15,    // planning pace
      completed: [
        { id: "c1", name: "Calculus I", credits: 4, grade: "A-" },
        { id: "c2", name: "Calculus II", credits: 4, grade: "B+" },
        { id: "c3", name: "Intro to Programming", credits: 3, grade: "A" },
        { id: "c4", name: "Physics I: Mechanics", credits: 4, grade: "B+" },
        { id: "c5", name: "English Composition", credits: 3, grade: "A-" },
        { id: "c6", name: "Digital Logic Design", credits: 3, grade: "A" },
        { id: "c7", name: "General Chemistry", credits: 4, grade: "B" },
      ],
      // future classes with expected grades — drives the projection
      planned: [
        { id: "p1", name: "Data Structures", credits: 3, grade: "A-" },
        { id: "p2", name: "Calculus III", credits: 4, grade: "B+" },
        { id: "p3", name: "Circuits I", credits: 3, grade: "B+" },
        { id: "p4", name: "Computer Organization", credits: 3, grade: "A-" },
        { id: "p5", name: "Technical Writing", credits: 3, grade: "A" },
      ],
      // upcoming coursework. due = ISO date
      assignments: [
        { id: "as1", title: "Data Structures — PS2", course: "Data Structures", due: isoInDays(1), done: false },
        { id: "as2", title: "Calc III quiz", course: "Calculus III", due: isoInDays(2), done: false },
        { id: "as3", title: "Circuits lab report", course: "Circuits I", due: isoInDays(4), done: false },
        { id: "as4", title: "Tech Writing draft", course: "Technical Writing", due: isoInDays(6), done: false },
        { id: "as5", title: "Computer Org midterm", course: "Computer Organization", due: isoInDays(9), done: false },
      ],
    },
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { saved = null; }
    if (!saved) return clone(SEED);
    const base = clone(SEED);
    const merged = Object.assign(base, saved);
    // keep profile defaults if an older save lacks fields
    merged.profile = Object.assign({}, base.profile, saved.profile || {});
    // deep-ish merge budget so seeded history survives older saves
    merged.budget = Object.assign({}, base.budget, saved.budget || {});
    if (!merged.budget.history || !merged.budget.history.length) merged.budget.history = clone(base.budget.history);
    if (merged.budget.taxRate == null) merged.budget.taxRate = base.budget.taxRate;
    if (!merged.budget.accounts) merged.budget.accounts = clone(base.budget.accounts);
    if (!merged.budget.bills) merged.budget.bills = clone(base.budget.bills);
    if (!merged.budget.subscriptions) merged.budget.subscriptions = clone(base.budget.subscriptions);
    // school
    merged.school = Object.assign({}, base.school, saved.school || {});
    if (!merged.school.assignments) merged.school.assignments = clone(base.school.assignments);
    if (!merged.followLeagues) merged.followLeagues = clone(base.followLeagues);
    return merged;
  }

  function save(state) {
    try { if (state) localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function uid(prefix) { return (prefix || "x") + Math.random().toString(36).slice(2, 9); }

  // ---- backup / restore ----
  const EXPORT_VERSION = 1;
  function exportData() {
    const data = load();
    return JSON.stringify({ app: "BASE", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
  }
  // accepts either a wrapped backup ({app,version,data}) or a raw state object
  function importData(str) {
    let parsed;
    try { parsed = JSON.parse(str); } catch (e) { return { ok: false, error: "That file isn't valid JSON." }; }
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || typeof data !== "object" || (!data.tasks && !data.budget && !data.school && !data.profile)) {
      return { ok: false, error: "This doesn't look like a BASE backup." };
    }
    try { localStorage.setItem(KEY, JSON.stringify(data)); return { ok: true }; }
    catch (e) { return { ok: false, error: "Couldn't save — storage may be full." }; }
  }
  function storageBytes() {
    try { const s = localStorage.getItem(KEY); return s ? new Blob([s]).size : 0; } catch (e) { return 0; }
  }

  // Monday-indexed weekday (Mon=0 ... Sun=6)
  function todayIdx() { return (new Date().getDay() + 6) % 7; }
  function isWeekend(i) { i = (i == null) ? todayIdx() : i; return i >= 5; }

  function isoMonth(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); }
  function monthLabel(ym) {
    const p = String(ym).split("-").map(Number);
    return new Date(p[0], (p[1] || 1) - 1, 1).toLocaleDateString(undefined, { month: "short" });
  }

  function formatDate(d) {
    d = d || new Date();
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Still up";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    if (h < 22) return "Good evening";
    return "Winding down";
  }

  window.Store = {
    KEY, DAYS, DAYS_FULL, SEED, load, save, reset, clone, uid,
    todayIdx, isWeekend, formatDate, greeting, isoInDays, daysUntil, isoMonth, monthLabel,
    GRADES, gradePoints, gpaLetter, daysUntilDom, ordinal,
    exportData, importData, storageBytes, EXPORT_VERSION,
  };
})();
