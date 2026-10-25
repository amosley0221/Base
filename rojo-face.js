/* ===========================================================
   BASE — Rojo's face
   A red felt fuzzball with round glasses and glossy googly eyes.
   The fuzzy body is drawn once as an SVG image (felt texture via
   SVG noise filters); the eyes, glasses and moods animate on top
   with little damped springs so every move has some life.

   RojoFace.create(el, { mini }) -> {
     setMood(m)  idle | listening | thinking | talking | happy | sleepy | asleep | surprised | focused
     lookAt(x, y) -1…1 (null to let him wander), lookAtPoint(clientX, clientY)
     setTalk(level 0…1), hop(strength), destroy()
   }
   =========================================================== */
window.RojoFace = (function () {
  "use strict";

  const RED = "#F2481D";
  // Body: one big circle plus twelve bumps around it -> soft scalloped edge.
  function bodySVG() {
    const bumps = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      bumps.push(`<circle cx="${(200 + Math.cos(a) * 140).toFixed(1)}" cy="${(208 + Math.sin(a) * 140).toFixed(1)}" r="56"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs>
<radialGradient id="g" gradientUnits="userSpaceOnUse" cx="150" cy="120" r="300">
<stop offset="0" stop-color="#FF5E2E"/><stop offset=".6" stop-color="${RED}"/><stop offset="1" stop-color="#D23A16"/></radialGradient>
<radialGradient id="s" gradientUnits="userSpaceOnUse" cx="200" cy="330" r="190">
<stop offset="0" stop-color="#7a1606" stop-opacity=".28"/><stop offset="1" stop-color="#7a1606" stop-opacity="0"/></radialGradient>
<filter id="f" x="-6%" y="-6%" width="112%" height="112%">
<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
<feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="9" result="n2"/>
<feColorMatrix in="n2" type="matrix" values="0 0 0 0 1  0 0 0 0 .72  0 0 0 0 .6  .3 0 0 0 -.13" result="w"/>
<feComposite in="w" in2="d" operator="in" result="wt"/>
<feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .1  0 0 0 0 .02  0 .32 0 0 -.12" result="dk"/>
<feComposite in="dk" in2="d" operator="in" result="dt"/>
<feMerge><feMergeNode in="d"/><feMergeNode in="dt"/><feMergeNode in="wt"/></feMerge>
</filter>
</defs>
<g filter="url(#f)"><g fill="url(#g)"><circle cx="200" cy="208" r="160"/>${bumps.join("")}</g></g>
</svg>`;
  }
  let bodyURL = null;
  const bodySrc = () => bodyURL || (bodyURL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(bodySVG()));

  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  // A tiny damped spring.
  function spring(value, stiffness, damping) { return { v: value, vel: 0, k: stiffness, d: damping }; }
  function step(s, target, dt) {
    const c = 2 * Math.sqrt(s.k) * s.d;
    s.vel += (s.k * (target - s.v) - c * s.vel) * dt;
    s.v += s.vel * dt;
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  // Layout in the 400×400 design box.
  const LENS = [{ x: 128, y: 172 }, { x: 272, y: 172 }];
  const LRX = 62, LRY = 66, ER = 30;
  const RANGE_X = LRX - ER - 7, RANGE_Y = LRY - ER - 8;
  let uid = 0;

  function create(host, opts) {
    opts = opts || {};
    const id = "rj" + (++uid);
    const wrap = document.createElement("div");
    wrap.className = "rojo-face" + (opts.mini ? " mini" : "");
    wrap.style.cssText = "position:relative;width:100%;aspect-ratio:1;transform-origin:50% 92%;will-change:transform;";
    const img = document.createElement("img");
    img.src = bodySrc(); img.alt = ""; img.draggable = false;
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;user-select:none;";
    wrap.appendChild(img);
    const svg = el("svg", { viewBox: "0 0 400 400", "aria-hidden": "true" });
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;";
    wrap.appendChild(svg);
    host.appendChild(wrap);

    const defs = el("defs", {}, svg);
    const eyeGrad = el("radialGradient", { id: id + "e", cx: "36%", cy: "30%", r: "75%" }, defs);
    el("stop", { offset: "0", "stop-color": "#4a4a4a" }, eyeGrad);
    el("stop", { offset: ".45", "stop-color": "#111" }, eyeGrad);
    el("stop", { offset: "1", "stop-color": "#000" }, eyeGrad);
    const blushGrad = el("radialGradient", { id: id + "b" }, defs);
    el("stop", { offset: "0", "stop-color": "#ff9a7a", "stop-opacity": ".85" }, blushGrad);
    el("stop", { offset: "1", "stop-color": "#ff9a7a", "stop-opacity": "0" }, blushGrad);

    // Blush (under the lenses)
    const blush = [el("ellipse", { cx: 112, cy: 276, rx: 34, ry: 16, fill: `url(#${id}b)`, opacity: 0 }, svg),
      el("ellipse", { cx: 288, cy: 276, rx: 34, ry: 16, fill: `url(#${id}b)`, opacity: 0 }, svg)];

    // Eyes (behind the glasses): ball clipped by a "lid" from the top, plus closed and happy lines.
    const eyes = LENS.map((L, i) => {
      const clip = el("clipPath", { id: id + "c" + i }, defs);
      const lid = el("rect", { x: -ER - 3, y: -ER - 3, width: 2 * ER + 6, height: 2 * ER + 6 }, clip);
      const g = el("g", {}, svg);
      const ball = el("g", { "clip-path": `url(#${id}c${i})` }, g);
      el("circle", { cx: 0, cy: 0, r: ER, fill: `url(#${id}e)` }, ball);
      el("circle", { cx: 9, cy: -10, r: 9.5, fill: "#fff" }, ball);
      const lidLine = el("path", { d: "", fill: "none", stroke: "#8f2408", "stroke-width": 4.5, "stroke-linecap": "round", opacity: 0 }, g);
      const shut = el("path", { d: `M ${-ER * 0.75} 2 Q 0 ${ER * 0.6} ${ER * 0.75} 2`, fill: "none", stroke: "#111", "stroke-width": 6, "stroke-linecap": "round", opacity: 0 }, g);
      const happy = el("path", { d: `M ${-ER * 0.78} ${ER * 0.3} Q 0 ${-ER * 0.75} ${ER * 0.78} ${ER * 0.3}`, fill: "none", stroke: "#111", "stroke-width": 7, "stroke-linecap": "round", opacity: 0 }, g);
      return { L, g, lid, ball, shut, happy, lidLine };
    });

    // Glasses
    const glasses = el("g", { fill: "none", stroke: "#0c0c0c", "stroke-width": 9.5, "stroke-linecap": "round" }, svg);
    LENS.forEach((L) => el("ellipse", { cx: L.x, cy: L.y, rx: LRX, ry: LRY }, glasses));
    el("path", { d: `M ${LENS[0].x + LRX - 1} ${LENS[0].y - 14} L ${LENS[1].x - LRX + 1} ${LENS[1].y - 14}`, "stroke-width": 10 }, glasses);
    el("path", { d: `M ${LENS[0].x - LRX} ${LENS[0].y - 2} L 50 ${LENS[0].y - 2}` }, glasses);
    el("path", { d: `M ${LENS[1].x + LRX} ${LENS[1].y - 2} L 350 ${LENS[1].y - 2}` }, glasses);
    const shine = el("g", { fill: "none", stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round", opacity: ".22" }, svg);
    LENS.forEach((L) => el("path", { d: `M ${L.x - LRX * 0.62} ${L.y - LRY * 0.62} Q ${L.x - LRX * 0.2} ${L.y - LRY * 0.98} ${L.x + LRX * 0.25} ${L.y - LRY * 0.92}` }, shine));

    // Thinking dots and sleepy Zs
    const dots = el("g", { opacity: 0 }, svg);
    const dotEls = [0, 1, 2].map((i) => el("circle", { cx: 318 + i * 22, cy: 66 - i * 18, r: 7 + i * 2, fill: "#fff" }, dots));
    const zz = el("g", { opacity: 0, fill: "#fff", "font-family": "system-ui, sans-serif", "font-weight": 700 }, svg);
    const zEls = [0, 1, 2].map((i) => { const t = el("text", { x: 320 + i * 18, y: 70 - i * 24, "font-size": 22 + i * 8 }, zz); t.textContent = "z"; return t; });

    // ---- animation state
    const S = {
      gx: spring(0, 260, 0.82), gy: spring(-0.1, 260, 0.82),
      hop: spring(0, 260, 0.35), squash: spring(0, 220, 0.4), lean: spring(0, 60, 0.8),
      pupil: spring(1, 160, 0.5), blush: spring(0, 40, 1), lid: spring(0, 120, 0.9), happy: spring(0, 150, 0.8),
    };
    let mood = "idle", moodAt = 0, touch = null, talk = 0, talkTarget = 0;
    let blinkAt = -1, dbl = false, nextBlink = 1.5, nextSaccade = 0, wander = { x: 0, y: -0.1 }, nextHop = rand(6, 12);
    let last = null, raf = 0, alive = true;

    function setMood(m) {
      if (m === mood) return;
      mood = m; moodAt = performance.now() / 1000;
      blinkAt = moodAt;
      if (m !== "sleepy" && m !== "asleep" && m !== "focused") { S.hop.vel += 220; S.pupil.vel += 2.5; }
    }

    function frame(ms) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) { last = null; return; }
      const now = ms / 1000;
      const dt = Math.min(last == null ? 0 : now - last, 1 / 20);
      last = now;

      // Gaze: finger > mood > wandering, plus tiny darts.
      let want;
      if (touch) want = touch;
      else if (mood === "thinking") want = { x: 0.65 + 0.08 * Math.sin(now * 1.3), y: -0.85 };
      else if (mood === "listening") want = { x: 0.15, y: -0.1 };
      else if (mood === "happy") want = { x: 0, y: -0.8 };
      else if (mood === "focused") want = { x: 0.1 * Math.sin(now * 0.3), y: 0.55 };
      else {
        if (now > nextSaccade) { wander = { x: rand(-0.85, 0.85), y: rand(-0.7, 0.45) }; nextSaccade = now + rand(0.7, 2.6); }
        want = wander;
      }
      step(S.gx, want.x, dt); step(S.gy, want.y, dt);

      talk += (talkTarget - talk) * Math.min(1, dt * 20);
      const talking = mood === "talking";
      const wob = talking ? Math.max(talk, 0.35) * (0.5 + 0.5 * Math.sin(now * 17) * Math.sin(now * 6.1)) : 0;

      let wPupil = 1, wBlush = 0, wLid = 0, wHappy = 0;
      let wTilt = 0;
      if (mood === "listening" || mood === "curious") { wPupil = 1.06; wTilt = 0.16; }
      else if (mood === "surprised") { wPupil = 1.16; }
      else if (mood === "thinking") { wPupil = 0.92; }
      else if (mood === "happy") { wPupil = 1.18; }
      else if (mood === "sleepy") { wLid = 0.5; wPupil = 0.92; }
      else if (mood === "asleep") { wLid = 1; }
      else if (mood === "focused") { wLid = 0.18; }
      else if (talking) { wPupil = 1.04; }
      step(S.pupil, wPupil, dt); step(S.blush, wBlush, dt); step(S.lid, wLid, dt); step(S.happy, wHappy, dt);
      step(S.lean, -S.gx.v * 0.05 + wTilt, dt);
      const curious = mood === "listening" || mood === "curious";
      step(S.squash, wob * 0.06, dt);

      if (now > nextHop) {
        if (!talking && mood !== "sleepy" && mood !== "asleep" && mood !== "focused") S.hop.vel += rand(150, 280);
        nextHop = now + (mood === "happy" ? rand(0.5, 0.9) : rand(7, 15));
      }
      step(S.hop, 0, dt);

      // Blinks (sometimes doubled; slow when drowsy).
      const drowsy = mood === "sleepy";
      if (now > nextBlink && mood !== "asleep") {
        blinkAt = now; dbl = !drowsy && Math.random() < 0.25;
        nextBlink = now + (drowsy ? rand(1.6, 3) : rand(2, 5.2));
      }
      const p = (now - blinkAt) / (drowsy ? 0.7 : 0.16);
      let blink = p >= 0 && p <= 1 ? Math.sin(Math.PI * p) : 0;
      if (dbl && p >= 1.3 && p <= 2.3) blink = Math.sin(Math.PI * (p - 1.3));
      const closed = Math.min(1, Math.max(S.lid.v, blink));
      const happy = Math.max(0, Math.min(1, S.happy.v));

      // ---- draw
      const hopPx = Math.max(0, S.hop.v) * 0.09 + (talking ? wob * 6 : 0);
      const sq = S.squash.v;
      const breathe = Math.sin(now * (mood === "asleep" ? 1.1 : 1.8)) * 0.008;
      wrap.style.transform = `translateY(${-hopPx}%) rotate(${S.lean.v}rad) scale(${1 + sq + breathe}, ${1 - sq - breathe})`;
      const gx = Math.max(-1.2, Math.min(1.2, S.gx.v)), gy = Math.max(-1.2, Math.min(1.2, S.gy.v));
      eyes.forEach((E, i) => {
        const inward = i === 0 ? 13 : -13;   // eyes sit low and toward the nose
        let dx = gx * RANGE_X + inward, dy = gy * RANGE_Y + 9;
        // keep the eyeball inside the lens oval (diagonals would cross the rim)
        const MX = LRX - ER - 5, MY = LRY - ER - 5, k = Math.hypot(dx / MX, dy / MY);
        if (k > 1) { dx /= k; dy /= k; }
        const ex = E.L.x + dx, ey = E.L.y + dy;
        const sc = S.pupil.v * (curious ? (i === 1 ? 1.12 : 0.94) : 1);   // curious: one eye a bit bigger
        E.g.setAttribute("transform", `translate(${ex.toFixed(2)} ${ey.toFixed(2)}) scale(${sc.toFixed(3)})`);
        const top = -ER - 3 + (2 * ER + 6) * closed;
        E.lid.setAttribute("y", top.toFixed(2));
        // a felt eyelid edge when half closed (sleepy / focused)
        if (closed > 0.12 && closed < 0.88 && happy < 0.5) {
          const yy = top + 3, w = Math.sqrt(Math.max(0, ER * ER - yy * yy)) + 2;
          E.lidLine.setAttribute("d", `M ${(-w).toFixed(1)} ${yy.toFixed(1)} L ${w.toFixed(1)} ${yy.toFixed(1)}`);
          E.lidLine.setAttribute("opacity", 1);
        } else E.lidLine.setAttribute("opacity", 0);
        E.ball.setAttribute("opacity", (1 - happy).toFixed(3));
        E.shut.setAttribute("opacity", (closed > 0.88 && happy < 0.5 ? 1 : 0));
        E.happy.setAttribute("opacity", happy.toFixed(3));
      });
      blush.forEach((b) => b.setAttribute("opacity", Math.max(0, Math.min(1, S.blush.v)).toFixed(3)));
      dots.setAttribute("opacity", mood === "thinking" ? 1 : 0);
      if (mood === "thinking") dotEls.forEach((d, i) => d.setAttribute("opacity", (0.35 + 0.65 * Math.max(0, Math.sin(now * 4 - i * 0.9))).toFixed(2)));
      zz.setAttribute("opacity", mood === "asleep" ? 1 : 0);
      if (mood === "asleep") zEls.forEach((z, i) => {
        const t = (now * 0.5 + i / 3) % 1;
        z.setAttribute("transform", `translate(${(t * 18).toFixed(1)} ${(-t * 40).toFixed(1)})`);
        z.setAttribute("opacity", (Math.sin(Math.PI * t)).toFixed(2));
      });
    }
    raf = requestAnimationFrame(frame);

    return {
      el: wrap,
      setMood,
      get mood() { return mood; },
      lookAt(x, y) { touch = x == null ? null : { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; },
      lookAtPoint(cx, cy) {
        const r = wrap.getBoundingClientRect();
        const ox = r.left + r.width / 2, oy = r.top + r.height * 0.46;
        const reach = Math.max(window.innerWidth, window.innerHeight) * 0.45;
        this.lookAt((cx - ox) / reach, (cy - oy) / reach);
      },
      setTalk(level) { talkTarget = Math.max(0, Math.min(1, level || 0)); },
      hop(strength) { S.hop.vel += 220 * (strength || 1); },
      blink() { blinkAt = performance.now() / 1000; },
      destroy() { alive = false; cancelAnimationFrame(raf); wrap.remove(); },
    };
  }

  // Static mini icon (for buttons / the nav) — same body + glasses, blinks occasionally.
  function icon(host) { return create(host, { mini: true }); }

  return { create, icon, bodySrc, RED };
})();
