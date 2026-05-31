/* ===========================================================
   ROUGE 01 — scroll choreography engine
   =========================================================== */
(function () {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- helpers ----
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // smooth ease in-out
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // progress through a pinned track (0 when track top hits viewport top,
  // 1 when we've scrolled the full sticky distance)
  function trackProgress(el) {
    const r = el.getBoundingClientRect();
    const dist = el.offsetHeight - window.innerHeight;
    if (dist <= 0) return 0;
    return clamp(-r.top / dist, 0, 1);
  }

  // ---- elements ----
  const nav = document.getElementById("nav");
  const progress = document.getElementById("progress");

  const heroTrack = document.querySelector(".hero-track");
  const heroRed = document.getElementById("heroRed");
  const heroTitle = document.getElementById("heroTitle");
  const heroKicker = document.getElementById("heroKicker");
  const heroStatement = document.getElementById("heroStatement");
  const heroProduct = document.getElementById("heroProduct");
  const scrollHint = document.getElementById("scrollHint");

  const manifesto = document.getElementById("manifesto");
  const manifestoText = document.getElementById("manifestoText");

  const feat = document.getElementById("feat");
  const featProduct = document.getElementById("featProduct");
  const featItems = Array.from(document.querySelectorAll(".feat-item"));

  const gallery = document.getElementById("gallery");
  const galleryTrack = document.getElementById("galleryTrack");

  const para = document.querySelector(".para");
  const paraWord = document.getElementById("paraWord");
  const paraProduct = document.getElementById("paraProduct");
  const paraCaption = document.getElementById("paraCaption");

  const navRegions = Array.from(document.querySelectorAll("[data-nav]"));

  let heroRedFill = 0; // shared with nav logic

  // ===========================================================
  //  HERO — red rises, product reveals
  // ===========================================================
  function updateHero() {
    const p = trackProgress(heroTrack);

    // red wipe rises to fill
    const fill = clamp(p / 0.55, 0, 1);
    heroRedFill = fill;
    const clipTop = lerp(50, 0, easeIO(fill));
    heroRed.style.clipPath = `inset(${clipTop}% 0 0 0)`;

    // dark hero title fades + lifts
    const titleFade = clamp(p / 0.26, 0, 1);
    heroTitle.style.opacity = String(1 - titleFade);
    heroTitle.style.transform = `translateY(${lerp(0, -46, titleFade)}px)`;
    heroKicker.style.opacity = String(1 - clamp(p / 0.18, 0, 1));

    // white statement rides in over the red
    const stIn = clamp((p - 0.42) / 0.26, 0, 1);
    const stOut = clamp((p - 0.9) / 0.1, 0, 1);
    heroStatement.style.opacity = String(stIn * (1 - stOut));
    heroStatement.style.transform = `translateY(${lerp(36, 0, easeOut(stIn)) + lerp(0, -30, stOut)}px)`;

    // product rises from the bottom
    const prIn = clamp((p - 0.38) / 0.42, 0, 1);
    heroProduct.style.opacity = String(clamp((p - 0.38) / 0.2, 0, 1));
    heroProduct.style.transform =
      `translateX(-50%) translateY(${lerp(180, 26, easeOut(prIn))}px) scale(${lerp(0.9, 1, prIn)})`;

    // scroll hint
    scrollHint.style.opacity = String(1 - clamp(p / 0.06, 0, 1));
  }

  // ===========================================================
  //  MANIFESTO — big text scales + fades
  // ===========================================================
  function updateManifesto() {
    const p = trackProgress(manifesto);
    const scale = lerp(0.82, 1.22, p);
    const op = clamp(p / 0.2, 0, 1) * (1 - clamp((p - 0.72) / 0.28, 0, 1));
    const y = lerp(60, -80, p);
    manifestoText.style.opacity = String(op);
    manifestoText.style.transform = `translateY(${y}px) scale(${scale})`;
  }

  // ===========================================================
  //  FEATURES — items sequence in while product holds
  // ===========================================================
  function updateFeatures() {
    const p = trackProgress(feat);
    const n = featItems.length;
    const active = clamp(Math.floor(p / (1 / n) + 0.0001), 0, n - 1);

    featItems.forEach((item, i) => {
      const seg = 1 / n;
      const start = i * seg;
      const appear = clamp((p - start) / (seg * 0.7), 0, 1);
      item.style.opacity = String(lerp(0.12, 1, easeOut(appear)));
      item.style.transform = `translateY(${lerp(46, 0, easeOut(appear))}px)`;
      item.classList.toggle("is-active", i === active && p > 0.02);
    });

    // product gentle drift
    featProduct.style.transform = `translateY(${lerp(28, -28, p)}px)`;
  }

  // ===========================================================
  //  GALLERY — vertical scroll drives horizontal travel
  // ===========================================================
  function updateGallery() {
    const p = trackProgress(gallery);
    const maxX = galleryTrack.scrollWidth - window.innerWidth + 16;
    if (maxX <= 0) return;
    galleryTrack.style.transform = `translateX(${-easeIO(p) * maxX}px)`;
  }

  // ===========================================================
  //  PARALLAX — layered depth
  // ===========================================================
  function updateParallax() {
    const r = para.getBoundingClientRect();
    const center = r.top + r.height / 2 - window.innerHeight / 2; // 0 at center
    paraWord.style.transform = `translate(-50%, calc(-50% + ${center * -0.22}px))`;
    paraProduct.style.transform = `translateY(${center * 0.08}px)`;
    paraCaption.style.transform = `translateY(${center * -0.12}px)`;
  }

  // ===========================================================
  //  NAV theme — pick region under the nav line
  // ===========================================================
  const navLine = 46;
  function updateNav() {
    let theme = "on-light";
    for (const region of navRegions) {
      const r = region.getBoundingClientRect();
      if (r.top <= navLine && r.bottom > navLine) {
        if (region.dataset.nav === "hero") {
          theme = heroRedFill > 0.82 ? "on-dark" : "on-light";
        } else {
          theme = region.dataset.theme || "on-light";
        }
        break;
      }
    }
    nav.classList.toggle("on-dark", theme === "on-dark");
    document.body.classList.toggle("theme-dark", theme === "on-dark");
  }

  // progress bar
  function updateProgress() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    progress.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`;
  }

  // ===========================================================
  //  CTA reveal
  // ===========================================================
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }),
    { threshold: 0.3 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // ===========================================================
  //  RAF loop
  // ===========================================================
  let ticking = false;
  function frame() {
    updateHero();
    updateManifesto();
    updateFeatures();
    updateGallery();
    updateParallax();
    updateNav();
    updateProgress();
    ticking = false;
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  if (!reduce) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    frame();
  } else {
    // still flip nav + reveals on scroll, no transforms
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
    nav.classList.add("on-dark");
  }

  // smooth anchor jumps
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const t = document.querySelector(id);
      if (t) {
        e.preventDefault();
        const y = t.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
  });
})();
