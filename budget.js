/* ===========================================================
   BASE — Budget editor logic
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store, { $, $$, esc, toast } = window.UI;
  let state = S.load();
  if (!state.budget) state.budget = { incomes: [], expenses: [] };
  const b = state.budget;
  if (!b.accounts) b.accounts = [];
  if (!b.bills) b.bills = [];
  if (!b.subscriptions) b.subscriptions = [];
  if (b.taxRate == null) b.taxRate = 0.12;
  const persist = () => S.save(state);
  const money = (n) => "$" + Math.round(n).toLocaleString();
  const money2 = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0 });
  const CATS = { needs: "Needs", wants: "Wants", goals: "Goals" };
  const monthlyOf = (sub) => (sub.cycle === "yearly" ? (+sub.amount || 0) / 12 : (+sub.amount || 0));

  function totals() {
    const inc = state.budget.incomes.reduce((s, x) => s + (+x.amount || 0), 0);
    const out = state.budget.expenses.reduce((s, x) => s + (+x.amount || 0), 0);
    return { inc, out, left: inc - out };
  }

  function renderSummary() {
    const t = totals();
    $("#sumIn").textContent = money(t.inc);
    $("#sumOut").textContent = money(t.out);
    const left = $("#sumLeft");
    left.textContent = (t.left < 0 ? "–" : "") + money(Math.abs(t.left));
    left.classList.toggle("neg", t.left < 0);
    left.classList.toggle("pos", t.left >= 0);
  }

  function renderIncome() {
    const list = $("#incomeList");
    if (!state.budget.incomes.length) { list.innerHTML = `<p class="muted">No income yet.</p>`; }
    else list.innerHTML = state.budget.incomes.map((x) => `
      <div class="row" data-id="${x.id}">
        <div class="row-main"><div class="t">${esc(x.label)}</div></div>
        <span class="amt">${money(x.amount)}</span>
        <button class="del" title="delete">×</button>
      </div>`).join("");
    $$("#incomeList .row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      state.budget.incomes = state.budget.incomes.filter((x) => x.id !== row.dataset.id); persist(); renderAll(); toast("Removed");
    }));
  }

  function renderExpenses() {
    const list = $("#expenseList");
    if (!state.budget.expenses.length) { list.innerHTML = `<p class="muted">No spending yet.</p>`; }
    else list.innerHTML = state.budget.expenses.map((x) => `
      <div class="row" data-id="${x.id}">
        <div class="row-main"><div class="t">${esc(x.label)}</div></div>
        <span class="cat-pill" data-cat="${x.cat}">${CATS[x.cat] || x.cat}</span>
        <span class="amt">${money(x.amount)}</span>
        <button class="del" title="delete">×</button>
      </div>`).join("");
    $$("#expenseList .row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      state.budget.expenses = state.budget.expenses.filter((x) => x.id !== row.dataset.id); persist(); renderAll(); toast("Removed");
    }));
  }

  function renderAll() { renderSummary(); renderCalc(); renderIncome(); renderExpenses(); renderAccounts(); renderBills(); renderSubs(); renderDue(); renderTrend(); }

  // ---------- CALCULATIONS ----------
  function calc() {
    const incomeMonthly = b.incomes.reduce((s, x) => s + (+x.amount || 0), 0);
    const tax = Math.max(0, Math.min(0.6, +b.taxRate || 0));
    const yearlyGross = incomeMonthly * 12;
    const yearlyNet = yearlyGross * (1 - tax);
    const billsMonthly = b.bills.reduce((s, x) => s + (+x.amount || 0), 0);
    const subsMonthly = b.subscriptions.reduce((s, x) => s + monthlyOf(x), 0);
    const credit = b.accounts.filter((a) => a.type === "credit");
    const debit = b.accounts.filter((a) => a.type === "debit");
    const creditOwed = credit.reduce((s, a) => s + (+a.balance || 0), 0);
    const creditLimit = credit.reduce((s, a) => s + (+a.limit || 0), 0);
    const cash = debit.reduce((s, a) => s + (+a.balance || 0), 0);
    const util = creditLimit ? creditOwed / creditLimit : 0;
    return { incomeMonthly, tax, yearlyGross, yearlyNet, billsMonthly, subsMonthly, creditOwed, creditLimit, cash, util };
  }

  function renderCalc() {
    const c = calc();
    $("#calcGrid").innerHTML = `
      <div class="calc"><div class="cn">${money(c.cash)}</div><div class="ck">Total cash</div><div class="cs">${b.accounts.filter((a) => a.type === "debit").length} debit account(s)</div></div>
      <div class="calc"><div class="cn pos">${money(c.yearlyGross)}</div><div class="ck">Yearly income</div><div class="cs">before taxes · ${money(c.incomeMonthly)}/mo</div></div>
      <div class="calc"><div class="cn pos">${money(c.yearlyNet)}</div><div class="ck">After taxes</div><div class="cs">${Math.round(c.tax * 100)}% rate · ${money(c.yearlyNet / 12)}/mo</div></div>
      <div class="calc"><div class="cn ${c.creditOwed > 0 ? "neg" : ""}">${money(c.creditOwed)}</div><div class="ck">Credit owed</div><div class="cs">${Math.round(c.util * 100)}% of ${money(c.creditLimit)} limit</div></div>
      <div class="calc"><div class="cn">${money(c.billsMonthly)}<span class="u">/mo</span></div><div class="ck">Bills</div><div class="cs">${money(c.billsMonthly * 12)} / year</div></div>
      <div class="calc"><div class="cn">${money2(c.subsMonthly)}<span class="u">/mo</span></div><div class="ck">Subscriptions</div><div class="cs">${money(c.subsMonthly * 12)} / year</div></div>
      <div class="calc"><div class="cn">${money(c.billsMonthly + c.subsMonthly)}<span class="u">/mo</span></div><div class="ck">Recurring total</div><div class="cs">bills + subscriptions</div></div>
      <div class="calc"><div class="cn ${c.cash - c.creditOwed >= 0 ? "pos" : "neg"}">${money(c.cash - c.creditOwed)}</div><div class="ck">Net cash position</div><div class="cs">cash minus credit owed</div></div>`;
  }

  // ---------- ACCOUNTS / CARDS ----------
  function renderAccounts() {
    const list = $("#acctList");
    if (!b.accounts.length) { list.innerHTML = `<p class="muted">No cards or accounts yet.</p>`; return; }
    const order = { credit: 0, debit: 1 };
    const sorted = b.accounts.slice().sort((a, z) => (order[a.type] - order[z.type]));
    list.innerHTML = sorted.map((a) => {
      let util = "";
      if (a.type === "credit" && +a.limit) {
        const u = (+a.balance || 0) / (+a.limit);
        util = `<div class="util"><span class="bar"><i class="${u > 0.5 ? "hot" : ""}" style="width:${Math.min(100, u * 100)}%"></i></span>${Math.round(u * 100)}% of ${money(a.limit)}${a.due ? " · due " + S.ordinal(a.due) : ""}</div>`;
      } else if (a.type === "credit" && a.due) { util = `<div class="util">due the ${S.ordinal(a.due)}</div>`; }
      else { util = `<div class="util">available balance</div>`; }
      return `<div class="acct-row" data-id="${a.id}">
        <div class="row-main"><div class="an">${esc(a.label)}</div>${util}</div>
        <span class="type-pill" data-t="${a.type}">${a.type}</span>
        <span class="bal">${money(a.balance)}</span>
        <button class="del" title="delete">×</button>
      </div>`;
    }).join("");
    $$("#acctList .acct-row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      b.accounts = b.accounts.filter((x) => x.id !== row.dataset.id); persist(); renderAll(); toast("Removed");
    }));
  }

  // ---------- BILLS ----------
  function renderBills() {
    const list = $("#billList");
    if (!b.bills.length) { list.innerHTML = `<p class="muted">No bills yet.</p>`; return; }
    const sorted = b.bills.slice().sort((a, z) => (a.due || 99) - (z.due || 99));
    list.innerHTML = sorted.map((x) => `
      <div class="row" data-id="${x.id}">
        <div class="row-main"><div class="t">${esc(x.label)}</div></div>
        ${x.due ? `<span class="due-chip ${dueClass(x.due)}">${S.ordinal(x.due)}</span>` : ""}
        <span class="amt">${money(x.amount)}</span>
        <button class="del" title="delete">×</button>
      </div>`).join("");
    $$("#billList .row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      b.bills = b.bills.filter((x) => x.id !== row.dataset.id); persist(); renderAll(); toast("Removed");
    }));
  }

  // ---------- SUBSCRIPTIONS ----------
  function renderSubs() {
    const list = $("#subList");
    if (!b.subscriptions.length) { list.innerHTML = `<p class="muted">No subscriptions yet.</p>`; return; }
    const sorted = b.subscriptions.slice().sort((a, z) => (a.due || 99) - (z.due || 99));
    list.innerHTML = sorted.map((x) => `
      <div class="row" data-id="${x.id}">
        <div class="row-main"><div class="t">${esc(x.label)}</div><div class="s">${x.cycle === "yearly" ? money(x.amount) + "/yr · " + money2(monthlyOf(x)) + "/mo" : "monthly"}</div></div>
        ${x.due ? `<span class="due-chip ${dueClass(x.due)}">${S.ordinal(x.due)}</span>` : ""}
        <span class="amt">${money2(x.amount)}</span>
        <button class="del" title="delete">×</button>
      </div>`).join("");
    $$("#subList .row").forEach((row) => row.querySelector(".del").addEventListener("click", () => {
      b.subscriptions = b.subscriptions.filter((x) => x.id !== row.dataset.id); persist(); renderAll(); toast("Removed");
    }));
  }

  // ---------- UPCOMING DUE DATES ----------
  function dueClass(dom) { const d = S.daysUntilDom(dom); return d === 0 ? "today" : (d != null && d <= 5) ? "soon" : ""; }
  function renderDue() {
    const items = [];
    b.bills.forEach((x) => { if (x.due) items.push({ name: x.label, kind: "Bill", amount: +x.amount || 0, due: x.due }); });
    b.subscriptions.forEach((x) => { if (x.due) items.push({ name: x.label, kind: x.cycle === "yearly" ? "Subscription · yearly" : "Subscription", amount: +x.amount || 0, due: x.due }); });
    b.accounts.forEach((a) => { if (a.type === "credit" && a.due) items.push({ name: a.label + " payment", kind: "Credit card", amount: +a.balance || 0, due: a.due }); });
    items.forEach((it) => (it.d = S.daysUntilDom(it.due)));
    items.sort((a, z) => a.d - z.d);
    const list = $("#dueList");
    if (!items.length) { list.innerHTML = `<p class="muted">Nothing with a due date yet.</p>`; return; }
    list.innerHTML = items.map((it) => {
      const soon = it.d <= 5;
      const when = it.d === 0 ? "Today" : it.d === 1 ? "Tomorrow" : "in " + it.d + " days";
      return `<div class="due-row">
        <div class="dd-day ${soon ? "soon" : ""}">${it.due}</div>
        <div class="row-main"><div class="dn">${esc(it.name)}</div><div class="dk">${it.kind} · ${when}</div></div>
        <span class="da">${money(it.amount)}</span>
      </div>`;
    }).join("");
  }

  // ---------- TAX CONTROL ----------
  const taxInput = $("#taxRate");
  taxInput.value = Math.round((+b.taxRate || 0) * 100);
  function applyTax() { b.taxRate = Math.max(0, Math.min(60, +taxInput.value || 0)) / 100; renderCalc(); }
  taxInput.addEventListener("input", applyTax);
  taxInput.addEventListener("change", () => { applyTax(); persist(); });

  // ---------- ADDERS (cards / bills / subs) ----------
  $("#addAcct").addEventListener("click", () => {
    const label = $("#acLabel").value.trim(), type = $("#acType").value;
    const bal = +$("#acBal").value, limit = +$("#acLimit").value, due = +$("#acDue").value;
    if (!label) { toast("Name the card or account"); return; }
    const a = { id: S.uid("a"), label, type, balance: bal || 0 };
    if (type === "credit") { a.limit = limit || 0; a.due = (due >= 1 && due <= 31) ? due : null; }
    b.accounts.push(a);
    ["acLabel", "acBal", "acLimit", "acDue"].forEach((id) => ($("#" + id).value = ""));
    persist(); renderAll(); toast("Added");
  });
  $("#addBill").addEventListener("click", () => {
    const label = $("#blLabel").value.trim(), amt = +$("#blAmt").value, due = +$("#blDue").value;
    if (!label || !(amt > 0)) { toast("Add a bill and amount"); return; }
    b.bills.push({ id: S.uid("b"), label, amount: amt, due: (due >= 1 && due <= 31) ? due : null });
    ["blLabel", "blAmt", "blDue"].forEach((id) => ($("#" + id).value = ""));
    persist(); renderAll(); toast("Bill added");
  });
  $("#addSub").addEventListener("click", () => {
    const label = $("#sbLabel").value.trim(), amt = +$("#sbAmt").value, cycle = $("#sbCycle").value, due = +$("#sbDue").value;
    if (!label || !(amt > 0)) { toast("Add a subscription and amount"); return; }
    b.subscriptions.push({ id: S.uid("s"), label, amount: amt, cycle, due: (due >= 1 && due <= 31) ? due : null });
    ["sbLabel", "sbAmt", "sbDue"].forEach((id) => ($("#" + id).value = ""));
    persist(); renderAll(); toast("Subscription added");
  });

  // ---------- TRENDS ----------
  let trendMode = "savings";
  if (!state.budget.history) state.budget.history = [];

  function series() {
    const hist = (state.budget.history || []).slice();
    const t = totals();
    const cur = S.isoMonth();
    const arr = hist.filter((h) => h.month !== cur).map((h) => ({ month: h.month, income: h.income, spend: h.spend, left: h.income - h.spend, current: false }));
    arr.push({ month: cur, income: t.inc, spend: t.out, left: t.left, current: true });
    return arr.slice(-8);
  }

  function renderTrendMeta(data) {
    const last = data[data.length - 1];
    const totalSaved = data.reduce((s, d) => s + d.left, 0);
    const avg = data.length ? totalSaved / data.length : 0;
    const prev = data.length > 1 ? data[data.length - 2].left : null;
    const change = prev == null ? null : last.left - prev;
    const changeStr = change == null ? "" : (change >= 0 ? "▲ " : "▼ ") + money(Math.abs(change));
    $("#trendMeta").innerHTML = `
      <div class="tm"><span class="v ${last.left < 0 ? "neg" : "pos"}">${last.left < 0 ? "–" : ""}${money(Math.abs(last.left))}</span><span class="k">this month${change != null ? ` · ${changeStr} vs last` : ""}</span></div>
      <div class="tm"><span class="v">${money(avg)}</span><span class="k">avg / month</span></div>
      <div class="tm"><span class="v ${totalSaved < 0 ? "neg" : "pos"}">${totalSaved < 0 ? "–" : ""}${money(Math.abs(totalSaved))}</span><span class="k">saved over ${data.length} mo</span></div>`;
  }

  function renderTrend() {
    const data = series();
    renderTrendMeta(data);
    const W = 720, H = 250, padL = 52, padR = 16, padT = 16, padB = 34;
    const iw = W - padL - padR, ih = H - padT - padB;
    const x = (i) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const note = $("#trendNote");

    if (trendMode === "savings") {
      const vals = data.map((d) => d.left);
      const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
      const span = (max - min) || 1;
      const y = (v) => padT + ih - ((v - min) / span) * ih;
      const pts = data.map((d, i) => [x(i), y(d.left)]);
      const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      const area = `M${x(0)} ${y(min)} ` + pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + ` L${x(data.length - 1)} ${y(min)} Z`;
      const zeroY = y(0);
      const ticks = 4;
      let grid = "";
      for (let g = 0; g <= ticks; g++) {
        const v = min + (span * g) / ticks; const gy = y(v);
        grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}"></line>`;
        grid += `<text class="chart-axis" x="${padL - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end">$${Math.round(v)}</text>`;
      }
      const labels = data.map((d, i) => `<text class="chart-axis" x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle">${S.monthLabel(d.month)}</text>`).join("");
      const dots = data.map((d, i) => `<circle class="chart-pt ${d.current ? "cur" : ""}" data-i="${i}" cx="${x(i).toFixed(1)}" cy="${y(d.left).toFixed(1)}" r="4.5"></circle>`).join("");
      $("#chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Savings per month">
        <g class="chart-grid">${grid}</g>
        ${min < 0 && max > 0 ? `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="var(--ink-faint)" stroke-dasharray="3 3"></line>` : ""}
        <path class="chart-area" d="${area}"></path>
        <path class="chart-line" d="${line}"></path>
        ${dots}
        <g class="chart-tip" id="chartTip" style="display:none"></g>
        ${labels}
      </svg>`;
      note.textContent = "Money left at the end of each month.";
      wireDots(data, (d) => `${S.monthLabel(d.month)}: ${d.left < 0 ? "–" : ""}${money(Math.abs(d.left))} left`);
    } else {
      const max = Math.max(...data.map((d) => Math.max(d.income, d.spend)), 1);
      const y = (v) => padT + ih - (v / max) * ih;
      const group = iw / data.length;
      const bw = Math.min(20, group / 3);
      const ticks = 4;
      let grid = "";
      for (let g = 0; g <= ticks; g++) {
        const v = (max * g) / ticks; const gy = y(v);
        grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}"></line>`;
        grid += `<text class="chart-axis" x="${padL - 8}" y="${(gy + 3).toFixed(1)}" text-anchor="end">$${Math.round(v)}</text>`;
      }
      let bars = "", labels = "";
      data.forEach((d, i) => {
        const cx = padL + group * i + group / 2;
        bars += `<rect class="bar-in" x="${(cx - bw - 2).toFixed(1)}" y="${y(d.income).toFixed(1)}" width="${bw}" height="${(padT + ih - y(d.income)).toFixed(1)}" rx="3"></rect>`;
        bars += `<rect class="bar-out" x="${(cx + 2).toFixed(1)}" y="${y(d.spend).toFixed(1)}" width="${bw}" height="${(padT + ih - y(d.spend)).toFixed(1)}" rx="3"></rect>`;
        labels += `<text class="chart-axis" x="${cx.toFixed(1)}" y="${H - 10}" text-anchor="middle">${S.monthLabel(d.month)}</text>`;
      });
      $("#chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income vs spending per month">
        <g class="chart-grid">${grid}</g>${bars}${labels}
      </svg>`;
      note.innerHTML = "";
      $("#chart").insertAdjacentHTML("afterend", "");
      note.textContent = "Income vs. spending, month by month.";
    }
  }

  function wireDots(data, fmt) {
    const tip = $("#chartTip");
    $$("#chart .chart-pt").forEach((c) => {
      const show = () => {
        $$("#chart .chart-pt").forEach((o) => o.classList.remove("on"));
        c.classList.add("on");
        const d = data[+c.dataset.i];
        const label = fmt(d);
        const cx = +c.getAttribute("cx"), cy = +c.getAttribute("cy");
        const w = label.length * 6.6 + 18;
        let tx = cx - w / 2; tx = Math.max(4, Math.min(tx, 720 - w - 4));
        tip.setAttribute("style", "display:block");
        tip.innerHTML = `<rect x="${tx.toFixed(1)}" y="${(cy - 34).toFixed(1)}" width="${w.toFixed(1)}" height="22" rx="6"></rect>
          <text x="${(tx + w / 2).toFixed(1)}" y="${(cy - 19).toFixed(1)}" text-anchor="middle">${label}</text>`;
      };
      c.addEventListener("mouseenter", show);
      c.addEventListener("click", show);
    });
  }

  $$("#trendToggle .tt-btn").forEach((b) => b.addEventListener("click", () => {
    trendMode = b.dataset.mode;
    $$("#trendToggle .tt-btn").forEach((o) => o.classList.toggle("active", o === b));
    renderTrend();
  }));

  $("#logMonth").addEventListener("click", () => {
    const t = totals(); const cur = S.isoMonth();
    if (!state.budget.history) state.budget.history = [];
    const existing = state.budget.history.find((h) => h.month === cur);
    if (existing) { existing.income = t.inc; existing.spend = t.out; toast("Updated this month"); }
    else { state.budget.history.push({ month: cur, income: t.inc, spend: t.out }); toast("Logged " + S.monthLabel(cur)); }
    persist(); renderTrend();
  });

  function addInc() {
    const label = $("#incLabel").value.trim(), amt = +$("#incAmt").value;
    if (!label || !(amt > 0)) { toast("Add a source and amount"); return; }
    state.budget.incomes.push({ id: S.uid("i"), label, amount: amt });
    $("#incLabel").value = ""; $("#incAmt").value = ""; persist(); renderAll(); toast("Income added");
  }
  function addExp() {
    const label = $("#expLabel").value.trim(), amt = +$("#expAmt").value, cat = $("#expCat").value;
    if (!label || !(amt > 0)) { toast("Add an expense and amount"); return; }
    state.budget.expenses.push({ id: S.uid("x"), label, amount: amt, cat });
    $("#expLabel").value = ""; $("#expAmt").value = ""; persist(); renderAll(); toast("Expense added");
  }
  $("#addInc").addEventListener("click", addInc);
  $("#addExp").addEventListener("click", addExp);
  $("#incAmt").addEventListener("keydown", (e) => { if (e.key === "Enter") addInc(); });
  $("#expAmt").addEventListener("keydown", (e) => { if (e.key === "Enter") addExp(); });

  renderAll();
})();
