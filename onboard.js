/* ===========================================================
   BASE — first-time welcome (Home)
   Shown once, until you've given a name or skipped it: asks what
   to call you, then points at where to set everything up.
   =========================================================== */
(function () {
  "use strict";
  const S = window.Store;
  const FLAG = "base_onboarded";
  let done = false;
  try { done = !!localStorage.getItem(FLAG); } catch (e) {}
  const st = S.load();
  if (done || (st.profile && st.profile.name)) return;

  const css = `
  .ob-scrim { position: fixed; inset: 0; z-index: 400; background: rgba(8,9,6,.45); display: grid; place-items: center; padding: 16px; animation: ob-in .3s ease both; }
  .ob-card { width: min(100%, 460px); max-height: calc(100dvh - 32px); overflow-y: auto; background: var(--white); color: var(--ink); border-radius: 24px; padding: 26px 22px 20px; box-shadow: var(--shadow-lg); }
  .ob-card h2 { font-size: 26px; letter-spacing: -0.02em; margin-bottom: 6px; }
  .ob-card p { color: var(--ink-soft); font-size: 15px; line-height: 1.5; margin-bottom: 16px; }
  .ob-card .field { width: 100%; margin-bottom: 14px; }
  .ob-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
  .ob-steps { list-style: none; display: grid; gap: 8px; margin: 4px 0 18px; padding: 0; }
  .ob-steps a { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--edge); border-radius: 14px; color: var(--ink); text-decoration: none; }
  .ob-steps a b { display: block; font-size: 15px; }
  .ob-steps a small { display: block; font-size: 13px; color: var(--ink-soft); margin-top: 2px; }
  .ob-steps a span:last-child { margin-left: auto; color: var(--ink-faint); }
  .ob-steps .ic { width: 34px; height: 34px; flex: none; border-radius: 10px; background: var(--red-wash); display: grid; place-items: center; font-size: 17px; }
  @keyframes ob-in { from { opacity: 0; } }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "ob-scrim";
  wrap.innerHTML = `
    <div class="ob-card" role="dialog" aria-label="Welcome to BASE">
      <div id="obStep1">
        <h2>Welcome to BASE.</h2>
        <p>Your homebase for bills, plans, school and scores. Everything stays on this phone. First, what should BASE call you?</p>
        <input class="field" id="obName" placeholder="Your first name" autocomplete="given-name" maxlength="40" />
        <div class="ob-row">
          <button class="btn btn--ghost btn--sm" id="obSkip" type="button">Skip</button>
          <button class="btn btn--red" id="obNext" type="button">Continue</button>
        </div>
      </div>
      <div id="obStep2" hidden>
        <h2 id="obHi">Let's set you up.</h2>
        <p>Start wherever you like. You can also just tell Rojo, like "rent is $1,200 due on the 1st".</p>
        <ul class="ob-steps">
          <li><a href="Budget.html"><span class="ic">$</span><span><b>Budget &amp; bills</b><small>Accounts, bills, subscriptions, reminders</small></span><span>›</span></a></li>
          <li><a href="Plan.html"><span class="ic">✓</span><span><b>Tasks &amp; habits</b><small>Your focus list and weekly habits</small></span><span>›</span></a></li>
          <li><a href="Calendar.html"><span class="ic">◷</span><span><b>Your week</b><small>Classes, shifts, workouts, dates</small></span><span>›</span></a></li>
          <li><a href="School.html"><span class="ic">✎</span><span><b>School</b><small>Classes, grades, assignments</small></span><span>›</span></a></li>
          <li><a href="rojo.html"><span class="ic">●</span><span><b>Meet Rojo</b><small>Your assistant for bills, questions and focus</small></span><span>›</span></a></li>
        </ul>
        <div class="ob-row"><button class="btn btn--red" id="obDone" type="button">Go to Home</button></div>
      </div>
    </div>`;

  let named = false;
  function finish() {
    try { localStorage.setItem(FLAG, "1"); } catch (e) {}
    // Home keeps its own copy of the data; reload so it picks up the name.
    if (named) location.reload(); else wrap.remove();
  }
  function show() {
    document.body.appendChild(wrap);
    const name = wrap.querySelector("#obName");
    wrap.querySelector("#obSkip").addEventListener("click", () => step2(""));
    wrap.querySelector("#obNext").addEventListener("click", () => step2(name.value.trim()));
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") step2(name.value.trim()); });
    wrap.querySelector("#obDone").addEventListener("click", finish);
    wrap.querySelectorAll(".ob-steps a").forEach((a) => a.addEventListener("click", () => { try { localStorage.setItem(FLAG, "1"); } catch (e) {} }));
  }
  function step2(name) {
    if (name) {
      const s2 = S.load();
      s2.profile = Object.assign({}, s2.profile, { name });
      S.save(s2);
      named = true;
      const g = document.getElementById("greet");
      if (g) g.textContent = S.greeting() + ", " + name + ".";
      wrap.querySelector("#obHi").textContent = "Nice to meet you, " + name + ".";
    }
    wrap.querySelector("#obStep1").hidden = true;
    wrap.querySelector("#obStep2").hidden = false;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
})();
