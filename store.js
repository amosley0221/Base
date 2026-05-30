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
    // monthly budget — student with two jobs
    budget: {
      // effective tax rate used to estimate take-home (editable)
      taxRate: 0.16,
      // monthly gross income sources
      incomes: [
        { id: "i1", label: "Cafe job", amount: 900 },
        { id: "i2", label: "Library desk", amount: 560 },
      ],
      // recurring bills — dueDay is day-of-month (0 = no fixed date)
      bills: [
        { id: "b1", label: "Rent + utilities", amount: 650, dueDay: 1 },
        { id: "b2", label: "Phone", amount: 45, dueDay: 12 },
        { id: "b3", label: "Transit pass", amount: 55, dueDay: 5 },
        { id: "b4", label: "Internet", amount: 25, dueDay: 20 },
      ],
      // recurring subscriptions — also dated
      subscriptions: [
        { id: "s1", label: "Gym membership", amount: 30, dueDay: 15 },
        { id: "s2", label: "Spotify", amount: 11, dueDay: 8 },
        { id: "s3", label: "iCloud", amount: 3, dueDay: 22 },
        { id: "s4", label: "Streaming", amount: 16, dueDay: 19 },
      ],
      // cards: kind "credit" (balance owed, has limit + due date) or "debit" (cash on hand)
      cards: [
        { id: "c1", kind: "credit", name: "Student Visa", balance: 420, limit: 1500, dueDay: 18 },
        { id: "c2", kind: "credit", name: "Store card", balance: 95, limit: 500, dueDay: 25 },
        { id: "c3", kind: "debit", name: "Checking", balance: 1240 },
        { id: "c4", kind: "debit", name: "Savings", balance: 2100 },
      ],
      // past monthly snapshots (most recent last); current month is computed live
      history: [
        { month: "2025-12", income: 1300, spend: 1280 },
        { month: "2026-01", income: 1380, spend: 1290 },
        { month: "2026-02", income: 1420, spend: 1355 },
        { month: "2026-03", income: 1460, spend: 1300 },
        { month: "2026-04", income: 1500, spend: 1285 },
      ],
    },
    // academics — GPA + degree progress + assignments (Computer Engineering)
    academics: {
      requiredCredits: 128,   // credits to graduate
      priorCredits: 0,        // transfer / AP credits already earned
      priorGpa: 0,            // GPA attached to those prior credits
      // status: "completed" (uses grade) | "in-progress" | "planned" (use expected)
      courses: [
        { id: "co1", code: "MATH 141", name: "Calculus I", credits: 4, grade: "A-", expected: "", term: "Fall 2025", status: "completed" },
        { id: "co2", code: "ENGL 101", name: "Composition", credits: 3, grade: "B+", expected: "", term: "Fall 2025", status: "completed" },
        { id: "co3", code: "CMPE 101", name: "Intro to Computer Eng", credits: 3, grade: "A", expected: "", term: "Fall 2025", status: "completed" },
        { id: "co4", code: "PHYS 121", name: "Physics I — Mechanics", credits: 4, grade: "B", expected: "", term: "Fall 2025", status: "completed" },
        { id: "co5", code: "MATH 142", name: "Calculus II", credits: 4, grade: "", expected: "A-", term: "Spring 2026", status: "in-progress" },
        { id: "co6", code: "CMPE 200", name: "Digital Logic", credits: 3, grade: "", expected: "B+", term: "Spring 2026", status: "in-progress" },
        { id: "co7", code: "CS 201", name: "Data Structures", credits: 3, grade: "", expected: "A-", term: "Spring 2026", status: "in-progress" },
        { id: "co8", code: "PHYS 122", name: "Physics II — E&M", credits: 4, grade: "", expected: "B", term: "Spring 2026", status: "in-progress" },
        { id: "co9", code: "CMPE 300", name: "Microprocessors", credits: 3, grade: "", expected: "B+", term: "Fall 2026", status: "planned" },
        { id: "co10", code: "CS 202", name: "Algorithms", credits: 3, grade: "", expected: "A-", term: "Fall 2026", status: "planned" },
        { id: "co11", code: "MATH 241", name: "Calculus III", credits: 4, grade: "", expected: "B", term: "Fall 2026", status: "planned" },
        { id: "co12", code: "EE 201", name: "Circuits I", credits: 4, grade: "", expected: "B+", term: "Fall 2026", status: "planned" },
      ],
      // upcoming assignments / academic tasks — due is an ISO date
      assignments: [
        { id: "as1", title: "Digital Logic lab report", course: "CMPE 200", due: isoInDays(1), done: false },
        { id: "as2", title: "Data Structures final project", course: "CS 201", due: isoInDays(2), done: false },
        { id: "as3", title: "Physics II problem set 12", course: "PHYS 122", due: isoInDays(3), done: false },
        { id: "as4", title: "Calculus II final exam", course: "MATH 142", due: isoInDays(5), done: false },
        { id: "as5", title: "Fall course registration", course: "", due: isoInDays(7), done: false },
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
    // deep-ish merge budget so seeded history / new fields survive older saves
    merged.budget = Object.assign({}, base.budget, saved.budget || {});
    if (!merged.budget.history || !merged.budget.history.length) merged.budget.history = clone(base.budget.history);
    merged.academics = Object.assign({}, base.academics, saved.academics || {});
    return merged;
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function uid(prefix) { return (prefix || "x") + Math.random().toString(36).slice(2, 9); }

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

  // ---------- GPA (4.0 scale, +/- aware) ----------
  const GRADE_POINTS = {
    "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7,
    "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0,
  };
  const GRADE_LIST = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
  function gradePoints(g) { return Object.prototype.hasOwnProperty.call(GRADE_POINTS, g) ? GRADE_POINTS[g] : null; }

  // ---------- DUE DATES ----------
  // next calendar date a given day-of-month (1..31) falls on, today or later. 0 => null
  function nextDueDate(dueDay) {
    dueDay = +dueDay;
    if (!dueDay || dueDay < 1) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const y = now.getFullYear(), m = now.getMonth();
    function clampDay(year, month, day) {
      const last = new Date(year, month + 1, 0).getDate();
      return new Date(year, month, Math.min(day, last));
    }
    let d = clampDay(y, m, dueDay);
    if (d < now) d = clampDay(y, m + 1, dueDay);
    return d;
  }
  function daysUntilDate(d) {
    if (!d) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }

  window.Store = {
    KEY, DAYS, DAYS_FULL, SEED, load, save, reset, clone, uid,
    todayIdx, isWeekend, formatDate, greeting, isoInDays, daysUntil, isoMonth, monthLabel,
    GRADE_POINTS, GRADE_LIST, gradePoints, nextDueDate, daysUntilDate,
  };
})();
