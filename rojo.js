/* ===========================================================
   BASE — Rojo's screen (rojo.html)
   Rojo lives here: his eyes follow your finger, he answers in a
   speech bubble with little chirps (no spoken voice), you hold
   him (or the mic) to talk, and he runs focus sessions with a
   big countdown. The brain is AgentCore (agent-core.js).
   =========================================================== */
(function () {
  "use strict";
  const C = window.AgentCore, F = window.BaseFocus;
  const CAP = window.Capacitor;
  const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const AG = NATIVE && CAP.Plugins ? CAP.Plugins.BaseAgent : null;
  const $ = (s) => document.querySelector(s);
  const bubble = $("#rjBubble"), textEl = $("#rjText"), extraEl = $("#rjExtra"), saidEl = $("#rjSaid");
  const input = $("#rjInput"), sendBtn = $("#rjSend"), micBtn = $("#rjMic"), chipsEl = $("#rjChips");
  const faceWrap = $("#rjFaceWrap"), faceEl = $("#rjFace"), hint = $("#rjHint");
  const face = RojoFace.create(faceEl);
  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------------------------------------------------------------- chirps
  const Chirp = (function () {
    let ctx = null, muted = false;
    try { muted = localStorage.getItem("base_rojo_mute") === "1"; } catch (e) {}
    function ac() {
      if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    function blip(a, t0, f0, f1, dur, vol, type) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.03);
    }
    function play(kind) {
      if (muted) return;
      const a = ac(); if (!a) return;
      const t = a.currentTime + 0.01, r = (x, y) => x + Math.random() * (y - x);
      if (kind === "hi") { blip(a, t, 720, 1150, 0.09, 0.16); blip(a, t + 0.11, 950, 1550, 0.11, 0.16); }
      else if (kind === "talk") { const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { const f = r(640, 1080); blip(a, t + i * 0.075, f, f * r(0.85, 1.25), 0.06, 0.1, "triangle"); } }
      else if (kind === "happy") [880, 1100, 1320, 1760].forEach((f, i) => blip(a, t + i * 0.07, f, f * 1.05, 0.09, 0.13));
      else if (kind === "surprise") blip(a, t, 520, 1650, 0.16, 0.16);
      else if (kind === "sleep") blip(a, t, 520, 250, 0.45, 0.08);
      else if (kind === "listen") blip(a, t, 900, 1250, 0.07, 0.12);
      else if (kind === "done") [784, 988, 1175, 1568].forEach((f, i) => blip(a, t + i * 0.11, f, f, 0.17, 0.14, "triangle"));
      else if (kind === "uhoh") { blip(a, t, 720, 500, 0.12, 0.12); blip(a, t + 0.15, 600, 420, 0.16, 0.12); }
    }
    return {
      play, unlock: ac,
      get muted() { return muted; },
      toggle() { muted = !muted; try { localStorage.setItem("base_rojo_mute", muted ? "1" : "0"); } catch (e) {} return muted; },
    };
  })();
  $("#rjSound").classList.toggle("muted", Chirp.muted);
  $("#rjSound").addEventListener("click", () => {
    const m = Chirp.toggle();
    $("#rjSound").classList.toggle("muted", m);
    if (!m) Chirp.play("hi");
  });

  // ---------------------------------------------------------------- voice (hold to talk)
  const Voice = (function () {
    const SR = NATIVE && CAP.Plugins ? CAP.Plugins.SpeechRecognition : null;
    const WebSR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const lang = () => (C.practice() === "es" ? "es-US" : (navigator.language || "en-US"));
    let text = "", rec = null, handle = null;
    async function start(onPartial) {
      text = "";
      if (SR) {
        let p = await SR.checkPermissions().catch(() => ({}));
        if (p.speechRecognition !== "granted") p = await SR.requestPermissions().catch(() => ({}));
        if (p.speechRecognition !== "granted") throw new Error("mic");
        handle = await SR.addListener("partialResults", (e) => {
          const t = e.accumulatedText || e.accumulated || (e.matches && e.matches[0]) || "";
          if (t) { text = t; onPartial(text); }
        });
        SR.start({ language: lang(), partialResults: true, popup: false, addPunctuation: true })
          .then((r) => { if (r && r.matches && r.matches[0]) { text = r.matches[0]; onPartial(text); } }).catch(() => {});
        return;
      }
      if (WebSR) {
        rec = new WebSR();
        rec.lang = lang(); rec.interimResults = true; rec.continuous = true;
        rec.onresult = (e) => {
          let s = "";
          for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
          text = s.trim(); onPartial(text);
        };
        rec.onerror = () => {};
        rec.start();
        return;
      }
      throw new Error("unsupported");
    }
    async function stop() {
      if (SR) {
        await SR.stop().catch(() => {});
        await new Promise((r) => setTimeout(r, 450));
        if (!text) { try { const l = await SR.getLastPartialResult(); if (l && l.available && l.text) text = l.text; } catch (e) {} }
        if (handle) { handle.remove(); handle = null; }
        return text;
      }
      if (rec) {
        const r = rec; rec = null;
        await new Promise((res) => { r.onend = res; try { r.stop(); } catch (e) { res(); } setTimeout(res, 1200); });
        return text;
      }
      return "";
    }
    return { available: !!(SR || WebSR), start, stop };
  })();

  // ---------------------------------------------------------------- bubble
  let typing = null;        // { finish() } while a reply is being typed out
  let listening = false;
  let lastActive = Date.now();

  function showBubble(html, cls) {
    bubble.classList.remove("empty");
    textEl.className = "rj-text" + (cls ? " " + cls : "");
    textEl.innerHTML = html;
  }
  function plainOf(mdText) { return mdText.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); }
  // Type a reply out with chirps while Rojo "talks"; resolves when done.
  function typeOut(mdText, mood) {
    if (typing) typing.finish();
    return new Promise((resolve) => {
      const plain = plainOf(mdText);
      const total = Math.max(500, Math.min(3800, plain.length * 24));
      const t0 = performance.now();
      let shown = 0, lastChirp = 0, raf = 0;
      face.setMood("talking");
      bubble.classList.remove("empty");
      textEl.className = "rj-text";
      function finish() {
        cancelAnimationFrame(raf);
        typing = null;
        textEl.innerHTML = C.md(mdText);
        face.setTalk(0);
        face.setMood(mood || "idle");
        if (mood === "happy") setTimeout(() => { if (!typing && face.mood === "happy") face.setMood(idleMood()); }, 1800);
        bubble.scrollTop = 0;
        renderChips();
        resolve();
      }
      function stepType(now) {
        const n = Math.min(plain.length, Math.ceil(plain.length * ((now - t0) / total)));
        if (n !== shown) {
          shown = n;
          textEl.textContent = plain.slice(0, n);
          face.setTalk(0.3 + Math.random() * 0.7);
          if (n - lastChirp > 16 && /\s/.test(plain[n - 1] || "")) { Chirp.play("talk"); lastChirp = n; }
        }
        if (n >= plain.length) return finish();
        raf = requestAnimationFrame(stepType);
      }
      Chirp.play("talk");
      raf = requestAnimationFrame(stepType);
      typing = { finish };
    });
  }
  bubble.addEventListener("click", (e) => { if (typing && !e.target.closest("button,a")) typing.finish(); });

  function itemsAfterLastUser() {
    const ui = C.convo.ui;
    let i = ui.length - 1;
    while (i >= 0 && ui[i].type !== "user") i--;
    return { userIdx: i, after: ui.slice(i + 1).map((it, k) => ({ it, idx: i + 1 + k })) };
  }
  function actsHTML(item, idx) {
    let h = `<div class="rj-acts${item.pending ? " pending" : ""}">`;
    if (item.pending) h += `<div class="head">${item.resolved ? (item.resolved === "applied" ? "Applied" : "Discarded") : "Review these changes"}</div>`;
    h += item.items.map((s) => `<div class="row1"><span>${C.esc(s)}</span></div>`).join("");
    if (item.pending && !item.resolved) h += `<div class="btns"><button class="rj-mini primary" data-apply="${idx}">Apply</button><button class="rj-mini" data-discard="${idx}">Discard</button></div>`;
    if (!item.pending && item.undoable && item.snapshot) h += `<div class="btns"><button class="rj-mini" data-undo="${idx}">Undo</button></div>`;
    if (item.undone) h += `<div class="btns"><span>Undone</span></div>`;
    return h + "</div>";
  }
  // Show the latest exchange (used on load and after Undo/Apply).
  function renderStatic() {
    if (typing) return;
    const { userIdx, after } = itemsAfterLastUser();
    const ui = C.convo.ui;
    saidEl.hidden = userIdx < 0;
    if (userIdx >= 0) saidEl.textContent = ui[userIdx].text;
    const bot = after.filter((x) => x.it.type === "bot").pop();
    const err = after.filter((x) => x.it.type === "err").pop();
    if (C.busy) showBubble('<span class="typing"><i></i><i></i><i></i></span>');
    else if (bot) showBubble(C.md(bot.it.text));
    else if (err) showBubble(C.esc(err.it.text), "err");
    else if (!ui.length) showBubble(C.md(C.greeting()));
    extraEl.innerHTML = after.filter((x) => x.it.type === "acts").map((x) => actsHTML(x.it, x.idx)).join("");
    renderChips();
    if (!$("#rjSheet").hidden) renderLog();
  }
  function onActionClick(e) {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.undo != null) { C.undo(+t.dataset.undo); Chirp.play("uhoh"); }
    else if (t.dataset.apply != null) { t.disabled = true; C.apply(+t.dataset.apply).then(() => { Chirp.play("happy"); face.setMood("happy"); setTimeout(() => face.setMood(idleMood()), 1500); }); }
    else if (t.dataset.discard != null) C.discard(+t.dataset.discard);
  }
  extraEl.addEventListener("click", onActionClick);

  function setupHTML() {
    return `<b>Rojo needs your Claude API key</b><br>Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. It's stored only on this device.
      <div class="rj-setup"><input type="password" id="rjKey" placeholder="sk-ant-…" autocomplete="off" /></div>
      <button class="rj-mini primary" id="rjKeySave" type="button">Save key</button>`;
  }
  function askForKey(pending) {
    showBubble(setupHTML());
    face.setMood("surprised");
    $("#rjKeySave").addEventListener("click", () => {
      const k = $("#rjKey").value.trim();
      if (!k) return;
      C.setKey(k);
      Chirp.play("happy");
      if (pending) ask(pending); else typeOut("Thanks! I'm all set. What can I do for you?", "happy");
    });
  }

  // ---------------------------------------------------------------- asking
  async function ask(text) {
    text = String(text || "").trim();
    if (!text || C.busy) return;
    if (typing) typing.finish();
    if (!C.hasKey()) { askForKey(text); return; }
    saidEl.hidden = false; saidEl.textContent = text;
    extraEl.innerHTML = "";
    chipsEl.innerHTML = "";
    const r = await C.send(text);
    if (r.needKey) { askForKey(text); return; }
    if (r.error) { showBubble(C.esc(r.error), "err"); face.setMood("surprised"); Chirp.play("uhoh"); setTimeout(() => face.setMood(idleMood()), 1400); renderStatic(); return; }
    const reply = r.reply || (r.done && r.done.length ? "Done!" : "Okay!");
    const happy = (r.done && r.done.length) || r.focus === "started";
    await typeOut(reply, happy ? "happy" : idleMood());
    if (happy) Chirp.play("happy");
    renderStatic();
    syncFocusUI();
  }

  C.init({
    render() { renderStatic(); },
    busy(on) {
      sendBtn.disabled = on;
      document.body.classList.toggle("glow-think", on);
      if (on) { face.setMood("thinking"); showBubble('<span class="typing"><i></i><i></i><i></i></span>'); extraEl.innerHTML = ""; }
    },
    screen() {},
    practice(on) { paintPractice(); },
  }, { surface: "rojo" });

  // ---------------------------------------------------------------- Spanish practice
  const esBtn = $("#rjSpanish");
  function paintPractice() {
    const on = C.practice() === "es";
    esBtn.classList.toggle("on", on);
    esBtn.setAttribute("aria-pressed", on ? "true" : "false");
    input.placeholder = on ? "Habla con Rojo… (Spanish practice)" : "Ask Rojo…";
  }
  esBtn.addEventListener("click", () => {
    const on = C.practice() !== "es";
    C.setPractice(on);
    paintPractice();
    Chirp.play(on ? "happy" : "hi"); face.hop();
    typeOut(on ? "¡Vamos a practicar! Hablo despacio y te ayudo. (Let's practice! I'll keep it simple and help you.) ¿Cómo estás hoy?" : "Okay, back to English.", on ? "happy" : "idle");
  });
  paintPractice();

  // ---------------------------------------------------------------- chips + input
  function renderChips() {
    chipsEl.innerHTML = "";
    if (C.busy || typing || C.convo.ui.length > 1) return;
    const st = F.status();
    const chips = [];
    if (!st.active) chips.push(["Focus with me", "", "I'm working on  for 25 minutes", "I'm working on ".length]);
    if (C.practice() !== "es") chips.push(["Practice Spanish", "Let's practice Spanish. I'm a beginner."]);
    chips.push(["What's due this week?", "What bills are due in the next 7 days?"]);
    chips.push(["Am I short this month?", "Do I have enough cash for the rest of this month's bills?"]);
    chips.push(["Add a bill", "", "Rent is $ due on the 1st", "Rent is $".length]);
    chips.push(["Update a balance", "", "Checking has $", "Checking has $".length]);
    chips.forEach(([label, msg, prefill, caret]) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label;
      b.addEventListener("click", () => {
        if (msg) { ask(msg); return; }
        input.value = prefill; input.focus(); input.setSelectionRange(caret, caret); autosize();
      });
      chipsEl.appendChild(b);
    });
  }
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(120, input.scrollHeight) + "px"; }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#rjForm").requestSubmit(); } });
  $("#rjForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = input.value;
    if (!t.trim() || C.busy) return;
    input.value = ""; autosize(); input.blur();
    ask(t);
  });

  // ---------------------------------------------------------------- touch: eyes, tap, hold
  function touched() {
    lastActive = Date.now();
    Chirp.unlock();
    if (face.mood === "asleep" || face.mood === "sleepy") {
      face.setMood("surprised"); Chirp.play("surprise");
      setTimeout(() => { if (face.mood === "surprised") face.setMood(idleMood()); }, 900);
      return true;
    }
    return false;
  }
  let lookTimer = 0;
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" || e.buttons) { face.lookAtPoint(e.clientX, e.clientY); clearTimeout(lookTimer); lookTimer = setTimeout(() => face.lookAt(null), e.pointerType === "mouse" ? 2500 : 700); }
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    touched();
    face.lookAtPoint(e.clientX, e.clientY);
    clearTimeout(lookTimer); lookTimer = setTimeout(() => face.lookAt(null), 900);
  }, { passive: true });

  async function startListening() {
    if (listening || C.busy) return;
    if (typing) typing.finish();
    if (!Voice.available) {
      showBubble("Hold-to-talk isn't available here. Tap the box below and use your keyboard's mic instead.");
      input.focus();
      return;
    }
    listening = true;
    faceWrap.classList.add("listening"); micBtn.classList.add("on");
    document.body.classList.add("glow-listen");
    face.setMood("listening"); Chirp.play("listen");
    showBubble("<i>Listening…</i>");
    hint.classList.add("gone");
    try {
      await Voice.start((t) => { if (listening) textEl.textContent = t; });
    } catch (e) {
      listening = false;
      faceWrap.classList.remove("listening"); micBtn.classList.remove("on");
      document.body.classList.remove("glow-listen");
      face.setMood("surprised");
      showBubble(e.message === "mic" ? "I need microphone access to hear you. Allow it for BASE in your phone settings." : "Hold-to-talk isn't available here. Use your keyboard's mic instead.");
    }
  }
  async function stopListening() {
    if (!listening) return;
    listening = false;
    faceWrap.classList.remove("listening"); micBtn.classList.remove("on");
    document.body.classList.remove("glow-listen");
    const text = (await Voice.stop() || "").trim();
    if (text) ask(text);
    else { face.setMood(idleMood()); showBubble("I didn't catch that. Hold me a bit longer while you talk?"); }
  }
  function holdable(el, onTap) {
    let timer = 0, held = false, down = false;
    el.addEventListener("pointerdown", (e) => {
      down = true; held = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      timer = setTimeout(() => { held = true; startListening(); }, 260);
    });
    const up = () => {
      if (!down) return;
      down = false; clearTimeout(timer);
      if (held) stopListening(); else onTap();
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  const TAPS = ["Hi! 👋", "Boop!", "Hehe, that tickles.", "Hold me and tell me what's up.", "I'm all ears. Well, all glasses.", "Need a hand with bills or focus?"];
  holdable(faceEl, () => {
    if (listening || C.busy) return;
    hint.classList.add("gone");
    face.hop(1.2); face.setMood("happy"); Chirp.play("hi");
    if (!typing) typeOut(rand(TAPS), "happy");
  });
  holdable(micBtn, () => { if (!Voice.available) { input.focus(); return; } showBubble("Hold the mic (or me) while you talk, then let go."); });

  // ---------------------------------------------------------------- focus
  const focusEl = $("#rjFocus"), clock = $("#rjClock"), taskEl = $("#rjTask"), pauseBtn = $("#rjPause");
  let cheered = {};
  function idleMood() { const st = F.status(); return st.active && !st.paused && !st.done ? "focused" : "idle"; }
  function syncFocusUI() {
    const st = F.status();
    focusEl.hidden = !st.active;
    taskEl.hidden = !st.active;
    if (!st.active) return st;
    taskEl.textContent = st.task;
    clock.textContent = F.fmt(st.remainingMs);
    focusEl.classList.toggle("paused", st.paused);
    pauseBtn.classList.toggle("paused", st.paused);
    pauseBtn.setAttribute("aria-label", st.paused ? "Resume" : "Pause");
    return st;
  }
  async function finishFocus() {
    const st = F.status();
    let nudges = 0;
    if (AG && AG.getFocusStats) { try { nudges = (await AG.getFocusStats()).nudges || 0; } catch (e) {} }
    const entry = F.end("done");
    syncFocusUI();
    if (!entry) return;
    face.hop(1.6); face.setMood("happy"); Chirp.play("done");
    typeOut(`Done! **${entry.focusedMin} min** on ${st.task}. ${nudges ? `(I only had to nudge you ${nudges === 1 ? "once" : nudges + " times"}.) ` : ""}Take a little break? 🎉`, "happy");
  }
  function focusTick() {
    const st = syncFocusUI();
    if (!st.active) return;
    if (st.done) { finishFocus(); return; }
    if (st.paused || typing || listening || C.busy) return;
    const key = st.startedAt;
    cheered[key] = cheered[key] || {};
    const frac = st.usedMs / st.totalMs;
    if (frac >= 0.5 && !cheered[key].half && st.totalMs >= 10 * 60000) { cheered[key].half = 1; Chirp.play("hi"); typeOut(rand(["Halfway there! Keep going. 💪", "Half done. You've got this.", "Halfway! Nice and steady."]), "focused"); }
    else if (st.remainingMs <= 5 * 60000 && !cheered[key].five && st.totalMs >= 15 * 60000) { cheered[key].five = 1; Chirp.play("hi"); typeOut("Five minutes left. Strong finish!", "focused"); }
    // a glance up at you now and then
    if (face.mood === "focused" && Math.random() < 0.04) { face.lookAt(0, -0.2); setTimeout(() => face.lookAt(null), 1600); }
  }
  pauseBtn.addEventListener("click", () => {
    const st = F.status();
    if (st.paused) { F.resume(); face.setMood("focused"); Chirp.play("hi"); }
    else { F.pause(); face.setMood("idle"); Chirp.play("sleep"); }
    syncFocusUI();
  });
  $("#rjPlus").addEventListener("click", () => { F.extend(5); Chirp.play("hi"); face.hop(); syncFocusUI(); });
  $("#rjEnd").addEventListener("click", () => {
    const st = F.status();
    if (!st.active) return;
    const entry = F.end("user");
    syncFocusUI();
    face.setMood("idle");
    typeOut(entry && entry.focusedMin >= 1 ? `Ended. **${entry.focusedMin} min** of focus on ${entry.task}. Nice work.` : "Ended. Ready when you are.", "idle");
  });
  F.onChange(() => { syncFocusUI(); if (!typing && !listening && !C.busy) face.setMood(idleMood()); renderChips(); });

  // ---------------------------------------------------------------- history sheet
  function renderLog() {
    const log = $("#rjLog");
    const ui = C.convo.ui;
    if (!ui.length) { log.innerHTML = `<div class="empty">No messages yet. Say hi to Rojo!</div>`; return; }
    log.innerHTML = ui.map((it, i) => {
      if (it.type === "user") return `<div class="m user">${C.esc(it.text)}</div>`;
      if (it.type === "bot") return `<div class="m bot">${C.md(it.text)}</div>`;
      if (it.type === "acts") return actsHTML(it, i);
      if (it.type === "err" || it.type === "note") return `<div class="m note">${C.esc(it.text)}</div>`;
      return "";
    }).join("");
    log.scrollTop = log.scrollHeight;
  }
  $("#rjHistory").addEventListener("click", () => { $("#rjSheet").hidden = false; renderLog(); });
  $("#rjSheetClose").addEventListener("click", () => { $("#rjSheet").hidden = true; });
  $("#rjSheet").addEventListener("click", (e) => { if (e.target.id === "rjSheet") $("#rjSheet").hidden = true; });
  $("#rjLog").addEventListener("click", onActionClick);
  $("#rjNew").addEventListener("click", () => {
    if (C.busy) return;
    C.newChat(); saidEl.hidden = true; Chirp.play("hi"); face.hop();
    typeOut(C.greeting(), "happy");
  });

  // ---------------------------------------------------------------- idle: sleepy, then asleep
  setInterval(() => {
    focusTick();
    if (typing || listening || C.busy) { lastActive = Date.now(); return; }
    const st = F.status();
    if (st.active && !st.paused) return;
    const idle = Date.now() - lastActive;
    if (idle > 120000 && face.mood !== "asleep") { face.setMood("asleep"); Chirp.play("sleep"); }
    else if (idle > 60000 && idle <= 120000 && face.mood !== "sleepy") face.setMood("sleepy");
  }, 1000);
  document.addEventListener("keydown", () => { lastActive = Date.now(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { lastActive = Date.now(); C.reload(); renderStatic(); syncFocusUI(); face.setMood(idleMood()); }
  });

  // ---------------------------------------------------------------- start
  syncFocusUI();
  face.setMood(idleMood());
  if (!C.convo.ui.length) setTimeout(() => { Chirp.play("hi"); typeOut(C.greeting(), "happy"); }, 350);
  else renderStatic();
  window.RojoScreen = { ask, face, focusTick };
})();
